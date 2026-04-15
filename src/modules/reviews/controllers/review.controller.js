const ResponseHandler = require("../../../utils/responseHandler")
const { resolveFundId } = require("../../shared/fund")
const MappingReviewService = require("../services/mappingReview.service")
const ReviewTaskService = require("../services/reviewTask.service")

function isTruthy(value) {
  if (typeof value === "boolean") return value
  return String(value || "")
    .trim()
    .toLowerCase() === "true"
}

function handleReviewError(res, error, next) {
  if (error?.statusCode === 404 || error?.code === "review_not_found") {
    return ResponseHandler.notFound(res, error.message)
  }
  if (error?.statusCode === 409 || error?.code === "review_conflict") {
    return ResponseHandler.conflict(res, error.message)
  }
  if (error?.statusCode === 400 || error?.code === "review_validation") {
    return ResponseHandler.badRequest(res, error.message)
  }
  return next(error)
}

class ReviewController {
  static async listReviewTasks(req, res, next) {
    try {
      const result = await ReviewTaskService.listReviewTasks({
        status: req.query.status || null,
        templateVersionId: req.query.template_version_id || req.query.templateVersionId || null,
        targetType: req.query.target_type || req.query.targetType || null,
        fundId: resolveFundId(req.query),
      })

      return ResponseHandler.success(
        res,
        {
          total: result.total,
          review_tasks: result.tasks,
        },
        "Review tasks retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async getReviewTask(req, res, next) {
    try {
      const result = await ReviewTaskService.getReviewTask({
        taskId: req.params.id,
        actorId: req.user?.id || null,
        markInReview: isTruthy(req.query.mark_in_review),
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Review task not found")
      }

      return ResponseHandler.success(res, { review_task: result }, "Review task retrieved")
    } catch (error) {
      return handleReviewError(res, error, next)
    }
  }

  static async approveReviewTask(req, res, next) {
    try {
      const result = await MappingReviewService.approveTask({
        taskId: req.params.id,
        actorId: req.user?.id || null,
        suggestionId: req.body.suggestion_id || req.body.suggestionId || null,
        semanticConceptId: req.body.semantic_concept_id || req.body.semanticConceptId || null,
        rationale: req.body.rationale || null,
      })

      return ResponseHandler.success(
        res,
        { review_task: result },
        "Mapping suggestion approved and durable mapping written",
      )
    } catch (error) {
      return handleReviewError(res, error, next)
    }
  }

  static async rejectReviewTask(req, res, next) {
    try {
      const result = await MappingReviewService.rejectTask({
        taskId: req.params.id,
        actorId: req.user?.id || null,
        suggestionIds: Array.isArray(req.body.suggestion_ids)
          ? req.body.suggestion_ids.filter(Boolean)
          : Array.isArray(req.body.suggestionIds)
            ? req.body.suggestionIds.filter(Boolean)
            : [],
        rationale: req.body.rationale || null,
      })

      return ResponseHandler.success(res, { review_task: result }, "Review task rejected")
    } catch (error) {
      return handleReviewError(res, error, next)
    }
  }

  static async overrideReviewTask(req, res, next) {
    try {
      const result = await MappingReviewService.overrideTask({
        taskId: req.params.id,
        actorId: req.user?.id || null,
        semanticConceptId: req.body.semantic_concept_id || req.body.semanticConceptId || null,
        rationale: req.body.rationale || null,
      })

      return ResponseHandler.success(
        res,
        { review_task: result },
        "Review task overridden and durable mapping written",
      )
    } catch (error) {
      return handleReviewError(res, error, next)
    }
  }

  static async deferReviewTask(req, res, next) {
    try {
      const result = await MappingReviewService.deferTask({
        taskId: req.params.id,
        actorId: req.user?.id || null,
        rationale: req.body.rationale || null,
      })

      return ResponseHandler.success(res, { review_task: result }, "Review task deferred")
    } catch (error) {
      return handleReviewError(res, error, next)
    }
  }
}

module.exports = ReviewController
