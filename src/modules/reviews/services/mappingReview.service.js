const {
  sequelize,
  ReviewDecision,
  ReviewTask,
  SemanticConcept,
  TemplateRowMappingSuggestion,
  TemplateRowSemanticMapping,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")
const ReviewTaskService = require("./reviewTask.service")
const {
  CLOSED_REVIEW_TASK_STATUSES,
  REVIEW_ACTION_TYPES,
  REVIEW_TARGET_TYPES,
  REVIEW_TASK_STATUSES,
} = require("../review.constants")

function createReviewError(message, code = "review_validation", statusCode = 400) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function toDateOnly(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10)
}

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function mergeMetadata(base, patch) {
  const current = base && typeof base === "object" && !Array.isArray(base) ? base : {}
  return {
    ...current,
    ...patch,
  }
}

class MappingReviewService {
  static async loadActiveTask({ taskId, transaction }) {
    const task = await ReviewTask.findByPk(taskId, { transaction })
    if (!task) {
      throw createReviewError("Review task not found", "review_not_found", 404)
    }

    if (task.target_type !== REVIEW_TARGET_TYPES.TEMPLATE_ROW) {
      throw createReviewError("Only template row review tasks are supported in Phase 6", "review_validation", 400)
    }

    if (CLOSED_REVIEW_TASK_STATUSES.includes(task.status)) {
      throw createReviewError("Review task is already closed", "review_conflict", 409)
    }

    return task
  }

  static async maybeMoveTaskToInReview({ task, actorId, transaction }) {
    if (![REVIEW_TASK_STATUSES.OPEN, REVIEW_TASK_STATUSES.DEFERRED].includes(task.status)) {
      return false
    }

    await task.update(
      {
        status: REVIEW_TASK_STATUSES.IN_REVIEW,
        completed_at: null,
      },
      { transaction },
    )

    await AuditService.logEvent({
      actorId,
      eventType: "review_started",
      entityType: "review_task",
      entityId: task.id,
      after: task.toJSON(),
      metadata: {
        target_type: task.target_type,
        target_id: task.target_id,
      },
    })

    return true
  }

  static async resolveSuggestionSelection({ task, suggestionId = null, semanticConceptId = null, transaction }) {
    if (!suggestionId && !semanticConceptId) {
      throw createReviewError("suggestionId or semanticConceptId is required", "review_validation", 400)
    }

    let suggestion = null
    if (suggestionId) {
      suggestion = await TemplateRowMappingSuggestion.findByPk(suggestionId, { transaction })
      if (!suggestion) {
        throw createReviewError("Suggested candidate not found", "review_not_found", 404)
      }
      if (suggestion.template_row_id !== task.target_id) {
        throw createReviewError("Suggested candidate does not belong to this review task", "review_conflict", 409)
      }
    }

    if (semanticConceptId && suggestion && suggestion.semantic_concept_id !== semanticConceptId) {
      throw createReviewError("suggestionId and semanticConceptId do not match", "review_validation", 400)
    }

    if (!suggestion && semanticConceptId) {
      suggestion = await TemplateRowMappingSuggestion.findOne({
        where: {
          template_row_id: task.target_id,
          semantic_concept_id: semanticConceptId,
          status: "suggested",
        },
        transaction,
      })

      if (!suggestion) {
        throw createReviewError(
          "The selected semantic concept is not an active suggestion for this row. Use override instead.",
          "review_conflict",
          409,
        )
      }
    }

    const concept = await SemanticConcept.findByPk(suggestion.semantic_concept_id, { transaction })
    if (!concept) {
      throw createReviewError("Semantic concept not found", "review_not_found", 404)
    }

    return { suggestion, concept }
  }

  static async resolveOverrideConcept({ semanticConceptId, transaction }) {
    if (!semanticConceptId) {
      throw createReviewError("semanticConceptId is required", "review_validation", 400)
    }

    const concept = await SemanticConcept.findByPk(semanticConceptId, { transaction })
    if (!concept) {
      throw createReviewError("Semantic concept not found", "review_not_found", 404)
    }

    return concept
  }

  static async validateRejectedSuggestions({ task, suggestionIds = [], transaction }) {
    if (!suggestionIds.length) return []

    const suggestions = await Promise.all(
      suggestionIds.map((suggestionId) => TemplateRowMappingSuggestion.findByPk(suggestionId, { transaction })),
    )

    const missingSuggestionId = suggestionIds.find((suggestionId, index) => !suggestions[index])
    if (missingSuggestionId) {
      throw createReviewError(`Suggested candidate not found: ${missingSuggestionId}`, "review_not_found", 404)
    }

    const invalidSuggestion = suggestions.find((suggestion) => suggestion.template_row_id !== task.target_id)
    if (invalidSuggestion) {
      throw createReviewError("One or more suggested candidates do not belong to this review task", "review_conflict", 409)
    }

    return suggestions
  }

