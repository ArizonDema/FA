function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .trim()
}

function singleLine(value) {
  return normalizeText(value).replace(/\s+/g, " ")
}

function snippet(value, maxLength = 220) {
  const normalized = singleLine(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

function point({ key, label, value, valueJson = null, sourceReference = null, confidence = 0.8 }) {
  if (value === null || value === undefined || String(value).trim() === "") return null
  return {
    point_key: key,
    label,
    value_text: String(value).trim(),
    value_json: valueJson,
    source_reference: sourceReference ? snippet(sourceReference) : null,
    confidence,
  }
}

function matchPoint(text, definition) {
  for (const pattern of definition.patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return point({
        key: definition.key,
        label: definition.label,
        value: singleLine(match[1]),
        sourceReference: match[0],
        confidence: definition.confidence || 0.8,
      })
    }
  }
  return null
}

function normalizeLookupLabel(value) {
  return singleLine(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function definitionAliases(definition) {
  return [definition.label, String(definition.key || "").replace(/_/g, " "), ...(definition.tableLabels || [])]
    .map(normalizeLookupLabel)
    .filter(Boolean)
}

function nextTableValue(row, startIndex) {
  for (let index = startIndex; index < row.length; index += 1) {
    const value = singleLine(row[index])
    if (!value) continue
    if (/^(?:value|amount|date|description|notes?|details?)$/i.test(value)) continue
    return value
  }
  return null
}

function matchTablePoint(source, definition) {
  const aliases = definitionAliases(definition)
  if (!aliases.length) return null
  for (const table of source?.tables || []) {
    for (const row of table.rows || []) {
      for (let index = 0; index < row.length - 1; index += 1) {
        const label = normalizeLookupLabel(row[index])
        if (!label || !aliases.includes(label)) continue
        const value = nextTableValue(row, index + 1)
        if (!value) continue
        return point({
          key: definition.key,
          label: definition.label,
          value,
          sourceReference: `${table.name || "Table"}: ${singleLine(row[index])}: ${value}`,
          confidence: definition.tableConfidence || Math.max(0.78, (definition.confidence || 0.8) - 0.03),
        })
      }
    }
  }
  return null
}

function matchPointFromSource(source, definition) {
  return matchPoint(source?.text || "", definition) || matchTablePoint(source, definition)
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const normalized = String(value || "")
    .replace(/\b(?:USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/gi, "")
    .replace(/US\$/gi, "")
    .replace(/[,$%()]/g, "")
    .replace(/\s+/g, "")
    .trim()
  if (!normalized) return null
  const number = Number(normalized)
  if (!Number.isFinite(number)) return null
  return String(value).includes("(") ? -number : number
}

function formatNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) return null
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function redactWireInstructions(text) {
  return String(text || "")
    .replace(
      /\b((?:routing number|routing no\.?|aba|iban|swift|bic|account number|account no\.?|beneficiary account|beneficiary acct\.?)\s*(?:is|:|#)?\s*)([A-Z0-9 -]{4,34})/gi,
      "$1[redacted]",
    )
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[redacted iban]")
}

function redactSensitiveIdentifiers(text) {
  return redactWireInstructions(text)
    .replace(
      /\b((?:tax identification number|taxpayer identification number|tax id|tin|ein|ssn|social security number)\s*(?:is|:|#|\|)?\s*)([A-Z0-9-]{4,})/gi,
      "$1[redacted]",
    )
    .replace(/\b\d{2}-\d{7}\b/g, "[redacted tax id]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted tax id]")
}

module.exports = {
  formatNumber,
  matchPoint,
  matchPointFromSource,
  matchTablePoint,
  normalizeText,
  parseNumber,
  point,
  redactSensitiveIdentifiers,
  redactWireInstructions,
  singleLine,
  snippet,
}
