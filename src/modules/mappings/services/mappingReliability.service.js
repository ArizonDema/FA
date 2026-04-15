const { Op } = require("sequelize")
const { Account, AccountSemanticMapping } = require("../../../models")
const { REPORT_RELIABILITY_STATUSES, REVIEW_REASON_CODES } = require("../../shared/reliability.constants")
const { roundScore } = require("../utils/mappingText.util")

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function buildEmptyGrounding() {
  return {
    approvedCount: 0,
    suggestedCount: 0,
    approvedAccounts: [],
    suggestedAccounts: [],
  }
}

function accountCoverageScoreFromCount(count) {
  if (!Number.isFinite(Number(count)) || Number(count) <= 0) return 0
  return roundScore(Math.min(1, 0.2 + Number(count) * 0.25))
}

function evidenceScoreFromCoverage({
  accountCoverageScore = 0,
  approvedCount = 0,
  semanticConfidence = 0,
  currentApprovedRowMapping = null,
  conflictingSignals = false,
  fallbackUsed = false,
  weakNumericSupport = false,
}) {
  let score = Number(accountCoverageScore || 0) * 0.75
  if (approvedCount > 0) score += 0.15
  if (currentApprovedRowMapping) score += 0.1
  if (Number(semanticConfidence || 0) < 0.45) {
    score = Math.min(score, 0.65)
  }
  if (conflictingSignals) {
    score = Math.min(score, 0.35)
  }
  if (fallbackUsed) {
    score = Math.min(score, 0.2)
  }
  if (weakNumericSupport) {
    score = Math.min(score, 0.4)
  }
  return roundScore(Math.max(0, Math.min(1, score)))
}

function resolveReliabilityStatus({
  semanticConfidence = 0,
  accountCoverageScore = 0,
  evidenceScore = 0,
  conflictingSignals = false,
  fallbackUsed = false,
  weakNumericSupport = false,
}) {
  if (conflictingSignals) return REPORT_RELIABILITY_STATUSES.CONFLICTING
  if (!Number(semanticConfidence || 0)) return REPORT_RELIABILITY_STATUSES.UNMAPPED
  if (fallbackUsed || weakNumericSupport) return REPORT_RELIABILITY_STATUSES.REQUIRES_REVIEW
  if (Number(accountCoverageScore || 0) <= 0) return REPORT_RELIABILITY_STATUSES.SEMANTICALLY_MATCHED_UNGROUNDED
  if (Number(accountCoverageScore || 0) < 0.75 || Number(evidenceScore || 0) < 0.85) {
    return REPORT_RELIABILITY_STATUSES.PARTIALLY_GROUNDED
  }
  return REPORT_RELIABILITY_STATUSES.GROUNDED
}

function deriveReviewReasons({
  semanticConfidence = 0,
  approvedCount = 0,
  accountCoverageScore = 0,
  evidenceScore = 0,
  conflictingSignals = false,
  fallbackUsed = false,
  weakNumericSupport = false,
}) {
  const reasons = []

  if (conflictingSignals) reasons.push(REVIEW_REASON_CODES.CONFLICTING_SIGNALS)
  if (Number(semanticConfidence || 0) < 0.45) reasons.push(REVIEW_REASON_CODES.LOW_SEMANTIC_CONFIDENCE)
  if (approvedCount <= 0) {
    reasons.push(REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING)
    reasons.push(REVIEW_REASON_CODES.NO_APPROVED_ACCOUNT_MAPPINGS)
  } else if (Number(accountCoverageScore || 0) < 0.75) {
    reasons.push(REVIEW_REASON_CODES.PARTIAL_ACCOUNT_COVERAGE)
  }
  if (fallbackUsed) reasons.push(REVIEW_REASON_CODES.FALLBACK_DERIVED_RESULT)
  if (weakNumericSupport) reasons.push(REVIEW_REASON_CODES.WEAK_NUMERIC_SUPPORT)
  if (Number(evidenceScore || 0) < 0.65) reasons.push(REVIEW_REASON_CODES.WEAK_EVIDENCE)

  return unique(reasons)
}

function buildExplainability({
  grounding = buildEmptyGrounding(),
  currentApprovedRowMapping = null,
  conflictingSignals = false,
  fallbackUsed = false,
  weakNumericSupport = false,
  selectedSemanticConceptKey = null,
}) {
  return {
    selectedSemanticConceptKey,
    approvedAccountMappingsCount: grounding.approvedCount,
    suggestedAccountMappingsCount: grounding.suggestedCount,
    approvedMappingsPresent: grounding.approvedCount > 0,
    currentApprovedRowMappingPresent: Boolean(currentApprovedRowMapping),
    mappedAccounts: grounding.approvedAccounts,
    fallbackUsed: Boolean(fallbackUsed),
    weakNumericSupport: Boolean(weakNumericSupport),
    conflictingSignals: Boolean(conflictingSignals),
  }
}

