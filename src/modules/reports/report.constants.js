const REPORT_RUN_STATUSES = Object.freeze({
  PENDING: "pending",
  COMPLETED: "completed",
  COMPLETED_WITH_UNRESOLVED_ROWS: "completed_with_unresolved_rows",
  FAILED: "failed",
})

const REPORT_ROW_RESOLUTION_STATUSES = Object.freeze({
  RESOLVED: "resolved",
  UNRESOLVED_NO_APPROVED_MAPPING: "unresolved_no_approved_mapping",
  UNRESOLVED_NO_SOURCE_SUPPORT: "unresolved_no_source_support",
  UNRESOLVED_PARTIAL_GROUNDING: "unresolved_partial_grounding",
  FORMULA_NOT_COMPUTED: "formula_not_computed",
  SKIPPED_BLANK_ROW: "skipped_blank_row",
  NOTE_ROW: "note_row",
  SECTION_HEADER: "section_header",
})

const REPORT_ROW_VALUE_SOURCES = Object.freeze({
  APPROVED_MAPPING: "approved_mapping",
  FORMULA_METADATA_ONLY: "formula_metadata_only",
  NONE: "none",
})

module.exports = {
  REPORT_RUN_STATUSES,
  REPORT_ROW_RESOLUTION_STATUSES,
  REPORT_ROW_VALUE_SOURCES,
}
