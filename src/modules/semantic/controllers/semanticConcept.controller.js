const ResponseHandler = require("../../../utils/responseHandler")
const SemanticConceptService = require("../services/semanticConcept.service")

class SemanticConceptController {
  static async list(req, res, next) {
    try {
      const activeFilter =
        req.query.active === undefined ? null : String(req.query.active || "").toLowerCase() === "true"

      const concepts = await SemanticConceptService.list({
        category: req.query.category || null,
        statementType: req.query.statement_type || req.query.statementType || null,
        activeOnly: activeFilter,
        query: req.query.q || null,
      })

      return ResponseHandler.success(res, { concepts }, "Semantic concepts retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getById(req, res, next) {
    try {
      const concept = await SemanticConceptService.getById(req.params.id)
      if (!concept) {
        return ResponseHandler.notFound(res, "Semantic concept not found")
      }

      return ResponseHandler.success(res, { concept }, "Semantic concept retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getByKey(req, res, next) {
    try {
      const concept = await SemanticConceptService.getByKey(req.params.key)
      if (!concept) {
        return ResponseHandler.notFound(res, "Semantic concept not found")
      }

      return ResponseHandler.success(res, { concept }, "Semantic concept retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async listCategories(req, res, next) {
    try {
      const activeFilter =
        req.query.active === undefined ? null : String(req.query.active || "").toLowerCase() === "true"

      const categories = await SemanticConceptService.listCategories({
        activeOnly: activeFilter,
        statementType: req.query.statement_type || req.query.statementType || null,
      })

      return ResponseHandler.success(res, { categories }, "Semantic concept categories retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async create(req, res, next) {
    try {
      const concept = await SemanticConceptService.create(req.body, {
        actorId: req.user?.id || null,
      })

      return ResponseHandler.created(res, { concept }, "Semantic concept created")
    } catch (error) {
      if (error instanceof SemanticConceptService.ValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }
}

module.exports = SemanticConceptController
