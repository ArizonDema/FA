const TEMPLATE_KINDS = Object.freeze({
  CASH_FLOW: "cash_flow",
  CAPITAL_ACCOUNT_STATEMENT: "capital_account_statement",
})

const TEMPLATE_KIND_VALUES = Object.freeze(Object.values(TEMPLATE_KINDS))

function normalizeTemplateKind(value, fallback = TEMPLATE_KINDS.CASH_FLOW) {
  const normalized = String(value || fallback).trim().toLowerCase()
  if (!TEMPLATE_KIND_VALUES.includes(normalized)) {
    throw new Error(`Unsupported template kind: ${normalized || "empty"}`)
  }
  return normalized
}

module.exports = {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_VALUES,
  normalizeTemplateKind,
}