  static async supersedeActiveApprovedMappings({ task, actorId, transaction }) {
    const activeMappings = await TemplateRowSemanticMapping.findAll({
      where: {
        template_version_id: task.template_version_id,
        template_row_id: task.target_id,
        status: "approved",
        effective_end: null,
      },
      transaction,
    })

    const effectiveEnd = toDateOnly()
    for (const mapping of activeMappings) {
      await mapping.update(
        {
          effective_end: effectiveEnd,
          metadata_json: mergeMetadata(mapping.metadata_json, {
            superseded_by_review_task_id: task.id,
            superseded_at: new Date().toISOString(),
            superseded_by_actor_id: actorId || null,
          }),
        },
        { transaction },
      )
    }

    return activeMappings.map((mapping) => mapping.id)
  }

  static async approveTask({ taskId, actorId = null, suggestionId = null, semanticConceptId = null, rationale = null }) {
    const result = await sequelize.transaction(async (transaction) => {
      const task = await this.loadActiveTask({ taskId, transaction })
      const taskBefore = asPlainObject(task)
      await this.maybeMoveTaskToInReview({ task, actorId, transaction })

      const { suggestion, concept } = await this.resolveSuggestionSelection({
        task,
        suggestionId,
        semanticConceptId,
        transaction,
      })

      const decision = await ReviewDecision.create(
        {
          review_task_id: task.id,
          action_type: REVIEW_ACTION_TYPES.APPROVE,
          selected_semantic_concept_id: concept.id,
          selected_suggestion_id: suggestion.id,
          rationale: rationale || null,
          actor_id: actorId,
          metadata_json: {
            suggestion_source: suggestion.source,
            suggestion_rank: suggestion.rank,
          },
        },
        { transaction },
      )

      const supersededMappingIds = await this.supersedeActiveApprovedMappings({
        task,
        actorId,
        transaction,
      })

      const mapping = await TemplateRowSemanticMapping.create(
        {
          portfolio_id: task.portfolio_id || null,
          template_version_id: task.template_version_id,
          template_row_id: task.target_id,
          semantic_concept_id: concept.id,
          status: "approved",
          effective_start: toDateOnly(),
          effective_end: null,
          confidence: Number(suggestion.merged_score ?? suggestion.confidence_score ?? 1) || 1,
          source: "review_approved",
          metadata_json: {
            selected_suggestion_id: suggestion.id,
            suggestion_source: suggestion.source,
            rationale: rationale || null,
            superseded_mapping_ids: supersededMappingIds,
          },
          review_task_id: task.id,
          review_decision_id: decision.id,
          suggested_by: suggestion.generated_by || actorId || null,
          approved_by: actorId,
          approved_at: new Date(),
        },
        { transaction },
      )

      await decision.update(
        {
          result_mapping_id: mapping.id,
        },
        { transaction },
      )

      await task.update(
        {
          status: REVIEW_TASK_STATUSES.APPROVED,
          completed_at: new Date(),
          metadata_json: mergeMetadata(task.metadata_json, {
            latest_decision_id: decision.id,
            outcome: {
              action: REVIEW_ACTION_TYPES.APPROVE,
              mapping_id: mapping.id,
              selected_suggestion_id: suggestion.id,
              semantic_concept_id: concept.id,
            },
          }),
        },
        { transaction },
      )

      await AuditService.logEvent({
        actorId,
        eventType: "mapping_approved",
        entityType: "review_task",
        entityId: task.id,
        before: taskBefore,
        after: task.toJSON(),
        metadata: {
          target_type: task.target_type,
          target_id: task.target_id,
          semantic_concept_id: concept.id,
          approved_mapping_id: mapping.id,
          review_decision_id: decision.id,
          selected_suggestion_id: suggestion.id,
        },
      })

      return {
        taskId: task.id,
      }
    })

    return await ReviewTaskService.getReviewTask({ taskId: result.taskId })
  }