function buildGroupAssessment({ topSuggestion, currentApprovedRowMapping = null, explicitAssessment = null }) {
  if (!topSuggestion) {
    return {
      semanticConfidence: 0,
      accountCoverageScore: 0,
      evidenceScore: 0,
      reportReliabilityStatus: REPORT_RELIABILITY_STATUSES.UNMAPPED,
      humanReviewRequired: true,
      needsHumanReview: true,
      reviewReasons: [REVIEW_REASON_CODES.NO_CANDIDATE, REVIEW_REASON_CODES.NO_ACCOUNT_GROUNDING],
      explainability: buildExplainability({
        currentApprovedRowMapping,
        selectedSemanticConceptKey: null,
      }),
      semanticAssessment: explicitAssessment || null,
    }
  }

  return {
    semanticConfidence: topSuggestion.semanticConfidence,
    accountCoverageScore: topSuggestion.accountCoverageScore,
    evidenceScore: topSuggestion.evidenceScore,
    reportReliabilityStatus: topSuggestion.reportReliabilityStatus,
    humanReviewRequired: topSuggestion.humanReviewRequired,
    needsHumanReview: topSuggestion.humanReviewRequired,
    reviewReasons: topSuggestion.reviewReasons,
    explainability: topSuggestion.explainability,
    semanticAssessment: explicitAssessment || null,
    selectedSemanticConceptKey: topSuggestion.semanticConceptKey,
    selectedSemanticConceptId: topSuggestion.semanticConceptId,
  }
}

class MappingReliabilityService {
  static async loadAccountGroundingIndex({ fundId = null, conceptIds = [] }) {
    const normalizedConceptIds = unique(conceptIds)
    if (!fundId || !normalizedConceptIds.length) {
      return new Map(normalizedConceptIds.map((conceptId) => [conceptId, buildEmptyGrounding()]))
    }

    const today = new Date().toISOString().slice(0, 10)
    const rows = await AccountSemanticMapping.findAll({
      where: {
        portfolio_id: fundId,
        semantic_concept_id: { [Op.in]: normalizedConceptIds },
        status: { [Op.in]: ["approved", "suggested"] },
        [Op.and]: [
          {
            [Op.or]: [{ effective_start: null }, { effective_start: { [Op.lte]: today } }],
          },
          {
            [Op.or]: [{ effective_end: null }, { effective_end: { [Op.gte]: today } }],
          },
        ],
      },
      include: [{ model: Account, as: "account" }],
      order: [["status", "ASC"]],
    })

    const index = new Map(normalizedConceptIds.map((conceptId) => [conceptId, buildEmptyGrounding()]))
    rows.forEach((row) => {
      const conceptId = row.semantic_concept_id
      const entry = index.get(conceptId) || buildEmptyGrounding()
      const accountPayload = row.account
        ? {
            id: row.account.id,
            code: row.account.code || null,
            name: row.account.name,
          }
        : null

      if (row.status === "approved") {
        entry.approvedCount += 1
        if (accountPayload) entry.approvedAccounts.push(accountPayload)
      } else {
        entry.suggestedCount += 1
        if (accountPayload) entry.suggestedAccounts.push(accountPayload)
      }

      index.set(conceptId, entry)
    })

    return index
  }

