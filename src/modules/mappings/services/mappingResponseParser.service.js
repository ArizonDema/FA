class MappingResponseValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = "MappingResponseValidationError"
    this.details = details
  }
}

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(1, numeric))
}

function normalizeTextArray(values = [], maxLength = 5) {
  if (!Array.isArray(values)) return []
  const normalized = []
  const seen = new Set()

  values.forEach((value) => {
    const item = String(value || "").trim()
    if (!item) return
    const key = item.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(item)
  })

  return normalized.slice(0, maxLength)
}

class MappingResponseParserService {
  static parse({ responseObject, rowId, allowedConceptKeys = [] }) {
    if (!responseObject || typeof responseObject !== "object" || Array.isArray(responseObject)) {
      throw new MappingResponseValidationError("LLM response must be a JSON object")
    }

    if (String(responseObject.rowId || "").trim() !== String(rowId)) {
      throw new MappingResponseValidationError("LLM response rowId does not match the requested row")
    }

    const allowedKeys = new Set((allowedConceptKeys || []).map((item) => String(item || "").trim()).filter(Boolean))
    const recommendedCandidates = Array.isArray(responseObject.recommendedCandidates)
      ? responseObject.recommendedCandidates
      : []

    const parsedCandidates = []
    const seenKeys = new Set()

    recommendedCandidates.forEach((candidate, index) => {
      const semanticConceptKey = String(candidate?.semanticConceptKey || "").trim()
      const llmScore = clampScore(candidate?.llmScore)
      if (!semanticConceptKey || !allowedKeys.has(semanticConceptKey) || seenKeys.has(semanticConceptKey)) {
        return
      }
      if (llmScore === null) {
        return
      }

      seenKeys.add(semanticConceptKey)
      parsedCandidates.push({
        semanticConceptKey,
        rank: Number.isInteger(candidate?.rank) && candidate.rank > 0 ? candidate.rank : index + 1,
        llmScore,
        reasoning: String(candidate?.reasoning || "").trim() || null,
        evidence: normalizeTextArray(candidate?.evidence, 5),
      })
    })

    if (!parsedCandidates.length) {
      throw new MappingResponseValidationError("LLM response did not contain any valid candidate recommendations")
    }

    parsedCandidates.sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      return right.llmScore - left.llmScore
    })

    return {
      rowId: String(responseObject.rowId),
      recommendedCandidates: parsedCandidates.map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      })),
      ambiguities: normalizeTextArray(responseObject.ambiguities, 6),
      needsHumanReview: Boolean(responseObject.needsHumanReview),
    }
  }
}

MappingResponseParserService.ValidationError = MappingResponseValidationError

module.exports = MappingResponseParserService
