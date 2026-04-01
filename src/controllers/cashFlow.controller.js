const fs = require("fs")
const path = require("path")
const { Op } = require("sequelize")
const {
  sequelize,
  Portfolio,
  CashFlowTemplate,
  CashFlowTemplateAnalysis,
  CashFlowAccountMapping,
  ReportRun,
  AuditLog,
} = require("../models")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")
const CashFlowService = require("../services/cashFlow.service")

const ROOT_DIR = path.join(__dirname, "..", "..")
const CASH_FLOW_DIR = path.join(ROOT_DIR, "uploads", "cash-flow")
const TEMPLATE_DIR = path.join(CASH_FLOW_DIR, "templates")
const TEMPLATE_ANALYSIS_DIR = path.join(CASH_FLOW_DIR, "template-analyses")
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

function buildAnalysisConfigPayload(analysisResult) {
  if (analysisResult?.suggested_config_json) {
    return analysisResult.suggested_config_json
  }

  return {
    version: "v3",
    sheet_name: "Cash Flow",
    layout_type: "freeform",
    period_granularity: "custom",
    period_axis: {
      orientation: "row",
      labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
      period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
    },
    period_resolution_rules: {
      custom_periods: [
        {
          period_key: "period_1",
          date_start: new Date().toISOString().slice(0, 10),
          date_end: new Date().toISOString().slice(0, 10),
        },
      ],
    },
    opening_binding: null,
    closing_binding: null,
    bucket_bindings: [
      {
        bucket_key: "inflow_bucket",
        label: "Inflow Bucket",
        direction: "inflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "B1" }],
      },
      {
        bucket_key: "outflow_bucket",
        label: "Outflow Bucket",
        direction: "outflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "C1" }],
      },
    ],
    writer_policy: {
      preserve_formulas: true,
      full_recalc_on_open: true,
    },
    mapping_policy: {
      auto_create: true,
      high_confidence_threshold: 0.7,
      low_confidence_threshold: 0.35,
    },
  }
}

function deepMerge(target, source) {
  const base = Array.isArray(target) ? [...target] : { ...(target || {}) }
  if (!source || typeof source !== "object") return base

  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      base[key] = value.map((item) => (typeof item === "object" && item ? deepMerge({}, item) : item))
      return
    }
    if (value && typeof value === "object") {
      const current = base[key] && typeof base[key] === "object" ? base[key] : {}
      base[key] = deepMerge(current, value)
      return
    }
    base[key] = value
  })
  return base
}

