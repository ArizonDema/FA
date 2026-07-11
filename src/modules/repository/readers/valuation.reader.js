const { formatNumber, matchPointFromSource, parseNumber, point, snippet } = require("./reader.utils")

const READER_KEY = "valuation"
const READER_VERSION = "valuation.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const VALUATION_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Partnership"],
    patterns: [
      /\b(?:fund name|entity|partnership)\s*(?:is|:|\|)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "valuation_period",
    label: "Valuation Period",
    tableLabels: ["Valuation Period", "Reporting Period", "Period"],
    patterns: [
      /\b(?:valuation period|reporting period|period)\s*(?:is|:|\|)?\s*([A-Za-z0-9, /-]{4,100})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "valuation_date",
    label: "Valuation Date",
    tableLabels: ["Valuation Date", "As Of Date", "NAV Date", "Date"],
    patterns: [
      new RegExp(`\\b(?:valuation date|as of date|valuation as of|nav date|as of)\\s*(?:is|:|\\|)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "prepared_by",
    label: "Prepared By",
    tableLabels: ["Prepared By", "Administrator", "Valuation Agent", "Pricing Agent"],
    patterns: [
      /\b(?:prepared by|administrator|valuation agent|pricing agent)\s*(?:is|:|\|)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "reporting_currency",
    label: "Valuation Currency",
    tableLabels: ["Valuation Currency", "Reporting Currency", "Currency", "Base Currency"],
    patterns: [
      /\b(?:valuation currency|reporting currency|currency)\s*(?:is|:|\|)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i,
    ],
  },
  {
    key: "net_asset_value",
    label: "Net Asset Value",
    tableLabels: ["Net Asset Value", "Net Asset Value (NAV)", "NAV", "Ending NAV"],
    patterns: [
      new RegExp(`\\b(?:net asset value|nav|ending nav)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "gross_asset_value",
    label: "Gross Asset Value",
    tableLabels: ["Gross Asset Value", "GAV", "Total Assets"],
    patterns: [
      new RegExp(`\\b(?:gross asset value|gav|total assets)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "total_liabilities",
    label: "Total Liabilities",
    tableLabels: ["Total Liabilities", "Liabilities"],
    patterns: [
      new RegExp(`\\b(?:total liabilities|liabilities)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "cash_balance",
    label: "Cash Balance",
    tableLabels: ["Cash Balance", "Cash", "Cash and Cash Equivalents"],
    patterns: [
      new RegExp(`\\b(?:cash balance|cash and cash equivalents|cash)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "investments_at_fair_value",
    label: "Investments at Fair Value",
    tableLabels: ["Investments at Fair Value", "Investment Fair Value", "Portfolio Fair Value", "Fair Value"],
    patterns: [
      new RegExp(`\\b(?:investments? at fair value|investment fair value|portfolio fair value|fair value)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "cost_basis",
    label: "Cost Basis",
    tableLabels: ["Cost Basis", "Investment Cost", "Cost", "Amortized Cost"],
    patterns: [
      new RegExp(`\\b(?:cost basis|investment cost|amortized cost|cost)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "unrealized_gain_loss",
    label: "Unrealized Gain / Loss",
    tableLabels: ["Unrealized Gain/Loss", "Unrealized Gain (Loss)", "Unrealized Gain", "Unrealized Loss"],
    patterns: [
      new RegExp(`\\b(?:unrealized gain/loss|unrealized gain\\s*\\(?loss\\)?|unrealized gain|unrealized loss)\\s*(?:is|:|\\|)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "units_outstanding",
    label: "Units / Shares Outstanding",
    tableLabels: ["Units Outstanding", "Shares Outstanding", "Interests Outstanding", "Ending Units", "Ending Shares"],
    patterns: [
      new RegExp(`\\b(?:units outstanding|shares outstanding|interests outstanding|ending units|ending shares)\\s*(?:is|:|\\|)?\\s*${NUMBER_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "unit_price",
    label: "NAV Per Unit / Share",
    tableLabels: ["NAV Per Unit", "NAV Per Share", "Unit Price", "Share Price"],
    patterns: [
      /\b(?:nav per (?:unit|share)|unit price|share price)\s*(?:is|:|\|)?\s*((?:US\$|USD|EUR|GBP|\$)?\s*[0-9][0-9,]*(?:\.[0-9]{2,6})?)/i,
    ],
    confidence: 0.9,
  },
  {
    key: "valuation_basis",
    label: "Valuation Basis",
    patterns: [
      /\b(?:valuation basis|valuation methodology|basis of valuation)\s*(?:is|:)?\s*([^.\n;]{4,140})/i,
    ],
  },
  {
    key: "valuation_methodology",
    label: "Valuation Methodology",
    tableLabels: ["Valuation Methodology", "Methodology", "Valuation Method"],
    patterns: [
      /\b(?:valuation methodology|methodology|valuation method)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "pricing_source",
    label: "Pricing Source",
    tableLabels: ["Pricing Source", "Price Source", "Valuation Source", "Source"],
    patterns: [
      /\b(?:pricing source|price source|valuation source)\s*(?:is|:)?\s*([^.\n;]{3,140})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "valuation_level",
    label: "Fair Value Level",
    tableLabels: ["Fair Value Level", "ASC 820 Level", "Valuation Level"],
    patterns: [
      /\b(?:fair value level|asc 820 level|valuation level)\s*(?:is|:)?\s*(level\s*[123]|[123])\b/i,
    ],
    confidence: 0.76,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Valuation Approval", "Approved"],
    patterns: [
      /\b(?:approval status|valuation approval|approved)\s*(?:is|:)?\s*(approved|pending|rejected|reviewed)\b/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approved_by",
    label: "Approved By",
    tableLabels: ["Approved By", "Approver", "Valuation Committee"],
    patterns: [
      /\b(?:approved by|approver|valuation committee)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Approved Date", "Review Date"],
    patterns: [
      new RegExp(`\\b(?:approval date|approved date|review date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.76,
  },
  {
    key: "stale_price_count",
    label: "Stale Price Count",
    tableLabels: ["Stale Price Count", "Stale Prices", "Aged Prices"],
    patterns: [
      /\b(?:stale price count|stale prices|aged prices)\s*(?:is|:)?\s*([0-9][0-9,]*)/i,
    ],
    confidence: 0.72,
  },
  {
    key: "material_assumptions",
    label: "Material Assumptions",
    tableLabels: ["Material Assumptions", "Key Assumptions", "Assumptions"],
    patterns: [
      /\b(?:material assumptions|key assumptions|assumptions)\s*(?:include|are|:)?\s*([^.\n;]{6,200})/i,
    ],
    confidence: 0.72,
  },
]

function sourceSearchText(source = {}) {
  return [
    source.text,
    ...(source.tables || []).map((table) => table.name),
    ...(source.tables || []).flatMap((table) => (table.rows || []).slice(0, 12).map((row) => row.join(" | "))),
  ]
    .filter(Boolean)
    .join("\n")
}

function identityPoint(source) {
  const text = sourceSearchText(source)
  const match = text.match(/\b(?:valuation package|valuation report|quarterly valuation workbook|nav package|net asset value package)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Valuation Package",
    sourceReference: match[0],
    confidence: 0.94,
  })
}

function numberValue(values, ...keys) {
  for (const key of keys) {
    const value = parseNumber(values[key])
    if (value !== null) return value
  }
  return null
}

function navVariance(values) {
  const grossAssetValue = numberValue(values, "gross_asset_value")
  const liabilities = numberValue(values, "total_liabilities")
  const nav = numberValue(values, "net_asset_value")
  if ([grossAssetValue, liabilities, nav].some((value) => value === null)) return null
  return grossAssetValue - liabilities - nav
}

function unrealizedVariance(values) {
  const fairValue = numberValue(values, "investments_at_fair_value")
  const cost = numberValue(values, "cost_basis")
  const unrealized = numberValue(values, "unrealized_gain_loss")
  if ([fairValue, cost, unrealized].some((value) => value === null)) return null
  return fairValue - cost - unrealized
}

function unitPriceVariance(values) {
  const nav = numberValue(values, "net_asset_value")
  const units = numberValue(values, "units_outstanding")
  const unitPrice = numberValue(values, "unit_price")
  if ([nav, units, unitPrice].some((value) => value === null) || Math.abs(units) <= 0.0000001) return null
  return nav / units - unitPrice
}

function reconciliationPoint({ key, label, variance, fractionDigits = 2, tolerance = 0.01 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= tolerance ? "Reconciled" : `Variance ${formatNumber(variance, fractionDigits)}`,
    confidence: 0.9,
  })
}

class ValuationReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = VALUATION_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const navReconciliationVariance = navVariance(values)
    const unrealizedReconciliationVariance = unrealizedVariance(values)
    const unitPriceReconciliationVariance = unitPriceVariance(values)
    keyPoints.push(
      ...[
        reconciliationPoint({ key: "nav_reconciliation", label: "NAV Reconciliation", variance: navReconciliationVariance }),
        reconciliationPoint({ key: "unrealized_gain_loss_reconciliation", label: "Unrealized Gain / Loss Reconciliation", variance: unrealizedReconciliationVariance }),
        reconciliationPoint({
          key: "unit_price_reconciliation",
          label: "Unit Price Reconciliation",
          variance: unitPriceReconciliationVariance,
          fractionDigits: 6,
          tolerance: 0.000001,
        }),
      ].filter(Boolean),
    )
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["valuation_date", "net_asset_value"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "valuation_fields_not_detected", message: `Review missing valuation fields: ${missing.join(", ")}.` })
    }
    if (navReconciliationVariance !== null && Math.abs(navReconciliationVariance) > 0.01) {
      issues.push({ code: "valuation_nav_mismatch", message: `Gross assets less liabilities differs from NAV by ${formatNumber(navReconciliationVariance, 2)}.` })
    }
    if (unrealizedReconciliationVariance !== null && Math.abs(unrealizedReconciliationVariance) > 0.01) {
      issues.push({ code: "valuation_unrealized_mismatch", message: `Fair value less cost differs from unrealized gain/loss by ${formatNumber(unrealizedReconciliationVariance, 2)}.` })
    }
    if (unitPriceReconciliationVariance !== null && Math.abs(unitPriceReconciliationVariance) > 0.000001) {
      issues.push({ code: "valuation_unit_price_mismatch", message: `NAV divided by units differs from unit price by ${formatNumber(unitPriceReconciliationVariance, 6)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Identified ${keyPoints.length} valuation fact(s), methodology notes, and reconciliation checks for reporting context review.`
        : "No standard valuation facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? Math.min(0.95, 0.42 + keyPoints.length * 0.045) : keyPoints.length ? 0.68 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        nav_reconciliation_variance: navReconciliationVariance,
        unrealized_gain_loss_reconciliation_variance: unrealizedReconciliationVariance,
        unit_price_reconciliation_variance: unitPriceReconciliationVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = ValuationReader
