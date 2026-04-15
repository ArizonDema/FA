const STOPWORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"])

function normalizePhrase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function singularizeToken(token) {
  if (!token) return ""
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`
  if (/(ches|shes|xes|zes)$/.test(token) && token.length > 4) return token.slice(0, -2)
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1)
  return token
}

function tokenizePhrase(value, { removeStopwords = true } = {}) {
  return normalizePhrase(value)
    .split(" ")
    .map((token) => singularizeToken(token.trim()))
    .filter((token) => token && (!removeStopwords || !STOPWORDS.has(token)))
}

function uniqueValues(values = []) {
  const results = []
  const seen = new Set()

  values.forEach((value) => {
    const normalized = String(value || "").trim()
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    results.push(normalized)
  })

  return results
}

function tokenOverlapScore(leftTokens = [], rightTokens = []) {
  const left = Array.from(new Set(leftTokens))
  const right = Array.from(new Set(rightTokens))
  if (!left.length || !right.length) return 0

  const rightSet = new Set(right)
  const matches = left.filter((token) => rightSet.has(token)).length
  return matches / Math.max(left.length, right.length)
}

function phraseContainmentScore(leftPhrase, rightPhrase) {
  const left = normalizePhrase(leftPhrase)
  const right = normalizePhrase(rightPhrase)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length)
  }
  return 0
}

function buildBigrams(value) {
  const normalized = normalizePhrase(value).replace(/\s+/g, " ")
  if (!normalized) return []
  if (normalized.length === 1) return [normalized]

  const bigrams = []
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2))
  }
  return bigrams
}

function diceCoefficient(leftValue, rightValue) {
  const left = buildBigrams(leftValue)
  const right = buildBigrams(rightValue)
  if (!left.length || !right.length) return 0

  const rightCounts = new Map()
  right.forEach((gram) => rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1))

  let matches = 0
  left.forEach((gram) => {
    const count = rightCounts.get(gram) || 0
    if (count > 0) {
      matches += 1
      rightCounts.set(gram, count - 1)
    }
  })

  return (2 * matches) / (left.length + right.length)
}

function roundScore(value, precision = 4) {
  const numeric = Number(value || 0)
  const factor = 10 ** precision
  return Math.round((numeric + Number.EPSILON) * factor) / factor
}

module.exports = {
  STOPWORDS,
  diceCoefficient,
  normalizePhrase,
  phraseContainmentScore,
  roundScore,
  singularizeToken,
  tokenOverlapScore,
  tokenizePhrase,
  uniqueValues,
}
