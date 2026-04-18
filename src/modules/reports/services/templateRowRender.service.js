const {
  REPORT_ROW_RESOLUTION_STATUSES,
  REPORT_ROW_VALUE_SOURCES,
} = require("../report.constants")

function roundCurrency(value) {
  if (value === null || value === undefined) return null
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function toPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function buildBaseRowPayload({ row, approvedMapping = null, semanticValue = null }) {
  const plainRow = toPlainObject(row) || {}
  const plainMapping = toPlainObject(approvedMapping) || null
  const concept = plainMapping?.semanticConcept || null

  return {
    templateRowId: plainRow.id,
    rowLabel: plainRow.label || null,
    rowKey: plainRow.row_key || null,
    rowType: plainRow.row_type || null,
    sheetName: plainRow.sheet_name || null,
    rowIndex: plainRow.row_index || null,
    rowOrder: plainRow.row_order || null,
    sectionName: plainRow.section_name || null,
    parentSectionName: plainRow.parent_section_name || null,
    indentationLevel: plainRow.indentation_level || 0,
    formulaText: plainRow.formula_text || null,
    semanticConceptId: plainMapping?.semantic_concept_id || null,
    semanticConceptKey: concept?.stable_key || null,
    semanticConceptLabel: concept?.label || null,
    value: null,
    currency: semanticValue?.currency || null,
    resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING,
    valueSource: REPORT_ROW_VALUE_SOURCES.NONE,
    metadata: {
      reviewRequired: true,
      approvedMappingId: plainMapping?.id || null,
      approvedMappingSource: plainMapping?.source || null,
      approvedAccountMappingsCount: semanticValue?.approvedAccountMappingsCount || 0,
      matchedSourceAccountCount: semanticValue?.matchedSourceAccountCount || 0,
      supportingLineCount: semanticValue?.supportingLineCount || 0,
      supportingEntryCount: semanticValue?.supportingEntryCount || 0,
      matchedSourceAccounts: semanticValue?.matchedSourceAccounts || [],
      approvedAccounts: semanticValue?.approvedAccounts || [],
      currencies: semanticValue?.currencies || [],
    },
  }
}

class TemplateRowRenderService {
  static render({ row, approvedMapping = null, semanticValue = null }) {
    const payload = buildBaseRowPayload({ row, approvedMapping, semanticValue })
    const rowType = String(payload.rowType || "").trim().toLowerCase()
    const isFormulaRow = Boolean(row?.is_formula || payload.formulaText)

    if (rowType === "blank") {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.SKIPPED_BLANK_ROW,
        valueSource: REPORT_ROW_VALUE_SOURCES.NONE,
        metadata: {
          ...payload.metadata,
          reviewRequired: false,
        },
      }
    }

    if (rowType === "note") {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.NOTE_ROW,
        valueSource: REPORT_ROW_VALUE_SOURCES.NONE,
        metadata: {
          ...payload.metadata,
          reviewRequired: false,
        },
      }
    }

    if (!approvedMapping && rowType === "section_header") {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.SECTION_HEADER,
        valueSource: REPORT_ROW_VALUE_SOURCES.NONE,
        metadata: {
          ...payload.metadata,
          reviewRequired: false,
        },
      }
    }

    if (isFormulaRow) {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED,
        valueSource: REPORT_ROW_VALUE_SOURCES.FORMULA_METADATA_ONLY,
        metadata: {
          ...payload.metadata,
          reviewRequired: true,
          computeSupported: false,
        },
      }
    }

    if (!approvedMapping) {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING,
        metadata: {
          ...payload.metadata,
          reviewRequired: true,
        },
      }
    }

    if (!semanticValue || Number(semanticValue.approvedAccountMappingsCount || 0) <= 0) {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT,
        metadata: {
          ...payload.metadata,
          reviewRequired: true,
          unresolvedReason: "no_approved_source_account_mappings",
        },
      }
    }

    if (Number(semanticValue.supportingLineCount || 0) <= 0) {
      return {
        ...payload,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT,
        metadata: {
          ...payload.metadata,
          reviewRequired: true,
          unresolvedReason: "no_posted_source_entries",
        },
      }
    }

    const resolvedValue = roundCurrency(semanticValue.totalValue)
    if (
      Number(semanticValue.matchedSourceAccountCount || 0) <
      Number(semanticValue.approvedAccountMappingsCount || 0)
    ) {
      return {
        ...payload,
        value: resolvedValue,
        resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_PARTIAL_GROUNDING,
        valueSource: REPORT_ROW_VALUE_SOURCES.APPROVED_MAPPING,
        metadata: {
          ...payload.metadata,
          reviewRequired: true,
          unresolvedReason: "partial_source_grounding",
        },
      }
    }

    return {
      ...payload,
      value: resolvedValue,
      resolutionStatus: REPORT_ROW_RESOLUTION_STATUSES.RESOLVED,
      valueSource: REPORT_ROW_VALUE_SOURCES.APPROVED_MAPPING,
      metadata: {
        ...payload.metadata,
        reviewRequired: false,
      },
    }
  }
}

module.exports = TemplateRowRenderService
