const REVIEW_TASK_STATUSES = Object.freeze({
  OPEN: "open",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  OVERRIDDEN: "overridden",
  DEFERRED: "deferred",
})

const ACTIVE_REVIEW_TASK_STATUSES = Object.freeze([
  REVIEW_TASK_STATUSES.OPEN,
  REVIEW_TASK_STATUSES.IN_REVIEW,
  REVIEW_TASK_STATUSES.DEFERRED,
])

const CLOSED_REVIEW_TASK_STATUSES = Object.freeze([
  REVIEW_TASK_STATUSES.APPROVED,
  REVIEW_TASK_STATUSES.REJECTED,
  REVIEW_TASK_STATUSES.OVERRIDDEN,
])

const REVIEW_PRIORITIES = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
})

const REVIEW_REASONS = Object.freeze({
  APPROVAL_REQUIRED: "approval_required",
  LOW_CONFIDENCE: "low_confidence",
  LLM_DISAGREEMENT: "llm_disagreement",
  NO_CANDIDATE: "no_candidate",
  NO_ACCOUNT_GROUNDING: "no_account_grounding",
  WEAK_EVIDENCE: "weak_evidence",
  FALLBACK_DERIVED_RESULT: "fallback_derived_result",
  CONFLICTING_SIGNALS: "conflicting_signals",
  PARTIALLY_GROUNDED: "partially_grounded",
  MULTIPLE_CLOSE_CANDIDATES: "multiple_close_candidates",
  MANUAL_REQUESTED: "manual_requested",
})

const REVIEW_ACTION_TYPES = Object.freeze({
  APPROVE: "approve",
  REJECT: "reject",
  OVERRIDE: "override",
  DEFER: "defer",
})

const REVIEW_TARGET_TYPES = Object.freeze({
  TEMPLATE_ROW: "template_row",
})

const NON_REVIEWABLE_ROW_TYPES = new Set(["blank", "note"])

const PRIORITY_SORT_ORDER = Object.freeze({
  [REVIEW_PRIORITIES.HIGH]: 0,
  [REVIEW_PRIORITIES.MEDIUM]: 1,
  [REVIEW_PRIORITIES.LOW]: 2,
})

module.exports = {
  ACTIVE_REVIEW_TASK_STATUSES,
  CLOSED_REVIEW_TASK_STATUSES,
  NON_REVIEWABLE_ROW_TYPES,
  PRIORITY_SORT_ORDER,
  REVIEW_ACTION_TYPES,
  REVIEW_PRIORITIES,
  REVIEW_REASONS,
  REVIEW_TARGET_TYPES,
  REVIEW_TASK_STATUSES,
}