async function resolveConfigFromAnalysisOrPayload({ body, portfolioId }) {
  const hasAnalysisId = Boolean(body.analysis_id)
  const explicitConfig = parseConfigJson(body.config_json)

  if (!hasAnalysisId && !explicitConfig) {
    throw new CashFlowService.CashFlowValidationError(
      "Either analysis_id or config_json is required for template creation",
    )
  }

  if (!hasAnalysisId) {
    return {
      analysis: null,
      normalizedConfig: CashFlowService.validateTemplateConfig(explicitConfig),
    }
  }

  const analysis = await CashFlowTemplateAnalysis.findByPk(body.analysis_id)
  if (!analysis || analysis.portfolio_id !== portfolioId) {
    throw new CashFlowService.CashFlowValidationError("analysis_id is invalid for the selected fund")
  }
  if (analysis.expires_at && new Date(analysis.expires_at) < new Date()) {
    throw new CashFlowService.CashFlowValidationError("analysis_id has expired. Re-run template analysis.")
  }

  const analysisConfig = analysis.suggested_config_json
  if (!analysisConfig) {
    throw new CashFlowService.CashFlowValidationError(
      "Analysis did not produce a usable config. Provide config_json with manual anchors.",
    )
  }

  const mergedConfig = explicitConfig ? deepMerge(analysisConfig, explicitConfig) : analysisConfig
  return {
    analysis,
    normalizedConfig: CashFlowService.validateTemplateConfig(mergedConfig),
  }
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

  static async analyzeTemplate(req, res, next) {
    try {
      if (!req.file) {
        return ResponseHandler.badRequest(res, "template_file is required")
      }

      const { portfolio_id: portfolioId } = req.body
      if (!portfolioId) {
        removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }

      const portfolio = await Portfolio.findByPk(portfolioId)
      if (!portfolio) {
        removeFileSilently(req.file.path)
        return ResponseHandler.notFound(res, "Fund not found")
      }

      ensureDirectory(TEMPLATE_ANALYSIS_DIR)
      const analysisFileName = `${Date.now()}_${safeFileName(req.file.originalname, "cash_flow_template_analysis")}`
      const analysisFilePath = path.join(TEMPLATE_ANALYSIS_DIR, analysisFileName)
      moveFile(req.file.path, analysisFilePath)

      const analysisResult = await CashFlowService.analyzeTemplateWorkbook({
        templatePath: analysisFilePath,
      })
      const analysisConfigPayload = buildAnalysisConfigPayload(analysisResult)

      const analysis = await CashFlowTemplateAnalysis.create({
        portfolio_id: portfolioId,
        source_file_name: req.file.originalname,
        source_file_path: analysisFilePath,
        status: "suggested",
        detected_layout_type: analysisResult.detected_layout_type,
        confidence: analysisResult.confidence,
        suggested_config_json: analysisConfigPayload,
        issues_json: {
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
        },
        created_by: req.user?.id || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      await recordAudit(req, "cash_flow_template_analysis", analysis.id, "create", null, analysis.toJSON())

      return ResponseHandler.success(
        res,
        {
          analysis,
          detected_layout: analysisResult.detected_layout_type,
          confidence: analysisResult.confidence,
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
          suggested_config_json: analysisConfigPayload,
        },
        "Template analysis completed",
      )
    } catch (error) {
      removeFileSilently(req.file?.path)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
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

      let analysis = null
      let normalizedConfig = null
      try {
        const resolved = await resolveConfigFromAnalysisOrPayload({
          body: req.body,
          portfolioId,
        })
        analysis = resolved.analysis
        normalizedConfig = resolved.normalizedConfig
      } catch (error) {
        // Backward compatibility path: if client sent old/invalid config, fall back to automatic analysis.
        if (!(error instanceof CashFlowService.CashFlowValidationError)) throw error

        const autoAnalysis = await CashFlowService.analyzeTemplateWorkbook({
          templatePath: req.file.path,
        })
        if (!autoAnalysis?.suggested_config_json) {
          throw error
        }

        normalizedConfig = CashFlowService.validateTemplateConfig(autoAnalysis.suggested_config_json)
      }
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

        if (analysis) {
          await analysis.update(
            {
              status: "confirmed",
              template_id: template.id,
            },
            { transaction },
          )

          await CashFlowTemplateAnalysis.update(
            { status: "superseded" },
            {
              where: {
                portfolio_id: portfolioId,
                id: { [Op.ne]: analysis.id },
                status: "suggested",
              },
              transaction,
            },
          )
        }

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

  static async reanalyzeTemplate(req, res, next) {
    try {
      const template = await CashFlowTemplate.findByPk(req.params.id)
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }
      if (!template.template_file_path || !fs.existsSync(template.template_file_path)) {
        return ResponseHandler.badRequest(res, "Template file is missing and cannot be reanalyzed")
      }

      const analysisResult = await CashFlowService.analyzeTemplateWorkbook({
        templatePath: template.template_file_path,
      })
      const analysisConfigPayload = buildAnalysisConfigPayload(analysisResult)

      const analysis = await CashFlowTemplateAnalysis.create({
        portfolio_id: template.portfolio_id,
        template_id: template.id,
        source_file_name: template.template_file_name,
        source_file_path: template.template_file_path,
        status: "suggested",
        detected_layout_type: analysisResult.detected_layout_type,
        confidence: analysisResult.confidence,
        suggested_config_json: analysisConfigPayload,
        issues_json: {
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
        },
        created_by: req.user?.id || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      let updatedTemplate = null
      if (parseBoolean(req.body?.apply, false)) {
        if (!analysisResult.suggested_config_json) {
          return ResponseHandler.badRequest(
            res,
            "Reanalysis needs manual anchors before config can be applied.",
            analysisResult.required_anchors || [],
          )
        }

        const normalizedConfig = CashFlowService.validateTemplateConfig(analysisResult.suggested_config_json)
        await template.update({ config_json: normalizedConfig })
        await analysis.update({ status: "confirmed" })
        updatedTemplate = template
      }

      await recordAudit(req, "cash_flow_template_analysis", analysis.id, "create", null, analysis.toJSON())

      return ResponseHandler.success(
        res,
        {
          analysis,
          template: updatedTemplate,
          detected_layout: analysisResult.detected_layout_type,
          confidence: analysisResult.confidence,
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
          suggested_config_json: analysisConfigPayload,
        },
        updatedTemplate
          ? "Template reanalyzed and config applied"
          : "Template reanalysis completed",
      )
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
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
      const dateStart = req.body.date_start ? String(req.body.date_start).trim() : null
      const dateEnd = req.body.date_end ? String(req.body.date_end).trim() : null
      const preset = req.body.preset ? String(req.body.preset).trim().toUpperCase() : null
      const fiscalYearRaw = req.body.fiscal_year
      const fiscalYear =
        fiscalYearRaw === undefined || fiscalYearRaw === null || String(fiscalYearRaw).trim() === ""
          ? null
          : Number.parseInt(fiscalYearRaw, 10)
      const tbUpload = req.files?.tb_file?.[0]
      const glUpload = req.files?.gl_file?.[0]

      if (!portfolioId) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      if (!dateStart && !dateEnd && !preset && !Number.isInteger(fiscalYear)) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(
          res,
          "Provide date_start/date_end, or preset, or fiscal_year (deprecated fallback).",
        )
      }
      if ((dateStart && !dateEnd) || (!dateStart && dateEnd)) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "date_start and date_end must be provided together")
      }
      if (!tbUpload || !glUpload) {
        cleanupTempUploads()
        return ResponseHandler.badRequest(res, "tb_file and gl_file are required")
      }

      let resolvedRange = null
      try {
        resolvedRange = CashFlowService.resolveRunDateRange({
          dateStart,
          dateEnd,
          preset,
          fiscalYear,
        })
      } catch (rangeError) {
        cleanupTempUploads()
        if (rangeError instanceof CashFlowService.CashFlowValidationError) {
          return ResponseHandler.badRequest(res, rangeError.message, rangeError.details || null)
        }
        throw rangeError
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
        period_start: resolvedRange.start.toISOString().slice(0, 10),
        period_end: resolvedRange.end.toISOString().slice(0, 10),
        inputs_json: {
          date_start: resolvedRange.start.toISOString().slice(0, 10),
          date_end: resolvedRange.end.toISOString().slice(0, 10),
          preset: preset || null,
          fiscal_year: Number.isInteger(fiscalYear) ? fiscalYear : null,
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

      const outputFilePath = path.join(
        runFolder,
        `cash_flow_${resolvedRange.start.toISOString().slice(0, 10)}_${resolvedRange.end
          .toISOString()
          .slice(0, 10)}.xlsx`,
      )

      const learnedMappingsRaw = await CashFlowAccountMapping.findAll({
        where: {
          portfolio_id: portfolioId,
          [Op.or]: [{ template_id: null }, { template_id: template.id }],
        },
      })
      const learnedMappings = learnedMappingsRaw
        .map((item) => item.toJSON())
        .sort((left, right) => {
          const leftTemplateSpecific = left.template_id === template.id ? 1 : 0
          const rightTemplateSpecific = right.template_id === template.id ? 1 : 0
          return leftTemplateSpecific - rightTemplateSpecific
        })

      const result = await CashFlowService.generateCashFlowReport({
        templatePath: template.template_file_path,
        templateConfig: template.config_json,
        tbFilePath,
        glFilePath,
        dateStart: resolvedRange.start.toISOString().slice(0, 10),
        dateEnd: resolvedRange.end.toISOString().slice(0, 10),
        preset,
        fiscalYear,
        outputFilePath,
        learnedMappings,
      })

      await sequelize.transaction(async (transaction) => {
        if (
          result.normalizedConfig &&
          JSON.stringify(template.config_json || null) !== JSON.stringify(result.normalizedConfig || null)
        ) {
          await template.update(
            {
              config_json: result.normalizedConfig,
            },
            { transaction },
          )
        }

        const autoMappings = Array.isArray(result.mapping?.auto_mappings_created)
          ? result.mapping.auto_mappings_created
          : []

        for (const mapping of autoMappings) {
          const [record, created] = await CashFlowAccountMapping.findOrCreate({
            where: {
              portfolio_id: portfolioId,
              template_id: template.id,
              normalized_account: mapping.normalized_account,
              direction: mapping.direction,
            },
            defaults: {
              bucket_key: mapping.bucket_key,
              confidence: mapping.confidence,
              source: mapping.source || "auto_semantic",
              usage_count: 0,
              last_used_at: null,
              created_by: req.user?.id || null,
            },
            transaction,
          })

          if (!created) {
            await record.update(
              {
                bucket_key: mapping.bucket_key,
                confidence: mapping.confidence,
                source: mapping.source || record.source,
              },
              { transaction },
            )
          }
        }

        const finalAssignments = Array.isArray(result.mapping?.final_bucket_assignments)
          ? result.mapping.final_bucket_assignments
          : []
        for (const assignment of finalAssignments) {
          const existing = await CashFlowAccountMapping.findOne({
            where: {
              portfolio_id: portfolioId,
              template_id: template.id,
              normalized_account: assignment.normalized_account,
              direction: assignment.direction,
            },
            transaction,
          })
          if (existing) {
            await existing.update(
              {
                usage_count: Number(existing.usage_count || 0) + 1,
                last_used_at: new Date(),
              },
              { transaction },
            )
          }
        }
      })

      await run.update({
        inputs_json: {
          ...run.inputs_json,
          tb_file_path: tbFilePath,
          gl_file_path: glFilePath,
          warnings: result.warnings,
          auto_mappings_created: result.mapping?.auto_mappings_created || [],
          low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
          final_bucket_assignments: result.mapping?.final_bucket_assignments || [],
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
          auto_mappings_created: result.mapping?.auto_mappings_created || [],
          low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
          final_bucket_assignments: result.mapping?.final_bucket_assignments || [],
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
