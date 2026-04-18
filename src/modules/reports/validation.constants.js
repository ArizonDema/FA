const VALIDATION_SEVERITIES = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
})

const VALIDATION_STATUSES = Object.freeze({
  PASS: "pass",
  WARNING: "warning",
  FAIL: "fail",
  SKIPPED: "skipped",
})

const REPORT_READINESS_STATUSES = Object.freeze({
  READY: "ready",
  READY_WITH_WARNINGS: "ready_with_warnings",
  NOT_READY: "not_ready",
})

const VALIDATION_CHECK_TYPES = Object.freeze({
  MISSING_APPROVED_MAPPINGS: "missing_approved_mappings",
  UNRESOLVED_ROWS: "unresolved_rows_present",
  SOURCE_GROUNDING: "source_grounding",
  FORMULA_SUPPORT: "formula_support",
  TOTAL_SUBTOTAL_CONSISTENCY: "total_subtotal_consistency",
  EMPTY_NULL_VALUES: "empty_or_null_values",
  MAPPING_COVERAGE_SUMMARY: "mapping_coverage_summary",
  RELIABILITY_STATUS_ROLLUP: "reliability_status_rollup",
  CRITICAL_CONCEPT_PRESENCE: "critical_concept_presence",
  AUDITABILITY: "auditability",
})

module.exports = {
  VALIDATION_SEVERITIES,
  VALIDATION_STATUSES,
  REPORT_READINESS_STATUSES,
  VALIDATION_CHECK_TYPES,
}
