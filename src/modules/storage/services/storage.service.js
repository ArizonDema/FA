const fs = require("fs")
const path = require("path")

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..")
const DEFAULT_UPLOAD_ROOT = path.join(ROOT_DIR, "uploads")

function resolveUploadRoot() {
  const configuredRoot = String(process.env.UPLOAD_ROOT_DIR || "").trim()
  if (!configuredRoot) return DEFAULT_UPLOAD_ROOT
  return path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(ROOT_DIR, configuredRoot)
}

const UPLOAD_ROOT = resolveUploadRoot()

class StorageService {
  static getUploadRoot() {
    return UPLOAD_ROOT
  }

  static ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true })
    }
    return directoryPath
  }

  static getNamespacePath(namespace, ...segments) {
    return path.join(UPLOAD_ROOT, namespace, ...segments.filter(Boolean))
  }

  static ensureNamespace(namespace, ...segments) {
    return this.ensureDirectory(this.getNamespacePath(namespace, ...segments))
  }

  static sanitizeFileName(originalName, fallbackPrefix = "upload") {
    const safe = String(originalName || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .trim()

    if (safe) return safe
    return `${fallbackPrefix}_${Date.now()}`
  }

  static moveFile(sourcePath, destinationPath) {
    this.ensureDirectory(path.dirname(destinationPath))
    fs.copyFileSync(sourcePath, destinationPath)
    fs.unlinkSync(sourcePath)
    return destinationPath
  }

  static removeFileSilently(filePath) {
    if (!filePath) return
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (error) {
      void error
    }
  }

  static fileExists(filePath) {
    return Boolean(filePath) && fs.existsSync(filePath)
  }
}

module.exports = StorageService
