const fs = require("fs")
const os = require("os")
const path = require("path")
const StorageService = require("../src/modules/storage/services/storage.service")

describe("StorageService", () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-service-test-"))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("sanitizes names and moves files into namespaced directories", () => {
    const sourceFile = path.join(tempDir, "unsafe name.xlsx")
    fs.writeFileSync(sourceFile, "demo")

    const safeName = StorageService.sanitizeFileName("unsafe name.xlsx", "fallback")
    expect(safeName).toBe("unsafe_name.xlsx")

    const destination = path.join(tempDir, "nested", safeName)
    StorageService.moveFile(sourceFile, destination)

    expect(fs.existsSync(sourceFile)).toBe(false)
    expect(fs.existsSync(destination)).toBe(true)
    expect(fs.readFileSync(destination, "utf8")).toBe("demo")
  })

  test("removes files silently when present", () => {
    const filePath = path.join(tempDir, "to-delete.txt")
    fs.writeFileSync(filePath, "delete me")

    StorageService.removeFileSilently(filePath)
    expect(fs.existsSync(filePath)).toBe(false)

    expect(() => StorageService.removeFileSilently(filePath)).not.toThrow()
  })
})
