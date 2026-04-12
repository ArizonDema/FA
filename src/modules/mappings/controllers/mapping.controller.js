const ResponseHandler = require("../../../utils/responseHandler")
const MappingService = require("../services/mapping.service")
const { resolveFundId } = require("../../shared/fund")

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
}

module.exports = MappingController
