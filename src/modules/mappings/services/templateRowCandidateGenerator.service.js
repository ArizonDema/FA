const {
  normalizePhrase,
  phraseContainmentScore,
  tokenOverlapScore,
  tokenizePhrase,
} = require("../utils/mappingText.util")

function normalizeRow(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  const rowLabel = normalizePhrase(payload.label || payload.rowLabel || "")
  const sectionName = normalizePhrase(payload.section_name || payload.sectionName || "")
  const parentSection = normalizePhrase(payload.parent_section_name || payload.parentSection || "")
  const combinedContext = normalizePhrase([rowLabel, sectionName, parentSection].filter(Boolean).join(" "))
  const rowType = String(payload.row_type || payload.rowType || "data_row").trim().toLowerCase()

  return {
    id: payload.id,
    templateVersionId: payload.template_version_id || payload.templateVersionId || null,
    portfolioId: payload.portfolio_id || payload.portfolioId || null,
    label: payload.label || payload.rowLabel || null,
    normalizedLabel: rowLabel,
    labelTokens: tokenizePhrase(rowLabel),
    sectionName: payload.section_name || payload.sectionName || null,
    normalizedSectionName: sectionName,
    sectionTokens: tokenizePhrase(sectionName),
    parentSection: payload.parent_section_name || payload.parentSection || null,
    normalizedParentSection: parentSection,
    parentSectionTokens: tokenizePhrase(parentSection),
    combinedContext,
    combinedTokens: tokenizePhrase(combinedContext),
    rowType,
    isFormula: Boolean(payload.is_formula || payload.isFormula),
    formulaText: payload.formula_text || payload.formulaText || null,
    metadata: payload.metadata_json || payload.metadata || null,
    raw: payload,
  }
}

function inferHints(target) {
  const text = [target.normalizedLabel, target.normalizedSectionName, target.normalizedParentSection]
    .filter(Boolean)
    .join(" ")

  const preferredCategories = new Set()
  const preferredKeys = new Set()
  const preferredStatementTypes = new Set()

  if (/\bopening cash\b|\bbeginning cash\b|\bcash at beginning\b|\bcash at start\b/.test(text)) {
    preferredKeys.add("opening_cash")
    preferredCategories.add("cash_position")
  }

  if (/\bclosing cash\b|\bending cash\b|\bcash at end\b/.test(text)) {
    preferredKeys.add("closing_cash")
    preferredCategories.add("cash_position")
  }

  if (/\bnet change in cash\b|\bchange in cash\b|\bnet increase in cash\b|\bnet decrease in cash\b/.test(text)) {
    preferredKeys.add("net_change_in_cash")
    preferredCategories.add("cash_position")
  }

  if (/\boperating\b/.test(text)) {
    preferredCategories.add("operating")
    preferredStatementTypes.add("cash_flow")
    preferredKeys.add("operating_cash_flow")
  }

  if (/\binvesting\b/.test(text)) {
    preferredCategories.add("investing")
    preferredStatementTypes.add("cash_flow")
    preferredKeys.add("investing_cash_flow")
  }

  if (/\bfinancing\b/.test(text)) {
    preferredCategories.add("financing")
    preferredCategories.add("capital_activity")
    preferredCategories.add("equity")
    preferredStatementTypes.add("cash_flow")
    preferredStatementTypes.add("capital_activity")
    preferredKeys.add("financing_cash_flow")
  }

  if (/\bsubscription\b|\bcontribution\b|\bcapital call\b|\bdrawdown\b/.test(text)) {
    preferredCategories.add("capital_activity")
    preferredStatementTypes.add("capital_activity")
  }

  if (/\bredemption\b|\bdistribution\b|\bwithdrawal\b/.test(text)) {
    preferredCategories.add("capital_activity")
    preferredStatementTypes.add("capital_activity")
  }

  if (/\bmanagement\b|\bperformance\b|\bcustody\b|\badministration\b|\baudit\b|\blegal\b|\btax\b|\bfee\b|\bexpense\b/.test(text)) {
    preferredCategories.add("expense")
    preferredCategories.add("payable_receivable")
    preferredStatementTypes.add("pnl")
    preferredStatementTypes.add("balance_sheet")
  }

  if (/\brealized\b|\bunrealized\b|\bfx\b|\bforeign exchange\b|\bgain\b|\bloss\b/.test(text)) {
    preferredCategories.add("gains_losses")
    preferredStatementTypes.add("pnl")
  }

  if (/\binterest\b|\bdividend\b|\bincome\b/.test(text)) {
    preferredCategories.add("income")
    preferredStatementTypes.add("pnl")
  }

  if (/\bpayable\b|\breceivable\b|\baccrued\b/.test(text)) {
    preferredCategories.add("payable_receivable")
    preferredStatementTypes.add("balance_sheet")
  }

  if (/\bcash\b/.test(text)) {
    preferredCategories.add("cash_position")
    preferredStatementTypes.add("cash_flow")
  }

  return {
    preferredCategories,
    preferredKeys,
    preferredStatementTypes,
  }
}

class TemplateRowCandidateGenerator {
  static normalizeRow(record) {
    return normalizeRow(record)
  }

  static shouldSkip(target) {
    if (!target) return true
    if (["blank", "note"].includes(target.rowType)) return true
    if (!target.normalizedLabel && !target.normalizedSectionName && !target.normalizedParentSection) return true
    return false
  }

  static buildCandidatePool({ row, concepts }) {
    const target = normalizeRow(row)
    const hints = inferHints(target)

    if (this.shouldSkip(target)) {
      return {
        target,
        hints,
        candidates: [],
        skipped: true,
        skipReason: `row_type_${target.rowType || "unknown"}`,
      }
    }

    const candidates = (concepts || []).filter((concept) => {
      if (hints.preferredKeys.has(concept.stableKey)) return true
      if (hints.preferredCategories.has(concept.category)) return true
      if (hints.preferredStatementTypes.has(concept.statementType)) return true

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
      hints,
      candidates: candidates.length ? candidates : concepts || [],
      skipped: false,
      skipReason: null,
    }
  }
}

module.exports = TemplateRowCandidateGenerator
