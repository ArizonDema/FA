const {
  diceCoefficient,
  phraseContainmentScore,
  roundScore,
  tokenOverlapScore,
  tokenizePhrase,
} = require("../utils/mappingText.util")

const SCORE_WEIGHTS = {
  exactMatch: 0.28,
  synonymMatch: 0.14,
  exampleMatch: 0.06,
  phraseContainment: 0.1,
  tokenOverlap: 0.14,
  labelSimilarity: 0.1,
  sectionContext: 0.06,
  categoryHint: 0.05,
  rowTypeCompatibility: 0.05,
  formulaAdjustment: 0.02,
}

function maxScore(values = []) {
  return values.reduce((highest, value) => (value > highest ? value : highest), 0)
}

function tokenCoverageScore(targetTokens = [], conceptPhrases = []) {
  const targetSet = new Set(targetTokens)
  if (!targetSet.size || !Array.isArray(conceptPhrases) || !conceptPhrases.length) return 0

  return maxScore(
    conceptPhrases.map((phrase) => {
      const phraseTokens = tokenizePhrase(phrase)
      if (!phraseTokens.length) return 0
      const matches = phraseTokens.filter((token) => targetSet.has(token)).length
      return matches / phraseTokens.length
    }),
  )
}

function buildRowTypeCompatibility({ target, concept, hints }) {
  if (!target || !concept) return 0

  const isSummaryConcept =
    concept.subcategory === "cash_flow_summary" ||
    ["opening_balance", "closing_balance", "derived"].includes(concept.aggregationBehavior) ||
    hints?.preferredKeys?.has(concept.stableKey)

  switch (target.rowType) {
    case "section_header":
      return isSummaryConcept ? 1 : 0.2
    case "subtotal":
    case "total":
      return isSummaryConcept ? 1 : 0.35
    case "formula_row":
      return isSummaryConcept ? 0.9 : 0.45
    case "data_row":
    default:
      return isSummaryConcept ? 0.25 : 0.9
  }
}

function buildFormulaAdjustment({ target, concept }) {
  if (!target?.isFormula) return 0

  if (["derived", "opening_balance", "closing_balance"].includes(concept.aggregationBehavior)) {
    return 1
  }

  if (target.rowType === "formula_row" && concept.subcategory === "cash_flow_summary") {
    return 0.8
  }

  return -0.5
}

function buildCategoryHint({ concept, hints }) {
  if (!concept || !hints) return 0
  if (hints.preferredKeys?.has(concept.stableKey)) return 1
  if (hints.preferredCategories?.has(concept.category)) return 0.85
  if (hints.preferredStatementTypes?.has(concept.statementType)) return 0.55
  return 0
}

function buildSectionContext({ target, concept }) {
  if (!target || !concept) return 0

  const sectionText = [target.normalizedSectionName, target.normalizedParentSection].filter(Boolean).join(" ")
  if (!sectionText) return 0

  return maxScore([
    diceCoefficient(sectionText, concept.labelPhrase),
    diceCoefficient(sectionText, concept.keyPhrase),
    ...concept.synonymPhrases.map((phrase) => diceCoefficient(sectionText, phrase)),
    ...concept.auxiliaryPhrases.map((phrase) => phraseContainmentScore(sectionText, phrase)),
  ])
}

function buildRationale(signalBreakdown) {
  const reasons = []
  if (signalBreakdown.exactMatch > 0) reasons.push("exact label or key match")
  if (signalBreakdown.synonymMatch >= 0.8) reasons.push("synonym match")
  if (signalBreakdown.exampleMatch >= 0.7) reasons.push("example phrase match")
  if (signalBreakdown.tokenOverlap >= 0.5) reasons.push("strong token overlap")
  if (signalBreakdown.sectionContext >= 0.5) reasons.push("section context alignment")
  if (signalBreakdown.categoryHint >= 0.7) reasons.push("category hint alignment")
  if (signalBreakdown.rowTypeCompatibility >= 0.8) reasons.push("row type compatibility")
  if (signalBreakdown.formulaAdjustment > 0) reasons.push("formula-aware adjustment")

  if (!reasons.length) {
    reasons.push("deterministic lexical similarity")
  }

  return reasons.slice(0, 3).join("; ")
}

