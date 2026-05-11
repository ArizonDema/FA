const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
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
const CashFlowTemplateIngestionService = require("../services/cashFlowTemplateIngestion.service")

const ROOT_DIR = path.join(__dirname, "..", "..")
const CASH_FLOW_DIR = path.join(ROOT_DIR, "uploads", "cash-flow")
const TEMPLATE_DIR = path.join(CASH_FLOW_DIR, "templates")
const TEMPLATE_ANALYSIS_DIR = path.join(CASH_FLOW_DIR, "template-analyses")
const RUN_DIR = path.join(CASH_FLOW_DIR, "runs")
const ANALYSIS_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function createSchemaHash(configJson) {
  return crypto.createHash("sha256").update(stableStringify(configJson || null)).digest("hex")
}

function normalizeAnalysisIssues(issues) {
  if (!Array.isArray(issues)) return []
  return issues.map((item) => String(item || "").trim()).filter(Boolean)
}

function normalizeRequiredAnchors(requiredAnchors) {
  if (!Array.isArray(requiredAnchors)) return []
  return requiredAnchors
    .map((item) => String(item || "").trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean)
}

function toAnalysisResultPayload(result) {
  return {
    source_file_sha256: result.source_file_sha256 || null,
    detected_layout_type: result.detected_layout_type || "freeform",
    confidence: Number(result.confidence || 0),
    suggested_config_json: buildAnalysisConfigPayload(result),
    issues: normalizeAnalysisIssues(result.issues),
    required_anchors: normalizeRequiredAnchors(result.required_anchors),
    raw_structure_json: result.raw_structure_json || null,
    llm_meta_json: result.llm_meta_json || null,
    needs_human_review: Boolean(result.needs_human_review),
    analysis_source: result.analysis_source || "llm",
  }
}

async function runTemplateIngestionWithCache({ portfolioId, templatePath, sourceFileName }) {
  void portfolioId
  const sourceHash = CashFlowTemplateIngestionService.computeTemplateHash(templatePath)

  const ingestionResult = await CashFlowTemplateIngestionService.ingestTemplateSchema({
    templatePath,
    sourceFileName,
  })
  const payload = toAnalysisResultPayload(ingestionResult)
  return {
    ...payload,
    source_file_sha256: sourceHash,
    schema_cache_hit: false,
    analysis_source: payload.analysis_source || "llm",
    cache_source_analysis_id: null,
  }
}

