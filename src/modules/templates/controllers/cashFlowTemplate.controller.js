const { Fund, Portfolio } = require("../../../models")
const ResponseHandler = require("../../../utils/responseHandler")
const CashFlowService = require("../../../services/cashFlow.service")
const StorageService = require("../../storage/services/storage.service")
const MappingSuggestionService = require("../../mappings/services/mappingSuggestion.service")
const LlmMappingAssistantService = require("../../mappings/services/llmMappingAssistant.service")
const ReviewTaskService = require("../../reviews/services/reviewTask.service")
const TemplateAnalysisService = require("../services/templateAnalysis.service")
const TemplateService = require("../services/template.service")
const TemplateParsingService = require("../services/templateParsing.service")
const { resolveFundId } = require("../../shared/fund")
const { buildAnalysisConfigPayload } = require("../utils/templateAnalysis.util")

const FundModel = Fund || Portfolio

function isTruthy(value) {
  if (typeof value === "boolean") return value
  return String(value || "")
    .trim()
    .toLowerCase() === "true"
}

function summarizeSemanticCoverage(config) {
  try {
    return CashFlowService.summarizeTemplateSemanticCoverage(config || {})
  } catch (error) {
    return null
  }
}

class CashFlowTemplateController {
  static async getTemplates(req, res, next) {
    try {
      const fundId = resolveFundId(req.query)
      if (!fundId) {
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }

      const templates = await TemplateService.listTemplates(fundId)
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

      analysisFilePath = StorageService.getNamespacePath(
        "cash-flow",
        "template-analyses",
        `${Date.now()}_${StorageService.sanitizeFileName(req.file.originalname, "cash_flow_template_analysis")}`,
      )
      StorageService.moveFile(req.file.path, analysisFilePath)

      const analysisResult = await TemplateAnalysisService.runTemplateIngestion({
        templatePath: analysisFilePath,
        sourceFileName: req.file.originalname,
      })
      const { analysis, analysisConfigPayload } = await TemplateAnalysisService.createAnalysisRecord({
        fundId,
        sourceFileName: req.file.originalname,
        sourceFilePath: analysisFilePath,
        actorId: req.user?.id || null,
        ingestionResult: analysisResult,
      })
      const review = TemplateService.evaluateReadinessForConfig({
        config: analysisConfigPayload,
        analysis: {
          needs_human_review: Boolean(analysisResult.needs_human_review),
          issues_json: { required_anchors: analysisResult.required_anchors || [] },
          suggested_config_json: analysisConfigPayload,
        },
      })
      const editorContext = TemplateService.buildEditorContext({
        analysis,
        config: analysisConfigPayload,
        mode: "new_upload",
        review,
        workbookStructure: analysisResult.raw_structure_json || null,
      })
      const semanticCoverage = summarizeSemanticCoverage(analysisConfigPayload)

      return ResponseHandler.success(
        res,
        {
          analysis,
          detected_layout: analysisResult.detected_layout_type,
          confidence: analysisResult.confidence,
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
          suggested_config_json: analysisConfigPayload,
          semantic_coverage: semanticCoverage,
          coverage_summary: semanticCoverage,
          needs_human_review: Boolean(analysisResult.needs_human_review),
          review_state: review.review_state,
          can_activate: review.can_activate,
          activation_block_reason: review.activation_block_reason,
          anchor_statuses: review.anchor_statuses,
          editor_context: editorContext,
          schema_cache_hit: Boolean(analysisResult.schema_cache_hit),
          analysis_source: analysisResult.analysis_source || "llm",
          llm_fallback_reason: analysisResult.llm_failure_reason || null,
        },
        "Template analysis completed",
      )
    } catch (error) {
      StorageService.removeFileSilently(req.file?.path)
      StorageService.removeFileSilently(analysisFilePath)
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

      const fundId = resolveFundId(req)
      const { name, version } = req.body
      if (!fundId) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      if (!name) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.badRequest(res, "name is required")
      }

      const fund = await FundModel.findByPk(fundId)
      if (!fund) {
        StorageService.removeFileSilently(req.file.path)
        return ResponseHandler.notFound(res, "Fund not found")
      }

      const resolved = await TemplateAnalysisService.resolveConfigFromAnalysisOrPayload({
        body: req.body,
        fundId,
        templatePath: req.file.path,
        sourceFileName: req.file.originalname,
      })

      const template = await TemplateService.createTemplate({
        fundId,
        name,
        versionLabel: version ? String(version).trim() : null,
        activationMode: req.body.activation_mode,
        requestedActive: Boolean(req.body.is_active === "true" || req.body.is_active === true),
        upload: req.file,
        actorId: req.user?.id || null,
        analysis: resolved.analysis,
        ingestionResult: resolved.ingestionResult,
        normalizedConfig: resolved.normalizedConfig,
        review: resolved.review,
      })

      return ResponseHandler.created(
        res,
        {
          template: TemplateService.decorateTemplatePayload(template.template, template.readiness),
          saved_as_draft: template.savedAsDraft,
          review_state: template.readiness.review_state,
          can_activate: template.readiness.can_activate,
          activation_block_reason: template.readiness.activation_block_reason,
          required_anchors: template.readiness.required_anchors,
          anchor_statuses: template.readiness.anchor_statuses,
        },
        template.savedAsDraft
          ? "Cash flow template saved as draft for review"
          : "Cash flow template created",
      )
    } catch (error) {
      StorageService.removeFileSilently(req.file?.path)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async updateTemplate(req, res, next) {
    try {
      const template = await TemplateService.updateTemplate({
        templateId: req.params.id,
        updates: req.body,
        actorId: req.user?.id || null,
      })
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }
      return ResponseHandler.success(
        res,
        {
          template: TemplateService.decorateTemplatePayload(template.template, template.readiness),
          saved_as_draft: template.savedAsDraft,
          review_state: template.readiness.review_state,
          can_activate: template.readiness.can_activate,
          activation_block_reason: template.readiness.activation_block_reason,
          required_anchors: template.readiness.required_anchors,
          anchor_statuses: template.readiness.anchor_statuses,
        },
        template.savedAsDraft
          ? "Cash flow template saved as draft for review"
          : "Cash flow template updated",
      )
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async activateTemplate(req, res, next) {
    try {
      const template = await TemplateService.activateTemplate({
        templateId: req.params.id,
        actorId: req.user?.id || null,
      })
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }
      return ResponseHandler.success(
        res,
        {
          template: TemplateService.decorateTemplatePayload(template.template, template.readiness),
          saved_as_draft: false,
          review_state: template.readiness.review_state,
          can_activate: template.readiness.can_activate,
          activation_block_reason: template.readiness.activation_block_reason,
          required_anchors: template.readiness.required_anchors,
          anchor_statuses: template.readiness.anchor_statuses,
        },
        "Cash flow template activated",
      )
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async reanalyzeTemplate(req, res, next) {
    try {
      const template = await TemplateService.getTemplate(req.params.id)
      if (!template) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }

      const resolvedTemplatePath = await TemplateService.resolveTemplateSourcePathForReanalysis(template)

      const analysisResult = await TemplateAnalysisService.runTemplateIngestion({
        templatePath: resolvedTemplatePath,
        sourceFileName: template.template_file_name || template.activeVersion?.source_file_name,
        forceLlm: true,
      })

      const { analysis, analysisConfigPayload } = await TemplateAnalysisService.createAnalysisRecord({
        fundId: template.portfolio_id,
        templateId: template.id,
        templateVersionId: template.active_version_id || null,
        sourceFileName: template.template_file_name,
        sourceFilePath: template.template_file_path,
        actorId: req.user?.id || null,
        ingestionResult: analysisResult,
      })

      let updatedTemplate = null
      const review = TemplateService.evaluateReadinessForConfig({
        config: analysisConfigPayload || buildAnalysisConfigPayload(analysisResult),
        analysis: {
          needs_human_review: Boolean(analysisResult.needs_human_review),
          issues_json: { required_anchors: analysisResult.required_anchors || [] },
          suggested_config_json: analysisConfigPayload || buildAnalysisConfigPayload(analysisResult),
        },
      })
      if (String(req.body?.apply || "").toLowerCase() === "true") {
        updatedTemplate = await TemplateService.applyReanalysis({
          templateId: template.id,
          analysis,
          actorId: req.user?.id || null,
        })
      }

      return ResponseHandler.success(
        res,
        {
          analysis,
          template: updatedTemplate
            ? TemplateService.decorateTemplatePayload(updatedTemplate.template, updatedTemplate.readiness)
            : null,
          detected_layout: analysisResult.detected_layout_type,
          confidence: analysisResult.confidence,
          issues: analysisResult.issues || [],
          required_anchors: analysisResult.required_anchors || [],
          suggested_config_json: analysisConfigPayload || buildAnalysisConfigPayload(analysisResult),
          needs_human_review: Boolean(analysisResult.needs_human_review),
          review_state: review.review_state,
          can_activate: review.can_activate,
          activation_block_reason: review.activation_block_reason,
          anchor_statuses: review.anchor_statuses,
          editor_context: TemplateService.buildEditorContext({
            template,
            version: template.activeVersion,
            analysis,
            config: analysisConfigPayload || buildAnalysisConfigPayload(analysisResult),
            mode: "reanalyze",
            review,
            workbookStructure: analysisResult.raw_structure_json || null,
          }),
          semantic_coverage: summarizeSemanticCoverage(analysisConfigPayload || buildAnalysisConfigPayload(analysisResult)),
          coverage_summary: summarizeSemanticCoverage(analysisConfigPayload || buildAnalysisConfigPayload(analysisResult)),
          schema_cache_hit: Boolean(analysisResult.schema_cache_hit),
          analysis_source: analysisResult.analysis_source || "llm",
          llm_fallback_reason: analysisResult.llm_failure_reason || null,
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

  static async getTemplateEditorContext(req, res, next) {
    try {
      const result = await TemplateService.getTemplateEditorContext({
        templateId: req.params.id,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Cash flow template not found")
      }

      return ResponseHandler.success(res, result, "Cash flow template editor context retrieved")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async parseTemplateVersion(req, res, next) {
    try {
      const result = await TemplateParsingService.parseTemplateVersion({
        templateId: req.params.id,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          structure: result.normalizedStructure,
          parse_metadata: result.parseMetadata,
          persisted_row_count: result.persistedRowCount,
        },
        "Template version parsed",
      )
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getTemplateVersionStructure(req, res, next) {
    try {
      const result = await TemplateParsingService.getParsedStructure({
        templateId: req.params.id,
        versionId: req.params.versionId,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          structure: result.structure,
          parse_metadata: result.parseMetadata,
        },
        "Template version structure retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getTemplateVersionRows(req, res, next) {
    try {
      const result = await TemplateParsingService.getTemplateRows({
        templateId: req.params.id,
        versionId: req.params.versionId,
        sheetName: req.query.sheet_name || null,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          rows: result.rows,
        },
        "Template version rows retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async suggestTemplateVersionMappings(req, res, next) {
    try {
      const result = await MappingSuggestionService.suggestTemplateVersionMappings({
        templateId: req.params.id,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
        limit: Number(req.body?.limit || req.query?.limit || 5),
        minConfidence: Number(req.body?.min_confidence || req.query?.min_confidence || 0.18),
        includeApproved: isTruthy(req.body?.include_approved) || isTruthy(req.query?.include_approved),
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          summary: result.summary,
          suggestions: result.suggestions,
        },
        "Template mapping suggestions generated",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getTemplateVersionMappingSuggestions(req, res, next) {
    try {
      const result = await MappingSuggestionService.getTemplateVersionSuggestions({
        templateId: req.params.id,
        versionId: req.params.versionId,
        status: req.query.status || "suggested",
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          suggestions: result.suggestions,
        },
        "Template mapping suggestions retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async assistTemplateVersionMappings(req, res, next) {
    try {
      const result = await LlmMappingAssistantService.assistTemplateVersionMappings({
        templateId: req.params.id,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          summary: result.summary,
          deterministic_summary: result.deterministicSummary,
          suggestions: result.suggestions,
        },
        result.summary?.llmEnabled
          ? "LLM-assisted mapping suggestions generated"
          : "LLM-assisted mapping is disabled; deterministic suggestions remain available",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getTemplateVersionLlmMappingSuggestions(req, res, next) {
    try {
      const result = await LlmMappingAssistantService.getTemplateVersionAssistedSuggestions({
        templateId: req.params.id,
        versionId: req.params.versionId,
        status: req.query.status || "suggested",
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          suggestions: result.suggestions,
        },
        "LLM-assisted mapping suggestions retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async createTemplateVersionReviewTasks(req, res, next) {
    try {
      const result = await ReviewTaskService.generateTemplateVersionReviewTasks({
        templateId: req.params.id,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
        force: isTruthy(req.body?.force) || isTruthy(req.query?.force),
        allowDuplicateActive:
          isTruthy(req.body?.allow_duplicate_active) || isTruthy(req.query?.allow_duplicate_active),
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(
        res,
        {
          template_version: result.version,
          summary: result.summary,
          review_tasks: result.reviewTasks,
        },
        "Review tasks generated for template version",
      )
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = CashFlowTemplateController
