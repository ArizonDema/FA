const { matchPoint, matchTablePoint, point, redactWireInstructions, snippet } = require("./reader.utils")

const READER_KEY = "lpa_amendment"
const READER_VERSION = "lpa-amendment.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,.]*(?:\\s*(?:million|billion|m|bn))?)"

const AMENDMENT_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity", "Issuer"],
    patterns: [
      /\b(?:fund name|partnership|entity|issuer|fund)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "amendment_number",
    label: "Amendment Number",
    tableLabels: ["Amendment Number", "Amendment No.", "Amendment", "Document"],
    patterns: [
      /\b((?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+amendment)\b/i,
      /\bamendment\s*(?:number|no\.?|#)\s*([A-Za-z0-9 -]{1,40})/i,
    ],
    confidence: 0.9,
  },
  {
    key: "effective_date",
    label: "Effective Date",
    tableLabels: ["Effective Date", "Effective As Of", "Amendment Effective Date"],
    patterns: [
      new RegExp(`\\b(?:effective date|effective as of|with effect from|amendment effective date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "execution_date",
    label: "Execution Date",
    tableLabels: ["Execution Date", "Date", "Dated As Of", "Agreement Date", "Signature Date"],
    patterns: [
      new RegExp(`\\b(?:execution date|dated as of|agreement date|signature date|date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Consent Date", "LP Approval Date", "GP Approval Date"],
    patterns: [
      new RegExp(`\\b(?:approval date|consent date|lp approval date|gp approval date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "amended_agreement_date",
    label: "Amended Agreement Date",
    tableLabels: ["Amended Agreement Date", "Original Agreement Date", "Existing Agreement Date", "LPA Date"],
    patterns: [
      new RegExp(`\\b(?:original agreement date|existing agreement date|amended agreement date|lpa date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "amended_sections",
    label: "Amended Sections",
    tableLabels: ["Amended Sections", "Sections Amended", "Affected Sections", "Clause", "Clauses", "Articles Amended"],
    patterns: [
      /\b(?:amended sections|sections amended|affected sections|clauses amended|articles amended)\s*(?:are|:)?\s*([^.\n;]{4,260})/i,
      /\b((?:section|clause|article)\s+[0-9A-Za-z(). -]+(?:,\s*(?:section|clause|article)\s+[0-9A-Za-z(). -]+)*)\s+(?:is|are)\s+(?:amended|deleted|replaced)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "effective_scope",
    label: "Effective Scope",
    tableLabels: ["Effective Scope", "Scope", "Applies To", "Applicability"],
    patterns: [
      /\b(?:effective scope|scope|applies to|applicability)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "affected_class",
    label: "Affected Class",
    tableLabels: ["Affected Class", "Affected Interest Class", "Share Class", "Class"],
    patterns: [
      /\b(?:affected class|affected interest class|share class|class)\s*(?:is|:)?\s*([A-Za-z0-9][A-Za-z0-9 -]{0,80})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "fund_term",
    label: "Fund Term",
    tableLabels: ["Fund Term", "Term", "Extended Term"],
    patterns: [
      /\b(?:fund term|term of the fund|extended term|extension period)\s*(?:shall be|is|:|extended to)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "investment_period",
    label: "Investment Period",
    tableLabels: ["Investment Period", "Commitment Period"],
    patterns: [
      /\b(?:investment|commitment)\s+period\s*(?:shall be|is|:|extended to|reduced to)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "management_fee",
    label: "Management Fee",
    tableLabels: ["Management Fee", "Management Fee Amendment", "Fee Change", "Revised Management Fee"],
    patterns: [
      /\b(?:management fee|revised management fee|fee change)\s*(?:shall be|is|:|equal to|reduced to|increased to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.94,
  },
  {
    key: "management_fee_waiver",
    label: "Management Fee Waiver",
    tableLabels: ["Management Fee Waiver", "Fee Waiver", "Waiver of Management Fee"],
    patterns: [
      /\b(?:management fee waiver|fee waiver|waiver of management fee)\s*(?:shall be|is|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "carried_interest",
    label: "Carried Interest",
    tableLabels: ["Carried Interest", "Carry", "Performance Allocation", "Incentive Allocation"],
    patterns: [
      /\b(?:carried interest|carry|performance allocation|incentive allocation)\s*(?:shall be|is|:|equal to|reduced to|increased to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.92,
  },
  {
    key: "preferred_return",
    label: "Preferred Return / Hurdle",
    tableLabels: ["Preferred Return", "Hurdle", "Hurdle Rate", "Preferred Return Amendment"],
    patterns: [
      /\b(?:preferred return|hurdle rate|hurdle)\s*(?:shall be|is|:|equal to|reduced to|increased to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.9,
  },
  {
    key: "waterfall_change",
    label: "Waterfall Change",
    tableLabels: ["Waterfall Change", "Distribution Waterfall", "Waterfall"],
    patterns: [
      /\b(?:waterfall change|distribution waterfall|waterfall)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "clawback_or_giveback",
    label: "Clawback / Giveback",
    tableLabels: ["Clawback", "Giveback", "GP Clawback", "Partner Giveback"],
    patterns: [
      /\b(?:clawback|giveback|gp clawback|partner giveback)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,200})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "expense_cap",
    label: "Expense Cap",
    tableLabels: ["Expense Cap", "Operating Expense Cap", "Expense Limitation"],
    patterns: [
      /\b(?:expense cap|operating expense cap|expense limitation)\s*(?:shall be|is|:|equal to)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.84,
  },
  {
    key: "organizational_expenses",
    label: "Organizational Expenses",
    tableLabels: ["Organizational Expenses", "Formation Expenses", "Organizational Expense Cap"],
    patterns: [
      /\b(?:organizational expenses|formation expenses|organizational expense cap)\s*(?:shall be|is|:|limited to)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "reporting_obligation",
    label: "Reporting Obligation",
    tableLabels: ["Reporting Obligation", "Reporting Covenant", "Reports", "Reporting"],
    patterns: [
      /\b(?:reporting obligation|reporting covenant|reports?|enhanced reporting)\s*(?:shall include|shall be|includes?|:)?\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.84,
  },
  {
    key: "financial_statement_deadline",
    label: "Financial Statement Deadline",
    tableLabels: ["Financial Statement Deadline", "Financial Statements", "Annual Financials"],
    patterns: [
      /\b(?:financial statement deadline|financial statements|annual financials)\s*(?:shall be|are|:|delivered)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "tax_reporting_deadline",
    label: "Tax Reporting Deadline",
    tableLabels: ["Tax Reporting Deadline", "Tax Reporting", "K-1 Deadline", "Tax Package Deadline"],
    patterns: [
      /\b(?:tax reporting deadline|tax reporting|k-1 deadline|tax package deadline)\s*(?:shall be|is|:|delivered)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "nav_frequency",
    label: "NAV Frequency",
    tableLabels: ["NAV Frequency", "NAV Reporting", "Valuation Frequency"],
    patterns: [
      /\b(?:nav frequency|nav reporting|valuation frequency)\s*(?:shall be|is|:)?\s*(monthly|quarterly|semi-annual|semiannual|annual|annually|quarterly NAV reporting|monthly NAV reporting)(?:[^.\n;]*)?/i,
    ],
    confidence: 0.78,
  },
  {
    key: "valuation_policy",
    label: "Valuation Policy",
    tableLabels: ["Valuation Policy", "Valuation", "Fair Value Policy"],
    patterns: [
      /\b(?:valuation policy|fair value policy|valuation)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "capital_call_notice_period",
    label: "Capital Call Notice Period",
    tableLabels: ["Capital Call Notice Period", "Capital Call Notice", "Drawdown Notice Period"],
    patterns: [
      /\b(?:capital call notice period|capital call notice|drawdown notice period)\s*(?:shall be|is|:)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "distribution_notice_period",
    label: "Distribution Notice Period",
    tableLabels: ["Distribution Notice Period", "Distribution Notice"],
    patterns: [
      /\b(?:distribution notice period|distribution notice)\s*(?:shall be|is|:)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "capital_call_mechanics",
    label: "Capital Call Mechanics",
    tableLabels: ["Capital Call Mechanics", "Drawdown Mechanics", "Capital Calls"],
    patterns: [
      /\b(?:capital call mechanics|drawdown mechanics|capital calls?)\s*(?:shall be|are|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "recycling_or_reinvestment",
    label: "Recycling / Reinvestment",
    tableLabels: ["Recycling", "Reinvestment", "Recallable Distribution", "Recallable Amount"],
    patterns: [
      /\b(?:recycling|reinvestment|recallable distribution|recallable amount)\s*(?:shall be|is|:|permitted)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "borrowing_limit",
    label: "Borrowing Limit",
    tableLabels: ["Borrowing Limit", "Leverage Limit", "Debt Limit", "Credit Facility"],
    patterns: [
      /\b(?:borrowing limit|leverage limit|debt limit|credit facility)\s*(?:shall be|is|:|limited to)?\s*([^.\n;]{4,180})/i,
      new RegExp(`\\b(?:borrowings?|indebtedness)\\s+(?:shall not exceed|limited to)\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.8,
  },
  {
    key: "transfer_restriction",
    label: "Transfer Restriction",
    tableLabels: ["Transfer Restriction", "Transfers", "Assignment"],
    patterns: [
      /\b(?:transfer restriction|transfers?|assignment)\s*(?:shall be|is|:)?\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "redemption_or_withdrawal",
    label: "Redemption / Withdrawal",
    tableLabels: ["Redemption", "Withdrawal", "Withdrawal Right", "Liquidity Right"],
    patterns: [
      /\b(?:redemption|withdrawal|withdrawal right|liquidity right)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "default_remedy",
    label: "Default Remedy",
    tableLabels: ["Default Remedy", "Default", "Defaulting Partner"],
    patterns: [
      /\b(?:default remedy|defaulting partner|default)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "consent_threshold",
    label: "Consent Threshold",
    tableLabels: ["Consent Threshold", "Required Consent", "Approval Threshold", "LP Consent"],
    patterns: [
      /\b(?:consent threshold|required consent|approval threshold|lp consent)\s*(?:shall be|is|:)?\s*([^.\n;]{4,180})/i,
      /\bconsent of\s+([^.\n;]{4,160}?)\s+(?:is|shall be)\s+required/i,
    ],
    confidence: 0.82,
  },
  {
    key: "consent_status",
    label: "Consent Status",
    tableLabels: ["Consent Status", "Approval Status", "Status"],
    patterns: [
      /\b(?:consent status|approval status|status)\s*(?:is|:)?\s*(approved|pending|rejected|executed|unanimous|majority approved|not obtained)(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approving_parties",
    label: "Approving Parties",
    tableLabels: ["Approving Parties", "Approved By", "Consenting Parties"],
    patterns: [
      /\b(?:approving parties|approved by|consenting parties)\s*(?:are|is|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "lpac_consent",
    label: "LPAC Consent",
    tableLabels: ["LPAC Consent", "Advisory Committee Consent", "LPAC Approval"],
    patterns: [
      /\b(?:lpac consent|advisory committee consent|lpac approval)\s*(?:shall be|is|:)?\s*([^.\n;]{4,180})/i,
      /\b((?:LPAC|limited partner advisory committee|advisory committee)[^.\n;]{0,160}(?:approved|consented|required|approval))\b/i,
    ],
    confidence: 0.8,
  },
  {
    key: "key_person_event",
    label: "Key Person Event",
    tableLabels: ["Key Person Event", "Key Person", "Key Man"],
    patterns: [
      /\b(?:key person event|key person|key man)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,200})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "waiver",
    label: "Waiver",
    tableLabels: ["Waiver", "Waived Requirement", "Waiver Granted"],
    patterns: [
      /\b(?:waiver|waived requirement|waiver granted)\s*(?:shall be|is|:)?\s*([^.\n;]{8,220})/i,
      /\b(?:the\s+)?(?:general partner|manager)\s+(?:waives|waived)\s+([^.\n;]{8,220})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "side_letter_or_mfn",
    label: "Side Letter / MFN Term",
    tableLabels: ["Side Letter", "MFN", "MFN Amendment", "Most Favored Nation"],
    patterns: [
      /\b(?:side letter|mfn|most favored nation|most favoured nation)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "tax_or_regulatory_change",
    label: "Tax / Regulatory Change",
    tableLabels: ["Tax Change", "Regulatory Change", "Tax", "ERISA", "FATCA"],
    patterns: [
      /\b(?:tax change|regulatory change|erisa|fatca|crs)\s*(?:shall be|is|:|amended to)?\s*([^.\n;]{6,220})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "governing_law",
    label: "Governing Law",
    tableLabels: ["Governing Law", "Law"],
    patterns: [
      /\bgoverned by (?:and construed in accordance with )?the laws? of\s+([A-Za-z ]{3,60})/i,
      /\bgoverning law\s*:\s*([A-Za-z ]{3,60})/i,
    ],
    confidence: 0.78,
  },
]

const ECONOMIC_TERM_KEYS = [
  "management_fee",
  "management_fee_waiver",
  "carried_interest",
  "preferred_return",
  "waterfall_change",
  "clawback_or_giveback",
  "expense_cap",
  "organizational_expenses",
]

const REPORTING_TERM_KEYS = [
  "reporting_obligation",
  "financial_statement_deadline",
  "tax_reporting_deadline",
  "nav_frequency",
  "valuation_policy",
]

const GOVERNANCE_TERM_KEYS = [
  "consent_threshold",
  "consent_status",
  "approving_parties",
  "lpac_consent",
  "key_person_event",
  "waiver",
  "side_letter_or_mfn",
  "tax_or_regulatory_change",
]

const OPERATING_TERM_KEYS = [
  "fund_term",
  "investment_period",
  "capital_call_notice_period",
  "distribution_notice_period",
  "capital_call_mechanics",
  "recycling_or_reinvestment",
  "borrowing_limit",
  "default_remedy",
]

const LIQUIDITY_TERM_KEYS = [
  "transfer_restriction",
  "redemption_or_withdrawal",
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

function redactSensitiveText(text) {
  return redactWireInstructions(String(text || ""))
    .replace(
      /\b((?:tax identification number|taxpayer identification number|tax id|tin|ein|ssn|social security number)\s*(?:is|:|#|\|)?\s*)([A-Z0-9-]{4,})/gi,
      "$1[redacted]",
    )
    .replace(/\b\d{2}-\d{7}\b/g, "[redacted tax id]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted tax id]")
}

function amendmentIdentity(source) {
  const text = sourceSearchText(source)
  const match = text.match(/\b(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+)?amendment to (?:the )?(?:amended and restated )?(?:limited partnership agreement|agreement of limited partnership)\b|\blpa amendment\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "LPA Amendment",
    sourceReference: match[0],
    confidence: 0.98,
  })
}

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function foundSubset(foundKeys, keys) {
  return keys.filter((key) => foundKeys.has(key))
}

function groupPoint({ key, label, foundKeys, keys, confidence = 0.76 }) {
  const found = foundSubset(foundKeys, keys)
  if (!found.length) return null
  return point({
    key,
    label,
    value: found.join(", "),
    valueJson: found,
    confidence,
  })
}

function amendedSectionCountPoint(amendedSections) {
  const matches = String(amendedSections || "").match(/\b(?:section|clause|article)\s+[0-9A-Za-z().-]+/gi)
  if (!matches?.length) return null
  return point({
    key: "amended_section_count",
    label: "Amended Section Count",
    value: String(new Set(matches.map((match) => match.toLowerCase())).size),
    confidence: 0.78,
  })
}

class LpaAmendmentReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = AMENDMENT_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = amendmentIdentity(source)
    if (identity) keyPoints.unshift(identity)

    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const sectionCount = amendedSectionCountPoint(values.amended_sections)
    if (sectionCount) keyPoints.push(sectionCount)

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const economicTerms = foundSubset(foundKeys, ECONOMIC_TERM_KEYS)
    const reportingTerms = foundSubset(foundKeys, REPORTING_TERM_KEYS)
    const governanceTerms = foundSubset(foundKeys, GOVERNANCE_TERM_KEYS)
    const operatingTerms = foundSubset(foundKeys, OPERATING_TERM_KEYS)
    const liquidityTerms = foundSubset(foundKeys, LIQUIDITY_TERM_KEYS)
    const groupPoints = [
      groupPoint({ key: "economic_terms_changed", label: "Economic Terms Changed", foundKeys, keys: ECONOMIC_TERM_KEYS }),
      groupPoint({ key: "reporting_terms_changed", label: "Reporting Terms Changed", foundKeys, keys: REPORTING_TERM_KEYS }),
      groupPoint({ key: "governance_terms_changed", label: "Governance Terms Changed", foundKeys, keys: GOVERNANCE_TERM_KEYS }),
      groupPoint({ key: "operating_terms_changed", label: "Operating Terms Changed", foundKeys, keys: OPERATING_TERM_KEYS }),
      groupPoint({ key: "liquidity_terms_changed", label: "Liquidity Terms Changed", foundKeys, keys: LIQUIDITY_TERM_KEYS }),
    ].filter(Boolean)
    keyPoints.push(...groupPoints)

    const finalFoundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missingCore = ["effective_date", "amended_sections"].filter((key) => !finalFoundKeys.has(key))
    const changedTermKeys = [
      ...economicTerms,
      ...reportingTerms,
      ...governanceTerms,
      ...operatingTerms,
      ...liquidityTerms,
    ]
    const issues = []

    if (missingCore.length) {
      issues.push({
        code: "lpa_amendment_core_fields_not_detected",
        message: `Review missing LPA amendment fields: ${missingCore.join(", ")}.`,
      })
    }
    if (!changedTermKeys.length) {
      issues.push({
        code: "lpa_amendment_changed_terms_not_detected",
        message: "No amended economic, reporting, consent, operating, waiver, or transfer terms were detected.",
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} LPA amendment fact(s) for governing-term, reporting, consent, and operating review.`
        : "No standard LPA amendment facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? Math.min(0.94, 0.4 + keyPoints.length * 0.05) : keyPoints.length ? 0.68 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(finalFoundKeys),
        missing_core_fields: missingCore,
        changed_term_keys: changedTermKeys,
        economic_terms: economicTerms,
        reporting_terms: reportingTerms,
        governance_terms: governanceTerms,
        operating_terms: operatingTerms,
        liquidity_terms: liquidityTerms,
        sensitive_identifiers_excluded: true,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveText(text), 1200),
    }
  }
}

module.exports = LpaAmendmentReader
