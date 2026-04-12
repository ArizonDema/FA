const multer = require("multer")
const path = require("path")
const StorageService = require("./services/storage.service")

function createUploadMiddleware({
  namespace,
  tempDir = "tmp",
  allowedExtensions = null,
  maxFileSize = 20 * 1024 * 1024,
}) {
  const destinationDir = StorageService.ensureNamespace(namespace, tempDir)

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destinationDir),
    filename: (req, file, cb) => {
      const safeName = StorageService.sanitizeFileName(file.originalname, "upload")
      cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safeName}`)
    },
  })

  return multer({
    storage,
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => {
      if (!Array.isArray(allowedExtensions) || !allowedExtensions.length) {
        return cb(null, true)
      }

      const extension = path.extname(file.originalname || "").toLowerCase()
      if (!allowedExtensions.includes(extension)) {
        return cb(new Error(`Only ${allowedExtensions.join(", ")} files are supported`))
      }
      return cb(null, true)
    },
  })
}

module.exports = {
  createUploadMiddleware,
}
