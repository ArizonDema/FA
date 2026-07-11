const { matchPointFromSource, point, redactWireInstructions, snippet } = require("./reader.utils")

const READER_KEY = "subscription_agreement"
const READER_VERSION = "subscription-agreement.v2"

const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,.]*(?:\\s*(?:million|billion|m|bn))?)"
const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const SUBSCRIPTION_FIELDS = [
  {
    key: "subscriber_name",
    label: "Subscriber / Investor",
    tableLabels: ["Subscriber", "Subscriber Name", "Investor", "Investor Name", "Subscriber Legal Name", "Legal Name"],
    patterns: [
      /\b(?:subscriber legal name|subscriber name|investor name|legal name)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Issuer"],
    patterns: [
      /\b(?:fund name|partnership|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "commitment_amount",
    label: "Committed Amount",
    tableLabels: ["Committed Amount", "Commitment Amount", "Subscription Amount", "Capital Commitment"],
    patterns: [
      new RegExp(`\\b(?:capital commitment|commitment amount|subscription amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "minimum_commitment",
    label: "Minimum Commitment",
    tableLabels: ["Minimum Commitment", "Minimum Subscription", "Minimum Initial Commitment"],
    patterns: [
      new RegExp(`\\b(?:minimum commitment|minimum subscription|minimum initial commitment)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "interest_class",
    label: "Interest / Share Class",
    tableLabels: ["Interest Class", "Share Class", "Unit Class", "Class of Interests"],
    patterns: [
      /\b(?:interest class|share class|unit class|class of interests)\s*(?:is|:)?\s*([A-Za-z0-9][A-Za-z0-9 -]{0,60})/i,
    ],
  },
  {
    key: "subscription_date",
    label: "Subscription Date",
    tableLabels: ["Subscription Date", "Execution Date", "Executed Date", "Date of Subscription"],
    patterns: [
      new RegExp(`\\b(?:subscription date|executed on|execution date|date of subscription)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
  },
  {
    key: "admission_date",
    label: "Admission / Closing Date",
    tableLabels: ["Admission Date", "Closing Date", "Effective Date", "Subscription Closing Date"],
    patterns: [
      new RegExp(`\\b(?:admission date|closing date|effective date|subscription closing date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "investor_status",
    label: "Investor Eligibility Status",
    tableLabels: ["Investor Status", "Investor Eligibility Status", "Investor Eligibility", "Eligibility"],
    patterns: [
      /\b(accredited investor|qualified purchaser|qualified client|professional investor|eligible counterparty)\b/i,
    ],
    confidence: 0.84,
  },
  {
    key: "subscriber_type",
    label: "Subscriber Type",
    tableLabels: ["Subscriber Type", "Investor Type", "Entity Type", "Investor Category"],
    patterns: [
      /\b(?:subscriber type|investor type|entity type|investor category)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "tax_residency",
    label: "Tax Residency",
    tableLabels: ["Tax Residency", "Tax Residence", "Jurisdiction of Tax Residence", "Tax Jurisdiction"],
    patterns: [
      /\b(?:tax residency|tax residence|jurisdiction of tax residence|tax jurisdiction)\s*(?:is|:)?\s*([A-Za-z][A-Za-z ,'-]{2,100})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "tax_form",
    label: "Tax Form",
    tableLabels: ["Tax Form", "IRS Form", "Withholding Form"],
    patterns: [
      /\b(form\s+(?:W-9|W-8BEN-E|W-8BEN|W-8IMY|W-8EXP|W-8ECI))\b/i,
      /\b(tax form\s+(?:W-9|W-8BEN-E|W-8BEN|W-8IMY|W-8EXP|W-8ECI))\b/i,
    ],
    confidence: 0.84,
  },
  {
    key: "aml_kyc_status",
    label: "AML / KYC Status",
    tableLabels: ["AML/KYC Status", "AML Status", "KYC Status", "AML and KYC"],
    patterns: [
      /\b(?:aml\/kyc status|aml status|kyc status|aml and kyc)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
      /\b(aml\/kyc complete|kyc complete|aml complete|anti-money laundering checks complete)\b/i,
    ],
    confidence: 0.82,
  },
  {
    key: "source_of_funds",
    label: "Source of Funds",
    tableLabels: ["Source of Funds", "Funds Source", "Wealth Source"],
    patterns: [
      /\b(?:source of funds|funds source|source of wealth|wealth source)\s*(?:is|:)?\s*([^.\n;]{3,120})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "erisa_status",
    label: "ERISA / Benefit Plan Status",
    tableLabels: ["ERISA Status", "Benefit Plan Investor", "Plan Assets"],
    patterns: [
      /\b(?:erisa status|benefit plan investor|plan assets?)\s*(?:is|:)?\s*([^.\n;]{2,100})/i,
      /\b(not a benefit plan investor|benefit plan investor)\b/i,
    ],
    confidence: 0.78,
  },
  {
    key: "fatca_crs_status",
    label: "FATCA / CRS Status",
    tableLabels: ["FATCA/CRS Status", "FATCA Status", "CRS Status"],
    patterns: [
      /\b(?:fatca\/crs status|fatca status|crs status)\s*(?:is|:)?\s*([^.\n;]{3,120})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "side_letter",
    label: "Side Letter",
    tableLabels: ["Side Letter", "Side Letter Requested", "Side Letter Election"],
    patterns: [
      /\b(?:side letter requested|side letter election|side letter)\s*(?:is|:)?\s*(yes|no|requested|not requested|executed|none)\b/i,
    ],
    confidence: 0.76,
  },
  {
    key: "placement_agent",
    label: "Placement Agent",
    tableLabels: ["Placement Agent", "Selling Agent", "Intermediary"],
    patterns: [
      /\b(?:placement agent|selling agent|intermediary)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.76,
  },
]

function redactSensitiveText(text) {
  return redactWireInstructions(String(text || ""))
    .replace(
      /\b((?:tax identification number|taxpayer identification number|tax id|tin|ein|ssn|social security number)\s*(?:is|:|#|\|)?\s*)([A-Z0-9-]{4,})/gi,
      "$1[redacted]",
    )
    .replace(/\b\d{2}-\d{7}\b/g, "[redacted tax id]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted tax id]")
}

function sourceSearchText(source = {}) {
  return [
    source.text,
    ...(source.tables || []).map((table) => table.name),
    ...(source.tables || []).flatMap((table) => (table.rows || []).slice(0, 8).map((row) => row.join(" | "))),
  ]
    .filter(Boolean)
    .join("\n")
}

function identityPoint(source) {
  const text = sourceSearchText(source)
  const match = text.match(/\bsubscription agreement\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Subscription Agreement",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function wireInstructionPoint(text) {
  if (!/\b(?:wire instructions?|routing number|routing no\.?|aba|iban|swift|bic|account number|beneficiary bank)\b/i.test(text)) {
    return null
  }
  return point({
    key: "wire_instructions_present",
    label: "Wire Instructions Present",
    value: "Present (details redacted)",
    confidence: 0.72,
  })
}

class SubscriptionAgreementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = SUBSCRIPTION_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const wirePoint = wireInstructionPoint(sourceSearchText(source))
    if (wirePoint) keyPoints.push(wirePoint)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["subscriber_name", "commitment_amount"].filter((key) => !foundKeys.has(key))

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !missing.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} subscription agreement fact(s) for investor onboarding and reporting context review.`
        : "No standard subscription agreement facts were detected automatically.",
      confidence: keyPoints.length ? Math.min(0.94, 0.44 + keyPoints.length * 0.07) : 0.18,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        sensitive_identifiers_excluded: true,
      },
      issues_json: missing.length
        ? [{ code: "subscription_core_fields_not_detected", message: `Review missing subscription fields: ${missing.join(", ")}.` }]
        : [],
      source_text_excerpt: snippet(redactSensitiveText(text), 1200),
    }
  }
}

module.exports = SubscriptionAgreementReader
