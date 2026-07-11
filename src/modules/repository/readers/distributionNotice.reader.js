const { formatNumber, matchPointFromSource, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "distribution_notice"
const READER_VERSION = "distribution-notice.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const DISTRIBUTION_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Issuing Fund"],
    patterns: [/\b(?:fund|fund name|partnership|issuing fund)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "investor_name",
    label: "Investor",
    tableLabels: ["Investor", "Investor Name", "Limited Partner", "LP", "Limited Partner Name"],
    patterns: [/\b(?:investor|investor name|limited partner|limited partner name|lp)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.86,
  },
  {
    key: "investor_type",
    label: "Investor Type",
    tableLabels: ["Investor Type", "Partner Type", "LP Type"],
    patterns: [/\b(?:investor type|partner type|lp type)\s*(?:is|:)?\s*([A-Za-z0-9 /.-]{3,80})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "share_class",
    label: "Share / Interest Class",
    tableLabels: ["Share Class", "Class", "Unit Class", "Interest Class", "Series"],
    patterns: [/\b(?:share class|unit class|interest class|series|class)\s*(?:is|:)?\s*([A-Za-z0-9 .-]{1,80})(?:[.;\n]|$)/i],
    confidence: 0.78,
  },
  {
    key: "notice_reference",
    label: "Notice Reference",
    tableLabels: ["Notice Reference", "Reference", "Distribution Number", "Distribution No."],
    patterns: [/\b(?:notice reference|reference|distribution number|distribution no\.?)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,40})/i],
    confidence: 0.8,
  },
  {
    key: "notice_date",
    label: "Notice Date",
    tableLabels: ["Notice Date", "Date", "Distribution Notice Date"],
    patterns: [new RegExp(`\\b(?:notice date|distribution notice date|date of notice|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "record_date",
    label: "Record Date",
    tableLabels: ["Record Date", "Holder Record Date", "Eligibility Date"],
    patterns: [new RegExp(`\\b(?:record date|holder record date|eligibility date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "payment_date",
    label: "Payment Date",
    tableLabels: ["Payment Date", "Distribution Date", "Expected Payment Date", "Wire Date"],
    patterns: [
      new RegExp(`\\b(?:payment date|distribution date|expected payment date|wire date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
      new RegExp(`\\b(?:distribution|payment)\\s+(?:will be\\s+)?(?:paid|made|sent)\\s+(?:on|by)\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.92,
  },
  {
    key: "distribution_period",
    label: "Distribution Period",
    tableLabels: ["Distribution Period", "Reporting Period", "Period", "Distribution Quarter"],
    patterns: [/\b(?:distribution period|reporting period|distribution quarter|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i],
    confidence: 0.78,
  },
  {
    key: "distribution_amount",
    label: "Distribution Amount",
    tableLabels: ["Distribution Amount", "Amount Distributed", "Payment Amount", "Cash Distribution"],
    patterns: [new RegExp(`\\b(?:distribution amount|amount distributed|payment amount|cash distribution)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.95,
  },
  {
    key: "gross_distribution_amount",
    label: "Gross Distribution Amount",
    tableLabels: ["Gross Distribution Amount", "Gross Distribution", "Gross Amount"],
    patterns: [new RegExp(`\\b(?:gross distribution amount|gross distribution|gross amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "net_distribution_amount",
    label: "Net Distribution Amount",
    tableLabels: ["Net Distribution Amount", "Net Distribution", "Net Cash Distribution", "Net Payment Amount"],
    patterns: [new RegExp(`\\b(?:net distribution amount|net distribution|net cash distribution|net payment amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "return_of_capital",
    label: "Return of Capital",
    tableLabels: ["Return of Capital", "ROC"],
    patterns: [new RegExp(`\\b(?:return of capital|roc)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "income_distribution",
    label: "Income Distribution",
    tableLabels: ["Income Distribution", "Investment Income", "Dividend Income"],
    patterns: [new RegExp(`\\b(?:income distribution|investment income|dividend income)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "realized_gain_distribution",
    label: "Realized Gain Distribution",
    tableLabels: ["Realized Gain Distribution", "Capital Gain Distribution", "Realized Gain", "Capital Gain"],
    patterns: [new RegExp(`\\b(?:realized gain distribution|capital gain distribution|realized gain|capital gain)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "tax_distribution",
    label: "Tax Distribution",
    tableLabels: ["Tax Distribution", "Tax Distribution Amount"],
    patterns: [new RegExp(`\\b(?:tax distribution amount|tax distribution)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "recallable_amount",
    label: "Recallable Amount",
    tableLabels: ["Recallable Amount", "Recallable Distribution"],
    patterns: [new RegExp(`\\b(?:recallable amount|recallable distribution)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
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
    confidence: 0.82,
  },
  {
    key: "distribution_expense",
    label: "Distribution Expense / Fee",
    tableLabels: ["Distribution Expense", "Distribution Fee", "Bank Fee", "Wire Fee", "Fees"],
    patterns: [new RegExp(`\\b(?:distribution expense|distribution fee|bank fee|wire fee|fees)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "units",
    label: "Units / Shares",
    tableLabels: ["Units", "Shares", "Units Outstanding", "Shares Outstanding"],
    patterns: [new RegExp(`\\b(?:units outstanding|shares outstanding|units|shares)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "amount_per_unit",
    label: "Amount Per Unit / Share",
    tableLabels: ["Amount Per Unit", "Distribution Per Unit", "Amount Per Share", "Distribution Per Share"],
    patterns: [new RegExp(`\\b(?:amount per unit|distribution per unit|amount per share|distribution per share)\\s*(?:is|:|of)?\\s*((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,]*(?:\\.[0-9]{2,6})?)`, "i")],
    confidence: 0.78,
  },
  {
    key: "payment_status",
    label: "Payment Status",
    tableLabels: ["Payment Status", "Distribution Status", "Status"],
    patterns: [/\b(?:payment status|distribution status|status)\s*(?:is|:)?\s*(paid|unpaid|pending|settled|processed|approved|rejected|withheld)(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Authorization Status", "Approved"],
    patterns: [/\b(?:approval status|authorization status|approved)\s*(?:is|:)?\s*(approved|authorized|pending|rejected|reviewed)(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "distribution_type",
    label: "Distribution Type",
    tableLabels: ["Distribution Type", "Type", "Distribution Category"],
    patterns: [/\b(return of capital|income distribution|capital gain distribution|recallable distribution|dividend distribution|tax distribution)\b/i],
    confidence: 0.82,
  },
]

function noticeIdentity(text) {
  const match = String(text || "").match(/\b(distribution notice|distribution statement|notice of distribution|cash distribution notice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Distribution Notice",
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

function grossDistribution(values) {
  return parseAmount(values.gross_distribution_amount) ?? parseAmount(values.distribution_amount)
}

function componentVariance(values) {
  const gross = grossDistribution(values)
  if (gross === null) return null
  const componentKeys = ["return_of_capital", "income_distribution", "realized_gain_distribution", "tax_distribution"]
  let count = 0
  const total = componentKeys.reduce((sum, key) => {
    const value = parseAmount(values[key])
    if (value === null) return sum
    count += 1
    return sum + value
  }, 0)
  if (count < 2) return null
  return total - gross
}

function netDistributionVariance(values) {
  const gross = grossDistribution(values)
  const net = parseAmount(values.net_distribution_amount)
  if (gross === null || net === null) return null
  return gross - (parseAmount(values.withholding_amount) || 0) - (parseAmount(values.distribution_expense) || 0) - net
}

function unitDistributionVariance(values) {
  const units = parseAmount(values.units)
  const amountPerUnit = parseAmount(values.amount_per_unit)
  const gross = grossDistribution(values)
  if (units === null || amountPerUnit === null || gross === null) return null
  return units * amountPerUnit - gross
}

function recallableCoverageVariance(values) {
  const recallable = parseAmount(values.recallable_amount)
  const returnOfCapital = parseAmount(values.return_of_capital)
  if (recallable === null || returnOfCapital === null) return null
  return returnOfCapital - recallable
}

function reconciliationPoint({ key, label, variance, reconciledText = "Reconciled", shortfallText = "Variance", confidence = 0.88 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= 0.01 ? reconciledText : `${shortfallText} ${formatNumber(variance, 2)}`,
    valueJson: { variance },
    confidence,
  })
}

class DistributionNoticeReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = DISTRIBUTION_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = noticeIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const distributionComponentVariance = componentVariance(values)
    const netVariance = netDistributionVariance(values)
    const unitVariance = unitDistributionVariance(values)
    const recallableCoverage = recallableCoverageVariance(values)
    ;[
      reconciliationPoint({ key: "distribution_component_reconciliation", label: "Distribution Component Reconciliation", variance: distributionComponentVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "net_distribution_reconciliation", label: "Net Distribution Reconciliation", variance: netVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "distribution_per_unit_reconciliation", label: "Distribution Per Unit Reconciliation", variance: unitVariance, confidence: 0.84 }),
      reconciliationPoint({
        key: "recallable_distribution_coverage",
        label: "Recallable Distribution Coverage",
        variance: recallableCoverage,
        reconciledText: "Fully Recallable",
        shortfallText: "Non-recallable ROC",
        confidence: 0.8,
      }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["payment_date", "distribution_amount"].filter((key) => !foundKeys.has(key) && !(key === "distribution_amount" && foundKeys.has("gross_distribution_amount")))
    const wireInstructionsDetected = /\b(?:routing number|aba|iban|swift|bic|beneficiary account|wire instructions|account number)\b/i.test(text)
    const issues = []

    if (missing.length) {
      issues.push({ code: "distribution_notice_fields_not_detected", message: `Review missing distribution fields: ${missing.join(", ")}.` })
    }
    if (distributionComponentVariance !== null && Math.abs(distributionComponentVariance) > 0.01) {
      issues.push({ code: "distribution_notice_component_mismatch", message: `Distribution character components do not agree to gross distribution by ${formatNumber(distributionComponentVariance, 2)}.` })
    }
    if (netVariance !== null && Math.abs(netVariance) > 0.01) {
      issues.push({ code: "distribution_notice_net_mismatch", message: `Gross distribution less withholding and fees does not agree to net distribution by ${formatNumber(netVariance, 2)}.` })
    }
    if (unitVariance !== null && Math.abs(unitVariance) > 0.01) {
      issues.push({ code: "distribution_notice_per_unit_mismatch", message: `Units multiplied by amount per unit does not agree to gross distribution by ${formatNumber(unitVariance, 2)}.` })
    }
    if (recallableCoverage !== null && recallableCoverage < -0.01) {
      issues.push({ code: "distribution_notice_recallable_exceeds_roc", message: `Recallable distribution exceeds return of capital by ${formatNumber(Math.abs(recallableCoverage), 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} distribution notice fact(s) for review.`
        : "No standard distribution notice facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.94 : keyPoints.length ? 0.72 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        wire_instructions_excluded: wireInstructionsDetected,
        distribution_component_variance: distributionComponentVariance,
        net_distribution_variance: netVariance,
        distribution_per_unit_variance: unitVariance,
        recallable_coverage_amount: recallableCoverage,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = DistributionNoticeReader
