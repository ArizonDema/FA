const { matchPointFromSource, point, redactWireInstructions, snippet } = require("./reader.utils")

const READER_KEY = "side_letter"
const READER_VERSION = "side-letter.v2"

const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,.]*(?:\\s*(?:million|billion|m|bn))?)"
const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const SIDE_LETTER_FIELDS = [
  {
    key: "investor_name",
    label: "Investor",
    tableLabels: ["Investor", "Investor Name", "Limited Partner", "LP", "Addressee", "Investor Legal Name"],
    patterns: [
      /\b(?:investor legal name|investor name|limited partner|lp|addressee)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
      /\binvestor\s*:\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
      /\bthis side letter is entered into with\s+([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "investor_type",
    label: "Investor Type",
    tableLabels: ["Investor Type", "Entity Type", "Investor Category", "LP Type"],
    patterns: [
      /\b(?:investor type|entity type|investor category|lp type)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "investor_domicile",
    label: "Investor Domicile / Jurisdiction",
    tableLabels: ["Investor Domicile", "Jurisdiction", "Investor Jurisdiction", "Domicile"],
    patterns: [
      /\b(?:investor domicile|investor jurisdiction|domicile|jurisdiction)\s*(?:is|:)?\s*([A-Za-z][A-Za-z ,'-]{2,90})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "effective_date",
    label: "Effective Date",
    tableLabels: ["Effective Date", "Date", "Side Letter Date", "Effective As Of"],
    patterns: [
      new RegExp(`\\b(?:effective date|effective as of|dated as of|side letter date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "execution_date",
    label: "Execution Date",
    tableLabels: ["Execution Date", "Executed Date", "Signature Date"],
    patterns: [
      new RegExp(`\\b(?:execution date|executed date|signature date|executed on)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "related_fund",
    label: "Related Fund",
    tableLabels: ["Fund", "Related Fund", "Applicable Fund", "Partnership", "Issuer"],
    patterns: [
      /\b(?:related fund|applicable fund|fund|partnership|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "interest_class",
    label: "Interest / Share Class",
    tableLabels: ["Interest Class", "Share Class", "Class", "Unit Class", "Class of Interests"],
    patterns: [
      /\b(?:interest class|share class|unit class|class of interests|class)\s*(?:is|:)?\s*([A-Za-z0-9][A-Za-z0-9 -]{0,60})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "commitment_amount",
    label: "Commitment Amount",
    tableLabels: ["Commitment Amount", "Capital Commitment", "Investor Commitment"],
    patterns: [
      new RegExp(`\\b(?:commitment amount|capital commitment|investor commitment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "minimum_commitment_override",
    label: "Minimum Commitment Override",
    tableLabels: ["Minimum Commitment Override", "Minimum Commitment", "Minimum Subscription"],
    patterns: [
      new RegExp(`\\b(?:minimum commitment override|minimum commitment|minimum subscription)\\s*(?:is|:|waived to|reduced to)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.76,
  },
  {
    key: "management_fee",
    label: "Management Fee / Fee Break",
    tableLabels: ["Management Fee", "Fee Break", "Fee Discount", "Reduced Management Fee", "Management Fee Rate"],
    patterns: [
      /\b(?:management fee|fee break|fee discount|reduced management fee|management fee rate)\s*(?:shall be|is|:|equal to|reduced to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
      /\breduced\s+(?:management\s+)?fee\s+of\s+([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.92,
  },
  {
    key: "management_fee_waiver",
    label: "Management Fee Waiver",
    tableLabels: ["Management Fee Waiver", "Fee Waiver", "Waiver"],
    patterns: [
      /\b(?:management fee waiver|fee waiver|waiver)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
      /\b((?:waives?|waived)\s+[^.\n;]{0,120}(?:management fee|fees?))/i,
    ],
    confidence: 0.82,
  },
  {
    key: "expense_cap",
    label: "Expense Cap",
    tableLabels: ["Expense Cap", "Expense Limitation", "Expense Cap Amount"],
    patterns: [
      /\b(?:expense cap|expense limitation)\s*(?:is|:|shall be|limited to)?\s*([^.\n;]{3,160})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "organizational_expense_waiver",
    label: "Organizational Expense Waiver",
    tableLabels: ["Organizational Expense Waiver", "Organizational Expenses", "Formation Expenses"],
    patterns: [
      /\b(?:organizational expense waiver|organizational expenses|formation expenses)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "carried_interest",
    label: "Carry / Incentive Override",
    tableLabels: ["Carried Interest", "Carry", "Incentive Allocation", "Performance Allocation"],
    patterns: [
      /\b(?:carried interest|carry|incentive allocation|performance allocation)\s*(?:shall be|is|:|equal to|reduced to)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.9,
  },
  {
    key: "rebate_or_offset",
    label: "Rebate / Offset",
    tableLabels: ["Rebate", "Offset", "Fee Offset", "Rebate or Offset"],
    patterns: [
      /\b(?:rebate|offset|fee offset|rebate or offset)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "mfn_rights",
    label: "MFN Rights",
    tableLabels: ["MFN", "MFN Rights", "Most Favored Nation", "Most Favoured Nation"],
    patterns: [
      /\b((?:most favored nation|most favoured nation|MFN)[^.\n;]{0,180})/i,
    ],
    confidence: 0.88,
  },
  {
    key: "mfn_election_period",
    label: "MFN Election Period",
    tableLabels: ["MFN Election Period", "MFN Election", "MFN Notice Period"],
    patterns: [
      /\b(?:mfn election period|mfn election|mfn notice period)\s*(?:is|:|shall be)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "reporting_obligation",
    label: "Reporting Obligation",
    tableLabels: ["Reporting Obligation", "Enhanced Reporting", "Reporting Requirement", "Reports", "Investor Reporting"],
    patterns: [
      /\b(?:enhanced reporting|reporting obligation|reporting requirement|investor reporting|reports?)\s*(?:shall include|includes?|:|shall be)?\s*([^.\n;]{8,200})/i,
    ],
    confidence: 0.86,
  },
  {
    key: "reporting_frequency",
    label: "Reporting Frequency",
    tableLabels: ["Reporting Frequency", "Report Frequency", "Frequency"],
    patterns: [
      /\b(monthly|quarterly|semi-annual|semiannual|annual)\s+(?:reporting|reports?)\b/i,
      /\breports?\s+(?:shall be\s+)?(?:provided|delivered)\s+(monthly|quarterly|semi-annually|semiannually|annually)\b/i,
    ],
    confidence: 0.84,
  },
  {
    key: "tax_reporting_obligation",
    label: "Tax Reporting Obligation",
    tableLabels: ["Tax Reporting", "Tax Reports", "K-1 Reporting", "Tax Package"],
    patterns: [
      /\b(?:tax reporting|tax reports|k-1 reporting|tax package)\s*(?:is|:|shall include|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "transparency_reporting",
    label: "Transparency / Look-Through Reporting",
    tableLabels: ["Transparency Reporting", "Look-Through Reporting", "Portfolio Transparency"],
    patterns: [
      /\b(?:transparency reporting|look-through reporting|portfolio transparency)\s*(?:is|:|shall include|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "esg_reporting",
    label: "ESG Reporting",
    tableLabels: ["ESG Reporting", "ESG", "Responsible Investment Reporting"],
    patterns: [
      /\b(?:esg reporting|responsible investment reporting|esg)\s*(?:is|:|shall include|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "advisory_committee_right",
    label: "Advisory Committee / LPAC Right",
    tableLabels: ["Advisory Committee Right", "LPAC Right", "LPAC Seat", "Advisory Committee Seat"],
    patterns: [
      /\b(?:advisory committee right|lpac right|lpac seat|advisory committee seat)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
      /\b((?:LPAC|limited partner advisory committee|advisory committee)[^.\n;]{0,180}(?:seat|observer|member|right))\b/i,
    ],
    confidence: 0.82,
  },
  {
    key: "observer_right",
    label: "Observer Right",
    tableLabels: ["Observer Right", "Observer Seat", "Board Observer"],
    patterns: [
      /\b(?:observer right|observer seat|board observer)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "consent_right",
    label: "Consent Right",
    tableLabels: ["Consent Right", "Investor Consent", "Approval Right"],
    patterns: [
      /\b(?:consent right|investor consent|approval right)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
      /\b((?:requires?|subject to)\s+[^.\n;]{0,140}(?:investor consent|consent of the investor|approval of the investor))\b/i,
    ],
    confidence: 0.8,
  },
  {
    key: "excuse_right",
    label: "Excuse Right",
    tableLabels: ["Excuse Right", "Excusal Right", "Investment Excuse"],
    patterns: [
      /\b(?:excuse right|excusal right|investment excuse)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
      /\b((?:may|shall)\s+be\s+excused\s+from\s+[^.\n;]{6,160})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "transfer_rights",
    label: "Transfer Rights",
    tableLabels: ["Transfer Rights", "Transfer Restriction", "Transfer Consent"],
    patterns: [
      /\b(?:transfer rights|transfer restriction|transfer consent)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
      /\b((?:transfer|assignment)\s+[^.\n;]{0,160}(?:permitted|consent|approval|restriction))\b/i,
    ],
    confidence: 0.8,
  },
  {
    key: "withdrawal_or_liquidity_right",
    label: "Withdrawal / Liquidity Right",
    tableLabels: ["Withdrawal Right", "Liquidity Right", "Redemption Right", "Withdrawal"],
    patterns: [
      /\b(?:withdrawal right|liquidity right|redemption right|withdrawal)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "co_investment_right",
    label: "Co-Investment Right",
    tableLabels: ["Co-Investment Right", "Co-Investment", "Co Investment"],
    patterns: [
      /\b(?:co-investment right|co-investment|co investment)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "key_person_right",
    label: "Key Person Right",
    tableLabels: ["Key Person Right", "Key Person", "Key Person Event"],
    patterns: [
      /\b(?:key person right|key person event|key person)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "most_restrictive_term",
    label: "Most Restrictive Term",
    tableLabels: ["Most Restrictive Term", "Restrictive Term", "Restriction"],
    patterns: [
      /\b(?:most restrictive term|restrictive term|restriction)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "confidentiality_obligation",
    label: "Confidentiality",
    tableLabels: ["Confidentiality", "Confidentiality Obligation", "Confidential Information"],
    patterns: [
      /\b(confidentiality[^.\n;]{0,180}|confidential information[^.\n;]{0,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "publicity_restriction",
    label: "Publicity Restriction",
    tableLabels: ["Publicity Restriction", "Name Use", "Use of Name"],
    patterns: [
      /\b(?:publicity restriction|name use|use of name)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
      /\b((?:may not|shall not)\s+[^.\n;]{0,120}(?:use|publish|disclose)[^.\n;]{0,80}(?:name|identity))\b/i,
    ],
    confidence: 0.76,
  },
  {
    key: "aml_kyc_status",
    label: "AML / KYC Status",
    tableLabels: ["AML/KYC Status", "AML Status", "KYC Status", "AML and KYC"],
    patterns: [
      /\b(?:aml\/kyc status|aml status|kyc status|aml and kyc)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
      /\b(aml\/kyc complete|kyc complete|aml complete|anti-money laundering checks complete)\b/i,
    ],
    confidence: 0.78,
  },
  {
    key: "erisa_plan_asset_right",
    label: "ERISA / Plan Asset Term",
    tableLabels: ["ERISA", "Plan Assets", "Benefit Plan Investor", "ERISA Term"],
    patterns: [
      /\b(?:erisa|plan assets?|benefit plan investor)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "fatca_crs_obligation",
    label: "FATCA / CRS Obligation",
    tableLabels: ["FATCA/CRS", "FATCA", "CRS", "FATCA CRS Obligation"],
    patterns: [
      /\b(?:fatca\/crs|fatca|crs)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "notice_delivery",
    label: "Notice Delivery",
    tableLabels: ["Notice Delivery", "Notices", "Notice Method"],
    patterns: [
      /\b(?:notice delivery|notices|notice method)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "term",
    label: "Term",
    tableLabels: ["Term", "Duration"],
    patterns: [
      /\b(?:term|duration)\s*(?:is|:|shall be)?\s*([^.\n;]{3,120})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "termination",
    label: "Termination",
    tableLabels: ["Termination", "Termination Right", "Termination Notice"],
    patterns: [
      /\b(?:termination|termination right|termination notice)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "amendment_waiver",
    label: "Amendment / Waiver",
    tableLabels: ["Amendment", "Waiver", "Amendment and Waiver"],
    patterns: [
      /\b(?:amendment and waiver|amendment|waiver)\s*(?:is|:|shall be)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "governing_law",
    label: "Governing Law",
    tableLabels: ["Governing Law", "Law"],
    patterns: [
      /\b(?:governing law|law)\s*(?:is|:)?\s*([A-Za-z][A-Za-z ,'-]{2,80})/i,
    ],
    confidence: 0.76,
  },
]

const ECONOMICS_FIELDS = [
  "commitment_amount",
  "minimum_commitment_override",
  "management_fee",
  "management_fee_waiver",
  "expense_cap",
  "organizational_expense_waiver",
  "carried_interest",
  "rebate_or_offset",
]

const REPORTING_FIELDS = [
  "reporting_obligation",
  "reporting_frequency",
  "tax_reporting_obligation",
  "transparency_reporting",
  "esg_reporting",
]

const RIGHTS_FIELDS = [
  "mfn_rights",
  "mfn_election_period",
  "advisory_committee_right",
  "observer_right",
  "consent_right",
  "excuse_right",
  "transfer_rights",
  "withdrawal_or_liquidity_right",
  "co_investment_right",
  "key_person_right",
]

const COMPLIANCE_FIELDS = [
  "confidentiality_obligation",
  "publicity_restriction",
  "aml_kyc_status",
  "erisa_plan_asset_right",
  "fatca_crs_obligation",
  "notice_delivery",
  "termination",
  "amendment_waiver",
  "governing_law",
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

function identityPoint(source) {
  const text = sourceSearchText(source)
  const match = text.match(/\b(side letter|investor letter agreement|letter agreement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Side Letter",
    sourceReference: match[0],
    confidence: 0.96,
  })
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

class SideLetterReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = SIDE_LETTER_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const economics = foundSubset(foundKeys, ECONOMICS_FIELDS)
    const reporting = foundSubset(foundKeys, REPORTING_FIELDS)
    const rights = foundSubset(foundKeys, RIGHTS_FIELDS)
    const compliance = foundSubset(foundKeys, COMPLIANCE_FIELDS)
    const groupPoints = [
      groupPoint({ key: "economics_terms_detected", label: "Economics Terms Detected", foundKeys, keys: ECONOMICS_FIELDS }),
      groupPoint({ key: "reporting_terms_detected", label: "Reporting Terms Detected", foundKeys, keys: REPORTING_FIELDS }),
      groupPoint({ key: "investor_rights_detected", label: "Investor Rights Detected", foundKeys, keys: RIGHTS_FIELDS }),
      groupPoint({ key: "compliance_terms_detected", label: "Compliance Terms Detected", foundKeys, keys: COMPLIANCE_FIELDS }),
    ].filter(Boolean)
    keyPoints.push(...groupPoints)

    const finalFoundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["investor_name", "effective_date", "related_fund"].filter((key) => !finalFoundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "side_letter_fields_not_detected", message: `Review missing side-letter fields: ${missing.join(", ")}.` })
    }
    if (![economics.length, reporting.length, rights.length, compliance.length].some((count) => count > 0)) {
      issues.push({
        code: "side_letter_substantive_terms_not_detected",
        message: "Review side letter manually because no economics, reporting, rights, or compliance terms were detected.",
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} side-letter investor context, economics, rights, reporting, and compliance fact(s) for review.`
        : "No standard side-letter facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? Math.min(0.94, 0.38 + keyPoints.length * 0.055) : keyPoints.length ? 0.66 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(finalFoundKeys),
        missing_core_fields: missing,
        economics_fields: economics,
        reporting_fields: reporting,
        investor_right_fields: rights,
        compliance_fields: compliance,
        sensitive_identifiers_excluded: true,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveText(text), 1200),
    }
  }
}

module.exports = SideLetterReader
