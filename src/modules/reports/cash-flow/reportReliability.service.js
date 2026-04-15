const { REPORT_RELIABILITY_STATUSES, REVIEW_REASON_CODES } = require("../../shared/reliability.constants")

function roundScore(value, precision = 4) {
  const numericValue = Number(value || 0)
  if (!Number.isFinite(numericValue)) return 0
  const factor = 10 ** precision
  return Math.round((numericValue + Number.EPSILON) * factor) / factor
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function sourceWeight(assignment = {}) {
  const source = String(assignment.source || "").trim().toLowerCase()
  const groundingStatus = String(assignment.grounding_status || "").trim().toLowerCase()

  if (groundingStatus === "approved") return 1
  if (groundingStatus === "template_rule") return 1
  if (source === "template_rule" || source === "manual_rule" || source === "seeded") return 1
  if (groundingStatus === "suggested") return 0.6
  if (groundingStatus === "fallback" || source === "fallback") return 0.1
  if (groundingStatus === "auto_semantic" || source === "auto_semantic") return 0.25
  return 0.2
}

function countAssignments(assignments = [], predicate) {
  return assignments.filter(predicate).length
}

function buildReasons({
  groundedCount,
  fallbackCount,
  lowConfidenceCount,
  uncoveredCount,
  evidenceScore,
  accountCoverageScore,
}) {
  const reasons = []
  if (groundedCount <= 0) {
    reasons.push(REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING)
    reasons.push(REVIEW_REASON_CODES.NO_APPROVED_ACCOUNT_MAPPINGS)
  }
  if (fallbackCount > 0) reasons.push(REVIEW_REASON_CODES.FALLBACK_DERIVED_RESULT)
  if (lowConfidenceCount > 0 || Number(evidenceScore || 0) < 0.65) {
    reasons.push(REVIEW_REASON_CODES.WEAK_NUMERIC_SUPPORT)
    reasons.push(REVIEW_REASON_CODES.WEAK_EVIDENCE)
  }
  if (uncoveredCount > 0 || Number(accountCoverageScore || 0) < 0.85) {
    reasons.push(REVIEW_REASON_CODES.PARTIAL_ACCOUNT_COVERAGE)
  }
  return unique(reasons)
}

class ReportReliabilityService {
  static assess({
    assignments = [],
    totalMovementCount = 0,
    lowConfidenceMappings = [],
    unmappedMovementCount = 0,
  }) {
    const safeTotalMovementCount = Number(totalMovementCount || 0)
    const groundedCount = countAssignments(
      assignments,
      (item) =>
        ["approved", "template_rule"].includes(String(item.grounding_status || "").trim().toLowerCase()) ||
        ["template_rule", "manual_rule", "seeded"].includes(String(item.source || "").trim().toLowerCase()),
    )
    const fallbackCount = countAssignments(
      assignments,
      (item) =>
        String(item.grounding_status || "").trim().toLowerCase() === "fallback" ||
        String(item.source || "").trim().toLowerCase() === "fallback",
    )
    const suggestedCount = countAssignments(
      assignments,
      (item) => String(item.grounding_status || "").trim().toLowerCase() === "suggested",
    )
    const autoSemanticCount = countAssignments(
      assignments,
      (item) =>
        String(item.grounding_status || "").trim().toLowerCase() === "auto_semantic" ||
        String(item.source || "").trim().toLowerCase() === "auto_semantic",
    )
    const lowConfidenceCount = Number(lowConfidenceMappings?.length || 0)

    const weightedEvidence = assignments.reduce(
      (total, assignment) => total + Number(assignment.abs_amount || 0) * sourceWeight(assignment),
      0,
    )
    const totalAbsAmount = assignments.reduce((total, assignment) => total + Number(assignment.abs_amount || 0), 0)

    const accountCoverageScore =
      safeTotalMovementCount > 0 ? roundScore(groundedCount / safeTotalMovementCount) : 0
    const evidenceScore =
      totalAbsAmount > 0
        ? roundScore(weightedEvidence / totalAbsAmount)
        : assignments.length > 0
          ? roundScore(
              assignments.reduce((total, assignment) => total + sourceWeight(assignment), 0) / assignments.length,
            )
          : 0

    const uncoveredCount = Math.max(
      0,
      safeTotalMovementCount - groundedCount - Number(unmappedMovementCount || 0),
    )

    let reportReliabilityStatus = REPORT_RELIABILITY_STATUSES.GROUNDED
    if (assignments.length === 0 || safeTotalMovementCount === 0) {
      reportReliabilityStatus = REPORT_RELIABILITY_STATUSES.UNMAPPED
    } else if (fallbackCount > 0 || lowConfidenceCount > 0 || Number(unmappedMovementCount || 0) > 0) {
      reportReliabilityStatus = REPORT_RELIABILITY_STATUSES.REQUIRES_REVIEW
    } else if (groundedCount <= 0) {
      reportReliabilityStatus = REPORT_RELIABILITY_STATUSES.SEMANTICALLY_MATCHED_UNGROUNDED
    } else if (Number(accountCoverageScore || 0) < 0.85 || Number(evidenceScore || 0) < 0.85 || suggestedCount > 0) {
      reportReliabilityStatus = REPORT_RELIABILITY_STATUSES.PARTIALLY_GROUNDED
    }

    const reviewReasons = buildReasons({
      groundedCount,
      fallbackCount,
      lowConfidenceCount,
      uncoveredCount,
      evidenceScore,
      accountCoverageScore,
    })

    return {
      accountCoverageScore,
      evidenceScore,
      reportReliabilityStatus,
      humanReviewRequired: reportReliabilityStatus !== REPORT_RELIABILITY_STATUSES.GROUNDED,
      reviewReasons,
      explainability: {
        totalMovementCount: safeTotalMovementCount,
        groundedAssignmentCount: groundedCount,
        suggestedAssignmentCount: suggestedCount,
        autoSemanticAssignmentCount: autoSemanticCount,
        fallbackAssignmentCount: fallbackCount,
        lowConfidenceAssignmentCount: lowConfidenceCount,
        unmappedMovementCount: Number(unmappedMovementCount || 0),
      },
    }
  }
}

module.exports = ReportReliabilityService
