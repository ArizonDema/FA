const { Fund, Portfolio, CashFlowTemplateAnalysis } = require("../../../models")
const ResponseHandler = require("../../../utils/responseHandler")
const CashFlowService = require("../../../services/cashFlow.service")
const StorageService = require("../../storage/services/storage.service")
const TemplateAnalysisService = require("../services/templateAnalysis.service")
const TemplateService = require("../services/template.service")
const CapitalAccountTemplateService = require("../services/capitalAccountTemplate.service")
const { TEMPLATE_KINDS } = require("../template.constants")
const { resolveFundId } = require("../../shared/fund")

const FundModel = Fund || Portfolio
const TEMPLATE_KIND = TEMPLATE_KINDS.CAPITAL_ACCOUNT_STATEMENT

function isTruthy(value) {
  if (typeof value === "boolean") return value
  return ["true", "1", "yes"].includes(String(value || "").trim().toLowerCase())
}

async function resolveConfig({ body, fundId, templatePath, sourceFileName }) {
  const explicitConfig = TemplateAnalysisService.parseConfigJson(body.config_json)
  let analysis = null
  let ingestionResult = null
  let config = explicitConfig

  if (body.analysis_id) {
    analysis = await CashFlowTemplateAnalysis.findByPk(body.analysis_id)
    if (
      !analysis ||
      analysis.portfolio_id !== fundId ||
      analysis.template_kind !== TEMPLATE_KIND
    ) {
      throw new CashFlowService.CashFlowValidationError("analysis_id is invalid for the selected fund and template type")
    }
    if (analysis.expires_at && new Date(analysis.expires_at) < new Date()) {
      throw new CashFlowService.CashFlowValidationError("analysis_id has expired. Re-run template analysis.")
    }
    config = explicitConfig || analysis.suggested_config_json
  } else if (!config) {
    ingestionResult = await CapitalAccountTemplateService.analyzeTemplate({ templatePath, sourceFileName })
    config = ingestionResult.suggested_config_json
  }

  const normalizedConfig = CapitalAccountTemplateService.validateConfig(config || {})
  const review = CapitalAccountTemplateService.evaluateReadiness(normalizedConfig)
  return { analysis, ingestionResult, normalizedConfig, review }
}

function responsePayload(templateResult) {
  return {
    template: TemplateService.decorateTemplatePayload(templateResult.template, templateResult.readiness),
    saved_as_draft: templateResult.savedAsDraft,
    review_state: templateResult.readiness.review_state,
    can_activate: templateResult.readiness.can_activate,
    activation_block_reason: templateResult.readiness.activation_block_reason,
    required_anchors: templateResult.readiness.required_anchors,
    anchor_statuses: templateResult.readiness.anchor_statuses,
  }
}

