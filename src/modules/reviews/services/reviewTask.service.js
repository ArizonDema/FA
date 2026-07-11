const logger = require("../../../config/logger")
const { Op } = require("sequelize")
const {
  sequelize,
  ReportExport,
  ReviewDecision,
  ReviewTask,
  SemanticConcept,
  Template,
  CashFlowTemplate,
  TemplateRow,
  TemplateRowMappingSuggestion,
  TemplateRowSemanticMapping,
  TemplateVersion,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")
const {
  ACTIVE_REVIEW_TASK_STATUSES,
  CLOSED_REVIEW_TASK_STATUSES,
  NON_REVIEWABLE_ROW_TYPES,
  PRIORITY_SORT_ORDER,
  REVIEW_ACTION_TYPES,
  REVIEW_PRIORITIES,
  REVIEW_REASONS,
  REVIEW_TARGET_TYPES,
  REVIEW_TASK_STATUSES,
} = require("../review.constants")
const { REPORT_RELIABILITY_STATUSES, REVIEW_REASON_CODES } = require("../../shared/reliability.constants")
const MappingReliabilityService = require("../../mappings/services/mappingReliability.service")

const TemplateModel = Template || CashFlowTemplate

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function createReviewError(message, code = "review_validation", statusCode = 400) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function mergeMetadata(base, patch) {
  const current = base && typeof base === "object" && !Array.isArray(base) ? base : {}
  return {
    ...current,
    ...patch,
  }
}

function roundScore(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null
  return Number(numericValue.toFixed(4))
}

function sortByPriorityAndCreatedAt(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftPriority = PRIORITY_SORT_ORDER[left.priority] ?? 99
    const rightPriority = PRIORITY_SORT_ORDER[right.priority] ?? 99
    if (leftPriority !== rightPriority) return leftPriority - rightPriority

    const leftCreatedAt = new Date(left.createdAt || left.created_at || 0).getTime()
    const rightCreatedAt = new Date(right.createdAt || right.created_at || 0).getTime()
    return rightCreatedAt - leftCreatedAt
  })
}

function buildNeighborLookup(rows = []) {
  const lookup = new Map()
  rows.forEach((row, index) => {
    lookup.set(row.id, {
      previousLabel: rows[index - 1]?.label || null,
      nextLabel: rows[index + 1]?.label || null,
    })
  })
  return lookup
}

function serializeRow(row, neighbors = null) {
  const payload = asPlainObject(row) || {}
  return {
    id: payload.id,
    fundId: payload.portfolio_id || payload.fundId || null,
    templateVersionId: payload.template_version_id,
    sheetName: payload.sheet_name,
    rowIndex: payload.row_index,
    rowKey: payload.row_key,
    label: payload.label,
    rowType: payload.row_type,
    rowOrder: payload.row_order,
    sectionName: payload.section_name,
    parentSectionName: payload.parent_section_name,
    indentationLevel: payload.indentation_level,
    formulaText: payload.formula_text,
    isFormula: Boolean(payload.is_formula),
    cellRange: payload.cell_range,
    metadata: payload.metadata_json || null,
    neighbors: neighbors || null,
  }
}

function serializeSuggestion(suggestion) {
  const payload = asPlainObject(suggestion) || {}
  const rowAssessment = payload.metadata_json?.rowAssessment || null

  return {
    id: payload.id,
    templateVersionId: payload.template_version_id,
    templateRowId: payload.template_row_id,
    semanticConceptId: payload.semantic_concept_id,
    semanticConceptKey: payload.semanticConcept?.stable_key || null,
    semanticConceptLabel: payload.semanticConcept?.label || null,
    semanticConceptDescription: payload.semanticConcept?.description || null,
    rank: payload.rank,
    confidenceScore: roundScore(payload.confidence_score),
    llmScore: payload.llm_score !== undefined && payload.llm_score !== null ? roundScore(payload.llm_score) : null,
    mergedScore:
      payload.merged_score !== undefined && payload.merged_score !== null ? roundScore(payload.merged_score) : null,
    rationale: payload.rationale || null,
    signalBreakdown: payload.signal_breakdown_json || null,
    source: payload.source,
    status: payload.status,
    needsHumanReview: Boolean(payload.needs_human_review),
    traceId: payload.trace_id || null,
    llmMetadata: payload.llm_metadata_json || null,
    metadata: payload.metadata_json || null,
    rowAssessment,
  }
}

