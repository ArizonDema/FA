const { matchPointFromSource, point, snippet } = require("./reader.utils")

const READER_KEY = "lpa"
const READER_VERSION = "lpa.v2"

const DAYS_PATTERN = "([0-9]+\\s*(?:business\\s+)?days?(?:[^.\\n;]*)?)"
const MONTHS_PATTERN = "([0-9]+\\s*(?:calendar\\s+)?months?(?:[^.\\n;]*)?)"
const DATE_OR_DURATION_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2}|[0-9]+\\s*(?:business\\s+)?days?|[0-9]+\\s*(?:calendar\\s+)?months?)"

const LPA_FIELDS = [
  {
    key: "fund_term",
    label: "Fund Term",
    tableLabels: ["Fund Term", "Term of Fund"],
    patterns: [
      /\b(?:term of the fund|fund term|term)\s*(?:is|:|shall be)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
  },
  {
    key: "investment_period",
    label: "Investment Period",
    tableLabels: ["Investment Period", "Commitment Period"],
    patterns: [
      /\b(?:investment|commitment)\s+period\s*(?:is|:|shall be)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
  },
  {
    key: "management_fee",
    label: "Management Fee",
    tableLabels: ["Management Fee", "Management Fee Rate", "Management Fee (%)"],
    patterns: [
      /\bmanagement\s+fee\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.94,
  },
  {
    key: "carried_interest",
    label: "Carried Interest",
    tableLabels: ["Carried Interest", "Carry", "Performance Allocation"],
    patterns: [
      /\b(?:carried interest|carry|performance allocation)\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.94,
  },
  {
    key: "preferred_return",
    label: "Preferred Return / Hurdle",
    tableLabels: ["Preferred Return", "Hurdle", "Hurdle Rate"],
    patterns: [
      /\b(?:preferred return|hurdle rate|hurdle)\s*(?:shall be|is|:|equal to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
      /\b([0-9]+(?:\.[0-9]+)?\s*%)\s*(?:preferred return|hurdle rate|hurdle)\b/i,
    ],
    confidence: 0.9,
  },
  {
    key: "general_partner",
    label: "General Partner",
    tableLabels: ["General Partner", "GP"],
    patterns: [
      /\b(?:general partner|gp)\s*(?:is|:|shall mean)?\s*([A-Z][A-Za-z0-9&,' -]{2,100})(?:[.;\n]|$)/i,
    ],
  },
  {
    key: "governing_law",
    label: "Governing Law",
    tableLabels: ["Governing Law", "Law"],
    patterns: [
      /\bgoverned by (?:and construed in accordance with )?the laws? of\s+([A-Za-z ]{3,60})/i,
      /\bgoverning law\s*:\s*([A-Za-z ]{3,60})/i,
    ],
  },
  {
    key: "audit_requirement",
    label: "Audit Requirement",
    tableLabels: ["Audit Requirement", "Audited Financial Statements"],
    patterns: [
      /\b(?:annual financial statements|financial statements)\s+(?:shall|will)\s+be\s+(audited[^.\n;]*)/i,
      /\b(audited financial statements[^.\n;]*)/i,
    ],
  },
  {
    key: "financial_statement_deadline",
    label: "Financial Statement Deadline",
    tableLabels: ["Financial Statement Deadline", "Annual Financial Statements", "Annual Report Deadline", "Audited Financial Statement Deadline"],
    patterns: [
      new RegExp(`\\b(?:annual financial statements|audited financial statements|annual report)\\s*(?:shall be delivered|must be delivered|are due|due|within)?\\s*${DATE_OR_DURATION_PATTERN}`, "i"),
      /\bwithin\s+([0-9]+\s*(?:business\s+)?days?)\s+after\s+(?:the end of )?(?:each fiscal year|year end|fiscal year end)[^.\n;]*(?:annual financial statements|audited financial statements|annual report)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "quarterly_reporting_deadline",
    label: "Quarterly Reporting Deadline",
    tableLabels: ["Quarterly Reporting Deadline", "Quarterly Financial Statements", "Quarterly Report Deadline"],
    patterns: [
      new RegExp(`\\b(?:quarterly financial statements|quarterly report|quarterly reporting package)\\s*(?:shall be delivered|must be delivered|are due|due|within)?\\s*${DATE_OR_DURATION_PATTERN}`, "i"),
      /\bwithin\s+([0-9]+\s*(?:business\s+)?days?)\s+after\s+(?:the end of )?(?:each fiscal quarter|quarter end)[^.\n;]*(?:quarterly financial statements|quarterly report|quarterly reporting package)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "reporting_frequency",
    label: "Reporting Frequency",
    tableLabels: ["Reporting Frequency", "Investor Reporting", "Reports"],
    patterns: [
      /\b(?:investor reporting|reports to limited partners|financial reporting)\s*(?:shall be|is|:)?\s*((?:monthly|quarterly|semi-annual|annual|annually)[^.\n;]*)/i,
      /\b((?:monthly|quarterly|semi-annual|annual|annually)\s+(?:financial statements|reports|reporting packages?)[^.\n;]*)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "nav_frequency",
    label: "NAV Frequency",
    tableLabels: ["NAV Frequency", "NAV Calculation", "Net Asset Value Frequency"],
    patterns: [
      /\b(?:net asset value|nav)\s*(?:shall be calculated|will be calculated|is calculated|calculated)?\s*((?:monthly|quarterly|semi-annually|annually)[^.\n;]*)/i,
      /\b((?:monthly|quarterly|semi-annually|annually)\s+(?:net asset value|nav)\s+(?:calculation|determination)[^.\n;]*)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "valuation_policy",
    label: "Valuation Policy",
    tableLabels: ["Valuation Policy", "Valuation Standard", "Fair Value Policy"],
    patterns: [
      /\b(?:valuation policy|valuation standard|fair value policy)\s*(?:is|:|shall be)?\s*([^.\n;]{8,180})/i,
      /\b(?:investments|portfolio investments)\s+shall\s+be\s+valued\s+([^.\n;]{8,180})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "capital_call_notice_period",
    label: "Capital Call Notice Period",
    tableLabels: ["Capital Call Notice Period", "Drawdown Notice", "Capital Contribution Notice"],
    patterns: [
      new RegExp(`\\b(?:capital call|drawdown|capital contribution)\\s+notice\\s*(?:period|must be given|shall be given|:)?\\s*${DAYS_PATTERN}`, "i"),
      /\b([0-9]+\s*(?:business\s+)?days?)\s+(?:prior )?notice\s+(?:of|for)\s+(?:a )?(?:capital call|drawdown|capital contribution)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "distribution_notice_period",
    label: "Distribution Notice Period",
    tableLabels: ["Distribution Notice Period", "Distribution Notice"],
    patterns: [
      new RegExp(`\\bdistribution\\s+notice\\s*(?:period|must be given|shall be given|:)?\\s*${DAYS_PATTERN}`, "i"),
      /\b([0-9]+\s*(?:business\s+)?days?)\s+(?:prior )?notice\s+(?:of|for)\s+(?:a )?distribution/i,
    ],
    confidence: 0.8,
  },
  {
    key: "tax_reporting_deadline",
    label: "Tax Reporting Deadline",
    tableLabels: ["Tax Reporting Deadline", "K-1 Deadline", "Schedule K-1 Deadline", "Tax Package Deadline"],
    patterns: [
      new RegExp(`\\b(?:schedule\\s+k-1|k-1|tax package|tax information)\\s*(?:shall be delivered|must be delivered|due|within)?\\s*${DATE_OR_DURATION_PATTERN}`, "i"),
      /\bwithin\s+([0-9]+\s*(?:business\s+)?days?|[0-9]+\s*(?:calendar\s+)?months?)\s+after\s+(?:the end of )?(?:each fiscal year|year end|fiscal year end)[^.\n;]*(?:schedule\s+k-1|tax package|tax information)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "partnership_representative",
    label: "Partnership Representative / Tax Matters Partner",
    tableLabels: ["Partnership Representative", "Tax Matters Partner", "TMP"],
    patterns: [
      /\b(?:partnership representative|tax matters partner|tmp)\s*(?:is|:|shall be)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "transfer_restriction",
    label: "Transfer Restriction",
    tableLabels: ["Transfer Restriction", "Transfers", "Assignment Restriction"],
    patterns: [
      /\b(?:transfer|assignment)s?\s+(?:of|by)\s+(?:a\s+)?(?:limited partner|partnership interest|interest)s?\s+(?:shall|may)\s+([^.\n;]{8,180})/i,
      /\b(?:no|not any)\s+(?:limited partner|partner)\s+may\s+transfer\s+([^.\n;]{8,180})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "lpac_consent",
    label: "LPAC / Advisory Committee Consent",
    tableLabels: ["LPAC Consent", "Advisory Committee Consent", "Limited Partner Advisory Committee"],
    patterns: [
      /\b(?:lpac|limited partner advisory committee|advisory committee)\s+(?:approval|consent|review)\s*(?:is|required|:)?\s*([^.\n;]{6,180})/i,
      /\b([^.\n;]{6,180})\s+requires?\s+(?:the\s+)?(?:lpac|limited partner advisory committee|advisory committee)\s+(?:approval|consent)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "key_person_event",
    label: "Key Person Event",
    tableLabels: ["Key Person Event", "Key Man Event", "Key Person"],
    patterns: [
      /\b(?:key person event|key man event)\s*(?:means|is|:)?\s*([^.\n;]{8,180})/i,
      /\bif\s+(?:a\s+)?key person\s+([^.\n;]{8,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "recycling_right",
    label: "Recycling / Recallable Capital",
    tableLabels: ["Recycling", "Recallable Capital", "Reinvestment"],
    patterns: [
      /\b(?:recycling|recallable capital|reinvestment)\s*(?:is|:|shall be)?\s*([^.\n;]{8,180})/i,
      /\b(?:capital|proceeds|distributions)\s+may\s+be\s+(recycled[^.\n;]{0,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "expense_allocation",
    label: "Fund Expense Allocation",
    tableLabels: ["Fund Expenses", "Expense Allocation", "Organizational Expenses"],
    patterns: [
      /\b(?:fund expenses|organizational expenses|partnership expenses)\s*(?:shall be|are|:)?\s*([^.\n;]{8,180})/i,
      /\b(?:the fund|partnership)\s+shall\s+bear\s+([^.\n;]{8,180}\bexpenses?[^.\n;]*)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "borrowing_limit",
    label: "Borrowing / Leverage Limit",
    tableLabels: ["Borrowing Limit", "Leverage Limit", "Subscription Line Limit"],
    patterns: [
      /\b(?:borrowing|leverage|indebtedness)\s*(?:limit|cap|shall not exceed|:)?\s*([^.\n;]{4,140})/i,
      /\b(?:borrowings|indebtedness)\s+shall\s+not\s+exceed\s+([^.\n;]{4,140})/i,
    ],
    confidence: 0.78,
  },
]

const CORE_EXPECTED_KEYS = ["fund_term", "management_fee", "carried_interest", "preferred_return", "governing_law"]
const REPORTING_CONTEXT_KEYS = [
  "financial_statement_deadline",
  "quarterly_reporting_deadline",
  "reporting_frequency",
  "nav_frequency",
  "valuation_policy",
  "capital_call_notice_period",
  "tax_reporting_deadline",
]

function labelsForMissing(keys, foundKeys) {
  return keys
    .filter((key) => !foundKeys.has(key))
    .map((key) => LPA_FIELDS.find((definition) => definition.key === key)?.label || key)
}

class LpaReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = LPA_FIELDS.map((definition) => matchPointFromSource(source, definition)).filter(Boolean)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missingCore = labelsForMissing(CORE_EXPECTED_KEYS, foundKeys)
    const missingReportingContext = labelsForMissing(REPORTING_CONTEXT_KEYS, foundKeys)
    const heading = text.match(/\b(?:limited partnership agreement|agreement of limited partnership)\b/i)
    if (heading) {
      keyPoints.unshift(
        point({
          key: "document_identity",
          label: "Document Type",
          value: "Limited Partnership Agreement",
          sourceReference: heading[0],
          confidence: 0.98,
        }),
      )
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length ? (missingCore.length ? "partial" : "completed") : "partial",
      summary_text: keyPoints.length
        ? `Identified ${keyPoints.length} LPA terms and reporting-control clauses for review.`
        : "No standard LPA terms could be identified automatically; review the source document.",
      confidence: keyPoints.length ? Math.min(0.98, 0.45 + keyPoints.length * 0.045) : 0.2,
      key_points: keyPoints,
      structured_data_json: {
        extracted_clause_keys: Array.from(foundKeys),
        missing_expected_terms: missingCore,
        missing_reporting_context_terms: missingReportingContext,
      },
      issues_json: missingCore.length
        ? [{ code: "lpa_terms_not_detected", message: `Review missing core terms: ${missingCore.join(", ")}.` }]
        : [],
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = LpaReader
