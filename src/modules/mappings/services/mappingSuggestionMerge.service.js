const { roundScore } = require("../utils/mappingText.util")

function buildSignalBreakdown({
  deterministicScore,
  llmScore,
  agreementBonus,
  llmOnlyCap,
  deterministicWeight,
  llmWeight,
}) {
  return {
    deterministicScore: roundScore(deterministicScore),
    llmScore: roundScore(llmScore),
    deterministicWeight: roundScore(deterministicWeight),
    llmWeight: roundScore(llmWeight),
    agreementBonus: roundScore(agreementBonus),
    llmOnlyCap: roundScore(llmOnlyCap),
  }
}

class MappingSuggestionMergeService {
  static merge({
    row,
    deterministicSuggestions = [],
    llmResult = null,
    conceptLookup = new Map(),
  }) {
    const deterministicTopKey = deterministicSuggestions[0]?.semanticConceptKey || null
    const llmTopKey = llmResult?.recommendedCandidates?.[0]?.semanticConceptKey || null
    const strongDisagreement = Boolean(
      deterministicTopKey &&
        llmTopKey &&
        deterministicTopKey !== llmTopKey &&
        Number(deterministicSuggestions[0]?.confidenceScore || 0) >= 0.55 &&
        Number(llmResult?.recommendedCandidates?.[0]?.llmScore || 0) >= 0.75,
    )

    const combinedKeys = Array.from(
      new Set([
        ...deterministicSuggestions.map((item) => item.semanticConceptKey),
        ...(llmResult?.recommendedCandidates || []).map((item) => item.semanticConceptKey),
      ]),
    )

    const mergedSuggestions = combinedKeys
      .map((semanticConceptKey) => {
        const deterministic = deterministicSuggestions.find((item) => item.semanticConceptKey === semanticConceptKey) || null
        const llm = llmResult?.recommendedCandidates?.find((item) => item.semanticConceptKey === semanticConceptKey) || null
        const concept = conceptLookup.get(semanticConceptKey)
        if (!concept) return null

        const deterministicScore = Number(deterministic?.confidenceScore || 0)
        const llmScore = Number(llm?.llmScore || 0)
        const agreementBonus =
          deterministicTopKey && llmTopKey && deterministicTopKey === llmTopKey && semanticConceptKey === deterministicTopKey
            ? 0.07
            : 0
        const deterministicWeight = deterministic ? 0.72 : 0
        const llmWeight = llm ? 0.28 : 0
        const llmOnlyCap = deterministic ? 1 : 0.45

        let mergedScore = deterministic ? deterministicScore : 0
        if (deterministic && llm) {
          mergedScore = deterministicScore * deterministicWeight + llmScore * llmWeight + agreementBonus
        } else if (!deterministic && llm) {
          mergedScore = Math.min(llmOnlyCap, 0.14 + llmScore * 0.31)
        }

        if (strongDisagreement && !deterministic && semanticConceptKey === llmTopKey) {
          mergedScore = Math.min(mergedScore, 0.4)
        }

        mergedScore = Math.max(0, Math.min(0.9999, roundScore(mergedScore)))

        return {
          semanticConceptId: concept.id,
          semanticConceptKey,
          semanticConceptLabel: concept.label,
          rankHint: Math.min(deterministic?.rank || 99, llm?.rank || 99),
          confidenceScore: mergedScore,
          mergedScore,
          llmScore: llm ? roundScore(llmScore) : null,
          rationale: llm?.reasoning || deterministic?.rationale || null,
          signalBreakdown: buildSignalBreakdown({
            deterministicScore,
            llmScore,
            agreementBonus,
            llmOnlyCap,
            deterministicWeight,
            llmWeight,
          }),
          llmEvidence: llm?.evidence || [],
          llmRank: llm?.rank || null,
          deterministicRank: deterministic?.rank || null,
        }
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.confidenceScore !== left.confidenceScore) return right.confidenceScore - left.confidenceScore
        return String(left.semanticConceptKey).localeCompare(String(right.semanticConceptKey))
      })
      .slice(0, 5)
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }))

    const topSuggestion = mergedSuggestions[0] || null
    const needsHumanReview = Boolean(
      llmResult?.needsHumanReview ||
        strongDisagreement ||
        (llmResult?.ambiguities || []).length ||
        Number(topSuggestion?.confidenceScore || 0) < 0.4,
    )

    return {
      row,
      mergedSuggestions: mergedSuggestions.map((candidate) => ({
        ...candidate,
        needsHumanReview,
      })),
      assessment: {
        needsHumanReview,
        disagreementFlag: strongDisagreement,
        ambiguities: llmResult?.ambiguities || [],
        deterministicTopKey,
        llmTopKey,
      },
    }
  }
}

module.exports = MappingSuggestionMergeService