  static async overrideTask({ taskId, actorId = null, semanticConceptId = null, rationale = null }) {
    if (!String(rationale || "").trim()) {
      throw createReviewError("rationale is required when overriding a mapping", "review_validation", 400)
    }

    const result = await sequelize.transaction(async (transaction) => {
      const task = await this.loadActiveTask({ taskId, transaction })
      const taskBefore = asPlainObject(task)
      await this.maybeMoveTaskToInReview({ task, actorId, transaction })

      const concept = await this.resolveOverrideConcept({ semanticConceptId, transaction })

      const decision = await ReviewDecision.create(
        {
          review_task_id: task.id,
          action_type: REVIEW_ACTION_TYPES.OVERRIDE,
          selected_semantic_concept_id: concept.id,
          selected_suggestion_id: null,
          rationale: String(rationale).trim(),
          actor_id: actorId,
          metadata_json: {
            override: true,
          },
        },
        { transaction },
      )

      const supersededMappingIds = await this.supersedeActiveApprovedMappings({
        task,
        actorId,
        transaction,
      })

      const mapping = await TemplateRowSemanticMapping.create(
        {
          portfolio_id: task.portfolio_id || null,
          template_version_id: task.template_version_id,
          template_row_id: task.target_id,
          semantic_concept_id: concept.id,
          status: "approved",
          effective_start: toDateOnly(),
          effective_end: null,
          confidence: 1,
          source: "review_override",
          metadata_json: {
            override: true,
            rationale: String(rationale).trim(),
            superseded_mapping_ids: supersededMappingIds,
          },
          review_task_id: task.id,
          review_decision_id: decision.id,
          suggested_by: actorId || null,
          approved_by: actorId,
          approved_at: new Date(),
        },
        { transaction },
      )

      await decision.update(
        {
          result_mapping_id: mapping.id,
        },
        { transaction },
      )

      await task.update(
        {
          status: REVIEW_TASK_STATUSES.OVERRIDDEN,
          completed_at: new Date(),
          metadata_json: mergeMetadata(task.metadata_json, {
            latest_decision_id: decision.id,
            outcome: {
              action: REVIEW_ACTION_TYPES.OVERRIDE,
              mapping_id: mapping.id,
              semantic_concept_id: concept.id,
            },
          }),
        },
        { transaction },
      )

      await AuditService.logEvent({
        actorId,
        eventType: "mapping_overridden",
        entityType: "review_task",
        entityId: task.id,
        before: taskBefore,
        after: task.toJSON(),
        metadata: {
          target_type: task.target_type,
          target_id: task.target_id,
          semantic_concept_id: concept.id,
          approved_mapping_id: mapping.id,
          review_decision_id: decision.id,
          rationale: String(rationale).trim(),
        },
      })

      return {
        taskId: task.id,
      }
    })

    return await ReviewTaskService.getReviewTask({ taskId: result.taskId })
  }

  static async rejectTask({ taskId, actorId = null, suggestionIds = [], rationale = null }) {
    const result = await sequelize.transaction(async (transaction) => {
      const task = await this.loadActiveTask({ taskId, transaction })
      const taskBefore = asPlainObject(task)
      await this.maybeMoveTaskToInReview({ task, actorId, transaction })

      const rejectedSuggestions = await this.validateRejectedSuggestions({
        task,
        suggestionIds,
        transaction,
      })

      const decision = await ReviewDecision.create(
        {
          review_task_id: task.id,
          action_type: REVIEW_ACTION_TYPES.REJECT,
          selected_semantic_concept_id: null,
          selected_suggestion_id: rejectedSuggestions[0]?.id || null,
          rationale: rationale || null,
          actor_id: actorId,
          metadata_json: {
            rejected_suggestion_ids: rejectedSuggestions.map((item) => item.id),
          },
        },
        { transaction },
      )

      await task.update(
        {
          status: REVIEW_TASK_STATUSES.REJECTED,
          completed_at: new Date(),
          metadata_json: mergeMetadata(task.metadata_json, {
            latest_decision_id: decision.id,
            outcome: {
              action: REVIEW_ACTION_TYPES.REJECT,
              rejected_suggestion_ids: rejectedSuggestions.map((item) => item.id),
            },
          }),
        },
        { transaction },
      )

      await AuditService.logEvent({
        actorId,
        eventType: "mapping_rejected",
        entityType: "review_task",
        entityId: task.id,
        before: taskBefore,
        after: task.toJSON(),
        metadata: {
          target_type: task.target_type,
          target_id: task.target_id,
          rejected_suggestion_ids: rejectedSuggestions.map((item) => item.id),
          rationale: rationale || null,
        },
      })

      return {
        taskId: task.id,
      }
    })

    return await ReviewTaskService.getReviewTask({ taskId: result.taskId })
  }

  static async deferTask({ taskId, actorId = null, rationale = null }) {
    const result = await sequelize.transaction(async (transaction) => {
      const task = await this.loadActiveTask({ taskId, transaction })
      const taskBefore = asPlainObject(task)
      await this.maybeMoveTaskToInReview({ task, actorId, transaction })

      const decision = await ReviewDecision.create(
        {
          review_task_id: task.id,
          action_type: REVIEW_ACTION_TYPES.DEFER,
          selected_semantic_concept_id: null,
          selected_suggestion_id: null,
          rationale: rationale || null,
          actor_id: actorId,
          metadata_json: null,
        },
        { transaction },
      )

      await task.update(
        {
          status: REVIEW_TASK_STATUSES.DEFERRED,
          completed_at: null,
          metadata_json: mergeMetadata(task.metadata_json, {
            latest_decision_id: decision.id,
            outcome: {
              action: REVIEW_ACTION_TYPES.DEFER,
            },
          }),
        },
        { transaction },
      )

      await AuditService.logEvent({
        actorId,
        eventType: "review_deferred",
        entityType: "review_task",
        entityId: task.id,
        before: taskBefore,
        after: task.toJSON(),
        metadata: {
          target_type: task.target_type,
          target_id: task.target_id,
          rationale: rationale || null,
        },
      })

      return {
        taskId: task.id,
      }
    })

    return await ReviewTaskService.getReviewTask({ taskId: result.taskId })
  }
}

module.exports = MappingReviewService