function serializeApprovedMapping(mapping) {
  const payload = asPlainObject(mapping) || {}
  return {
    id: payload.id,
    templateVersionId: payload.template_version_id,
    templateRowId: payload.template_row_id,
    semanticConceptId: payload.semantic_concept_id,
    semanticConceptKey: payload.semanticConcept?.stable_key || null,
    semanticConceptLabel: payload.semanticConcept?.label || null,
    status: payload.status,
    effectiveStart: payload.effective_start || null,
    effectiveEnd: payload.effective_end || null,
    confidence: roundScore(payload.confidence),
    source: payload.source,
    metadata: payload.metadata_json || null,
    approvedBy: payload.approved_by || null,
    approvedAt: payload.approved_at || null,
    reviewTaskId: payload.review_task_id || null,
    reviewDecisionId: payload.review_decision_id || null,
  }
}

function serializeDecision(decision) {
  const payload = asPlainObject(decision) || {}
  return {
    id: payload.id,
    reviewTaskId: payload.review_task_id,
    actionType: payload.action_type,
    selectedSemanticConceptId: payload.selected_semantic_concept_id || null,
    selectedSemanticConceptKey: payload.selectedSemanticConcept?.stable_key || null,
    selectedSemanticConceptLabel: payload.selectedSemanticConcept?.label || null,
    selectedSuggestionId: payload.selected_suggestion_id || null,
    resultMappingId: payload.result_mapping_id || null,
    rationale: payload.rationale || null,
    actorId: payload.actor_id || null,
    metadata: payload.metadata_json || null,
    createdAt: payload.created_at || payload.createdAt || null,
    updatedAt: payload.updated_at || payload.updatedAt || null,
  }
}

function serializeGenericTarget(task) {
  const metadata = task.metadata_json || {}
  return {
    id: task.target_id,
    type: task.target_type,
    label:
      metadata.target_label ||
      metadata.check_type ||
      metadata.format ||
      metadata.source_title ||
      task.review_reason ||
      task.target_type,
    metadata,
  }
}

function selectCurrentApprovedMapping(mappings = []) {
  if (!mappings.length) return null
  const active = mappings.find((mapping) => !mapping.effectiveEnd)
  return active || mappings[0]
}