  static enrichSuggestion({
    suggestion,
    grounding = buildEmptyGrounding(),
    currentApprovedRowMapping = null,
    explicitAssessment = null,
  }) {
    const semanticConfidence = roundScore(
      suggestion.semanticConfidence ?? suggestion.mergedScore ?? suggestion.confidenceScore ?? suggestion.llmScore ?? 0,
    )
    const conflictingSignals = Boolean(
      explicitAssessment?.disagreementFlag ||
        explicitAssessment?.conflictingSignals ||
        (currentApprovedRowMapping &&
          currentApprovedRowMapping.semanticConceptId &&
          currentApprovedRowMapping.semanticConceptId !== suggestion.semanticConceptId),
    )
    const fallbackUsed = Boolean(explicitAssessment?.fallbackUsed)
    const weakNumericSupport = Boolean(explicitAssessment?.weakNumericSupport)
    const accountCoverageScore = accountCoverageScoreFromCount(grounding.approvedCount)
    const evidenceScore = evidenceScoreFromCoverage({
      accountCoverageScore,
      approvedCount: grounding.approvedCount,
      semanticConfidence,
      currentApprovedRowMapping,
      conflictingSignals,
      fallbackUsed,
      weakNumericSupport,
    })
    const reportReliabilityStatus = resolveReliabilityStatus({
      semanticConfidence,
      accountCoverageScore,
      evidenceScore,
      conflictingSignals,
      fallbackUsed,
      weakNumericSupport,
    })
    const reviewReasons = deriveReviewReasons({
      semanticConfidence,
      approvedCount: grounding.approvedCount,
      accountCoverageScore,
      evidenceScore,
      conflictingSignals,
      fallbackUsed,
      weakNumericSupport,
    })
    const humanReviewRequired = reportReliabilityStatus !== REPORT_RELIABILITY_STATUSES.GROUNDED
    const explainability = buildExplainability({
      grounding,
      currentApprovedRowMapping,
      conflictingSignals,
      fallbackUsed,
      weakNumericSupport,
      selectedSemanticConceptKey: suggestion.semanticConceptKey,
    })

    return {
      ...suggestion,
      semanticConfidence,
      accountCoverageScore,
      evidenceScore,
      reportReliabilityStatus,
      humanReviewRequired,
      needsHumanReview: humanReviewRequired,
      reviewReasons,
      explainability,
    }
  }

  static async groupTemplateRowSuggestions({
    fundId = null,
    suggestions = [],
    currentApprovedMappingsByRow = new Map(),
  }) {
    const conceptIds = unique(suggestions.map((suggestion) => suggestion.semanticConceptId))
    const resolvedFundIds = unique(
      suggestions
        .map((suggestion) => suggestion.fundId || fundId || null)
        .filter(Boolean),
    )
    const groundingIndexByFund = new Map()
    if (resolvedFundIds.length) {
      await Promise.all(
        resolvedFundIds.map(async (resolvedFundId) => {
          groundingIndexByFund.set(
            resolvedFundId,
            await this.loadAccountGroundingIndex({ fundId: resolvedFundId, conceptIds }),
          )
        }),
      )
    }

    const grouped = new Map()
    suggestions.forEach((suggestion) => {
      const rowId = suggestion.templateRowId
      if (!grouped.has(rowId)) {
        grouped.set(rowId, {
          templateRowId: rowId,
          templateRow: suggestion.templateRow || null,
          suggestions: [],
          explicitAssessment: suggestion.metadata?.rowAssessment || null,
        })
      }
      const group = grouped.get(rowId)
      if (!group.templateRow && suggestion.templateRow) {
        group.templateRow = suggestion.templateRow
      }
      if (!group.explicitAssessment && suggestion.metadata?.rowAssessment) {
        group.explicitAssessment = suggestion.metadata.rowAssessment
      }
      group.suggestions.push(suggestion)
    })

    return Array.from(grouped.values())
      .map((group) => {
        const currentApprovedRowMapping = currentApprovedMappingsByRow.get(group.templateRowId) || null
        const enrichedSuggestions = group.suggestions.map((suggestion) =>
          this.enrichSuggestion({
            suggestion,
            grounding:
              groundingIndexByFund.get(suggestion.fundId || fundId || null)?.get(suggestion.semanticConceptId) ||
              buildEmptyGrounding(),
            currentApprovedRowMapping,
            explicitAssessment: group.explicitAssessment,
          }),
        )

        const sortedSuggestions = enrichedSuggestions.sort((left, right) => {
          if ((left.rank || 0) !== (right.rank || 0)) return (left.rank || 0) - (right.rank || 0)
          return String(left.semanticConceptKey || "").localeCompare(String(right.semanticConceptKey || ""))
        })

        const topSuggestion = sortedSuggestions[0] || null
        return {
          templateRowId: group.templateRowId,
          templateRow: group.templateRow,
          currentApprovedMapping: currentApprovedRowMapping,
          assessment: buildGroupAssessment({
            topSuggestion,
            currentApprovedRowMapping,
            explicitAssessment: group.explicitAssessment,
          }),
          suggestions: sortedSuggestions,
        }
      })
      .sort((left, right) => {
        const leftOrder = Number(left.templateRow?.rowOrder ?? left.templateRow?.row_order ?? 999999)
        const rightOrder = Number(right.templateRow?.rowOrder ?? right.templateRow?.row_order ?? 999999)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return String(left.templateRowId || "").localeCompare(String(right.templateRowId || ""))
      })
  }
}

module.exports = MappingReliabilityService
