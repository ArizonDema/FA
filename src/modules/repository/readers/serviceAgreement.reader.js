const { matchPointFromSource, point, redactWireInstructions, snippet } = require("./reader.utils")

const READER_KEY = "service_agreement"
const READER_VERSION = "service-agreement.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,.]*(?:\\s*(?:per annum|annually|monthly|quarterly))?|[0-9]+(?:\\.[0-9]+)?\\s*%(?:[^.\\n;]*)?)"

const AGREEMENT_FIELDS = [
  {
    key: "agreement_type",
    label: "Agreement Type",
    tableLabels: ["Agreement Type", "Document Type"],
    patterns: [
      /\b(administration agreement|fund administration agreement|custody agreement|investment advisory agreement|depositary agreement|service agreement)\b/i,
    ],
    confidence: 0.86,
  },
  {
    key: "service_provider",
    label: "Service Provider",
    tableLabels: ["Service Provider", "Provider", "Administrator", "Custodian", "Depositary", "Auditor", "Adviser"],
    patterns: [
      /\b(?:service provider|administrator|custodian|depositary|auditor|adviser|provider)\s*(?:is|:|shall mean)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "related_fund",
    label: "Related Fund",
    tableLabels: ["Fund", "Fund Name", "Client", "Partnership"],
    patterns: [
      /\b(?:fund name|related fund|client|partnership)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "service_role",
    label: "Service Role",
    tableLabels: ["Services Provided", "Scope of Services", "Service Role", "Services"],
    patterns: [
      /\b(?:services provided|scope of services|service role)\s*(?:is|:|shall include)?\s*([^.\n;]{4,140})/i,
    ],
  },
  {
    key: "effective_date",
    label: "Effective Date",
    tableLabels: ["Effective Date", "Commencement Date"],
    patterns: [
      new RegExp(`\\b(?:effective date|effective as of|commencement date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
  },
  {
    key: "initial_term",
    label: "Initial Term",
    tableLabels: ["Initial Term", "Term", "Agreement Term"],
    patterns: [
      /\b(?:initial term|agreement term|term)\s*(?:is|:|shall be)?\s*([0-9]+\s*(?:years?|months?)(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "renewal_term",
    label: "Renewal Term",
    tableLabels: ["Renewal Term", "Renewal", "Auto Renewal"],
    patterns: [
      /\b(?:renewal term|auto renewal|renewal)\s*(?:is|:|shall be)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "service_fee",
    label: "Service Fee",
    tableLabels: ["Service Fee", "Administration Fee", "Annual Fee", "Fee Rate"],
    patterns: [
      new RegExp(`\\b(?:administration fee|service fee|annual fee|fee rate)\\s*(?:is|:|shall be)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "fee_basis",
    label: "Fee Basis",
    tableLabels: ["Fee Basis", "Billing Basis", "Fee Schedule"],
    patterns: [
      /\b(?:fee basis|billing basis|fee schedule)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "billing_frequency",
    label: "Billing Frequency",
    tableLabels: ["Billing Frequency", "Invoice Frequency", "Billing Cycle"],
    patterns: [
      /\b(?:billing frequency|invoice frequency|billing cycle)\s*(?:is|:)?\s*((?:monthly|quarterly|annually|annual|semi-annual)[^.\n;]*)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "expense_reimbursement",
    label: "Expense Reimbursement",
    tableLabels: ["Expense Reimbursement", "Reimbursable Expenses", "Out-of-Pocket Expenses"],
    patterns: [
      /\b(?:expense reimbursement|reimbursable expenses|out-of-pocket expenses)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "deliverables",
    label: "Service Deliverables",
    tableLabels: ["Deliverables", "Service Deliverables", "Required Deliverables"],
    patterns: [
      /\b(?:deliverables|service deliverables|required deliverables)\s*(?:include|are|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "nav_frequency",
    label: "NAV / Valuation Frequency",
    tableLabels: ["NAV Frequency", "NAV Calculation", "Valuation Frequency"],
    patterns: [
      /\b(?:nav frequency|nav calculation|valuation frequency)\s*(?:is|:)?\s*((?:monthly|quarterly|annually|annual|semi-annual)[^.\n;]*)/i,
      /\b(?:net asset value|nav)\s*(?:shall be calculated|calculated)?\s*((?:monthly|quarterly|annually|annual|semi-annual)[^.\n;]*)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "financial_reporting_obligation",
    label: "Financial Reporting Obligation",
    tableLabels: ["Financial Reporting", "Reporting Obligation", "Financial Statements"],
    patterns: [
      /\b(?:financial reporting|reporting obligation|financial statements)\s*(?:is|:|shall include)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "tax_reporting_obligation",
    label: "Tax Reporting Obligation",
    tableLabels: ["Tax Reporting", "Tax Reports", "K-1 Support"],
    patterns: [
      /\b(?:tax reporting|tax reports|k-1 support|schedule k-1 support)\s*(?:is|:|shall include)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "books_and_records",
    label: "Books and Records",
    tableLabels: ["Books and Records", "Recordkeeping", "Accounting Records"],
    patterns: [
      /\b(?:books and records|recordkeeping|accounting records)\s*(?:is|:|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "service_level",
    label: "Service Level / Timing",
    tableLabels: ["Service Level", "SLA", "Turnaround Time", "Timeline"],
    patterns: [
      /\b(?:service level|sla|turnaround time|timeline)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "soc_report",
    label: "SOC / Control Report",
    tableLabels: ["SOC Report", "SOC 1", "Control Report", "Internal Controls Report"],
    patterns: [
      /\b(?:soc report|soc 1|soc 2|control report|internal controls report)\s*(?:is|:|shall be)?\s*([^.\n;]{4,160})/i,
      /\b(SOC\s*[12]\s*(?:Type\s*[12])?[^.\n;]*)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "data_security",
    label: "Data Security",
    tableLabels: ["Data Security", "Information Security", "Cybersecurity"],
    patterns: [
      /\b(?:data security|information security|cybersecurity)\s*(?:is|:|shall include)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "confidentiality",
    label: "Confidentiality",
    tableLabels: ["Confidentiality", "Confidential Information"],
    patterns: [
      /\b(?:confidentiality|confidential information)\s*(?:is|:|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "indemnification",
    label: "Indemnification",
    tableLabels: ["Indemnification", "Indemnity"],
    patterns: [
      /\b(?:indemnification|indemnity)\s*(?:is|:|shall be)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "liability_cap",
    label: "Liability Cap",
    tableLabels: ["Liability Cap", "Limitation of Liability", "Liability Limit"],
    patterns: [
      /\b(?:liability cap|limitation of liability|liability limit)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "termination_notice",
    label: "Termination Notice",
    tableLabels: ["Termination Notice", "Notice of Termination"],
    patterns: [
      /\b(?:termination notice|notice of termination|terminated upon)\s*(?:is|:|requires?)?\s*([0-9]+\s*(?:days?|months?)(?:[^.\n;]*)?)/i,
    ],
  },
  {
    key: "termination_for_cause",
    label: "Termination For Cause",
    tableLabels: ["Termination For Cause", "Cause Termination", "Immediate Termination"],
    patterns: [
      /\b(?:termination for cause|cause termination|immediate termination)\s*(?:is|:)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "governing_law",
    label: "Governing Law",
    tableLabels: ["Governing Law", "Law"],
    patterns: [
      /\bgoverning law\s*(?:is|:)?\s*([A-Za-z ]{3,80})/i,
      /\bgoverned by (?:and construed in accordance with )?the laws? of\s+([A-Za-z ]{3,80})/i,
    ],
    confidence: 0.78,
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
  const match = text.match(/\b(?:administration agreement|fund administration agreement|custody agreement|investment advisory agreement|depositary agreement|service agreement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Service Agreement",
    sourceReference: match[0],
    confidence: 0.94,
  })
}

class ServiceAgreementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = AGREEMENT_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["service_provider", "effective_date"].filter((key) => !foundKeys.has(key))

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !missing.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} service agreement term(s) for oversight, fee, reporting, and control context.`
        : "No standard service agreement terms were detected automatically.",
      confidence: keyPoints.length ? Math.min(0.93, 0.4 + keyPoints.length * 0.05) : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
      },
      issues_json: missing.length
        ? [{ code: "service_agreement_fields_not_detected", message: `Review missing service terms: ${missing.join(", ")}.` }]
        : [],
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = ServiceAgreementReader