function buildReviewAssessment({ row, groupedSuggestions = null, force = false }) {
  const assessment = groupedSuggestions?.assessment || null
  const allSuggestions = groupedSuggestions?.suggestions || []
  const noCandidate = allSuggestions.length === 0
  const topSuggestion = allSuggestions[0] || null
  const secondSuggestion = allSuggestions[1] || null
  const multipleCloseCandidates =
    allSuggestions.length > 1 &&
    Math.abs(Number(topSuggestion?.semanticConfidence || 0) - Number(secondSuggestion?.semanticConfidence || 0)) <= 0.06

  if (!row?.label && !row?.section_name && !allSuggestions.length) {
    return {
      shouldCreateTask: false,
      reviewReason: null,
      priority: null,
      flags: {
        noCandidate: true,
        lowConfidence: false,
        disagreement: false,
        multipleCloseCandidates: false,
        needsHumanReview: false,
        noAccountGrounding: true,
        weakEvidence: true,
        fallbackDerived: false,
      },
      scores: {
        semanticConfidence: 0,
        accountCoverageScore: 0,
        evidenceScore: 0,
      },
      status: REPORT_RELIABILITY_STATUSES.UNMAPPED,
      reviewReasons: [REVIEW_REASON_CODES.NO_CANDIDATE, REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING],
    }
  }

  let reviewReason = REVIEW_REASONS.APPROVAL_REQUIRED
  let priority = REVIEW_PRIORITIES.LOW
  const reviewReasons = assessment?.reviewReasons || (noCandidate ? [REVIEW_REASON_CODES.NO_CANDIDATE] : [])
  const reportReliabilityStatus = assessment?.reportReliabilityStatus || REPORT_RELIABILITY_STATUSES.UNMAPPED

  if (force) {
    reviewReason = REVIEW_REASONS.MANUAL_REQUESTED
    priority = REVIEW_PRIORITIES.MEDIUM
  }

  if (noCandidate) {
    reviewReason = REVIEW_REASONS.NO_CANDIDATE
    priority = REVIEW_PRIORITIES.HIGH
  } else if (reviewReasons.includes(REVIEW_REASON_CODES.CONFLICTING_SIGNALS)) {
    reviewReason = REVIEW_REASONS.CONFLICTING_SIGNALS
    priority = REVIEW_PRIORITIES.HIGH
  } else if (
    reviewReasons.includes(REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING) ||
    reportReliabilityStatus === REPORT_RELIABILITY_STATUSES.SEMANTICALLY_MATCHED_UNGROUNDED
  ) {
    reviewReason = REVIEW_REASONS.NO_ACCOUNT_GROUNDING
    priority = REVIEW_PRIORITIES.HIGH
  } else if (reviewReasons.includes(REVIEW_REASON_CODES.FALLBACK_DERIVED_RESULT)) {
    reviewReason = REVIEW_REASONS.FALLBACK_DERIVED_RESULT
    priority = REVIEW_PRIORITIES.HIGH
  } else if (
    reviewReasons.includes(REVIEW_REASON_CODES.WEAK_NUMERIC_SUPPORT) ||
    reviewReasons.includes(REVIEW_REASON_CODES.WEAK_EVIDENCE)
  ) {
    reviewReason = REVIEW_REASONS.WEAK_EVIDENCE
    priority = REVIEW_PRIORITIES.HIGH
  } else if (
    reportReliabilityStatus === REPORT_RELIABILITY_STATUSES.PARTIALLY_GROUNDED ||
    reviewReasons.includes(REVIEW_REASON_CODES.PARTIAL_ACCOUNT_COVERAGE)
  ) {
    reviewReason = REVIEW_REASONS.PARTIALLY_GROUNDED
    priority = REVIEW_PRIORITIES.MEDIUM
  } else if (reviewReasons.includes(REVIEW_REASON_CODES.LOW_SEMANTIC_CONFIDENCE)) {
    reviewReason = REVIEW_REASONS.LOW_CONFIDENCE
    priority = REVIEW_PRIORITIES.MEDIUM
  } else if (multipleCloseCandidates || assessment?.semanticAssessment?.needsHumanReview) {
    reviewReason = REVIEW_REASONS.MULTIPLE_CLOSE_CANDIDATES
    priority = REVIEW_PRIORITIES.MEDIUM
  }

  return {
    shouldCreateTask: force || assessment?.humanReviewRequired !== false || noCandidate,
    reviewReason,
    priority,
    flags: {
      noCandidate,
      lowConfidence: reviewReasons.includes(REVIEW_REASON_CODES.LOW_SEMANTIC_CONFIDENCE),
      disagreement: reviewReasons.includes(REVIEW_REASON_CODES.CONFLICTING_SIGNALS),
      multipleCloseCandidates,
      needsHumanReview: assessment?.humanReviewRequired !== false || noCandidate,
      noAccountGrounding: reviewReasons.includes(REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING),
      weakEvidence:
        reviewReasons.includes(REVIEW_REASON_CODES.WEAK_EVIDENCE) ||
        reviewReasons.includes(REVIEW_REASON_CODES.WEAK_NUMERIC_SUPPORT),
      fallbackDerived: reviewReasons.includes(REVIEW_REASON_CODES.FALLBACK_DERIVED_RESULT),
    },
    scores: {
      semanticConfidence: roundScore(assessment?.semanticConfidence || topSuggestion?.semanticConfidence || 0),
      accountCoverageScore: roundScore(assessment?.accountCoverageScore || topSuggestion?.accountCoverageScore || 0),
      evidenceScore: roundScore(assessment?.evidenceScore || topSuggestion?.evidenceScore || 0),
    },
    status: reportReliabilityStatus,
    reviewReasons,
  }
}

class ReviewTaskService {
  static async getTaskTargetType({ taskId }) {
    const task = await ReviewTask.findByPk(taskId)
    return task?.target_type || null
  }

  static isGenericTargetType(targetType) {
    return Boolean(targetType) && targetType !== REVIEW_TARGET_TYPES.TEMPLATE_ROW
  }

  static async createGenericReviewTask({
    targetType,
    targetId,
    fundId = null,
    templateVersionId = null,
    taskType = "exception_review",
    reviewReason = REVIEW_REASONS.APPROVAL_REQUIRED,
    priority = REVIEW_PRIORITIES.MEDIUM,
    metadata = null,
    actorId = null,
  }) {
    if (!Object.values(REVIEW_TARGET_TYPES).includes(targetType)) {
      throw createReviewError("Unsupported review task target type", "review_validation", 400)
    }
    if (!this.isGenericTargetType(targetType)) {
      throw createReviewError("Template row tasks must use the mapping review workflow", "review_validation", 400)
    }
    if (!targetId) {
      throw createReviewError("targetId is required", "review_validation", 400)
    }

    const task = await ReviewTask.create({
      task_type: taskType,
      target_type: targetType,
      target_id: targetId,
      template_version_id: templateVersionId || null,
      portfolio_id: fundId || null,
      status: REVIEW_TASK_STATUSES.OPEN,
      priority,
      review_reason: reviewReason,
      metadata_json: metadata || null,
      created_by: actorId,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "generic_review_task_created",
      entityType: "review_task",
      entityId: task.id,
      after: task.toJSON(),
      metadata: {
        target_type: targetType,
        target_id: targetId,
        review_reason: reviewReason,
        priority,
      },
    })

    const [hydrated] = await this.hydrateReviewTasks([task])
    return hydrated
  }

