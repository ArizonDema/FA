const ResponseHandler = require("../../../utils/responseHandler")
const LlmTraceService = require("../services/llmTrace.service")
const LlmMappingAssistantService = require("../services/llmMappingAssistant.service")
const MappingSuggestionService = require("../services/mappingSuggestion.service")
const MappingService = require("../services/mapping.service")
const { resolveFundId } = require("../../shared/fund")

function isTruthy(value) {
  if (typeof value === "boolean") return value
  return String(value || "")
    .trim()
    .toLowerCase() === "true"
}

class MappingController {
  static async listAccountMappings(req, res, next) {
    try {
      const mappings = await MappingService.listAccountMappings({
        fundId: resolveFundId(req.query),
      })
      return ResponseHandler.success(res, { mappings }, "Account mappings retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createAccountMapping(req, res, next) {
    try {
      const mapping = await MappingService.createAccountMapping({
        fundId: resolveFundId(req),
        actorId: req.user?.id || null,
        accountId: req.body.account_id || null,
        account: req.body.account || null,
        semanticConceptId: req.body.semantic_concept_id || null,
        semanticConceptKey: req.body.semantic_concept_key || null,
        status: req.body.status || "suggested",
        effectiveStart: req.body.effective_start || null,
        effectiveEnd: req.body.effective_end || null,
        confidence: req.body.confidence ?? 1,
        source: req.body.source || "manual",
        metadata: req.body.metadata_json || req.body.metadata || null,
      })
      return ResponseHandler.created(res, { mapping }, "Account mapping created")
    } catch (error) {
      return ResponseHandler.badRequest(res, error.message)
    }
  }

  static async updateAccountMappingStatus(req, res, next) {
    try {
      const mapping = await MappingService.updateAccountMappingStatus({
        mappingId: req.params.id,
        status: req.body.status,
        actorId: req.user?.id || null,
      })
      if (!mapping) {
        return ResponseHandler.notFound(res, "Account mapping not found")
      }
      return ResponseHandler.success(res, { mapping }, "Account mapping updated")
    } catch (error) {
      return next(error)
    }
  }

  static async listTemplateRowMappings(req, res, next) {
    try {
      const mappings = await MappingService.listTemplateRowMappings({
        fundId: resolveFundId(req.query),
        templateVersionId: req.query.template_version_id || null,
      })
      return ResponseHandler.success(res, { mappings }, "Template row mappings retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createTemplateRowMapping(req, res, next) {
    try {
      const mapping = await MappingService.createTemplateRowMapping({
        fundId: resolveFundId(req),
        actorId: req.user?.id || null,
        templateVersionId: req.body.template_version_id,
        templateRowId: req.body.template_row_id || null,
        templateRow: req.body.template_row || null,
        semanticConceptId: req.body.semantic_concept_id || null,
        semanticConceptKey: req.body.semantic_concept_key || null,
        status: req.body.status || "suggested",
        effectiveStart: req.body.effective_start || null,
        effectiveEnd: req.body.effective_end || null,
        confidence: req.body.confidence ?? 1,
        source: req.body.source || "manual",
        metadata: req.body.metadata_json || req.body.metadata || null,
      })
      return ResponseHandler.created(res, { mapping }, "Template row mapping created")
    } catch (error) {
      return ResponseHandler.badRequest(res, error.message)
    }
  }

  static async updateTemplateRowMappingStatus(req, res, next) {
    try {
      const mapping = await MappingService.updateTemplateRowMappingStatus({
        mappingId: req.params.id,
        status: req.body.status,
        actorId: req.user?.id || null,
      })
      if (!mapping) {
        return ResponseHandler.notFound(res, "Template row mapping not found")
      }
      return ResponseHandler.success(res, { mapping }, "Template row mapping updated")
    } catch (error) {
      return next(error)
    }
  }

  static async getTemplateRowSuggestions(req, res, next) {
    try {
      const result = await MappingSuggestionService.getTemplateRowSuggestions({
        rowId: req.params.id,
        status: req.query.status || "suggested",
      })
      if (!result) {
        return ResponseHandler.notFound(res, "Template row not found")
      }
      return ResponseHandler.success(
        res,
        {
          template_row: result.row,
          assessment: result.assessment,
          suggestions: result.suggestions,
        },
        "Template row mapping suggestions retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getTemplateRowLlmSuggestions(req, res, next) {
    try {
      const result = await LlmMappingAssistantService.getTemplateRowAssistedSuggestions({
        rowId: req.params.id,
        status: req.query.status || "suggested",
      })
      if (!result) {
        return ResponseHandler.notFound(res, "Template row not found")
      }
      return ResponseHandler.success(
        res,
        {
          template_row: result.row,
          assessment: result.assessment,
          suggestions: result.suggestions,
        },
        "LLM-assisted template row mapping suggestions retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async suggestAccountMappings(req, res, next) {
    try {
      const accountIds = Array.isArray(req.body.account_ids)
        ? req.body.account_ids.filter(Boolean)
        : req.body.account_id
          ? [req.body.account_id]
          : []

      const result = await MappingSuggestionService.suggestAccountMappings({
        fundId: resolveFundId(req),
        accountIds,
        actorId: req.user?.id || null,
        limit: Number(req.body?.limit || req.query?.limit || 5),
        minConfidence: Number(req.body?.min_confidence || req.query?.min_confidence || 0.18),
        includeApproved: isTruthy(req.body?.include_approved) || isTruthy(req.query?.include_approved),
      })

      return ResponseHandler.success(
        res,
        {
          summary: result.summary,
          suggestions: result.suggestions,
        },
        "Account mapping suggestions generated",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getAccountSuggestions(req, res, next) {
    try {
      const result = await MappingSuggestionService.getAccountSuggestions({
        accountId: req.params.id,
        status: req.query.status || "suggested",
      })
      if (!result) {
        return ResponseHandler.notFound(res, "Account not found")
      }
      return ResponseHandler.success(
        res,
        {
          account: result.account,
          suggestions: result.suggestions,
        },
        "Account mapping suggestions retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getSuggestionTrace(req, res, next) {
    try {
      const trace = await LlmTraceService.getTraceBySuggestionId(req.params.id)
      if (!trace) {
        return ResponseHandler.notFound(res, "Suggestion trace not found")
      }
      return ResponseHandler.success(res, { trace }, "Suggestion trace retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = MappingController
