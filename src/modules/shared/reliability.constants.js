const REPORT_RELIABILITY_STATUSES = Object.freeze({
  UNMAPPED: "unmapped",
  SEMANTICALLY_MATCHED_UNGROUNDED: "semantically_matched_ungrounded",
  PARTIALLY_GROUNDED: "partially_grounded",
  GROUNDED: "grounded",
  CONFLICTING: "conflicting",
  REQUIRES_REVIEW: "requires_review",
})

const REVIEW_REASON_CODES = Object.freeze({
  NO_ACCOUNT_GROUNDING: "no_account_grounding",
  NO_APPROVED_ACCOUNT_MAPPINGS: "no_approved_account_mappings",
  PARTIAL_ACCOUNT_COVERAGE: "partial_account_coverage",
  WEAK_EVIDENCE: "weak_evidence",
  WEAK_NUMERIC_SUPPORT: "weak_numeric_support",
  FALLBACK_DERIVED_RESULT: "fallback_derived_result",
  CONFLICTING_SIGNALS: "conflicting_signals",
  LOW_SEMANTIC_CONFIDENCE: "low_semantic_confidence",
  NO_CANDIDATE: "no_candidate",
})

module.exports = {
  REPORT_RELIABILITY_STATUSES,
  REVIEW_REASON_CODES,
}
