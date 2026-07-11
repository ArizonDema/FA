const { formatNumber, matchPointFromSource, parseNumber, point, snippet } = require("./reader.utils")

const READER_KEY = "waterfall_statement"
const READER_VERSION = "waterfall-statement.v1"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"

const WATERFALL_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity"],
    patterns: [/\b(?:fund|fund name|partnership|entity)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "waterfall_period",
    label: "Waterfall Period",
    tableLabels: ["Waterfall Period", "Reporting Period", "Distribution Period", "Period"],
    patterns: [/\b(?:waterfall period|reporting period|distribution period|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i],
    confidence: 0.86,
  },
  {
    key: "distribution_date",
    label: "Distribution Date",
    tableLabels: ["Distribution Date", "Payment Date", "Effective Date", "Date"],
    patterns: [new RegExp(`\\b(?:distribution date|payment date|effective date|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "investment_name",
    label: "Investment / Realization",
    tableLabels: ["Investment", "Investment Name", "Realization", "Asset", "Portfolio Company"],
    patterns: [/\b(?:investment|realization|asset|portfolio company)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.78,
  },
  {
    key: "total_distribution",
    label: "Total Distribution",
    tableLabels: ["Total Distribution", "Total Distributions", "Total Proceeds", "Gross Proceeds", "Amount Distributed"],
    patterns: [new RegExp(`\\b(?:total distributions?|total proceeds|gross proceeds|amount distributed)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
  },
  {
    key: "return_of_capital",
    label: "Return of Capital",
    tableLabels: ["Return of Capital", "Capital Returned", "ROC"],
    patterns: [new RegExp(`\\b(?:return of capital|capital returned|roc)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "preferred_return",
    label: "Preferred Return",
    tableLabels: ["Preferred Return", "Pref", "Hurdle Return"],
    patterns: [new RegExp(`\\b(?:preferred return|pref|hurdle return)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "gp_catch_up",
    label: "GP Catch-up",
    tableLabels: ["GP Catch-up", "Catch-up", "General Partner Catch-up"],
    patterns: [new RegExp(`\\b(?:gp catch-up|catch-up|general partner catch-up)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "carried_interest_distribution",
    label: "Carried Interest Distribution",
    tableLabels: ["Carried Interest", "Carry", "Promote", "GP Promote"],
    patterns: [new RegExp(`\\b(?:carried interest|carry|promote|gp promote)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "carried_interest_rate",
    label: "Carried Interest Rate",
    tableLabels: ["Carried Interest Rate", "Carry Rate", "Promote Rate"],
    patterns: [/\b(?:carried interest rate|carry rate|promote rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i],
    confidence: 0.82,
  },
  {
    key: "lp_distribution",
    label: "LP Distribution",
    tableLabels: ["LP Distribution", "Limited Partner Distribution", "Investor Distribution", "LP Allocation"],
    patterns: [new RegExp(`\\b(?:lp distribution|limited partner distribution|investor distribution|lp allocation)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.92,
  },
  {
    key: "gp_distribution",
    label: "GP Distribution",
    tableLabels: ["GP Distribution", "General Partner Distribution", "GP Allocation"],
    patterns: [new RegExp(`\\b(?:gp distribution|general partner distribution|gp allocation)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.92,
  },
  {
    key: "recallable_amount",
    label: "Recallable Amount",
    tableLabels: ["Recallable Amount", "Recallable Distribution", "Recyclable Amount"],
    patterns: [new RegExp(`\\b(?:recallable amount|recallable distribution|recyclable amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "escrow_reserve",
    label: "Escrow / Reserve",
    tableLabels: ["Escrow", "Reserve", "Holdback", "Escrow Reserve"],
    patterns: [new RegExp(`\\b(?:escrow|reserve|holdback|escrow reserve)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
]

function identityPoint(text) {
  const match = String(text || "").match(/\b(distribution waterfall statement|waterfall statement|carried interest statement|carry allocation statement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Waterfall Statement",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function allocationVariance(values) {
  const totalDistribution = parseNumber(values.total_distribution)
  const lpDistribution = parseNumber(values.lp_distribution)
  const gpDistribution = parseNumber(values.gp_distribution)
  if (totalDistribution === null || lpDistribution === null || gpDistribution === null) return null
  return totalDistribution - lpDistribution - gpDistribution
}

class WaterfallStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = WATERFALL_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(text)
    if (identity) keyPoints.unshift(identity)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const reconciliationVariance = allocationVariance(values)
    if (reconciliationVariance !== null) {
      keyPoints.push(point({
        key: "allocation_reconciliation",
        label: "LP/GP Allocation Reconciliation",
        value: Math.abs(reconciliationVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(reconciliationVariance, 2)}`,
        confidence: 0.94,
      }))
      foundKeys.add("allocation_reconciliation")
    }

    const missingCore = ["total_distribution"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missingCore.length) {
      issues.push({
        code: "waterfall_statement_fields_not_detected",
        message: `Review missing waterfall fields: ${missingCore.join(", ")}.`,
      })
    }
    if (reconciliationVariance !== null && Math.abs(reconciliationVariance) > 0.01) {
      issues.push({
        code: "waterfall_allocation_reconciliation_mismatch",
        message: `LP plus GP allocations do not agree to total distribution by ${formatNumber(reconciliationVariance, 2)}.`,
      })
    }
    if (!foundKeys.has("lp_distribution") && !foundKeys.has("gp_distribution") && !foundKeys.has("carried_interest_distribution")) {
      issues.push({
        code: "waterfall_allocation_fields_not_detected",
        message: "Review missing LP, GP, or carried-interest allocation fields.",
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} waterfall allocation fact(s) for review.`
        : "No standard waterfall allocation facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.7 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missingCore,
        allocation_reconciliation_variance: reconciliationVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = WaterfallStatementReader