function scoreTemplateRowCandidate({ target, concept, hints }) {
  const exactMatch = maxScore([
    target.normalizedLabel === concept.keyPhrase ? 1 : 0,
    target.normalizedLabel === concept.labelPhrase ? 1 : 0,
  ])
  const synonymMatch = maxScore(concept.synonymPhrases.map((phrase) => (target.normalizedLabel === phrase ? 1 : 0)))
  const exampleMatch = maxScore(concept.examplePhrases.map((phrase) => phraseContainmentScore(target.normalizedLabel, phrase)))
  const phraseContainment = maxScore(
    concept.searchablePhrases.map((phrase) => phraseContainmentScore(target.normalizedLabel, phrase)),
  )
  const tokenOverlap = maxScore([
    tokenOverlapScore(target.labelTokens, concept.searchableTokens),
    tokenOverlapScore(target.combinedTokens, concept.searchableTokens),
    tokenCoverageScore(target.labelTokens, concept.searchablePhrases),
    tokenCoverageScore(target.combinedTokens, concept.searchablePhrases),
  ])
  const labelSimilarity = maxScore(
    concept.searchablePhrases.map((phrase) => diceCoefficient(target.normalizedLabel, phrase)),
  )
  const sectionContext = buildSectionContext({ target, concept })
  const categoryHint = buildCategoryHint({ concept, hints })
  const rowTypeCompatibility = buildRowTypeCompatibility({ target, concept, hints })
  const formulaAdjustment = buildFormulaAdjustment({ target, concept })

  const weightedScore =
    exactMatch * SCORE_WEIGHTS.exactMatch +
    synonymMatch * SCORE_WEIGHTS.synonymMatch +
    exampleMatch * SCORE_WEIGHTS.exampleMatch +
    phraseContainment * SCORE_WEIGHTS.phraseContainment +
    tokenOverlap * SCORE_WEIGHTS.tokenOverlap +
    labelSimilarity * SCORE_WEIGHTS.labelSimilarity +
    sectionContext * SCORE_WEIGHTS.sectionContext +
    categoryHint * SCORE_WEIGHTS.categoryHint +
    rowTypeCompatibility * SCORE_WEIGHTS.rowTypeCompatibility +
    formulaAdjustment * SCORE_WEIGHTS.formulaAdjustment

  const confidenceScore = Math.max(0, Math.min(0.9999, roundScore(weightedScore)))
  const signalBreakdown = {
    exactMatch: roundScore(exactMatch),
    synonymMatch: roundScore(synonymMatch),
    exampleMatch: roundScore(exampleMatch),
    phraseContainment: roundScore(phraseContainment),
    tokenOverlap: roundScore(tokenOverlap),
    labelSimilarity: roundScore(labelSimilarity),
    sectionContext: roundScore(sectionContext),
    categoryHint: roundScore(categoryHint),
    rowTypeCompatibility: roundScore(rowTypeCompatibility),
    formulaAdjustment: roundScore(formulaAdjustment),
  }

  return {
    semanticConceptId: concept.id,
    semanticConceptKey: concept.stableKey,
    semanticConceptLabel: concept.label,
    confidenceScore,
    rationale: buildRationale(signalBreakdown),
    signalBreakdown,
  }
}

function scoreAccountCandidate({ target, concept }) {
  const exactMatch = maxScore([
    target.normalizedLabel === concept.keyPhrase ? 1 : 0,
    target.normalizedLabel === concept.labelPhrase ? 1 : 0,
  ])
  const synonymMatch = maxScore(concept.synonymPhrases.map((phrase) => (target.normalizedLabel === phrase ? 1 : 0)))
  const exampleMatch = maxScore(concept.examplePhrases.map((phrase) => phraseContainmentScore(target.normalizedLabel, phrase)))
  const phraseContainment = maxScore(
    concept.searchablePhrases.map((phrase) => phraseContainmentScore(target.normalizedLabel, phrase)),
  )
  const tokenOverlap = maxScore([
    tokenOverlapScore(target.labelTokens, concept.searchableTokens),
    tokenOverlapScore(target.combinedTokens, concept.searchableTokens),
    tokenCoverageScore(target.labelTokens, concept.searchablePhrases),
    tokenCoverageScore(target.combinedTokens, concept.searchablePhrases),
  ])
  const labelSimilarity = maxScore(
    concept.searchablePhrases.map((phrase) => diceCoefficient(target.normalizedLabel, phrase)),
  )

  const weightedScore =
    exactMatch * 0.32 +
    synonymMatch * 0.16 +
    exampleMatch * 0.06 +
    phraseContainment * 0.12 +
    tokenOverlap * 0.18 +
    labelSimilarity * 0.16

  const confidenceScore = Math.max(0, Math.min(0.9999, roundScore(weightedScore)))
  const signalBreakdown = {
    exactMatch: roundScore(exactMatch),
    synonymMatch: roundScore(synonymMatch),
    exampleMatch: roundScore(exampleMatch),
    phraseContainment: roundScore(phraseContainment),
    tokenOverlap: roundScore(tokenOverlap),
    labelSimilarity: roundScore(labelSimilarity),
  }

  return {
    semanticConceptId: concept.id,
    semanticConceptKey: concept.stableKey,
    semanticConceptLabel: concept.label,
    confidenceScore,
    rationale: buildRationale({
      ...signalBreakdown,
      sectionContext: 0,
      categoryHint: 0,
      rowTypeCompatibility: 0.8,
      formulaAdjustment: 0,
    }),
    signalBreakdown,
  }
}

class MappingScoringService {
  static scoreTemplateRowCandidate(input) {
    return scoreTemplateRowCandidate(input)
  }

  static scoreAccountCandidate(input) {
    return scoreAccountCandidate(input)
  }

  static rankTemplateRowCandidates({ target, hints, concepts, limit = 5, minConfidence = 0.18 }) {
    return (concepts || [])
      .map((concept) => scoreTemplateRowCandidate({ target, concept, hints }))
      .filter((candidate) => candidate.confidenceScore >= minConfidence)
      .sort((left, right) => {
        if (right.confidenceScore !== left.confidenceScore) {
          return right.confidenceScore - left.confidenceScore
        }
        return String(left.semanticConceptKey).localeCompare(String(right.semanticConceptKey))
      })
      .slice(0, limit)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }))
  }

  static rankAccountCandidates({ target, concepts, limit = 5, minConfidence = 0.18 }) {
    return (concepts || [])
      .map((concept) => scoreAccountCandidate({ target, concept }))
      .filter((candidate) => candidate.confidenceScore >= minConfidence)
      .sort((left, right) => {
        if (right.confidenceScore !== left.confidenceScore) {
          return right.confidenceScore - left.confidenceScore
        }
        return String(left.semanticConceptKey).localeCompare(String(right.semanticConceptKey))
      })
      .slice(0, limit)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }))
  }
}

MappingScoringService.SCORE_WEIGHTS = SCORE_WEIGHTS

module.exports = MappingScoringService
