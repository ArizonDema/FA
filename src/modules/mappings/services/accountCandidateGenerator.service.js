const {
  normalizePhrase,
  phraseContainmentScore,
  tokenOverlapScore,
  tokenizePhrase,
} = require("../utils/mappingText.util")

function normalizeAccount(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  const label = normalizePhrase(payload.name || payload.label || "")
  const code = normalizePhrase(payload.code || "")
  const combinedContext = normalizePhrase([label, code].filter(Boolean).join(" "))

  return {
    id: payload.id,
    portfolioId: payload.portfolio_id || payload.portfolioId || null,
    name: payload.name || payload.label || null,
    normalizedLabel: label,
    labelTokens: tokenizePhrase(label),
    code: payload.code || null,
    normalizedCode: code,
    combinedContext,
    combinedTokens: tokenizePhrase(combinedContext),
    raw: payload,
  }
}

class AccountCandidateGenerator {
  static normalizeAccount(record) {
    return normalizeAccount(record)
  }

  static shouldSkip(target) {
    return !target || !target.normalizedLabel
  }

  static buildCandidatePool({ account, concepts }) {
    const target = normalizeAccount(account)

    if (this.shouldSkip(target)) {
      return {
        target,
        candidates: [],
        skipped: true,
        skipReason: "missing_account_name",
      }
    }

    const candidates = (concepts || []).filter((concept) => {
      const overlap = Math.max(
        tokenOverlapScore(target.labelTokens, concept.searchableTokens),
        tokenOverlapScore(target.combinedTokens, concept.searchableTokens),
      )
      if (overlap >= 0.2) return true

      const containment = Math.max(
        ...concept.searchablePhrases.map((phrase) => phraseContainmentScore(target.normalizedLabel, phrase)),
        0,
      )
      return containment >= 0.45
    })

    return {
      target,
      candidates: candidates.length ? candidates : concepts || [],
      skipped: false,
      skipReason: null,
    }
  }
}

module.exports = AccountCandidateGenerator
