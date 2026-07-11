const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "redemption_notice"
const READER_VERSION = "redemption-notice.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const REDEMPTION_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Issuing Fund", "Company"],
    patterns: [/\b(?:fund|fund name|partnership|issuing fund|company)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "investor_name",
    label: "Investor",
    tableLabels: ["Investor", "Investor Name", "Limited Partner", "LP", "Shareholder", "Holder"],
    patterns: [/\b(?:investor|investor name|limited partner|limited partner name|lp|shareholder|holder)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.86,
  },
  {
    key: "investor_type",
    label: "Investor Type",
    tableLabels: ["Investor Type", "Partner Type", "Shareholder Type", "Holder Type"],
    patterns: [/\b(?:investor type|partner type|shareholder type|holder type)\s*(?:is|:)?\s*([A-Za-z0-9 /.-]{3,80})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "notice_reference",
    label: "Notice Reference",
    tableLabels: ["Notice Reference", "Reference", "Redemption Number", "Redemption No.", "Request Number"],
    patterns: [/\b(?:notice reference|reference|redemption number|redemption no\.?|request number)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,50})/i],
    confidence: 0.8,
  },
  {
    key: "notice_date",
    label: "Notice Date",
    tableLabels: ["Notice Date", "Date", "Redemption Notice Date", "Request Date"],
    patterns: [new RegExp(`\\b(?:notice date|redemption notice date|request date|date of notice|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "redemption_effective_date",
    label: "Redemption Effective Date",
    tableLabels: ["Redemption Date", "Redemption Effective Date", "Effective Date", "Valuation Date", "NAV Date"],
    patterns: [new RegExp(`\\b(?:redemption date|redemption effective date|effective date|valuation date|nav date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.92,
  },
  {
    key: "payment_date",
    label: "Payment Date",
    tableLabels: ["Payment Date", "Settlement Date", "Expected Payment Date", "Wire Date", "Proceeds Date"],
    patterns: [
      new RegExp(`\\b(?:payment date|settlement date|expected payment date|wire date|proceeds date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
      new RegExp(`\\b(?:redemption proceeds|payment|settlement)\\s+(?:will be\\s+)?(?:paid|made|sent|settled)\\s+(?:on|by)\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "share_class",
    label: "Share / Interest Class",
    tableLabels: ["Share Class", "Class", "Unit Class", "Interest Class", "Series"],
    patterns: [/\b(?:share class|unit class|interest class|series|class)\s*(?:is|:)?\s*([A-Za-z0-9 -]{1,80})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "redemption_type",
    label: "Redemption Type",
    tableLabels: ["Redemption Type", "Type", "Request Type"],
    patterns: [/\b(full redemption|partial redemption|mandatory redemption|voluntary redemption|withdrawal|repurchase)\b/i],
    confidence: 0.8,
  },
  {
    key: "redemption_amount",
    label: "Redemption Amount",
    tableLabels: ["Redemption Amount", "Amount Redeemed", "Requested Amount", "Gross Redemption", "Gross Redemption Amount"],
    patterns: [new RegExp(`\\b(?:redemption amount|amount redeemed|requested amount|gross redemption amount|gross redemption)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.95,
  },
  {
    key: "net_redemption_amount",
    label: "Net Redemption Amount",
    tableLabels: ["Net Redemption Amount", "Net Redemption Proceeds", "Net Proceeds", "Amount Payable"],
    patterns: [new RegExp(`\\b(?:net redemption amount|net redemption proceeds|net proceeds|amount payable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
  },
  {
    key: "redemption_fee",
    label: "Redemption Fee",
    tableLabels: ["Redemption Fee", "Early Redemption Fee", "Fee", "Redemption Penalty"],
    patterns: [
      new RegExp(`\\b(?:redemption fee|early redemption fee|redemption penalty)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
      /\b(?:redemption fee|early redemption fee|redemption penalty)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "holdback_amount",
    label: "Holdback Amount",
    tableLabels: ["Holdback", "Holdback Amount", "Reserve", "Retention"],
    patterns: [
      new RegExp(`\\b(?:holdback amount|holdback|reserve|retention)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
      /\b(?:holdback|reserve|retention)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "withholding_amount",
    label: "Withholding Amount",
    tableLabels: ["Withholding Amount", "Tax Withholding", "Withholding Tax"],
    patterns: [
      new RegExp(`\\b(?:withholding amount|tax withholding|withholding tax)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
      /\b(?:withholding rate|tax withholding rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "beginning_balance",
    label: "Beginning Balance",
    tableLabels: ["Beginning Balance", "Pre Redemption Balance", "Beginning Capital Balance", "Opening Balance"],
    patterns: [new RegExp(`\\b(?:beginning balance|pre redemption balance|beginning capital balance|opening balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "remaining_balance",
    label: "Remaining Balance",
    tableLabels: ["Remaining Balance", "Remaining Investment", "Post Redemption Balance", "Remaining Capital Balance"],
    patterns: [new RegExp(`\\b(?:remaining balance|remaining investment|post redemption balance|remaining capital balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "beginning_units",
    label: "Beginning Units / Shares",
    tableLabels: ["Beginning Units", "Opening Units", "Beginning Shares", "Opening Shares"],
    patterns: [new RegExp(`\\b(?:beginning units|opening units|beginning shares|opening shares)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "units_redeemed",
    label: "Units / Shares Redeemed",
    tableLabels: ["Units Redeemed", "Shares Redeemed", "Interests Redeemed", "Units", "Shares"],
    patterns: [new RegExp(`\\b(?:units redeemed|shares redeemed|interests redeemed|units|shares)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "remaining_units",
    label: "Remaining Units / Shares",
    tableLabels: ["Remaining Units", "Remaining Shares", "Ending Units", "Post Redemption Units"],
    patterns: [new RegExp(`\\b(?:remaining units|remaining shares|ending units|post redemption units)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "nav_per_unit",
    label: "NAV Per Unit / Share",
    tableLabels: ["NAV Per Unit", "NAV Per Share", "Unit Price", "Share Price", "Redemption Price"],
    patterns: [new RegExp(`\\b(?:nav per (?:unit|share)|unit price|share price|redemption price)\\s*(?:is|:|of)?\\s*((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,]*(?:\\.[0-9]{2,6})?)`, "i")],
    confidence: 0.9,
  },
  {
    key: "redemption_percentage",
    label: "Redemption Percentage",
    tableLabels: ["Redemption Percentage", "Percentage Redeemed", "Percent Redeemed"],
    patterns: [
      /\b(?:redemption percentage|percentage redeemed|percent redeemed)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
      /\b(full redemption|partial redemption)\b/i,
    ],
    confidence: 0.82,
  },
  {
    key: "redemption_status",
    label: "Redemption Status",
    tableLabels: ["Status", "Redemption Status", "Approval Status"],
    patterns: [/\b(?:redemption status|approval status|status)\s*(?:is|:)?\s*(approved|accepted|pending|rejected|settled|processed|paid)(?:[.;\n]|$)/i],
    confidence: 0.8,
  },
  {
    key: "payment_status",
    label: "Payment Status",
    tableLabels: ["Payment Status", "Settlement Status", "Cash Status"],
    patterns: [/\b(?:payment status|settlement status|cash status)\s*(?:is|:)?\s*(paid|settled|pending|withheld|unpaid|processed|overdue)(?:[.;\n]|$)/i],
    confidence: 0.78,
  },
]

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function noticeIdentity(text) {
  const match = String(text || "").match(/\b(redemption notice|redemption request notice|notice of redemption|redemption request|withdrawal notice|repurchase notice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Redemption Notice",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function parseAmount(value) {
  const text = singleLine(value)
  if (!text) return null
  const normalized = text.replace(/\b(?:million|billion|m|bn)\b/gi, "")
  const number = parseNumber(normalized)
  if (number === null) return null
  if (/\b(?:billion|bn)\b/i.test(text)) return number * 1000000000
  if (/\b(?:million|m)\b/i.test(text)) return number * 1000000
  return number
}

function netVariance(values) {
  const gross = parseAmount(values.redemption_amount)
  const net = parseAmount(values.net_redemption_amount)
  if (gross === null || net === null) return null
  return gross - (parseAmount(values.redemption_fee) || 0) - (parseAmount(values.holdback_amount) || 0) - (parseAmount(values.withholding_amount) || 0) - net
}

function unitPriceVariance(values) {
  const units = parseAmount(values.units_redeemed)
  const navPerUnit = parseAmount(values.nav_per_unit)
  const amount = parseAmount(values.redemption_amount)
  if (units === null || navPerUnit === null || amount === null) return null
  return units * navPerUnit - amount
}

function balanceVariance(values) {
  const beginning = parseAmount(values.beginning_balance)
  const gross = parseAmount(values.redemption_amount)
  const remaining = parseAmount(values.remaining_balance)
  if (beginning === null || gross === null || remaining === null) return null
  return beginning - gross - remaining
}

function unitBalanceVariance(values) {
  const beginning = parseAmount(values.beginning_units)
  const redeemed = parseAmount(values.units_redeemed)
  const remaining = parseAmount(values.remaining_units)
  if (beginning === null || redeemed === null || remaining === null) return null
  return beginning - redeemed - remaining
}

function redemptionPercentageVariance(values) {
  const beginning = parseAmount(values.beginning_balance)
  const gross = parseAmount(values.redemption_amount)
  const percentage = parseNumber(values.redemption_percentage)
  if (beginning === null || gross === null || percentage === null || Math.abs(beginning) <= 0.000001) return null
  return (gross / beginning) * 100 - percentage
}

function reconciliationPoint({ key, label, variance, tolerance = 0.01, fractionDigits = 2, confidence = 0.88 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= tolerance ? "Reconciled" : `Variance ${formatNumber(variance, fractionDigits)}`,
    valueJson: { variance },
    confidence,
  })
}

class RedemptionNoticeReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = REDEMPTION_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = noticeIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const redemptionNetVariance = netVariance(values)
    const redemptionUnitVariance = unitPriceVariance(values)
    const remainingBalanceVariance = balanceVariance(values)
    const remainingUnitsVariance = unitBalanceVariance(values)
    const percentageVariance = redemptionPercentageVariance(values)

    ;[
      reconciliationPoint({ key: "redemption_net_reconciliation", label: "Redemption Net Reconciliation", variance: redemptionNetVariance, confidence: 0.9 }),
      reconciliationPoint({ key: "redemption_unit_price_reconciliation", label: "Redemption Unit Price Reconciliation", variance: redemptionUnitVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "remaining_balance_reconciliation", label: "Remaining Balance Reconciliation", variance: remainingBalanceVariance, confidence: 0.86 }),
      reconciliationPoint({ key: "remaining_units_reconciliation", label: "Remaining Units Reconciliation", variance: remainingUnitsVariance, tolerance: 0.0001, fractionDigits: 4, confidence: 0.86 }),
      reconciliationPoint({ key: "redemption_percentage_reconciliation", label: "Redemption Percentage Reconciliation", variance: percentageVariance, tolerance: 0.01, fractionDigits: 4, confidence: 0.84 }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["redemption_effective_date", "redemption_amount"].filter((key) => !foundKeys.has(key))
    const wireInstructionsDetected = /\b(?:routing number|aba|iban|swift|bic|beneficiary account|wire instructions|account number)\b/i.test(text)
    const issues = []
    if (missing.length) {
      issues.push({ code: "redemption_notice_fields_not_detected", message: `Review missing redemption fields: ${missing.join(", ")}.` })
    }
    if (redemptionNetVariance !== null && Math.abs(redemptionNetVariance) > 0.01) {
      issues.push({ code: "redemption_notice_net_mismatch", message: `Gross redemption less fees, holdbacks, and withholding does not agree to net proceeds by ${formatNumber(redemptionNetVariance, 2)}.` })
    }
    if (redemptionUnitVariance !== null && Math.abs(redemptionUnitVariance) > 0.01) {
      issues.push({ code: "redemption_notice_unit_price_mismatch", message: `Units redeemed multiplied by NAV per unit does not agree to redemption amount by ${formatNumber(redemptionUnitVariance, 2)}.` })
    }
    if (remainingBalanceVariance !== null && Math.abs(remainingBalanceVariance) > 0.01) {
      issues.push({ code: "redemption_notice_remaining_balance_mismatch", message: `Beginning balance less redemption amount does not agree to remaining balance by ${formatNumber(remainingBalanceVariance, 2)}.` })
    }
    if (remainingUnitsVariance !== null && Math.abs(remainingUnitsVariance) > 0.0001) {
      issues.push({ code: "redemption_notice_remaining_units_mismatch", message: `Beginning units less redeemed units does not agree to remaining units by ${formatNumber(remainingUnitsVariance, 4)}.` })
    }
    if (percentageVariance !== null && Math.abs(percentageVariance) > 0.01) {
      issues.push({ code: "redemption_notice_percentage_mismatch", message: `Redemption amount divided by beginning balance differs from reported percentage by ${formatNumber(percentageVariance, 4)}%.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} redemption notice fact(s) for review.`
        : "No standard redemption notice facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.94 : keyPoints.length ? 0.7 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        net_reconciliation_variance: redemptionNetVariance,
        unit_price_reconciliation_variance: redemptionUnitVariance,
        remaining_balance_variance: remainingBalanceVariance,
        remaining_units_variance: remainingUnitsVariance,
        redemption_percentage_variance: percentageVariance,
        wire_instructions_excluded: wireInstructionsDetected,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = RedemptionNoticeReader
