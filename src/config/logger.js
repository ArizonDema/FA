const fs = require("fs")
const path = require("path")
const winston = require("winston")
const config = require("./app")

const LOG_DIR = path.resolve(__dirname, "..", "..", "logs")
const ERROR_LOG_PATH = path.join(LOG_DIR, "error.log")
const COMBINED_LOG_PATH = path.join(LOG_DIR, "combined.log")
const LEGACY_ARCHIVE_THRESHOLD_BYTES = 200 * 1024 * 1024
const FILE_MAX_SIZE_BYTES = 20 * 1024 * 1024
const FILE_MAX_COUNT = 10
const BROKEN_PIPE_HANDLER_KEY = "__cssInvestBrokenPipeHandler"

function ensureLogDirectory() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function sanitizeFileTimestamp(value) {
  return value.toISOString().replace(/[:.]/g, "-")
}

function archiveOversizedLog(logPath) {
  try {
    if (!fs.existsSync(logPath)) return

    const stats = fs.statSync(logPath)
    if (stats.size < LEGACY_ARCHIVE_THRESHOLD_BYTES) return

    const archivedName = `${path.basename(logPath, ".log")}.legacy-${sanitizeFileTimestamp(
      new Date(),
    )}.log`
    const archivedPath = path.join(LOG_DIR, archivedName)
    fs.renameSync(logPath, archivedPath)
  } catch (error) {
    // Last-resort safety: never crash app startup because of log archival.
    // eslint-disable-next-line no-console
    console.warn(`[v0] Failed to archive oversized log ${logPath}: ${error.message}`)
  }
}

function suppressBrokenPipe(stream) {
  if (!stream || typeof stream.on !== "function") return
  if (stream[BROKEN_PIPE_HANDLER_KEY]) return

  const handler = (error) => {
    if (error?.code === "EPIPE") return
  }

  stream[BROKEN_PIPE_HANDLER_KEY] = handler
  stream.on("error", handler)
}

ensureLogDirectory()
archiveOversizedLog(ERROR_LOG_PATH)
archiveOversizedLog(COMBINED_LOG_PATH)
suppressBrokenPipe(process.stdout)
suppressBrokenPipe(process.stderr)

const dropBrokenPipeEntries = winston.format((info) => {
  const message = String(info?.message || "")
  const stack = String(info?.stack || "")
  if (message.includes("EPIPE: broken pipe") || stack.includes("EPIPE: broken pipe")) {
    return false
  }
  return info
})

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
)

const fileFormat = winston.format.combine(dropBrokenPipeEntries(), baseFormat, winston.format.json())

const transports = [
  new winston.transports.File({
    filename: ERROR_LOG_PATH,
    level: "error",
    format: fileFormat,
    maxsize: FILE_MAX_SIZE_BYTES,
    maxFiles: FILE_MAX_COUNT,
    tailable: true,
  }),
  new winston.transports.File({
    filename: COMBINED_LOG_PATH,
    format: fileFormat,
    maxsize: FILE_MAX_SIZE_BYTES,
    maxFiles: FILE_MAX_COUNT,
    tailable: true,
  }),
]

if (process.stdout && process.stdout.isTTY) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        baseFormat,
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          let log = `${timestamp} [${service}] ${level}: ${message}`
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`
          }
          return log
        }),
      ),
    }),
  )
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(baseFormat, winston.format.json()),
  defaultMeta: { service: "css-invest-backend" },
  transports,
})

module.exports = logger
