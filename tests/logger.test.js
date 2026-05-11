const path = require("path")

const loggerPath = path.resolve(__dirname, "..", "src", "config", "logger.js")
const BROKEN_PIPE_HANDLER_KEY = "__cssInvestBrokenPipeHandler"

describe("logger broken pipe suppression", () => {
  test("does not register duplicate stream error listeners when reloaded", () => {
    const stdoutBefore = process.stdout.listenerCount("error")
    const stderrBefore = process.stderr.listenerCount("error")

    delete require.cache[loggerPath]
    require(loggerPath)

    const stdoutAfterFirstLoad = process.stdout.listenerCount("error")
    const stderrAfterFirstLoad = process.stderr.listenerCount("error")

    delete require.cache[loggerPath]
    require(loggerPath)

    const stdoutAfterSecondLoad = process.stdout.listenerCount("error")
    const stderrAfterSecondLoad = process.stderr.listenerCount("error")

    expect(stdoutAfterSecondLoad).toBe(stdoutAfterFirstLoad)
    expect(stderrAfterSecondLoad).toBe(stderrAfterFirstLoad)
    expect(stdoutAfterFirstLoad - stdoutBefore).toBeLessThanOrEqual(1)
    expect(stderrAfterFirstLoad - stderrBefore).toBeLessThanOrEqual(1)

    if (process.stdout[BROKEN_PIPE_HANDLER_KEY]) {
      process.stdout.removeListener("error", process.stdout[BROKEN_PIPE_HANDLER_KEY])
      delete process.stdout[BROKEN_PIPE_HANDLER_KEY]
    }
    if (process.stderr[BROKEN_PIPE_HANDLER_KEY]) {
      process.stderr.removeListener("error", process.stderr[BROKEN_PIPE_HANDLER_KEY])
      delete process.stderr[BROKEN_PIPE_HANDLER_KEY]
    }
  })
})
