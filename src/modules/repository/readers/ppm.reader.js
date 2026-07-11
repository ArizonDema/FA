const { matchPointFromSource, point, snippet } = require("./reader.utils")

const READER_KEY = "ppm"
const READER_VERSION = "ppm.v2"

const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,.]*(?:\\s*(?:million|billion|m|bn))?)"
const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const OFFERING_TERMS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Issuer", "Partnership"],
    patterns: [
      /\b(?:fund name|issuer|partnership)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "sponsor",
    label: "Sponsor / Manager",
    tableLabels: ["Sponsor", "Manager", "Investment Manager", "Adviser", "Investment Adviser"],
    patterns: [
      /\b(?:sponsor|manager|investment manager|investment adviser|adviser)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "general_partner",
    label: "General Partner",
    tableLabels: ["General Partner", "GP"],
    patterns: [
      /\b(?:general partner|gp)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "administrator",
    label: "Administrator",
    tableLabels: ["Administrator", "Fund Administrator"],
    patterns: [
      /\b(?:administrator|fund administrator)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "auditor",
    label: "Auditor",
    tableLabels: ["Auditor", "Independent Auditor"],
    patterns: [
      /\b(?:auditor|independent auditor)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "investment_strategy",
    label: "Investment Strategy",
    tableLabels: ["Investment Strategy", "Strategy", "Investment Objective"],
    patterns: [
      /\b(?:investment strategy|strategy|investment objective)\s*(?:is|:)?\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "asset_classes",
    label: "Asset Classes",
    tableLabels: ["Asset Classes", "Asset Class", "Investment Focus", "Target Assets"],
    patterns: [
      /\b(?:asset classes?|investment focus|target assets?)\s*(?:is|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "geographic_focus",
    label: "Geographic Focus",
    tableLabels: ["Geographic Focus", "Geography", "Region"],
    patterns: [
      /\b(?:geographic focus|geography|region)\s*(?:is|:)?\s*([^.\n;]{3,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "target_fund_size",
    label: "Target Fund Size",
    tableLabels: ["Target Fund Size", "Target Commitments", "Fundraising Target"],
    patterns: [
      new RegExp(`\\b(?:target fund size|target commitments|fundraising target)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.91,
  },
  {
    key: "hard_cap",
    label: "Hard Cap",
    tableLabels: ["Hard Cap", "Maximum Offering", "Maximum Fund Size", "Maximum Commitments"],
    patterns: [
      new RegExp(`\\b(?:hard cap|maximum offering|maximum fund size|maximum commitments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "minimum_commitment",
    label: "Minimum Commitment",
    tableLabels: ["Minimum Commitment", "Minimum Subscription", "Minimum Investment", "Minimum Initial Commitment"],
    patterns: [
      new RegExp(`\\b(?:minimum (?:subscription|commitment|investment)|minimum initial commitment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "fund_term",
    label: "Fund Term",
    tableLabels: ["Fund Term", "Term"],
    patterns: [
      /\b(?:fund term|term of the fund|term)\s*(?:is|:)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "investment_period",
    label: "Investment Period",
    tableLabels: ["Investment Period", "Commitment Period"],
    patterns: [
      /\b(?:investment period|commitment period)\s*(?:is|:)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "management_fee",
    label: "Management Fee",
    tableLabels: ["Management Fee", "Management Fee Rate", "Management Fee (%)"],
    patterns: [
      /\bmanagement\s+fee\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.92,
  },
  {
    key: "carried_interest",
    label: "Carried Interest",
    tableLabels: ["Carried Interest", "Carry", "Performance Allocation"],
    patterns: [
      /\b(?:carried interest|carry|performance allocation)\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.92,
  },
  {
    key: "preferred_return",
    label: "Preferred Return / Hurdle",
    tableLabels: ["Preferred Return", "Hurdle", "Hurdle Rate"],
    patterns: [
      /\b(?:preferred return|hurdle rate|hurdle)\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
      /\b([0-9]+(?:\.[0-9]+)?\s*%)\s*(?:preferred return|hurdle rate|hurdle)\b/i,
    ],
    confidence: 0.88,
  },
  {
    key: "final_close",
    label: "Final Closing Date",
    tableLabels: ["Final Closing Date", "Final Close"],
    patterns: [
      new RegExp(`\\b(?:final closing date|final close)\\s*(?:is|:|shall occur on)?\\s*${DATE_PATTERN}`, "i"),
    ],
  },
  {
    key: "initial_close",
    label: "Initial Closing Date",
    tableLabels: ["Initial Closing Date", "Initial Close", "First Closing"],
    patterns: [
      new RegExp(`\\b(?:initial closing date|initial close|first closing)\\s*(?:is|:|shall occur on)?\\s*${DATE_PATTERN}`, "i"),
    ],
  },
  {
    key: "eligible_investors",
    label: "Eligible Investors",
    tableLabels: ["Eligible Investors", "Investor Eligibility", "Eligible Investor Types"],
    patterns: [
      /\b(?:eligible investors?|investor eligibility)\s*(?:is|:|shall be limited to)?\s*([^.\n;]{4,140})/i,
    ],
  },
  {
    key: "reporting_frequency",
    label: "Investor Reporting Frequency",
    tableLabels: ["Reporting Frequency", "Investor Reporting", "Reports"],
    patterns: [
      /\b(?:investor reporting|reports to investors|financial reporting)\s*(?:is|:)?\s*((?:monthly|quarterly|semi-annual|annual|annually)[^.\n;]*)/i,
      /\b((?:monthly|quarterly|semi-annual|annual|annually)\s+(?:reports|reporting packages?|financial statements)[^.\n;]*)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "valuation_frequency",
    label: "Valuation / NAV Frequency",
    tableLabels: ["Valuation Frequency", "NAV Frequency", "Net Asset Value Frequency"],
    patterns: [
      /\b(?:valuation frequency|nav frequency|net asset value frequency)\s*(?:is|:)?\s*((?:monthly|quarterly|semi-annually|annually)[^.\n;]*)/i,
      /\b(?:net asset value|nav)\s*(?:shall be calculated|will be calculated|is calculated|calculated)?\s*((?:monthly|quarterly|semi-annually|annually)[^.\n;]*)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "valuation_policy",
    label: "Valuation Policy",
    tableLabels: ["Valuation Policy", "Valuation Standard", "Fair Value Policy"],
    patterns: [
      /\b(?:valuation policy|valuation standard|fair value policy)\s*(?:is|:)?\s*([^.\n;]{8,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "tax_reporting",
    label: "Tax Reporting",
    tableLabels: ["Tax Reporting", "Tax Reports", "Schedule K-1"],
    patterns: [
      /\b(?:tax reporting|tax reports|schedule\s+k-1|k-1)\s*(?:is|:|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "erisa_limit",
    label: "ERISA / Benefit Plan Limit",
    tableLabels: ["ERISA Limit", "Benefit Plan Investor Limit", "Plan Asset Limit"],
    patterns: [
      /\b(?:erisa limit|benefit plan investor limit|plan asset limit|erisa)\s*(?:is|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "expense_cap",
    label: "Expense Cap / Organizational Expenses",
    tableLabels: ["Expense Cap", "Organizational Expenses", "Offering Expenses"],
    patterns: [
      /\b(?:expense cap|organizational expenses|offering expenses)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "borrowing_limit",
    label: "Borrowing / Leverage Limit",
    tableLabels: ["Borrowing Limit", "Leverage Limit", "Subscription Line Limit"],
    patterns: [
      /\b(?:borrowing limit|leverage limit|subscription line limit|borrowings|leverage)\s*(?:is|:|shall not exceed)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "transfer_restriction",
    label: "Transfer Restriction",
    tableLabels: ["Transfer Restriction", "Transfers", "Transferability"],
    patterns: [
      /\b(?:transfer restriction|transfers|transferability)\s*(?:is|:)?\s*([^.\n;]{8,180})/i,
      /\b(?:interests|shares|units)\s+may\s+not\s+be\s+transferred\s+([^.\n;]{8,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "redemption_liquidity",
    label: "Redemption / Liquidity Terms",
    tableLabels: ["Redemption Terms", "Liquidity", "Withdrawal Rights"],
    patterns: [
      /\b(?:redemption terms|liquidity|withdrawal rights|redemptions)\s*(?:is|:)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "risk_factors",
    label: "Risk Factors",
    tableLabels: ["Risk Factors", "Principal Risks", "Key Risks"],
    patterns: [
      /\b(?:risk factors|principal risks|key risks)\s*(?:include|are|:)?\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.74,
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
  const match = text.match(/\b(?:private placement memorandum|confidential offering memorandum|offering memorandum)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Private Placement Memorandum",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

class PpmReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = OFFERING_TERMS.map((term) => matchPointFromSource(source, term)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const requiredKeys = ["target_fund_size", "minimum_commitment", "management_fee"]
    const missing = requiredKeys.filter((key) => !foundKeys.has(key))

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length >= 3 && !missing.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Identified ${keyPoints.length} private placement offering, reporting, and fund-context term(s) for review.`
        : "No standard PPM offering terms could be identified automatically.",
      confidence: keyPoints.length ? Math.min(0.94, 0.42 + keyPoints.length * 0.045) : 0.18,
      key_points: keyPoints,
      structured_data_json: {
        extracted_term_keys: Array.from(foundKeys),
        missing_core_terms: missing,
      },
      issues_json: missing.length
        ? [{ code: "ppm_core_terms_not_detected", message: `Review missing PPM terms: ${missing.join(", ")}.` }]
        : [],
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = PpmReader
