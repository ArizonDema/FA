const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const CashFlowService = require("../../../services/cashFlow.service")

const SUPPORTED_TEMPLATE_EXTENSIONS = [".xlsx"]

class TemplateFileLoader {
  static loadablePath(filePath) {
    const resolvedPath = String(filePath || "").trim()
    return Boolean(resolvedPath) && fs.existsSync(resolvedPath)
  }

  static load({ filePath, sourceFileName = null }) {
    const resolvedPath = String(filePath || "").trim()
    if (!resolvedPath) {
      throw new CashFlowService.CashFlowValidationError("Template source path is required for parsing")
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new CashFlowService.CashFlowValidationError("Template source file is missing and cannot be parsed")
    }

    const resolvedName = String(sourceFileName || path.basename(resolvedPath)).trim()
    const extension = path.extname(resolvedName || resolvedPath).toLowerCase()
    if (!SUPPORTED_TEMPLATE_EXTENSIONS.includes(extension)) {
      throw new CashFlowService.CashFlowValidationError(
        `Unsupported template extension "${extension || "unknown"}". Supported: ${SUPPORTED_TEMPLATE_EXTENSIONS.join(", ")}`,
      )
    }

    const buffer = fs.readFileSync(resolvedPath)
    const stats = fs.statSync(resolvedPath)

    return {
      file_path: resolvedPath,
      source_file_name: resolvedName,
      extension,
      size_bytes: stats.size,
      buffer,
      source_file_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    }
  }
}

module.exports = TemplateFileLoader
