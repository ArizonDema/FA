const { formatNumber, matchPointFromSource, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "capital_call_notice"
const READER_VERSION = "capital-call-notice.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"

const CAPITAL_CALL_FIELDS = [
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
    tableLabels: ["Notice Reference", "Reference", "Capital Call Number", "Call Number", "Call No."],
    patterns: [/\b(?:notice reference|reference|capital call number|call number|call no\.?)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,40})/i],
    confidence: 0.8,
  },
  {
    key: "notice_date",
    label: "Notice Date",
    tableLabels: ["Notice Date", "Date", "Call Notice Date"],
    patterns: [new RegExp(`\\b(?:notice date|call notice date|date of notice|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "call_period",
    label: "Call Period",
    tableLabels: ["Call Period", "Reporting Period", "Period", "Capital Call Period"],
    patterns: [/\b(?:call period|capital call period|reporting period|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i],
    confidence: 0.78,
  },
  {
    key: "funding_due_date",
    label: "Funding Due Date",
    tableLabels: ["Funding Due Date", "Due Date", "Payment Due Date", "Call Due Date", "Wire Due Date"],
    patterns: [
      new RegExp(`\\b(?:funding due date|due date|payment due date|call due date|wire due date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
      new RegExp(`\\bfunding\\s+(?:is\\s+)?due\\s+(?:on|by)\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.92,
  },
  {
    key: "call_amount",
    label: "Capital Call Amount",
    tableLabels: ["Capital Call Amount", "Call Amount", "Amount Due", "Funding Amount", "Contribution Amount"],
    patterns: [new RegExp(`\\b(?:capital call amount|call amount|amount due|funding amount|contribution amount|capital contribution due)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.95,
  },
  {
    key: "call_percentage",
    label: "Call Percentage",
    tableLabels: ["Call Percentage", "Drawdown %", "Drawdown Percentage", "Percentage of Commitment"],
    patterns: [/\b(?:call percentage|drawdown percentage|percentage of commitment|drawdown)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i],
    confidence: 0.84,
  },
  {
    key: "commitment_amount",
    label: "Commitment Amount",
    tableLabels: ["Commitment Amount", "Capital Commitment", "Investor Commitment"],
    patterns: [new RegExp(`\\b(?:commitment amount|capital commitment|investor commitment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "called_capital_before_call",
    label: "Called Capital Before Call",
    tableLabels: ["Called Capital Before Call", "Prior Called Capital", "Called Capital to Date Before Call"],
    patterns: [new RegExp(`\\b(?:called capital before call|prior called capital|called capital to date before call)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "called_capital_after_call",
    label: "Called Capital After Call",
    tableLabels: ["Called Capital After Call", "Called Capital to Date", "Cumulative Called Capital", "Cumulative Contributions"],
    patterns: [new RegExp(`\\b(?:called capital after call|called capital to date|cumulative called capital|cumulative contributions)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "unfunded_commitment_before_call",
    label: "Unfunded Commitment Before Call",
    tableLabels: ["Unfunded Commitment Before Call", "Beginning Unfunded Commitment", "Prior Unfunded Commitment"],
    patterns: [new RegExp(`\\b(?:unfunded commitment before call|beginning unfunded commitment|prior unfunded commitment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "unfunded_commitment_after_call",
    label: "Unfunded Commitment After Call",
    tableLabels: ["Unfunded Commitment After Call", "Remaining Commitment", "Remaining Unfunded Commitment"],
    patterns: [new RegExp(`\\b(?:unfunded commitment after call|remaining commitment|remaining unfunded commitment)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "investment_funding_amount",
    label: "Investment Funding Amount",
    tableLabels: ["Investment Funding", "Investment Amount", "Portfolio Investment", "Deal Funding"],
    patterns: [new RegExp(`\\b(?:investment funding|investment amount|portfolio investment|deal funding)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "management_fee_amount",
    label: "Management Fee Amount",
    tableLabels: ["Management Fee", "Management Fee Amount"],
    patterns: [new RegExp(`\\b(?:management fee amount|management fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "expense_amount",
    label: "Expense Amount",
    tableLabels: ["Expense Amount", "Fund Expenses", "Organizational Expenses", "Expense Funding"],
    patterns: [new RegExp(`\\b(?:expense amount|fund expenses|organizational expenses|expense funding)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "equalization_interest",
    label: "Equalization Interest",
    tableLabels: ["Equalization Interest", "Equalisation Interest", "Equalization Amount", "True-Up Interest"],
    patterns: [new RegExp(`\\b(?:equalization interest|equalisation interest|equalization amount|true-up interest)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "late_interest",
    label: "Late Interest / Penalty",
    tableLabels: ["Late Interest", "Default Interest", "Late Penalty", "Penalty"],
    patterns: [new RegExp(`\\b(?:late interest|default interest|late penalty|penalty)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "recallable_amount_applied",
    label: "Recallable Amount Applied",
    tableLabels: ["Recallable Amount Applied", "Recallable Capital Applied", "Recycled Capital Applied"],
    patterns: [new RegExp(`\\b(?:recallable amount applied|recallable capital applied|recycled capital applied)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "payment_status",
    label: "Payment Status",
    tableLabels: ["Payment Status", "Funding Status", "Status"],
    patterns: [/\b(?:payment status|funding status|status)\s*(?:is|:)?\s*(paid|funded|unpaid|open|pending|overdue|received|settled)(?:[.;\n]|$)/i],
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
    key: "use_of_proceeds",
    label: "Use of Proceeds",
    tableLabels: ["Purpose", "Use of Proceeds", "Call Purpose", "Use"],
    patterns: [/\b(?:purpose|use of proceeds|call purpose|use)\s*(?:is|:)?\s*([^.\n;]{5,180})/i],
    confidence: 0.82,
  },
]

function noticeIdentity(text) {
  const match = String(text || "").match(/\b(capital call notice|capital call|drawdown notice|capital contribution notice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Capital Call Notice",
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

function drawdownVariance(values) {
  const commitment = parseAmount(values.commitment_amount)
  const percentage = parseNumber(values.call_percentage)
  const amount = parseAmount(values.call_amount)
  if (commitment === null || percentage === null || amount === null) return null
  return commitment * (percentage / 100) - amount
}

function calledCapitalVariance(values) {
  const before = parseAmount(values.called_capital_before_call)
  const call = parseAmount(values.call_amount)
  const after = parseAmount(values.called_capital_after_call)
  if (before === null || call === null || after === null) return null
  return before + call - after
}

function unfundedVariance(values) {
  const before = parseAmount(values.unfunded_commitment_before_call)
  const call = parseAmount(values.call_amount)
  const after = parseAmount(values.unfunded_commitment_after_call)
  if (before === null || call === null || after === null) return null
  return before - call - after
}

function commitmentVariance(values) {
  const commitment = parseAmount(values.commitment_amount)
  const calledAfter = parseAmount(values.called_capital_after_call)
  const unfundedAfter = parseAmount(values.unfunded_commitment_after_call)
  if (commitment === null || calledAfter === null || unfundedAfter === null) return null
  return commitment - calledAfter - unfundedAfter
}

function componentVariance(values) {
  const call = parseAmount(values.call_amount)
  if (call === null) return null
  const componentKeys = [
    "investment_funding_amount",
    "management_fee_amount",
    "expense_amount",
    "equalization_interest",
    "late_interest",
  ]
  let count = 0
  const total = componentKeys.reduce((sum, key) => {
    const value = parseAmount(values[key])
    if (value === null) return sum
    count += 1
    return sum + value
  }, 0)
  const recallableApplied = parseAmount(values.recallable_amount_applied) || 0
  if (!count && !recallableApplied) return null
  return total - recallableApplied - call
}

function reconciliationPoint({ key, label, variance, confidence = 0.88 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(variance, 2)}`,
    valueJson: { variance },
    confidence,
  })
}

class CapitalCallNoticeReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = CAPITAL_CALL_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = noticeIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const callDrawdownVariance = drawdownVariance(values)
    const calledVariance = calledCapitalVariance(values)
    const remainingUnfundedVariance = unfundedVariance(values)
    const commitmentReconciliationVariance = commitmentVariance(values)
    const callComponentVariance = componentVariance(values)
    ;[
      reconciliationPoint({ key: "call_drawdown_reconciliation", label: "Call Drawdown Reconciliation", variance: callDrawdownVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "called_capital_reconciliation", label: "Called Capital Reconciliation", variance: calledVariance, confidence: 0.86 }),
      reconciliationPoint({ key: "unfunded_commitment_reconciliation", label: "Unfunded Commitment Reconciliation", variance: remainingUnfundedVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "commitment_reconciliation", label: "Commitment Reconciliation", variance: commitmentReconciliationVariance, confidence: 0.86 }),
      reconciliationPoint({ key: "call_component_reconciliation", label: "Call Component Reconciliation", variance: callComponentVariance, confidence: 0.84 }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["funding_due_date", "call_amount"].filter((key) => !foundKeys.has(key))
    const wireInstructionsDetected = /\b(?:routing number|aba|iban|swift|bic|beneficiary account|wire instructions|account number)\b/i.test(text)
    const issues = []

    if (missing.length) {
      issues.push({ code: "capital_call_notice_fields_not_detected", message: `Review missing capital-call fields: ${missing.join(", ")}.` })
    }
    if (callDrawdownVariance !== null && Math.abs(callDrawdownVariance) > 0.01) {
      issues.push({ code: "capital_call_drawdown_mismatch", message: `Commitment multiplied by call percentage does not agree to call amount by ${formatNumber(callDrawdownVariance, 2)}.` })
    }
    if (calledVariance !== null && Math.abs(calledVariance) > 0.01) {
      issues.push({ code: "capital_call_called_capital_mismatch", message: `Prior called capital plus call amount does not agree to called capital after call by ${formatNumber(calledVariance, 2)}.` })
    }
    if (remainingUnfundedVariance !== null && Math.abs(remainingUnfundedVariance) > 0.01) {
      issues.push({ code: "capital_call_unfunded_mismatch", message: `Unfunded commitment before call less call amount does not agree to remaining unfunded commitment by ${formatNumber(remainingUnfundedVariance, 2)}.` })
    }
    if (commitmentReconciliationVariance !== null && Math.abs(commitmentReconciliationVariance) > 0.01) {
      issues.push({ code: "capital_call_commitment_mismatch", message: `Called capital after call plus unfunded commitment after call does not agree to commitment by ${formatNumber(commitmentReconciliationVariance, 2)}.` })
    }
    if (callComponentVariance !== null && Math.abs(callComponentVariance) > 0.01) {
      issues.push({ code: "capital_call_component_mismatch", message: `Call purpose components do not agree to call amount by ${formatNumber(callComponentVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} capital-call notice fact(s) for review.`
        : "No standard capital-call notice facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.94 : keyPoints.length ? 0.72 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        wire_instructions_excluded: wireInstructionsDetected,
        call_drawdown_variance: callDrawdownVariance,
        called_capital_variance: calledVariance,
        unfunded_commitment_variance: remainingUnfundedVariance,
        commitment_reconciliation_variance: commitmentReconciliationVariance,
        call_component_variance: callComponentVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = CapitalCallNoticeReader