class CapitalAccountTemplateController {
  static async list(req, res, next) {
    try {
      const fundId = resolveFundId(req.query)
      if (!fundId) return ResponseHandler.badRequest(res, "portfolio_id is required")
      const templates = await TemplateService.listTemplates(fundId, TEMPLATE_KIND)
      return ResponseHandler.success(res, { templates }, "Capital account statement templates retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async analyze(req, res, next) {
    let analysisPath = null
    try {
      if (!req.file) return ResponseHandler.badRequest(res, "template_file is required")
      const fundId = resolveFundId(req)
      if (!fundId) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      const fund = await FundModel.findByPk(fundId)
      if (!fund) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.notFound(res, "Fund not found")
      }

      analysisPath = StorageService.getNamespacePath(
        "capital-account-statements",
        "template-analyses",
        `${Date.now()}_${StorageService.sanitizeFileName(req.file.originalname, "cas_template_analysis")}`,
      )
      StorageService.moveFile(req.file.path, analysisPath)
      const ingestionResult = await CapitalAccountTemplateService.analyzeTemplate({
        templatePath: analysisPath,
        sourceFileName: req.file.originalname,
      })
      const { analysis, analysisConfigPayload } = await TemplateAnalysisService.createAnalysisRecord({
        fundId,
        templateKind: TEMPLATE_KIND,
        sourceFileName: req.file.originalname,
        sourceFilePath: analysisPath,
        actorId: req.user?.id || null,
        ingestionResult,
      })
      const review = CapitalAccountTemplateService.evaluateReadiness(analysisConfigPayload)
      return ResponseHandler.success(
        res,
        {
          analysis,
          suggested_config_json: analysisConfigPayload,
          workbook: TemplateService.summarizeWorkbookStructure(ingestionResult.raw_structure_json),
          review_state: review.review_state,
          can_activate: review.can_activate,
          activation_block_reason: review.activation_block_reason,
          required_anchors: review.required_anchors,
          anchor_statuses: review.anchor_statuses,
          supported_fields: review.supported_fields,
          analysis_source: ingestionResult.analysis_source,
        },
        "Capital account statement template analysis completed",
      )
    } catch (error) {
      StorageService.removeFileSilently(req.file?.path)
      StorageService.removeFileSilently(analysisPath)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async create(req, res, next) {
    try {
      if (!req.file) return ResponseHandler.badRequest(res, "template_file is required")
      const fundId = resolveFundId(req)
      const name = String(req.body.name || "").trim()
      if (!fundId || !name) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, !fundId ? "portfolio_id is required" : "name is required")
      }
      const fund = await FundModel.findByPk(fundId)
      if (!fund) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.notFound(res, "Fund not found")
      }
      const resolved = await resolveConfig({
        body: req.body,
        fundId,
        templatePath: req.file.path,
        sourceFileName: req.file.originalname,
      })
      const result = await TemplateService.createTemplate({
        fundId,
        templateKind: TEMPLATE_KIND,
        name,
        versionLabel: String(req.body.version || "").trim() || null,
        requestedActive: isTruthy(req.body.is_active),
        activationMode: req.body.activation_mode,
        upload: req.file,
        actorId: req.user?.id || null,
        analysis: resolved.analysis,
        ingestionResult: resolved.ingestionResult,
        normalizedConfig: resolved.normalizedConfig,
        review: resolved.review,
      })
      return ResponseHandler.created(
        res,
        responsePayload(result),
        result.savedAsDraft ? "CAS template saved as draft" : "CAS template created and activated",
      )
    } catch (error) {
      StorageService.removeFileSilently(req.file?.path)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async update(req, res, next) {
    try {
      const result = await TemplateService.updateTemplate({
        templateId: req.params.id,
        templateKind: TEMPLATE_KIND,
        updates: req.body,
        actorId: req.user?.id || null,
      })
      if (!result) return ResponseHandler.notFound(res, "CAS template not found")
      return ResponseHandler.success(res, responsePayload(result), "CAS template updated")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async activate(req, res, next) {
    try {
      const result = await TemplateService.activateTemplate({
        templateId: req.params.id,
        templateKind: TEMPLATE_KIND,
        actorId: req.user?.id || null,
      })
      if (!result) return ResponseHandler.notFound(res, "CAS template not found")
      return ResponseHandler.success(res, responsePayload(result), "CAS template activated")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async reanalyze(req, res, next) {
    try {
      const template = await TemplateService.getTemplate(req.params.id, TEMPLATE_KIND)
      if (!template) return ResponseHandler.notFound(res, "CAS template not found")
      const templatePath = await TemplateService.resolveTemplateSourcePathForReanalysis(template)
      const ingestionResult = await CapitalAccountTemplateService.analyzeTemplate({
        templatePath,
        sourceFileName: template.template_file_name,
      })
      const { analysis, analysisConfigPayload } = await TemplateAnalysisService.createAnalysisRecord({
        fundId: template.portfolio_id,
        templateKind: TEMPLATE_KIND,
        templateId: template.id,
        templateVersionId: template.active_version_id,
        sourceFileName: template.template_file_name,
        sourceFilePath: templatePath,
        actorId: req.user?.id || null,
        ingestionResult,
      })
      let updated = null
      if (isTruthy(req.body?.apply)) {
        updated = await TemplateService.applyReanalysis({
          templateId: template.id,
          templateKind: TEMPLATE_KIND,
          analysis,
          actorId: req.user?.id || null,
        })
      }
      const review = CapitalAccountTemplateService.evaluateReadiness(analysisConfigPayload)
      return ResponseHandler.success(res, {
        analysis,
        suggested_config_json: analysisConfigPayload,
        template: updated ? TemplateService.decorateTemplatePayload(updated.template, updated.readiness) : null,
        editor_context: TemplateService.buildEditorContext({
          template,
          version: template.activeVersion,
          analysis,
          config: analysisConfigPayload,
          mode: "reanalyze",
          review,
          workbookStructure: ingestionResult.raw_structure_json,
        }),
        ...review,
      }, "CAS template reanalysis completed")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async editorContext(req, res, next) {
    try {
      const result = await TemplateService.getTemplateEditorContext({
        templateId: req.params.id,
        templateKind: TEMPLATE_KIND,
      })
      if (!result) return ResponseHandler.notFound(res, "CAS template not found")
      return ResponseHandler.success(res, result, "CAS template editor context retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = CapitalAccountTemplateController
