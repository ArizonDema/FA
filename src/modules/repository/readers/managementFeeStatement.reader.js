const { formatNumber, matchPointFromSource, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "management_fee_statement"
const READER_VERSION = "management-fee-statement.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"

const MANAGEMENT_FEE_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity", "Issuer"],
    patterns: [
      /\b(?:fund|fund name|partnership|entity|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "investment_manager",
    label: "Investment Manager",
    tableLabels: ["Investment Manager", "Investment Adviser", "Investment Advisor", "Manager", "Management Company"],
    patterns: [
      /\b(?:investment manager|investment adviser|investment advisor|management company|manager)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "fee_period",
    label: "Fee Period",
    tableLabels: ["Fee Period", "Management Fee Period", "Fee Calculation Period", "Billing Period", "Reporting Period", "Period"],
    patterns: [
      /\b(?:fee calculation period|management fee period|fee period|billing period|reporting period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i,
    ],
    confidence: 0.9,
  },
  {
    key: "calculation_date",
    label: "Calculation Date",
    tableLabels: ["Calculation Date", "Statement Date", "Fee Calculation Date", "Date"],
    patterns: [
      new RegExp(`\\b(?:calculation date|statement date|invoice date|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "invoice_date",
    label: "Invoice Date",
    tableLabels: ["Invoice Date", "Invoice Issued Date", "Billing Date"],
    patterns: [
      new RegExp(`\\b(?:invoice date|invoice issued date|billing date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "payment_due_date",
    label: "Payment Due Date",
    tableLabels: ["Payment Due Date", "Due Date", "Fee Due Date", "Payable Date"],
    patterns: [
      new RegExp(`\\b(?:payment due date|fee due date|due date|payable date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
      new RegExp(`\\b(?:payment|fee)\\s+(?:is\\s+)?due\\s+(?:on|by)\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Base Currency", "Currency", "Statement Currency"],
    patterns: [/\b(?:reporting currency|base currency|statement currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?|sterling)/i],
    confidence: 0.82,
  },
  {
    key: "billing_frequency",
    label: "Billing Frequency",
    tableLabels: ["Billing Frequency", "Fee Frequency", "Billing Cycle", "Payment Frequency"],
    patterns: [
      /\b(?:billing frequency|fee frequency|billing cycle|payment frequency)\s*(?:is|:)?\s*(monthly|quarterly|semi-annual|semiannual|annual|annually|yearly)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "period_fraction",
    label: "Fee Period Fraction",
    tableLabels: ["Period Fraction", "Fee Period Fraction", "Proration Factor", "Proration", "Period Factor"],
    patterns: [
      /\b(?:period fraction|fee period fraction|proration factor|proration|period factor)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%?|[0-9]+\/[0-9]+)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "management_fee_rate",
    label: "Management Fee Rate",
    tableLabels: ["Management Fee Rate", "Annual Management Fee Rate", "Fee Rate", "Rate"],
    patterns: [
      /\b(?:management fee rate|annual management fee rate|fee rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:\s*(?:per annum|annual|annually|p\.a\.))?)/i,
    ],
    confidence: 0.92,
  },
  {
    key: "fee_basis",
    label: "Fee Basis",
    tableLabels: ["Fee Basis", "Calculation Basis", "Basis", "Fee Base", "Charge Basis"],
    patterns: [
      /\b(?:fee basis|calculation basis|basis for fee|fee base|charge basis)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.86,
  },
  {
    key: "basis_amount",
    label: "Fee Basis Amount",
    tableLabels: ["Fee Basis Amount", "Basis Amount", "Fee Base Amount", "Committed Capital Base", "NAV Base"],
    patterns: [
      new RegExp(`\\b(?:fee basis amount|basis amount|fee base amount|committed capital base|nav base)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "gross_management_fee",
    label: "Gross Management Fee",
    tableLabels: ["Gross Management Fee", "Management Fee Amount", "Management Fee Before Offsets", "Base Management Fee"],
    patterns: [
      new RegExp(`\\b(?:gross management fee|management fee amount|management fee before offsets|base management fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.93,
  },
  {
    key: "waiver_amount",
    label: "Fee Waiver",
    tableLabels: ["Fee Waiver", "Management Fee Waiver", "Waiver Amount", "Waived Fee"],
    patterns: [
      new RegExp(`\\b(?:fee waiver|management fee waiver|waiver amount|waived fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "total_fee_reductions",
    label: "Total Fee Reductions",
    tableLabels: ["Total Fee Reductions", "Total Offsets", "Total Deductions", "Total Offsets and Waivers"],
    patterns: [
      new RegExp(`\\b(?:total fee reductions|total offsets|total deductions|total offsets and waivers)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "fee_offset",
    label: "Fee Offset",
    tableLabels: ["Fee Offset", "Offset", "Offset Amount", "Placement Fee Offset"],
    patterns: [
      new RegExp(`\\b(?:fee offset|offset amount|placement fee offset)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "transaction_fee_offset",
    label: "Transaction Fee Offset",
    tableLabels: ["Transaction Fee Offset", "Deal Fee Offset", "Monitoring Fee Offset"],
    patterns: [
      new RegExp(`\\b(?:transaction fee offset|deal fee offset|monitoring fee offset)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "expense_offset",
    label: "Expense Offset",
    tableLabels: ["Expense Offset", "Expense Reimbursement Offset", "Fund Expense Offset"],
    patterns: [
      new RegExp(`\\b(?:expense offset|expense reimbursement offset|fund expense offset)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "rebate_amount",
    label: "Rebate Amount",
    tableLabels: ["Rebate", "Rebate Amount", "Investor Rebate", "Class Rebate"],
    patterns: [
      new RegExp(`\\b(?:rebate|rebate amount|investor rebate|class rebate)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "catch_up_adjustment",
    label: "Catch-Up / True-Up Adjustment",
    tableLabels: ["Catch-Up Adjustment", "True-Up Adjustment", "Catch Up Adjustment", "Prior Period Adjustment", "Adjustment"],
    patterns: [
      new RegExp(`\\b(?:catch-up adjustment|catch up adjustment|true-up adjustment|prior period adjustment|adjustment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.8,
  },
  {
    key: "net_management_fee",
    label: "Net Management Fee",
    tableLabels: ["Net Management Fee", "Net Management Fee Due", "Net Fee Due", "Fee Payable", "Amount Due"],
    patterns: [
      new RegExp(`\\b(?:net management fee(?: due)?|net fee due|fee payable|amount due)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.95,
  },
  {
    key: "accrued_management_fee",
    label: "Accrued Management Fee",
    tableLabels: ["Accrued Management Fee", "Fee Accrued", "Accrued Fee"],
    patterns: [
      new RegExp(`\\b(?:accrued management fee|fee accrued|accrued fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "paid_management_fee",
    label: "Paid Management Fee",
    tableLabels: ["Paid Management Fee", "Fee Paid", "Payments", "Amount Paid"],
    patterns: [
      new RegExp(`\\b(?:paid management fee|fee paid|payments|amount paid)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "payable_management_fee",
    label: "Payable Management Fee",
    tableLabels: ["Payable Management Fee", "Management Fee Payable", "Ending Payable", "Outstanding Fee", "Amount Outstanding"],
    patterns: [
      new RegExp(`\\b(?:payable management fee|management fee payable|ending payable|outstanding fee|amount outstanding)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "payment_status",
    label: "Payment Status",
    tableLabels: ["Payment Status", "Status", "Settlement Status"],
    patterns: [
      /\b(?:payment status|settlement status|status)\s*(?:is|:)?\s*(paid|unpaid|open|outstanding|partially paid|settled|pending)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Review Status", "Approved"],
    patterns: [
      /\b(?:approval status|review status|approved)\s*(?:is|:)?\s*(approved|pending|rejected|reviewed|not approved)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approved_by",
    label: "Approved By",
    tableLabels: ["Approved By", "Reviewed By", "Authorized By"],
    patterns: [
      /\b(?:approved by|reviewed by|authorized by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,100})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Review Date", "Authorized Date"],
    patterns: [
      new RegExp(`\\b(?:approval date|review date|authorized date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "investor_class",
    label: "Investor / Share Class",
    tableLabels: ["Investor Class", "Share Class", "Unit Class", "Class", "Series"],
    patterns: [
      /\b(?:investor class|share class|unit class|class|series)\s*(?:is|:)?\s*([A-Za-z0-9 .-]{1,60})(?:[.;\n]|$)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "calculation_method",
    label: "Calculation Method",
    tableLabels: ["Calculation Method", "Method", "Formula", "Calculation"],
    patterns: [
      /\b(?:calculation method|method|formula|calculation)\s*(?:is|:)?\s*([^.\n;]{8,220})/i,
      /\bcalculated as\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "notice_reference",
    label: "Notice Reference",
    tableLabels: ["Notice Reference", "Reference", "Invoice Number", "Invoice No.", "Statement Number"],
    patterns: [
      /\b(?:notice reference|reference|invoice number|invoice no\.?|statement number)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,50})/i,
    ],
    confidence: 0.8,
  },
]

function statementIdentity(text) {
  const match = String(text || "").match(/\b(management fee statement|management fee calculation|management fee invoice|management fee notice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Management Fee Statement",
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

function parseFraction(value) {
  const text = singleLine(value).toLowerCase()
  if (!text) return null
  const fractionMatch = text.match(/\b([0-9]+)\s*\/\s*([0-9]+)\b/)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1])
    const denominator = Number(fractionMatch[2])
    if (denominator) return numerator / denominator
  }
  const monthMatch = text.match(/\b([0-9]+)\s+months?\b/)
  if (monthMatch) return Number(monthMatch[1]) / 12
  const dayMatch = text.match(/\b([0-9]+)\s+days?\b/)
  if (dayMatch) return Number(dayMatch[1]) / 365
  if (/\b(?:monthly|month)\b/.test(text)) return 1 / 12
  if (/\b(?:quarterly|quarter|q[1-4])\b/.test(text)) return 0.25
  if (/\b(?:semi-annual|semiannual|half-year|half year)\b/.test(text)) return 0.5
  if (/\b(?:annual|annually|yearly|per annum|p\.a\.)\b/.test(text)) return 1
  const number = parseNumber(text)
  if (number === null) return null
  if (/%/.test(text)) return number / 100
  return number > 1 ? number / 100 : number
}

function managementFeeRate(value) {
  const rate = parseNumber(value)
  if (rate === null) return null
  return Math.abs(rate) > 1 ? rate / 100 : rate
}

function numberValue(values, ...keys) {
  for (const key of keys) {
    const parsed = parseAmount(values[key])
    if (parsed !== null) return parsed
  }
  return null
}

function sumPresent(values, keys) {
  let count = 0
  const total = keys.reduce((sum, key) => {
    const value = parseAmount(values[key])
    if (value === null) return sum
    count += 1
    return sum + value
  }, 0)
  return count ? total : null
}

function feePeriodFraction(values) {
  return (
    parseFraction(values.period_fraction) ||
    parseFraction(values.billing_frequency) ||
    parseFraction(values.fee_period) ||
    parseFraction(values.calculation_method)
  )
}

function totalReductionAmount(values) {
  const total = parseAmount(values.total_fee_reductions)
  if (total !== null) return total
  return (
    sumPresent(values, ["waiver_amount", "fee_offset", "transaction_fee_offset", "expense_offset", "rebate_amount"]) ||
    0
  )
}

function grossFeeVariance(values) {
  const basis = numberValue(values, "basis_amount")
  const rate = managementFeeRate(values.management_fee_rate)
  const fraction = feePeriodFraction(values)
  const gross = numberValue(values, "gross_management_fee")
  if (basis === null || rate === null || fraction === null || gross === null) return null
  return basis * rate * fraction - gross
}

function netFeeVariance(values) {
  const gross = numberValue(values, "gross_management_fee")
  const net = numberValue(values, "net_management_fee")
  if (gross === null || net === null) return null
  const adjustment = numberValue(values, "catch_up_adjustment") || 0
  return gross - totalReductionAmount(values) + adjustment - net
}

function payableFeeVariance(values) {
  const accrued = numberValue(values, "accrued_management_fee", "net_management_fee")
  const paid = numberValue(values, "paid_management_fee")
  const payable = numberValue(values, "payable_management_fee")
  if (accrued === null || paid === null || payable === null) return null
  return accrued - paid - payable
}

function reconciliationPoint({ key, label, variance, confidence = 0.9 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(variance, 2)}`,
    valueJson: { variance },
    confidence,
  })
}

class ManagementFeeStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = MANAGEMENT_FEE_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = statementIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const grossReconciliationVariance = grossFeeVariance(values)
    const netReconciliationVariance = netFeeVariance(values)
    const payableReconciliationVariance = payableFeeVariance(values)
    ;[
      reconciliationPoint({
        key: "gross_fee_reconciliation",
        label: "Gross Fee Reconciliation",
        variance: grossReconciliationVariance,
        confidence: 0.9,
      }),
      reconciliationPoint({
        key: "net_fee_reconciliation",
        label: "Net Fee Reconciliation",
        variance: netReconciliationVariance,
        confidence: 0.92,
      }),
      reconciliationPoint({
        key: "payable_fee_reconciliation",
        label: "Payable Fee Reconciliation",
        variance: payableReconciliationVariance,
        confidence: 0.88,
      }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missingCore = ["fee_period", "management_fee_rate", "fee_basis", "net_management_fee"].filter((key) => !foundKeys.has(key))
    const issues = []

    if (missingCore.length) {
      issues.push({
        code: "management_fee_statement_fields_not_detected",
        message: `Review missing management fee fields: ${missingCore.join(", ")}.`,
      })
    }
    if (grossReconciliationVariance !== null && Math.abs(grossReconciliationVariance) > 0.01) {
      issues.push({
        code: "management_fee_statement_gross_fee_mismatch",
        message: `Basis, rate, and period fraction do not agree to gross management fee by ${formatNumber(grossReconciliationVariance, 2)}.`,
      })
    }
    if (netReconciliationVariance !== null && Math.abs(netReconciliationVariance) > 0.01) {
      issues.push({
        code: "management_fee_statement_net_fee_mismatch",
        message: `Gross fee less reductions plus adjustments does not agree to net management fee by ${formatNumber(netReconciliationVariance, 2)}.`,
      })
    }
    if (payableReconciliationVariance !== null && Math.abs(payableReconciliationVariance) > 0.01) {
      issues.push({
        code: "management_fee_statement_payable_mismatch",
        message: `Accrued fee less paid fee does not agree to payable management fee by ${formatNumber(payableReconciliationVariance, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} management fee statement fact(s) for review.`
        : "No standard management fee statement facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.94 : keyPoints.length ? 0.72 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missingCore,
        period_fraction: feePeriodFraction(values),
        gross_fee_reconciliation_variance: grossReconciliationVariance,
        net_fee_reconciliation_variance: netReconciliationVariance,
        payable_fee_reconciliation_variance: payableReconciliationVariance,
        reconciliation_variance: netReconciliationVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = ManagementFeeStatementReader
