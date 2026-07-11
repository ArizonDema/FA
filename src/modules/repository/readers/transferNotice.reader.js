const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "transfer_notice"
const READER_VERSION = "transfer-notice.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const TRANSFER_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Company", "Issuer"],
    patterns: [/\b(?:fund|fund name|partnership|company|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "transferor_name",
    label: "Transferor",
    tableLabels: ["Transferor", "Transferor Name", "Seller", "Assignor", "Current Holder"],
    patterns: [/\b(?:transferor|transferor name|seller|assignor|current holder)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.9,
  },
  {
    key: "transferor_type",
    label: "Transferor Type",
    tableLabels: ["Transferor Type", "Seller Type", "Assignor Type"],
    patterns: [/\b(?:transferor type|seller type|assignor type)\s*(?:is|:)?\s*([A-Za-z0-9 /.-]{3,80})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "transferee_name",
    label: "Transferee",
    tableLabels: ["Transferee", "Transferee Name", "Buyer", "Assignee", "New Holder"],
    patterns: [/\b(?:transferee|transferee name|buyer|assignee|new holder)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.9,
  },
  {
    key: "transferee_type",
    label: "Transferee Type",
    tableLabels: ["Transferee Type", "Buyer Type", "Assignee Type"],
    patterns: [/\b(?:transferee type|buyer type|assignee type)\s*(?:is|:)?\s*([A-Za-z0-9 /.-]{3,80})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "notice_reference",
    label: "Notice Reference",
    tableLabels: ["Notice Reference", "Reference", "Transfer Number", "Transfer No.", "Request Number"],
    patterns: [/\b(?:notice reference|reference|transfer number|transfer no\.?|request number)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,50})/i],
    confidence: 0.8,
  },
  {
    key: "notice_date",
    label: "Notice Date",
    tableLabels: ["Notice Date", "Date", "Transfer Notice Date", "Request Date"],
    patterns: [new RegExp(`\\b(?:notice date|transfer notice date|request date|date of notice|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "transfer_effective_date",
    label: "Transfer Effective Date",
    tableLabels: ["Transfer Effective Date", "Effective Date", "Transfer Date", "Settlement Date"],
    patterns: [new RegExp(`\\b(?:transfer effective date|effective date|transfer date|settlement date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.92,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Consent Date", "GP Approval Date", "Manager Approval Date"],
    patterns: [new RegExp(`\\b(?:approval date|consent date|gp approval date|manager approval date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "settlement_date",
    label: "Settlement Date",
    tableLabels: ["Settlement Date", "Payment Date", "Closing Date"],
    patterns: [new RegExp(`\\b(?:settlement date|payment date|closing date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "share_class",
    label: "Share / Interest Class",
    tableLabels: ["Share Class", "Class", "Unit Class", "Interest Class", "Series"],
    patterns: [/\b(?:share class|unit class|interest class|series|class)\s*(?:is|:)?\s*([A-Za-z0-9 -]{1,80})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "transfer_type",
    label: "Transfer Type",
    tableLabels: ["Transfer Type", "Type", "Transaction Type"],
    patterns: [/\b(full transfer|partial transfer|assignment|secondary sale|internal transfer|class transfer)\b/i],
    confidence: 0.82,
  },
  {
    key: "transfer_amount",
    label: "Transfer Amount",
    tableLabels: ["Transfer Amount", "Amount Transferred", "Interest Value", "Capital Transferred", "Transferred Amount"],
    patterns: [new RegExp(`\\b(?:transfer amount|amount transferred|interest value|capital transferred|transferred amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
  },
  {
    key: "consideration_amount",
    label: "Consideration Amount",
    tableLabels: ["Consideration", "Consideration Amount", "Purchase Price", "Transfer Price"],
    patterns: [new RegExp(`\\b(?:consideration amount|consideration|purchase price|transfer price)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "transfer_fee",
    label: "Transfer Fee",
    tableLabels: ["Transfer Fee", "Assignment Fee", "Processing Fee", "Admin Fee"],
    patterns: [new RegExp(`\\b(?:transfer fee|assignment fee|processing fee|admin fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "units_transferred",
    label: "Units / Shares Transferred",
    tableLabels: ["Units Transferred", "Shares Transferred", "Interests Transferred", "Units", "Shares"],
    patterns: [new RegExp(`\\b(?:units transferred|shares transferred|interests transferred|units|shares)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "beginning_transferor_units",
    label: "Beginning Transferor Units",
    tableLabels: ["Beginning Transferor Units", "Transferor Beginning Units", "Seller Beginning Units", "Pre Transfer Units"],
    patterns: [new RegExp(`\\b(?:beginning transferor units|transferor beginning units|seller beginning units|pre transfer units)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "remaining_transferor_units",
    label: "Remaining Transferor Units",
    tableLabels: ["Remaining Transferor Units", "Transferor Remaining Units", "Post Transfer Units", "Remaining Units"],
    patterns: [new RegExp(`\\b(?:remaining transferor units|transferor remaining units|post transfer units|remaining units)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "nav_per_unit",
    label: "NAV Per Unit / Share",
    tableLabels: ["NAV Per Unit", "NAV Per Share", "Unit Price", "Share Price", "Transfer Price Per Unit"],
    patterns: [new RegExp(`\\b(?:nav per (?:unit|share)|unit price|share price|transfer price per unit)\\s*(?:is|:|of)?\\s*((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,]*(?:\\.[0-9]{2,6})?)`, "i")],
    confidence: 0.88,
  },
  {
    key: "transfer_percentage",
    label: "Transfer Percentage",
    tableLabels: ["Transfer Percentage", "Percentage Transferred", "Percent Transferred", "Ownership Transferred"],
    patterns: [/\b(?:transfer percentage|percentage transferred|percent transferred|ownership transferred)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i],
    confidence: 0.82,
  },
  {
    key: "beginning_transferor_balance",
    label: "Beginning Transferor Balance",
    tableLabels: ["Beginning Transferor Balance", "Transferor Beginning Balance", "Pre Transfer Balance", "Beginning Investment"],
    patterns: [new RegExp(`\\b(?:beginning transferor balance|transferor beginning balance|pre transfer balance|beginning investment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "remaining_transferor_balance",
    label: "Remaining Transferor Balance",
    tableLabels: ["Remaining Transferor Balance", "Transferor Remaining Balance", "Remaining Investment", "Post Transfer Balance"],
    patterns: [new RegExp(`\\b(?:remaining transferor balance|transferor remaining balance|remaining investment|post transfer balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "consent_status",
    label: "Consent / Approval Status",
    tableLabels: ["Consent Status", "Approval Status", "Status", "GP Consent", "Manager Consent"],
    patterns: [/\b(?:consent status|approval status|gp consent|manager consent|status)\s*(?:is|:)?\s*(approved|consented|pending|rejected|waived|not required)(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "side_letter_status",
    label: "Side Letter Status",
    tableLabels: ["Side Letter Status", "Side Letter", "MFN Status"],
    patterns: [/\b(?:side letter status|side letter|mfn status)\s*(?:is|:)?\s*(assigned|not assigned|applies|does not apply|yes|no|mfn)(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "kyc_status",
    label: "KYC / AML Status",
    tableLabels: ["KYC Status", "AML Status", "KYC/AML Status", "Compliance Status"],
    patterns: [/\b(?:kyc status|aml status|kyc\/aml status|compliance status)\s*(?:is|:)?\s*(complete|completed|approved|pending|rejected|not required)(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "settlement_status",
    label: "Settlement Status",
    tableLabels: ["Settlement Status", "Payment Status", "Closing Status"],
    patterns: [/\b(?:settlement status|payment status|closing status)\s*(?:is|:)?\s*(settled|pending|paid|unpaid|closed|open)(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
]

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function noticeIdentity(text) {
  const match = String(text || "").match(/\b(transfer notice|notice of transfer|interest transfer notice|share transfer notice|assignment notice|transfer request|assignment agreement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Investor Transfer Notice",
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

function transferValueVariance(values) {
  const units = parseAmount(values.units_transferred)
  const navPerUnit = parseAmount(values.nav_per_unit)
  const amount = parseAmount(values.transfer_amount)
  if (units === null || navPerUnit === null || amount === null) return null
  return units * navPerUnit - amount
}

function considerationVariance(values) {
  const transfer = parseAmount(values.transfer_amount)
  const fee = parseAmount(values.transfer_fee) || 0
  const consideration = parseAmount(values.consideration_amount)
  if (transfer === null || consideration === null) return null
  return transfer - fee - consideration
}

function remainingBalanceVariance(values) {
  const beginning = parseAmount(values.beginning_transferor_balance)
  const transfer = parseAmount(values.transfer_amount)
  const remaining = parseAmount(values.remaining_transferor_balance)
  if (beginning === null || transfer === null || remaining === null) return null
  return beginning - transfer - remaining
}

function remainingUnitsVariance(values) {
  const beginning = parseAmount(values.beginning_transferor_units)
  const transferred = parseAmount(values.units_transferred)
  const remaining = parseAmount(values.remaining_transferor_units)
  if (beginning === null || transferred === null || remaining === null) return null
  return beginning - transferred - remaining
}

function transferPercentageVariance(values) {
  const beginning = parseAmount(values.beginning_transferor_balance)
  const transfer = parseAmount(values.transfer_amount)
  const percentage = parseNumber(values.transfer_percentage)
  if (beginning === null || transfer === null || percentage === null || Math.abs(beginning) <= 0.000001) return null
  return (transfer / beginning) * 100 - percentage
}

function reconciliationPoint({ key, label, variance, tolerance = 0.01, fractionDigits = 2, confidence = 0.86 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= tolerance ? "Reconciled" : `Variance ${formatNumber(variance, fractionDigits)}`,
    valueJson: { variance },
    confidence,
  })
}

class TransferNoticeReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = TRANSFER_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = noticeIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const valueVariance = transferValueVariance(values)
    const transferConsiderationVariance = considerationVariance(values)
    const transferorBalanceVariance = remainingBalanceVariance(values)
    const transferorUnitsVariance = remainingUnitsVariance(values)
    const percentageVariance = transferPercentageVariance(values)

    ;[
      reconciliationPoint({ key: "transfer_value_reconciliation", label: "Transfer Value Reconciliation", variance: valueVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "transfer_consideration_reconciliation", label: "Transfer Consideration Reconciliation", variance: transferConsiderationVariance, confidence: 0.84 }),
      reconciliationPoint({ key: "transferor_balance_reconciliation", label: "Transferor Balance Reconciliation", variance: transferorBalanceVariance, confidence: 0.84 }),
      reconciliationPoint({ key: "transferor_units_reconciliation", label: "Transferor Units Reconciliation", variance: transferorUnitsVariance, tolerance: 0.0001, fractionDigits: 4, confidence: 0.84 }),
      reconciliationPoint({ key: "transfer_percentage_reconciliation", label: "Transfer Percentage Reconciliation", variance: percentageVariance, tolerance: 0.01, fractionDigits: 4, confidence: 0.84 }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["transferor_name", "transferee_name", "transfer_effective_date"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "transfer_notice_fields_not_detected", message: `Review missing investor transfer fields: ${missing.join(", ")}.` })
    }
    if (!foundKeys.has("transfer_amount") && !foundKeys.has("units_transferred") && !foundKeys.has("transfer_percentage")) {
      issues.push({ code: "transfer_notice_quantity_not_detected", message: "No transferred amount, units, or percentage could be detected." })
    }
    if (valueVariance !== null && Math.abs(valueVariance) > 0.01) {
      issues.push({ code: "transfer_notice_value_mismatch", message: `Units transferred multiplied by NAV per unit does not agree to transfer amount by ${formatNumber(valueVariance, 2)}.` })
    }
    if (transferConsiderationVariance !== null && Math.abs(transferConsiderationVariance) > 0.01) {
      issues.push({ code: "transfer_notice_consideration_mismatch", message: `Transfer amount less fees does not agree to consideration by ${formatNumber(transferConsiderationVariance, 2)}.` })
    }
    if (transferorBalanceVariance !== null && Math.abs(transferorBalanceVariance) > 0.01) {
      issues.push({ code: "transfer_notice_transferor_balance_mismatch", message: `Beginning transferor balance less transfer amount does not agree to remaining balance by ${formatNumber(transferorBalanceVariance, 2)}.` })
    }
    if (transferorUnitsVariance !== null && Math.abs(transferorUnitsVariance) > 0.0001) {
      issues.push({ code: "transfer_notice_transferor_units_mismatch", message: `Beginning transferor units less transferred units does not agree to remaining units by ${formatNumber(transferorUnitsVariance, 4)}.` })
    }
    if (percentageVariance !== null && Math.abs(percentageVariance) > 0.01) {
      issues.push({ code: "transfer_notice_percentage_mismatch", message: `Transfer amount divided by beginning transferor balance differs from reported percentage by ${formatNumber(percentageVariance, 4)}%.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} investor transfer notice fact(s) for review.`
        : "No standard investor transfer notice facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.68 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        transfer_value_variance: valueVariance,
        transfer_consideration_variance: transferConsiderationVariance,
        transferor_balance_variance: transferorBalanceVariance,
        transferor_units_variance: transferorUnitsVariance,
        transfer_percentage_variance: percentageVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = TransferNoticeReader
