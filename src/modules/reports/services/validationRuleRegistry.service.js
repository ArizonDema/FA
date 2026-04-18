const {
  REPORT_ROW_RESOLUTION_STATUSES,
  REPORT_RUN_STATUSES,
} = require("../report.constants")
const {
  VALIDATION_CHECK_TYPES,
  VALIDATION_SEVERITIES,
  VALIDATION_STATUSES,
} = require("../validation.constants")

const MAPPING_EXPECTED_ROW_TYPES = new Set(["data_row", "subtotal", "total"])
const STRUCTURAL_ROW_TYPES = new Set(["blank", "note", "section_header"])

function normalizeRowType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function buildCheck({
  checkType,
  severity,
  status,
  message,
  details = null,
  targetType = "report_run",
  targetId = null,
}) {
  return {
    checkType,
    severity,
    status,
    targetType,
    targetId,
    message,
    details,
  }
}

function getEligibleMappingRows(rows = []) {
  return rows.filter((row) => MAPPING_EXPECTED_ROW_TYPES.has(normalizeRowType(row.rowType)))
}

function getReviewableRows(rows = []) {
  return rows.filter((row) => !STRUCTURAL_ROW_TYPES.has(normalizeRowType(row.rowType)))
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function countsByStatus(rows = []) {
  return rows.reduce((result, row) => {
    result[row.resolutionStatus] = (result[row.resolutionStatus] || 0) + 1
    return result
  }, {})
}

function extractApprovedMappingId(row) {
  return row.metadata?.approvedMappingId || null
}

class ValidationRuleRegistry {
  static getRules() {
    return [
      this.missingApprovedMappingsRule,
      this.mappingCoverageSummaryRule,
      this.unresolvedRowsRule,
      this.sourceGroundingRule,
      this.formulaSupportRule,
      this.totalSubtotalConsistencyRule,
      this.emptyNullValuesRule,
      this.reliabilityStatusRollupRule,
      this.criticalConceptPresenceRule,
      this.auditabilityRule,
    ]
  }

  static missingApprovedMappingsRule(context) {
    const eligibleRows = getEligibleMappingRows(context.rows)
    if (!eligibleRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.MISSING_APPROVED_MAPPINGS,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.SKIPPED,
        message: "No mapping-eligible rows were present for approved-mapping coverage checks.",
        targetId: context.run.id,
      })
    }

    const missingRows = eligibleRows.filter(
      (row) => row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING,
    )
    if (!missingRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.MISSING_APPROVED_MAPPINGS,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "All mapping-eligible rows have approved mappings.",
        details: {
          eligibleRowCount: eligibleRows.length,
          missingApprovedMappingCount: 0,
        },
        targetId: context.run.id,
      })
    }

    const ratio = missingRows.length / eligibleRows.length
    const warningOnly = missingRows.length <= 2 && ratio <= 0.05
    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.MISSING_APPROVED_MAPPINGS,
      severity: warningOnly ? VALIDATION_SEVERITIES.WARNING : VALIDATION_SEVERITIES.ERROR,
      status: warningOnly ? VALIDATION_STATUSES.WARNING : VALIDATION_STATUSES.FAIL,
      message: `${missingRows.length} mapping-eligible row(s) have no approved mapping.`,
      details: {
        eligibleRowCount: eligibleRows.length,
        missingApprovedMappingCount: missingRows.length,
        missingRowIds: missingRows.map((row) => row.templateRowId),
        missingRowLabels: missingRows.map((row) => row.rowLabel).filter(Boolean).slice(0, 10),
        coverageRatio: Number(((eligibleRows.length - missingRows.length) / eligibleRows.length).toFixed(4)),
      },
      targetId: context.run.id,
    })
  }

  static mappingCoverageSummaryRule(context) {
    const eligibleRows = getEligibleMappingRows(context.rows)
    if (!eligibleRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.MAPPING_COVERAGE_SUMMARY,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.SKIPPED,
        message: "Mapping coverage is not applicable because no eligible rows were found.",
        targetId: context.run.id,
      })
    }

    const coveredRows = eligibleRows.filter((row) => Boolean(extractApprovedMappingId(row) || row.semanticConceptId))
    const coverageRatio = coveredRows.length / eligibleRows.length

    if (coverageRatio === 1) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.MAPPING_COVERAGE_SUMMARY,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "Approved mapping coverage is 100% for mapping-eligible rows.",
        details: {
          eligibleRowCount: eligibleRows.length,
          coveredRowCount: coveredRows.length,
          coverageRatio: 1,
        },
        targetId: context.run.id,
      })
    }

    const isWarning = coverageRatio >= 0.9
    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.MAPPING_COVERAGE_SUMMARY,
      severity: isWarning ? VALIDATION_SEVERITIES.WARNING : VALIDATION_SEVERITIES.ERROR,
      status: isWarning ? VALIDATION_STATUSES.WARNING : VALIDATION_STATUSES.FAIL,
      message: `Approved mapping coverage is ${(coverageRatio * 100).toFixed(1)}% for mapping-eligible rows.`,
      details: {
        eligibleRowCount: eligibleRows.length,
        coveredRowCount: coveredRows.length,
        uncoveredRowCount: eligibleRows.length - coveredRows.length,
        coverageRatio: Number(coverageRatio.toFixed(4)),
      },
      targetId: context.run.id,
    })
  }

  static unresolvedRowsRule(context) {
    const reviewableRows = getReviewableRows(context.rows)
    const unresolvedRows = reviewableRows.filter((row) =>
      [
        REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING,
        REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT,
        REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_PARTIAL_GROUNDING,
        REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED,
      ].includes(row.resolutionStatus),
    )

    if (!unresolvedRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.UNRESOLVED_ROWS,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "No unresolved reviewable rows were found in the generated report.",
        details: {
          reviewableRowCount: reviewableRows.length,
          unresolvedRowCount: 0,
        },
        targetId: context.run.id,
      })
    }

    const counts = countsByStatus(unresolvedRows)
    const hardFailures =
      (counts[REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING] || 0) +
      (counts[REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT] || 0)
    const warningOnly = hardFailures === 0

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.UNRESOLVED_ROWS,
      severity: warningOnly ? VALIDATION_SEVERITIES.WARNING : VALIDATION_SEVERITIES.ERROR,
      status: warningOnly ? VALIDATION_STATUSES.WARNING : VALIDATION_STATUSES.FAIL,
      message: `${unresolvedRows.length} reviewable row(s) remain unresolved after generation.`,
      details: {
        unresolvedRowCount: unresolvedRows.length,
        reviewableRowCount: reviewableRows.length,
        byResolutionStatus: counts,
        unresolvedRowIds: unresolvedRows.map((row) => row.templateRowId),
        unresolvedRowLabels: unresolvedRows.map((row) => row.rowLabel).filter(Boolean).slice(0, 10),
      },
      targetId: context.run.id,
    })
  }

  static sourceGroundingRule(context) {
    const noSourceRows = context.rows.filter(
      (row) => row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT,
    )
    const partialRows = context.rows.filter(
      (row) => row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_PARTIAL_GROUNDING,
    )

    if (!noSourceRows.length && !partialRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.SOURCE_GROUNDING,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "All resolved rows have complete source grounding support.",
        details: {
          noSourceSupportCount: 0,
          partialGroundingCount: 0,
        },
        targetId: context.run.id,
      })
    }

    const failure = noSourceRows.length > 0
    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.SOURCE_GROUNDING,
      severity: failure ? VALIDATION_SEVERITIES.ERROR : VALIDATION_SEVERITIES.WARNING,
      status: failure ? VALIDATION_STATUSES.FAIL : VALIDATION_STATUSES.WARNING,
      message: failure
        ? `${noSourceRows.length} row(s) have approved mappings but no usable source support.`
        : `${partialRows.length} row(s) are only partially grounded by source support.`,
      details: {
        noSourceSupportCount: noSourceRows.length,
        noSourceSupportRowIds: noSourceRows.map((row) => row.templateRowId),
        partialGroundingCount: partialRows.length,
        partialGroundingRowIds: partialRows.map((row) => row.templateRowId),
      },
      targetId: context.run.id,
    })
  }

  static formulaSupportRule(context) {
    const formulaRows = context.rows.filter(
      (row) =>
        row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED ||
        Boolean(row.formulaText) ||
        normalizeRowType(row.rowType) === "formula_row",
    )

    if (!formulaRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.FORMULA_SUPPORT,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.SKIPPED,
        message: "No formula rows were present for formula-support validation.",
        targetId: context.run.id,
      })
    }

    const notComputedRows = formulaRows.filter(
      (row) => row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED,
    )
    if (!notComputedRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.FORMULA_SUPPORT,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "Formula rows were present and none were flagged as unsupported.",
        details: {
          formulaRowCount: formulaRows.length,
          notComputedCount: 0,
        },
        targetId: context.run.id,
      })
    }

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.FORMULA_SUPPORT,
      severity: VALIDATION_SEVERITIES.WARNING,
      status: VALIDATION_STATUSES.WARNING,
      message: `${notComputedRows.length} formula row(s) were preserved but not computed.`,
      details: {
        formulaRowCount: formulaRows.length,
        notComputedCount: notComputedRows.length,
        rowIds: notComputedRows.map((row) => row.templateRowId),
        rowLabels: notComputedRows.map((row) => row.rowLabel).filter(Boolean).slice(0, 10),
      },
      targetId: context.run.id,
    })
  }

  static totalSubtotalConsistencyRule(context) {
    const totalLikeRows = context.rows.filter((row) => {
      const rowType = normalizeRowType(row.rowType)
      return rowType === "total" || rowType === "subtotal" || Boolean(row.formulaText)
    })

    if (!totalLikeRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.TOTAL_SUBTOTAL_CONSISTENCY,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.SKIPPED,
        message: "No total or subtotal rows were present for deterministic consistency checks.",
        targetId: context.run.id,
      })
    }

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.TOTAL_SUBTOTAL_CONSISTENCY,
      severity: VALIDATION_SEVERITIES.INFO,
      status: VALIDATION_STATUSES.SKIPPED,
      message: "Deterministic total/subtotal validation is not yet implemented for this report family.",
      details: {
        totalLikeRowCount: totalLikeRows.length,
        rowIds: totalLikeRows.map((row) => row.templateRowId),
      },
      targetId: context.run.id,
    })
  }

  static emptyNullValuesRule(context) {
    const invalidRows = context.rows.filter(
      (row) =>
        row.valueSource === "approved_mapping" &&
        row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.RESOLVED &&
        (row.value === null || row.value === undefined || Number.isNaN(Number(row.value))),
    )

    if (!invalidRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.EMPTY_NULL_VALUES,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "No resolved approved-mapping rows contain null or invalid values.",
        details: {
          invalidResolvedValueCount: 0,
        },
        targetId: context.run.id,
      })
    }

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.EMPTY_NULL_VALUES,
      severity: VALIDATION_SEVERITIES.ERROR,
      status: VALIDATION_STATUSES.FAIL,
      message: `${invalidRows.length} resolved row(s) contain null or invalid numeric values.`,
      details: {
        invalidResolvedValueCount: invalidRows.length,
        rowIds: invalidRows.map((row) => row.templateRowId),
        rowLabels: invalidRows.map((row) => row.rowLabel).filter(Boolean).slice(0, 10),
      },
      targetId: context.run.id,
    })
  }

  static reliabilityStatusRollupRule(context) {
    const unresolvedCount = Number(context.generationSummary?.unresolvedRows || 0)
    if (!unresolvedCount && context.run.status === REPORT_RUN_STATUSES.COMPLETED) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.RELIABILITY_STATUS_ROLLUP,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "Generation completed without unresolved row statuses.",
        details: {
          generationStatus: context.run.status,
          unresolvedRows: 0,
        },
        targetId: context.run.id,
      })
    }

    const hardUnresolved =
      Number(context.generationSummary?.missingMappingsCount || 0) +
      Number(
        context.generationSummary?.statusBreakdown?.[REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT] || 0,
      )
    const warningOnly = hardUnresolved === 0 && unresolvedCount > 0

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.RELIABILITY_STATUS_ROLLUP,
      severity: warningOnly ? VALIDATION_SEVERITIES.WARNING : VALIDATION_SEVERITIES.ERROR,
      status: warningOnly ? VALIDATION_STATUSES.WARNING : VALIDATION_STATUSES.FAIL,
      message: warningOnly
        ? "Generation completed with warning-level unresolved statuses."
        : "Generation completed with unresolved statuses that prevent full report readiness.",
      details: {
        generationStatus: context.run.status,
        unresolvedRows: unresolvedCount,
        statusBreakdown: context.generationSummary?.statusBreakdown || {},
      },
      targetId: context.run.id,
    })
  }

  static criticalConceptPresenceRule(context) {
    const criticalKeys = ["opening_cash", "closing_cash", "net_change_in_cash"]
    const criticalRows = context.rows.filter((row) => criticalKeys.includes(String(row.semanticConceptKey || "")))

    if (!criticalRows.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.CRITICAL_CONCEPT_PRESENCE,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.SKIPPED,
        message: "No mapped critical cash concepts were present in this template version.",
        targetId: context.run.id,
      })
    }

    const unresolvedCritical = criticalRows.filter(
      (row) => row.resolutionStatus !== REPORT_ROW_RESOLUTION_STATUSES.RESOLVED,
    )
    if (!unresolvedCritical.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.CRITICAL_CONCEPT_PRESENCE,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "Mapped critical cash concepts are present and resolved.",
        details: {
          criticalConceptKeys: unique(criticalRows.map((row) => row.semanticConceptKey)),
        },
        targetId: context.run.id,
      })
    }

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.CRITICAL_CONCEPT_PRESENCE,
      severity: VALIDATION_SEVERITIES.ERROR,
      status: VALIDATION_STATUSES.FAIL,
      message: `${unresolvedCritical.length} mapped critical cash concept row(s) are unresolved.`,
      details: {
        criticalConceptKeys: unique(criticalRows.map((row) => row.semanticConceptKey)),
        unresolvedCriticalRowIds: unresolvedCritical.map((row) => row.templateRowId),
        unresolvedCriticalKeys: unique(unresolvedCritical.map((row) => row.semanticConceptKey)),
      },
      targetId: context.run.id,
    })
  }

  static auditabilityRule(context) {
    const issues = []
    const approvedRowMappingIds = context.run.mappingSnapshot?.approved_row_mapping_ids || []

    if (!context.rows.length) {
      issues.push("missing_persisted_report_rows")
    }
    if (!context.run.templateVersionId) {
      issues.push("missing_template_version_id")
    }
    if (context.run.inputs?.generation_mode !== "approved_mapping_report_engine") {
      issues.push("unexpected_generation_mode")
    }
    if (!Array.isArray(approvedRowMappingIds)) {
      issues.push("missing_approved_mapping_snapshot")
    } else if (context.generationSummary?.resolvedRows > 0 && approvedRowMappingIds.length === 0) {
      issues.push("resolved_rows_without_mapping_lineage")
    }

    if (!issues.length) {
      return buildCheck({
        checkType: VALIDATION_CHECK_TYPES.AUDITABILITY,
        severity: VALIDATION_SEVERITIES.INFO,
        status: VALIDATION_STATUSES.PASS,
        message: "Report run retains template and approved-mapping lineage needed for auditability.",
        details: {
          templateVersionId: context.run.templateVersionId,
          approvedRowMappingIdsCount: approvedRowMappingIds.length,
        },
        targetId: context.run.id,
      })
    }

    return buildCheck({
      checkType: VALIDATION_CHECK_TYPES.AUDITABILITY,
      severity: VALIDATION_SEVERITIES.ERROR,
      status: VALIDATION_STATUSES.FAIL,
      message: "Report run lineage is incomplete for auditability requirements.",
      details: {
        issues,
        templateVersionId: context.run.templateVersionId,
        approvedRowMappingIdsCount: Array.isArray(approvedRowMappingIds) ? approvedRowMappingIds.length : null,
      },
      targetId: context.run.id,
    })
  }
}

module.exports = ValidationRuleRegistry