function buildIssuesJson({ issues, requiredAnchors, schemaCacheHit, analysisSource, cacheSourceAnalysisId }) {
  return {
    issues: normalizeAnalysisIssues(issues),
    required_anchors: normalizeRequiredAnchors(requiredAnchors),
    ingestion: {
      schema_cache_hit: Boolean(schemaCacheHit),
      analysis_source: analysisSource || "llm",
      cache_source_analysis_id: cacheSourceAnalysisId || null,
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

async function resolveConfigFromAnalysisOrPayload({ body, portfolioId, templatePath, sourceFileName }) {
  const hasAnalysisId = Boolean(body.analysis_id)
  const explicitConfig = parseConfigJson(body.config_json)

  if (!templatePath) {
    throw new CashFlowService.CashFlowValidationError("template_file is required for template ingestion")
  }

  let analysis = null
  let ingestionResult = null
  let baseConfig = explicitConfig || null

  if (hasAnalysisId) {
    analysis = await CashFlowTemplateAnalysis.findByPk(body.analysis_id)
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
    const hasMeaningfulOverride =
      Boolean(explicitConfig) && stableStringify(mergedConfig || null) !== stableStringify(analysisConfig || null)
    if (analysis.needs_human_review && !hasMeaningfulOverride) {
      throw new CashFlowService.CashFlowValidationError(
        "Selected analysis is flagged for human review. Update config_json to resolve required anchors before saving.",
        {
          issues: normalizeAnalysisIssues(analysis?.issues_json?.issues),
          required_anchors: normalizeRequiredAnchors(analysis?.issues_json?.required_anchors),
        },
      )
    }
    baseConfig = mergedConfig
  } else {
    ingestionResult = await runTemplateIngestionWithCache({
      portfolioId,
      templatePath,
      sourceFileName,
    })
    if (!ingestionResult?.suggested_config_json) {
      throw new CashFlowService.CashFlowValidationError("Template ingestion did not produce a usable configuration")
    }
    const mergedConfig = explicitConfig
      ? deepMerge(ingestionResult.suggested_config_json, explicitConfig)
      : ingestionResult.suggested_config_json
    const hasMeaningfulOverride =
      Boolean(explicitConfig) &&
      stableStringify(mergedConfig || null) !== stableStringify(ingestionResult.suggested_config_json || null)
    if (ingestionResult.needs_human_review && !hasMeaningfulOverride) {
      throw new CashFlowService.CashFlowValidationError(
        "Template ingestion needs human review before creation. Update config_json to resolve required anchors first.",
        {
          issues: ingestionResult.issues || [],
          required_anchors: ingestionResult.required_anchors || [],
        },
      )
    }
    baseConfig = mergedConfig
  }

  const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
    templateConfig: baseConfig,
    templatePath,
  })

  return {
    analysis,
    ingestionResult,
    normalizedConfig: CashFlowService.validateTemplateConfig(normalizedV3),
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

function buildAutoMappingMetadata(mapping = {}) {
  return {
    semantic_key: mapping.semantic_key || null,
    source: mapping.source || "auto_semantic",
    status: mapping.status || "suggested",
    profile_score: Number(mapping.profile_score || 0),
    llm_score: Number(mapping.llm_score || 0),
    deterministic_score: Number(mapping.deterministic_score || mapping.confidence || 0),
    evidence: Array.isArray(mapping.evidence) ? mapping.evidence : [],
    reasoning: mapping.reasoning || null,
    previous_bucket_key: mapping.previous_bucket_key || null,
    account_profile: mapping.account_profile || null,
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
    let analysisFilePath = null
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
      analysisFilePath = path.join(TEMPLATE_ANALYSIS_DIR, analysisFileName)
      moveFile(req.file.path, analysisFilePath)

      const analysisResult = await runTemplateIngestionWithCache({
        portfolioId,
        templatePath: analysisFilePath,
        sourceFileName: req.file.originalname,
      })
      const analysisConfigPayload = buildAnalysisConfigPayload(analysisResult)

      const analysis = await CashFlowTemplateAnalysis.create({
        portfolio_id: portfolioId,
        source_file_name: req.file.originalname,
        source_file_path: analysisFilePath,
        source_file_sha256: analysisResult.source_file_sha256 || null,
        status: "suggested",
        detected_layout_type: analysisResult.detected_layout_type,
        confidence: analysisResult.confidence,
        suggested_config_json: analysisConfigPayload,
        raw_structure_json: analysisResult.raw_structure_json || null,
        llm_meta_json: analysisResult.llm_meta_json || null,
        schema_hash: createSchemaHash(analysisConfigPayload),
        needs_human_review: Boolean(analysisResult.needs_human_review),
        issues_json: buildIssuesJson({
          issues: analysisResult.issues || [],
          requiredAnchors: analysisResult.required_anchors || [],
          schemaCacheHit: analysisResult.schema_cache_hit,
          analysisSource: analysisResult.analysis_source,
          cacheSourceAnalysisId: analysisResult.cache_source_analysis_id,
        }),
        created_by: req.user?.id || null,
        expires_at: new Date(Date.now() + ANALYSIS_TTL_MS),
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
          needs_human_review: Boolean(analysisResult.needs_human_review),
          schema_cache_hit: Boolean(analysisResult.schema_cache_hit),
          analysis_source: analysisResult.analysis_source || "llm",
        },
        "Template analysis completed",
      )
    } catch (error) {
      removeFileSilently(req.file?.path)
      removeFileSilently(analysisFilePath)
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
      let ingestionResult = null
      const resolved = await resolveConfigFromAnalysisOrPayload({
        body: req.body,
        portfolioId,
        templatePath: req.file.path,
        sourceFileName: req.file.originalname,
      })
      analysis = resolved.analysis
      ingestionResult = resolved.ingestionResult
      normalizedConfig = resolved.normalizedConfig
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
              schema_hash: createSchemaHash(template.config_json),
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
        } else if (ingestionResult) {
          const fallbackAnalysis = await CashFlowTemplateAnalysis.create(
            {
              portfolio_id: portfolioId,
              template_id: template.id,
              source_file_name: req.file.originalname,
              source_file_path: finalPath,
              source_file_sha256: ingestionResult.source_file_sha256 || null,
              status: "confirmed",
              detected_layout_type: ingestionResult.detected_layout_type || "freeform",
              confidence: Number(ingestionResult.confidence || 0),
              suggested_config_json: normalizedConfig,
              raw_structure_json: ingestionResult.raw_structure_json || null,
              issues_json: buildIssuesJson({
                issues: ingestionResult.issues || [],
                requiredAnchors: ingestionResult.required_anchors || [],
                schemaCacheHit: ingestionResult.schema_cache_hit,
                analysisSource: ingestionResult.analysis_source,
                cacheSourceAnalysisId: ingestionResult.cache_source_analysis_id,
              }),
              llm_meta_json: ingestionResult.llm_meta_json || null,
              schema_hash: createSchemaHash(normalizedConfig),
              needs_human_review: false,
              created_by: req.user?.id || null,
              expires_at: new Date(Date.now() + ANALYSIS_TTL_MS),
            },
            { transaction },
          )
          analysis = fallbackAnalysis
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
        const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
          templateConfig: configPayload,
          templatePath: template.template_file_path,
        })
        updates.config_json = CashFlowService.validateTemplateConfig(normalizedV3)
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

      const analysisResult = await runTemplateIngestionWithCache({
        portfolioId: template.portfolio_id,
        templatePath: template.template_file_path,
        sourceFileName: template.template_file_name,
      })
      const analysisConfigPayload = buildAnalysisConfigPayload(analysisResult)

      const analysis = await CashFlowTemplateAnalysis.create({
        portfolio_id: template.portfolio_id,
        template_id: template.id,
        source_file_name: template.template_file_name,
        source_file_path: template.template_file_path,
        source_file_sha256: analysisResult.source_file_sha256 || null,
        status: "suggested",
        detected_layout_type: analysisResult.detected_layout_type,
        confidence: analysisResult.confidence,
        suggested_config_json: analysisConfigPayload,
        raw_structure_json: analysisResult.raw_structure_json || null,
        issues_json: buildIssuesJson({
          issues: analysisResult.issues || [],
          requiredAnchors: analysisResult.required_anchors || [],
          schemaCacheHit: analysisResult.schema_cache_hit,
          analysisSource: analysisResult.analysis_source,
          cacheSourceAnalysisId: analysisResult.cache_source_analysis_id,
        }),
        llm_meta_json: analysisResult.llm_meta_json || null,
        schema_hash: createSchemaHash(analysisConfigPayload),
        needs_human_review: Boolean(analysisResult.needs_human_review),
        created_by: req.user?.id || null,
        expires_at: new Date(Date.now() + ANALYSIS_TTL_MS),
      })

      let updatedTemplate = null
      if (parseBoolean(req.body?.apply, false)) {
        if (analysisResult.needs_human_review) {
          return ResponseHandler.badRequest(
            res,
            "Reanalysis is flagged for human review. Resolve required anchors before applying.",
            {
              issues: analysisResult.issues || [],
              required_anchors: analysisResult.required_anchors || [],
            },
          )
        }
        if (!analysisResult.suggested_config_json) {
          return ResponseHandler.badRequest(
            res,
            "Reanalysis needs manual anchors before config can be applied.",
            analysisResult.required_anchors || [],
          )
        }

        const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
          templateConfig: analysisResult.suggested_config_json,
          templatePath: template.template_file_path,
        })
        const normalizedConfig = CashFlowService.validateTemplateConfig(normalizedV3)
        await template.update({ config_json: normalizedConfig })
        await analysis.update({
          status: "confirmed",
          schema_hash: createSchemaHash(normalizedConfig),
          needs_human_review: false,
        })
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
          needs_human_review: Boolean(analysisResult.needs_human_review),
          schema_cache_hit: Boolean(analysisResult.schema_cache_hit),
          analysis_source: analysisResult.analysis_source || "llm",
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

      let templateConfigForRun = template.config_json
      let autoCorrectedSheetName = null
      let result = null
      try {
        result = await CashFlowService.generateCashFlowReport({
          templatePath: template.template_file_path,
          templateConfig: templateConfigForRun,
          tbFilePath,
          glFilePath,
          dateStart: resolvedRange.start.toISOString().slice(0, 10),
          dateEnd: resolvedRange.end.toISOString().slice(0, 10),
          preset,
          fiscalYear,
          outputFilePath,
          learnedMappings,
        })
      } catch (generationError) {
        const availableSheets = Array.isArray(generationError?.details?.available_sheets)
          ? generationError.details.available_sheets.filter(Boolean)
          : []
        const currentSheetName = String(templateConfigForRun?.sheet_name || "").trim()
        const caseInsensitiveMatch =
          currentSheetName && availableSheets.length
            ? availableSheets.find((sheetName) => String(sheetName).trim().toLowerCase() === currentSheetName.toLowerCase())
            : null
        const fallbackSheetName = caseInsensitiveMatch || (availableSheets.length === 1 ? availableSheets[0] : null)
        const canAutoCorrectSheet =
          generationError instanceof CashFlowService.CashFlowValidationError &&
          /^Template sheet ".+" not found$/.test(String(generationError.message || "")) &&
          Boolean(fallbackSheetName) &&
          fallbackSheetName !== currentSheetName

        if (!canAutoCorrectSheet) {
          throw generationError
        }

        const correctedConfig = await CashFlowService.ensureV3TemplateConfig({
          templateConfig: {
            ...(templateConfigForRun || {}),
            sheet_name: fallbackSheetName,
          },
          templatePath: template.template_file_path,
        })

        result = await CashFlowService.generateCashFlowReport({
          templatePath: template.template_file_path,
          templateConfig: correctedConfig,
          tbFilePath,
          glFilePath,
          dateStart: resolvedRange.start.toISOString().slice(0, 10),
          dateEnd: resolvedRange.end.toISOString().slice(0, 10),
          preset,
          fiscalYear,
          outputFilePath,
          learnedMappings,
        })
        templateConfigForRun = correctedConfig
        autoCorrectedSheetName = fallbackSheetName
      }

      if (autoCorrectedSheetName) {
        result = {
          ...result,
          warnings: [
            ...(Array.isArray(result.warnings) ? result.warnings : []),
            `Template sheet mapping was auto-corrected to "${autoCorrectedSheetName}" for this run. Review and confirm the template config.`,
          ],
          normalizedConfig: templateConfigForRun,
        }
      }

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
              status: mapping.status || "suggested",
              metadata_json: buildAutoMappingMetadata(mapping),
              usage_count: 0,
              last_used_at: null,
              created_by: req.user?.id || null,
            },
            transaction,
          })

          if (!created && record.status !== "approved") {
            await record.update(
              {
                bucket_key: mapping.bucket_key,
                confidence: mapping.confidence,
                source: mapping.source || record.source,
                status: mapping.status || record.status || "suggested",
                metadata_json: buildAutoMappingMetadata(mapping),
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
          assistance_summary: result.mapping?.assistance_summary || null,
          account_profile_summary: result.mapping?.account_profile_summary || null,
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
          assistance_summary: result.mapping?.assistance_summary || null,
          account_profile_summary: result.mapping?.account_profile_summary || null,
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