  static async getTemplateVersionRecord({ templateId, versionId }) {
    const template = await TemplateModel.findByPk(templateId)
    if (!template) return null

    const version = await TemplateVersion.findOne({
      where: {
        id: versionId,
        template_id: templateId,
      },
    })

    if (!version) return null
    return { template, version }
  }

  static async generateTemplateVersionReviewTasks({
    templateId,
    versionId,
    actorId = null,
    force = false,
    allowDuplicateActive = false,
  }) {
    const startedAt = Date.now()
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const { template, version } = records
    const rows = await TemplateRow.findAll({
      where: { template_version_id: version.id },
      order: [
        ["row_order", "ASC"],
        ["row_index", "ASC"],
      ],
    })

    const approvedMappings = await TemplateRowSemanticMapping.findAll({
      where: {
        template_version_id: version.id,
        status: "approved",
      },
      include: [{ model: SemanticConcept, as: "semanticConcept" }],
      order: [
        ["approved_at", "DESC"],
        ["created_at", "DESC"],
      ],
    })
    const approvedByRow = new Map()
    approvedMappings.forEach((mapping) => {
      const rowId = mapping.template_row_id
      if (!approvedByRow.has(rowId)) {
        approvedByRow.set(rowId, [])
      }
      approvedByRow.get(rowId).push(serializeApprovedMapping(mapping))
    })
    const currentApprovedMappingsByRow = new Map(
      Array.from(approvedByRow.entries()).map(([rowId, mappings]) => [rowId, selectCurrentApprovedMapping(mappings)]),
    )

    const activeTasks = await ReviewTask.findAll({
      where: {
        template_version_id: version.id,
        target_type: REVIEW_TARGET_TYPES.TEMPLATE_ROW,
        status: { [Op.in]: ACTIVE_REVIEW_TASK_STATUSES },
      },
    })
    const activeTaskIdsByRow = new Map(activeTasks.map((task) => [task.target_id, task.id]))

    const suggestionRecords = await TemplateRowMappingSuggestion.findAll({
      where: {
        template_version_id: version.id,
        status: "suggested",
      },
      include: [{ model: SemanticConcept, as: "semanticConcept" }],
      order: [
        ["template_row_id", "ASC"],
        ["source", "ASC"],
        ["rank", "ASC"],
      ],
    })
    const groupedSuggestionResults = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: version.portfolio_id,
      suggestions: suggestionRecords.map((record) => serializeSuggestion(record)),
      currentApprovedMappingsByRow,
    })
    const suggestionsByRow = new Map(groupedSuggestionResults.map((group) => [group.templateRowId, group]))

    const createdTasks = []
    let rowsConsidered = 0
    let rowsSkippedNonReviewable = 0
    let rowsSkippedApproved = 0
    let rowsSkippedActiveTask = 0

    for (const row of rows) {
      if (NON_REVIEWABLE_ROW_TYPES.has(String(row.row_type || "").trim().toLowerCase())) {
        rowsSkippedNonReviewable += 1
        continue
      }

      const currentApprovedMapping = selectCurrentApprovedMapping(approvedByRow.get(row.id) || [])
      if (currentApprovedMapping && !force) {
        rowsSkippedApproved += 1
        continue
      }

      if (activeTaskIdsByRow.has(row.id) && !allowDuplicateActive) {
        rowsSkippedActiveTask += 1
        continue
      }

      const rowSuggestions = suggestionsByRow.get(row.id) || null
      const assessment = buildReviewAssessment({
        row,
        groupedSuggestions: rowSuggestions,
        force,
      })

      if (!assessment.shouldCreateTask) {
        rowsSkippedNonReviewable += 1
        continue
      }

      rowsConsidered += 1

      const task = await ReviewTask.create({
        task_type: "mapping_review",
        target_type: REVIEW_TARGET_TYPES.TEMPLATE_ROW,
        target_id: row.id,
        template_version_id: version.id,
        portfolio_id: version.portfolio_id,
        status: REVIEW_TASK_STATUSES.OPEN,
        priority: assessment.priority,
        review_reason: assessment.reviewReason,
        metadata_json: {
          generation_source: force ? "manual_requested" : "suggestion_pipeline",
          target_label: row.label || null,
          row_type: row.row_type || null,
          section_name: row.section_name || null,
          suggestion_counts: {
            deterministic: rowSuggestions?.suggestions?.filter((item) => item.source === "deterministic_engine").length || 0,
            llm_assisted: rowSuggestions?.suggestions?.filter((item) => item.source === "llm_assisted").length || 0,
            total: rowSuggestions?.suggestions?.length || 0,
          },
          suggestion_ids: {
            deterministic:
              rowSuggestions?.suggestions
                ?.filter((item) => item.source === "deterministic_engine")
                .map((item) => item.id) || [],
            llm_assisted:
              rowSuggestions?.suggestions
                ?.filter((item) => item.source === "llm_assisted")
                .map((item) => item.id) || [],
          },
          flags: assessment.flags,
          scores: assessment.scores,
          report_reliability_status: assessment.status,
          review_reasons: assessment.reviewReasons,
          explainability: rowSuggestions?.assessment?.explainability || null,
          current_approved_mapping_id: currentApprovedMapping?.id || null,
        },
        created_by: actorId,
      })

      createdTasks.push(task)
      activeTaskIdsByRow.set(row.id, task.id)

      await AuditService.logEvent({
        actorId,
        eventType: "review_task_created",
        entityType: "review_task",
        entityId: task.id,
        after: task.toJSON(),
        metadata: {
          template_id: template.id,
          template_version_id: version.id,
          target_type: REVIEW_TARGET_TYPES.TEMPLATE_ROW,
          target_id: row.id,
          review_reason: assessment.reviewReason,
          priority: assessment.priority,
        },
      })
    }

    const summary = {
      rowsConsidered,
      rowsSkippedNonReviewable,
      rowsSkippedApproved,
      rowsSkippedActiveTask,
      tasksCreated: createdTasks.length,
      durationMs: Date.now() - startedAt,
    }

    logger.info("[phase6] Review tasks generated for template version", {
      template_id: template.id,
      template_version_id: version.id,
      tasks_created: createdTasks.length,
      rows_considered: rowsConsidered,
      rows_skipped_non_reviewable: rowsSkippedNonReviewable,
      rows_skipped_approved: rowsSkippedApproved,
      rows_skipped_active_task: rowsSkippedActiveTask,
      duration_ms: summary.durationMs,
    })

    return {
      template,
      version,
      summary,
      reviewTasks: await this.hydrateReviewTasks(createdTasks),
    }
  }

  static async markTaskInReview({ taskId, actorId = null }) {
    const task = await ReviewTask.findByPk(taskId)
    if (!task) return null

    if (![REVIEW_TASK_STATUSES.OPEN, REVIEW_TASK_STATUSES.DEFERRED].includes(task.status)) {
      return task
    }

    const before = task.toJSON()
    await task.update({
      status: REVIEW_TASK_STATUSES.IN_REVIEW,
      completed_at: null,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "review_started",
      entityType: "review_task",
      entityId: task.id,
      before,
      after: task.toJSON(),
      metadata: {
        target_type: task.target_type,
        target_id: task.target_id,
      },
    })

    return task
  }

  static async listReviewTasks({
    status = null,
    templateVersionId = null,
    targetType = null,
    fundId = null,
  } = {}) {
    const where = {}
    if (status) where.status = status
    if (templateVersionId) where.template_version_id = templateVersionId
    if (targetType) where.target_type = targetType
    if (fundId) where.portfolio_id = fundId

    const tasks = await ReviewTask.findAll({
      where,
      order: [["created_at", "DESC"]],
    })

    const hydratedTasks = await this.hydrateReviewTasks(tasks)
    return {
      tasks: sortByPriorityAndCreatedAt(hydratedTasks),
      total: hydratedTasks.length,
    }
  }

  static async generateValidationReviewTasks({
    run,
    validationResult,
    checks = [],
    actorId = null,
  }) {
    if (!ReviewTask || typeof ReviewTask.findAll !== "function" || typeof ReviewTask.create !== "function") {
      return { summary: { tasksCreated: 0, skippedUnavailable: true }, reviewTasks: [] }
    }

    const runId = run?.id || validationResult?.reportRunId || validationResult?.report_run_id || null
    if (!runId || !validationResult) {
      return { summary: { tasksCreated: 0, skippedMissingContext: true }, reviewTasks: [] }
    }

    const actionableChecks = checks.filter((check) => ["fail", "warning"].includes(String(check.status || "").toLowerCase()))
    if (!actionableChecks.length) {
      return { summary: { tasksCreated: 0 }, reviewTasks: [] }
    }

    const activeTasks = await ReviewTask.findAll({
      where: {
        target_type: REVIEW_TARGET_TYPES.VALIDATION_CHECK,
        target_id: runId,
        status: { [Op.in]: ACTIVE_REVIEW_TASK_STATUSES },
      },
    })
    const activeCheckTypes = new Set(
      activeTasks
        .map((task) => asPlainObject(task)?.metadata_json?.check_type)
        .filter(Boolean),
    )

    const createdTasks = []
    for (const check of actionableChecks) {
      if (activeCheckTypes.has(check.checkType)) continue

      const isFailure = String(check.status || "").toLowerCase() === "fail"
      const task = await ReviewTask.create({
        task_type: "validation_exception_review",
        target_type: REVIEW_TARGET_TYPES.VALIDATION_CHECK,
        target_id: runId,
        template_version_id: run.templateVersionId || run.template_version_id || null,
        portfolio_id: run.fundId || run.portfolio_id || null,
        status: REVIEW_TASK_STATUSES.OPEN,
        priority: isFailure ? REVIEW_PRIORITIES.HIGH : REVIEW_PRIORITIES.MEDIUM,
        review_reason: isFailure ? REVIEW_REASONS.VALIDATION_FAILED : REVIEW_REASONS.VALIDATION_WARNING,
        metadata_json: {
          report_run_id: runId,
          validation_result_id: validationResult.id,
          validation_check_id: check.id || null,
          check_type: check.checkType,
          severity: check.severity,
          status: check.status,
          message: check.message,
          details: check.details || null,
        },
        created_by: actorId,
      })

      createdTasks.push(task)
      activeCheckTypes.add(check.checkType)

      await AuditService.logEvent({
        actorId,
        eventType: "validation_exception_review_task_created",
        entityType: "review_task",
        entityId: task.id,
        after: task.toJSON(),
        metadata: {
          report_run_id: runId,
          validation_result_id: validationResult.id,
          check_type: check.checkType,
        },
      })
    }

    return {
      summary: {
        checksConsidered: actionableChecks.length,
        tasksCreated: createdTasks.length,
        tasksSkippedActive: actionableChecks.length - createdTasks.length,
      },
      reviewTasks: await this.hydrateReviewTasks(createdTasks),
    }
  }

  static async loadGenericTask({ taskId, transaction = null }) {
    const task = await ReviewTask.findByPk(taskId, { transaction })
    if (!task) {
      throw createReviewError("Review task not found", "review_not_found", 404)
    }
    if (!this.isGenericTargetType(task.target_type)) {
      throw createReviewError("Template row review tasks must use the mapping review workflow", "review_validation", 400)
    }
    if (CLOSED_REVIEW_TASK_STATUSES.includes(task.status)) {
      throw createReviewError("Review task is already closed", "review_conflict", 409)
    }
    return task
  }

  static async updateGenericTargetForDecision({ task, actionType, actorId, transaction }) {
    if (task.target_type !== REVIEW_TARGET_TYPES.REPORT_EXPORT || !ReportExport) return null

    const exportRecord = await ReportExport.findByPk(task.target_id, { transaction })
    if (!exportRecord) {
      throw createReviewError("Report export request not found", "review_not_found", 404)
    }

    const statusByAction = {
      [REVIEW_ACTION_TYPES.APPROVE]: "approved",
      [REVIEW_ACTION_TYPES.REJECT]: "rejected",
      [REVIEW_ACTION_TYPES.DEFER]: "approval_requested",
    }
    const updates = {
      status: statusByAction[actionType] || exportRecord.status,
    }

    if (actionType === REVIEW_ACTION_TYPES.APPROVE) {
      updates.approved_by = actorId
      updates.approved_at = new Date()
    }

    await exportRecord.update(updates, { transaction })
    return exportRecord
  }

  static async recordGenericDecision({
    taskId,
    actionType,
    actorId = null,
    rationale = null,
  }) {
    if (!Object.values(REVIEW_ACTION_TYPES).includes(actionType)) {
      throw createReviewError("Unsupported review action", "review_validation", 400)
    }
    if (actionType === REVIEW_ACTION_TYPES.OVERRIDE) {
      throw createReviewError("Generic review tasks do not support override actions", "review_validation", 400)
    }

    const result = await sequelize.transaction(async (transaction) => {
      const task = await this.loadGenericTask({ taskId, transaction })
      const taskBefore = asPlainObject(task)
      const decision = await ReviewDecision.create(
        {
          review_task_id: task.id,
          action_type: actionType,
          rationale: rationale || null,
          actor_id: actorId,
          metadata_json: {
            target_type: task.target_type,
            target_id: task.target_id,
          },
        },
        { transaction },
      )

      const statusByAction = {
        [REVIEW_ACTION_TYPES.APPROVE]: REVIEW_TASK_STATUSES.APPROVED,
        [REVIEW_ACTION_TYPES.REJECT]: REVIEW_TASK_STATUSES.REJECTED,
        [REVIEW_ACTION_TYPES.DEFER]: REVIEW_TASK_STATUSES.DEFERRED,
      }
      await task.update(
        {
          status: statusByAction[actionType],
          completed_at: actionType === REVIEW_ACTION_TYPES.DEFER ? null : new Date(),
          metadata_json: mergeMetadata(task.metadata_json, {
            latest_decision_id: decision.id,
            outcome: {
              action: actionType,
            },
          }),
        },
        { transaction },
      )

      const targetRecord = await this.updateGenericTargetForDecision({
        task,
        actionType,
        actorId,
        transaction,
      })

      await AuditService.logEvent({
        actorId,
        eventType: `generic_review_${actionType}`,
        entityType: "review_task",
        entityId: task.id,
        before: taskBefore,
        after: task.toJSON(),
        metadata: {
          target_type: task.target_type,
          target_id: task.target_id,
          review_decision_id: decision.id,
          target_status: targetRecord?.status || null,
        },
      })

      return { taskId: task.id }
    })

    return await this.getReviewTask({ taskId: result.taskId })
  }

  static async approveGenericTask({ taskId, actorId = null, rationale = null }) {
    return await this.recordGenericDecision({
      taskId,
      actionType: REVIEW_ACTION_TYPES.APPROVE,
      actorId,
      rationale,
    })
  }

  static async rejectGenericTask({ taskId, actorId = null, rationale = null }) {
    return await this.recordGenericDecision({
      taskId,
      actionType: REVIEW_ACTION_TYPES.REJECT,
      actorId,
      rationale,
    })
  }

  static async deferGenericTask({ taskId, actorId = null, rationale = null }) {
    return await this.recordGenericDecision({
      taskId,
      actionType: REVIEW_ACTION_TYPES.DEFER,
      actorId,
      rationale,
    })
  }

  static async getReviewTask({ taskId, actorId = null, markInReview = false }) {
    let task = await ReviewTask.findByPk(taskId)
    if (!task) return null

    if (markInReview) {
      task = await this.markTaskInReview({ taskId, actorId })
    }

    const [hydratedTask] = await this.hydrateReviewTasks([task], { includeDetails: true })
    return hydratedTask || null
  }

  static async hydrateReviewTasks(tasks = [], { includeDetails = false } = {}) {
    if (!tasks.length) return []

    const taskRecords = tasks.map((task) => asPlainObject(task))
    const templateRowIds = taskRecords
      .filter((task) => task.target_type === REVIEW_TARGET_TYPES.TEMPLATE_ROW)
      .map((task) => task.target_id)

    const templateRows = templateRowIds.length
      ? await TemplateRow.findAll({
          where: { id: { [Op.in]: templateRowIds } },
          order: [
            ["row_order", "ASC"],
            ["row_index", "ASC"],
          ],
        })
      : []
    const rowsById = new Map(templateRows.map((row) => [row.id, row]))

    const templateVersionIds = Array.from(new Set(taskRecords.map((task) => task.template_version_id).filter(Boolean)))
    const versionRows = includeDetails && templateVersionIds.length
      ? await TemplateRow.findAll({
          where: { template_version_id: { [Op.in]: templateVersionIds } },
          order: [
            ["template_version_id", "ASC"],
            ["row_order", "ASC"],
            ["row_index", "ASC"],
          ],
        })
      : []
    const neighborLookupByVersion = new Map()
    if (includeDetails) {
      const versionGroups = new Map()
      versionRows.forEach((row) => {
        if (!versionGroups.has(row.template_version_id)) {
          versionGroups.set(row.template_version_id, [])
        }
        versionGroups.get(row.template_version_id).push(row)
      })
      versionGroups.forEach((rows, versionId) => {
        neighborLookupByVersion.set(versionId, buildNeighborLookup(rows))
      })
    }

    const currentApprovedMappings = templateRowIds.length
      ? await TemplateRowSemanticMapping.findAll({
          where: {
            template_row_id: { [Op.in]: templateRowIds },
            status: "approved",
          },
          include: [{ model: SemanticConcept, as: "semanticConcept" }],
          order: [
            ["approved_at", "DESC"],
            ["created_at", "DESC"],
          ],
        })
      : []
    const approvedMappingsByRow = new Map()
    currentApprovedMappings.forEach((mapping) => {
      const rowId = mapping.template_row_id
      if (!approvedMappingsByRow.has(rowId)) {
        approvedMappingsByRow.set(rowId, [])
      }
      approvedMappingsByRow.get(rowId).push(serializeApprovedMapping(mapping))
    })
    const currentApprovedMappingsByRow = new Map(
      Array.from(approvedMappingsByRow.entries()).map(([rowId, mappings]) => [rowId, selectCurrentApprovedMapping(mappings)]),
    )

    const suggestionRecords = templateRowIds.length
      ? await TemplateRowMappingSuggestion.findAll({
          where: {
            template_row_id: { [Op.in]: templateRowIds },
            status: "suggested",
          },
          include: [{ model: SemanticConcept, as: "semanticConcept" }],
          order: [
            ["template_row_id", "ASC"],
            ["source", "ASC"],
            ["rank", "ASC"],
          ],
        })
      : []
    const groupedSuggestionResults = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: taskRecords[0]?.portfolio_id || null,
      suggestions: suggestionRecords.map((record) => serializeSuggestion(record)),
      currentApprovedMappingsByRow,
    })
    const suggestionsByRow = new Map(groupedSuggestionResults.map((group) => [group.templateRowId, group]))

    const decisions = await ReviewDecision.findAll({
      where: {
        review_task_id: { [Op.in]: taskRecords.map((task) => task.id) },
      },
      include: [{ model: SemanticConcept, as: "selectedSemanticConcept" }],
      order: [["created_at", "ASC"]],
    })
    const decisionsByTask = new Map()
    decisions.forEach((decision) => {
      const taskId = decision.review_task_id
      if (!decisionsByTask.has(taskId)) {
        decisionsByTask.set(taskId, [])
      }
      decisionsByTask.get(taskId).push(serializeDecision(decision))
    })

    return taskRecords.map((task) => {
      const row = rowsById.get(task.target_id)
      const neighborLookup = neighborLookupByVersion.get(task.template_version_id)
      const neighbors = includeDetails ? neighborLookup?.get(task.target_id) || null : null
      const currentApprovedMapping = currentApprovedMappingsByRow.get(task.target_id) || null
      const rowSuggestions = suggestionsByRow.get(task.target_id) || null

      return {
        id: task.id,
        taskType: task.task_type,
        targetType: task.target_type,
        targetId: task.target_id,
        templateVersionId: task.template_version_id,
        fundId: task.portfolio_id || null,
        status: task.status,
        priority: task.priority,
        reviewReason: task.review_reason,
        assignedTo: task.assigned_to || null,
        createdBy: task.created_by || null,
        completedAt: task.completed_at || null,
        createdAt: task.created_at || task.createdAt || null,
        updatedAt: task.updated_at || task.updatedAt || null,
        metadata: task.metadata_json || null,
        target: row ? serializeRow(row, neighbors) : serializeGenericTarget(task),
        suggestionSummary: {
          deterministicCount:
            rowSuggestions?.suggestions?.filter((item) => item.source === "deterministic_engine").length || 0,
          llmAssistedCount: rowSuggestions?.suggestions?.filter((item) => item.source === "llm_assisted").length || 0,
          topDeterministicCandidate:
            rowSuggestions?.suggestions?.find((item) => item.source === "deterministic_engine") || null,
          topLlmAssistedCandidate: rowSuggestions?.suggestions?.find((item) => item.source === "llm_assisted") || null,
        },
        currentApprovedMapping,
        reviewContext: includeDetails
          ? {
              deterministicCandidates:
                rowSuggestions?.suggestions?.filter((item) => item.source === "deterministic_engine") || [],
              llmAssistedCandidates:
                rowSuggestions?.suggestions?.filter((item) => item.source === "llm_assisted") || [],
              reliability: rowSuggestions?.assessment || null,
              approvedMappingHistory: approvedMappingsByRow.get(task.target_id) || [],
            }
          : null,
        decisions: decisionsByTask.get(task.id) || [],
      }
    })
  }
}

module.exports = ReviewTaskService
