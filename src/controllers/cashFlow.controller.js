const fs = require("fs")
const path = require("path")
const {
  sequelize,
  Portfolio,
  CashFlowTemplate,
  ReportRun,
  AuditLog,
} = require("../models")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")
const CashFlowService = require("../services/cashFlow.service")

const ROOT_DIR = path.join(__dirname, "..", "..")
const CASH_FLOW_DIR = path.join(ROOT_DIR, "uploads", "cash-flow")
const TEMPLATE_DIR = path.join(CASH_FLOW_DIR, "templates")
const RUN_DIR = path.join(CASH_FLOW_DIR, "runs")

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true })
  }
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return fallback
}

function parseConfigJson(value) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "object") return value
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch (error) {
      throw new CashFlowService.CashFlowValidationError("config_json must be valid JSON")
    }
  }
  throw new CashFlowService.CashFlowValidationError("config_json must be valid JSON")
}

function removeFileSilently(filePath) {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    logger.warn(`[v0] Failed to remove file: ${filePath}`, error)
  }
}

function moveFile(sourcePath, destinationPath) {
  ensureDirectory(path.dirname(destinationPath))
  fs.copyFileSync(sourcePath, destinationPath)
  fs.unlinkSync(sourcePath)
}

function safeFileName(originalName, fallbackPrefix) {
  const safe = String(originalName || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .trim()
  if (safe) return safe
  return `${fallbackPrefix}_${Date.now()}.xlsx`
}

async function recordAudit(req, entityType, entityId, action, before, after) {
  try {
    await AuditLog.create({
      actor_id: req.user?.id || null,
      entity_type: entityType,
      entity_id: entityId,
      action,
      before_json: before || null,
      after_json: after || null,
      created_at: new Date(),
    })
  } catch (error) {
    logger.warn(`[v0] Audit log failed for ${entityType}:${entityId}`, error)
  }
}

class CashFlowController {
  static async getTemplates(req, res, next) {
    try {
      const portfolioId = req.query.portfolio_id
      if (!portfolioId) {
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }

      const templates = await CashFlowTemplate.findAll({
        where: { portfolio_id: portfolioId },
        order: [
          ["is_active", "DESC"],
          ["created_at", "DESC"],
        ],
      })

      return ResponseHandler.success(res, { templates }, "Cash flow templates retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createTemplate(req, res, next) {
    try {
      if (!req.file) {
        return ResponseHandler.badRequest(res, "template_file is required")
      }

      const { portfolio_id: portfolioId, name, version } = req.body
      if (!portfolioId) {
        removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      if (!name) {
        removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "name is required")
      }

      const portfolio = await Portfolio.findByPk(portfolioId)
      if (!portfolio) {
        removeFileSilently(req.file.path)
        return ResponseHandler.notFound(res, "Fund not found")
      }

      const configPayload = parseConfigJson(req.body.config_json)
      const normalizedConfig = CashFlowService.validateTemplateConfig(configPayload)
      const requestedActive = parseBoolean(req.body.is_active, false)

      ensureDirectory(TEMPLATE_DIR)

      const activeTemplate = await CashFlowTemplate.findOne({
        where: { portfolio_id: portfolioId, is_active: true },
      })
      const isActive = requestedActive || !activeTemplate

      const createdTemplate = await sequelize.transaction(async (transaction) => {
        if (isActive) {
          await CashFlowTemplate.update(
            { is_active: false },
            {
              where: { portfolio_id: portfolioId, is_active: true },
              transaction,
            },
          )
        }

        const template = await CashFlowTemplate.create(
          {
            portfolio_id: portfolioId,
            name: String(name).trim(),
            version: version ? String(version).trim() : null,
            template_file_name: req.file.originalname,
            template_file_path: "",
            config_json: normalizedConfig,
            is_active: isActive,
            uploaded_by: req.user?.id || null,
          },
          { transaction },
        )

        const finalFileName = `${template.id}_${safeFileName(req.file.originalname, "cash_flow_template")}`
        const finalPath = path.join(TEMPLATE_DIR, finalFileName)
        moveFile(req.file.path, finalPath)

        await template.update(
          {
            template_file_name: req.file.originalname,
            template_file_path: finalPath,
          },
          { transaction },
        )

        return template
      })

      await recordAudit(req, "cash_flow_template", createdTemplate.id, "create", null, createdTemplate.toJSON())
      return ResponseHandler.created(res, { template: createdTemplate }, "Cash flow template created")
    } catch (error) {
      removeFileSilently(req.file?.path)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async updateTemplate(req, res, next) {
    try {
      const template = await CashFlowTemplate.findByPk(req.params.id)
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }

      const before = template.toJSON()
      const updates = {}

      if (req.body.name !== undefined) {
        const name = String(req.body.name || "").trim()
        if (!name) {
          return ResponseHandler.badRequest(res, "name cannot be empty")
        }
        updates.name = name
      }

      if (req.body.version !== undefined) {
        const version = String(req.body.version || "").trim()
        updates.version = version || null
      }

      if (req.body.config_json !== undefined) {
        const configPayload = parseConfigJson(req.body.config_json)
        updates.config_json = CashFlowService.validateTemplateConfig(configPayload)
      }

      const shouldActivate = parseBoolean(req.body.is_active, template.is_active)

      await sequelize.transaction(async (transaction) => {
        if (shouldActivate) {
          await CashFlowTemplate.update(
            { is_active: false },
            {
              where: { portfolio_id: template.portfolio_id, is_active: true },
              transaction,
            },
          )
          updates.is_active = true
        } else if (req.body.is_active !== undefined) {
          updates.is_active = false
        }

        if (Object.keys(updates).length) {
          await template.update(updates, { transaction })
        }
      })

      await recordAudit(req, "cash_flow_template", template.id, "update", before, template.toJSON())
      return ResponseHandler.success(res, { template }, "Cash flow template updated")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async activateTemplate(req, res, next) {
    try {
      const template = await CashFlowTemplate.findByPk(req.params.id)
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }

      const before = template.toJSON()
      await sequelize.transaction(async (transaction) => {
        await CashFlowTemplate.update(
          { is_active: false },
          {
            where: { portfolio_id: template.portfolio_id, is_active: true },
            transaction,
          },
        )
        await template.update({ is_active: true }, { transaction })
      })

      await recordAudit(req, "cash_flow_template", template.id, "activate", before, template.toJSON())
      return ResponseHandler.success(res, { template }, "Cash flow template activated")
    } catch (error) {
      return next(error)
    }
  }

  static async runCashFlowReport(req, res, next) {
    const cleanupTempUploads = () => {
      const tbUpload = req.files?.tb_file?.[0]
      const glUpload = req.files?.gl_file?.[0]
      removeFileSilently(tbUpload?.path)
      removeFileSilently(glUpload?.path)
    }

    try {
      const { portfolio_id: portfolioId, template_id: templateId } = req.body
      const fiscalYear = Number.parseInt(req.body.fiscal_year, 10)
      const tbUpload = req.files?.tb_file?.[0]
      const glUpload = req.files?.gl_file?.[0]

      if (!portfolioId) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      if (!Number.isInteger(fiscalYear)) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "fiscal_year is required and must be a valid year")
      }
      if (!tbUpload || !glUpload) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "tb_file and gl_file are required")
      }

      const portfolio = await Portfolio.findByPk(portfolioId)
      if (!portfolio) {
        cleanupTempUploads()
        return ResponseHandler.notFound(res, "Fund not found")
      }

      let template = null
      if (templateId) {
        template = await CashFlowTemplate.findByPk(templateId)
        if (!template || template.portfolio_id !== portfolioId) {
          cleanupTempUploads()
          return ResponseHandler.badRequest(res, "template_id is invalid for the selected fund")
        }
      } else {
        template = await CashFlowTemplate.findOne({
          where: { portfolio_id: portfolioId, is_active: true },
          order: [["created_at", "DESC"]],
        })
      }

      if (!template) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(
          res,
          "No active cash flow template found for this fund. Upload and activate one first.",
        )
      }

      const run = await ReportRun.create({
        type: "cash_flow",
        portfolio_id: portfolioId,
        period_start: `${fiscalYear}-01-01`,
        period_end: `${fiscalYear}-12-31`,
        inputs_json: {
          fiscal_year: fiscalYear,
          template_id: template.id,
          template_name: template.name,
          tb_file_name: tbUpload.originalname,
          gl_file_name: glUpload.originalname,
        },
        created_by: req.user?.id || null,
      })

      const runFolder = path.join(RUN_DIR, run.id)
      ensureDirectory(runFolder)

      const tbFilePath = path.join(runFolder, `tb_${safeFileName(tbUpload.originalname, "trial_balance")}`)
      const glFilePath = path.join(runFolder, `gl_${safeFileName(glUpload.originalname, "general_ledger")}`)
      moveFile(tbUpload.path, tbFilePath)
      moveFile(glUpload.path, glFilePath)

      const outputFilePath = path.join(runFolder, `cash_flow_${fiscalYear}.xlsx`)

      const result = await CashFlowService.generateCashFlowReport({
        templatePath: template.template_file_path,
        templateConfig: template.config_json,
        tbFilePath,
        glFilePath,
        fiscalYear,
        outputFilePath,
      })

      await run.update({
        inputs_json: {
          ...run.inputs_json,
          tb_file_path: tbFilePath,
          gl_file_path: glFilePath,
          warnings: result.warnings,
        },
        output_paths: {
          xlsx: result.outputFilePath,
        },
      })

      await recordAudit(req, "cash_flow_report_run", run.id, "create", null, run.toJSON())

      return ResponseHandler.success(
        res,
        {
          run,
          template: {
            id: template.id,
            name: template.name,
            version: template.version,
          },
          outputs: { xlsx: true },
          preview: result.preview,
          warnings: result.warnings,
        },
        "Cash flow report generated",
      )
    } catch (error) {
      cleanupTempUploads()
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getReportHistory(req, res, next) {
    try {
      const portfolioId = req.query.portfolio_id
      if (!portfolioId) {
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }

      const runs = await ReportRun.findAll({
        where: {
          portfolio_id: portfolioId,
          type: "cash_flow",
        },
        order: [["created_at", "DESC"]],
      })

      return ResponseHandler.success(res, { runs }, "Cash flow report history retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async downloadReport(req, res, next) {
    try {
      const run = await ReportRun.findByPk(req.params.run_id)
      if (!run || run.type !== "cash_flow") {
        return ResponseHandler.notFound(res, "Cash flow report run not found")
      }

      const xlsxPath = run.output_paths?.xlsx
      if (!xlsxPath || !fs.existsSync(xlsxPath)) {
        return ResponseHandler.notFound(res, "Cash flow report file not found")
      }

      return res.download(xlsxPath, path.basename(xlsxPath))
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = CashFlowController
