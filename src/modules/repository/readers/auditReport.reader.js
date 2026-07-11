const { matchPointFromSource, matchTablePoint, point, snippet } = require("./reader.utils")

const READER_KEY = "audit_report"
const READER_VERSION = "audit-report.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const AUDIT_FIELDS = [
  {
    key: "fund_name",
    label: "Audited Fund",
    patterns: [
      /\b(?:financial statements?|audit) of\s+([A-Z][A-Za-z0-9&,' .-]{2,140})\s+for\s+(?:the\s+)?(?:year|period)\s+ended/i,
      /\b(?:fund name|entity|partnership)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    tableLabels: ["Fund", "Fund Name", "Entity", "Partnership", "Audited Entity"],
    confidence: 0.84,
  },
  {
    key: "report_addressee",
    label: "Report Addressee",
    patterns: [
      /\b(?:to the|addressee|addressed to)\s+(partners|shareholders|members|board of directors|general partner|limited partners[^.\n;]{0,80})/i,
    ],
    tableLabels: ["Report Addressee", "Addressee", "Addressed To"],
    confidence: 0.76,
  },
  {
    key: "audited_period",
    label: "Audited Period End",
    patterns: [
      /\b(?:financial statements?|financial position).*?\b(?:year|period)\s+ended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /\b(?:year|period)\s+ended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    ],
    tableLabels: ["Audited Period", "Audited Period End", "Period End", "Year Ended", "Fiscal Year End"],
    confidence: 0.9,
  },
  {
    key: "independent_auditor",
    label: "Independent Auditor",
    patterns: [
      /\b(?:independent auditor|audit firm|auditor)\s*:\s*([A-Z][A-Za-z0-9&,' .-]{2,100})(?:[.;\n]|$)/i,
    ],
    tableLabels: ["Independent Auditor", "Auditor", "Audit Firm"],
    confidence: 0.88,
  },
  {
    key: "auditor_report_date",
    label: "Auditor Report Date",
    patterns: [
      new RegExp(`\\b(?:auditor'?s? report date|report date|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    tableLabels: ["Auditor Report Date", "Report Date", "Date of Report", "Auditor's Report Date"],
    confidence: 0.88,
  },
  {
    key: "auditing_standard",
    label: "Auditing Standard",
    patterns: [
      /\b(International Standards on Auditing|auditing standards generally accepted in the United States of America|PCAOB auditing standards)\b/i,
    ],
    tableLabels: ["Auditing Standard", "Audit Standard", "Basis of Audit", "Audit Basis"],
    confidence: 0.92,
  },
  {
    key: "accounting_framework",
    label: "Accounting Framework",
    patterns: [
      /\b(?:financial statements? (?:are|were) prepared in accordance with|basis of accounting|accounting framework|financial reporting framework)\s*([^.\n;]{4,180})/i,
      /\b(U\.?S\.?\s+GAAP|IFRS|International Financial Reporting Standards|generally accepted accounting principles)\b/i,
    ],
    tableLabels: ["Accounting Framework", "Financial Reporting Framework", "Basis of Accounting", "Basis of Presentation"],
    confidence: 0.82,
  },
  {
    key: "statements_audited",
    label: "Statements Audited",
    patterns: [
      /\bwe have audited\s+([^.\n;]{10,220})/i,
    ],
    tableLabels: ["Statements Audited", "Financial Statements Audited", "Audit Scope"],
    confidence: 0.8,
  },
  {
    key: "management_responsibility",
    label: "Management Responsibility",
    patterns: [
      /\bmanagement is responsible for\s+([^.\n;]{8,220})/i,
    ],
    tableLabels: ["Management Responsibility", "Management Responsibilities"],
    confidence: 0.76,
  },
  {
    key: "auditor_responsibility",
    label: "Auditor Responsibility",
    patterns: [
      /\bour responsibility is to\s+([^.\n;]{8,220})/i,
      /\bauditor'?s responsibility\s*(?:is|:)?\s*([^.\n;]{8,220})/i,
    ],
    tableLabels: ["Auditor Responsibility", "Auditor Responsibilities"],
    confidence: 0.76,
  },
  {
    key: "emphasis_of_matter",
    label: "Emphasis of Matter",
    patterns: [
      /\b(emphasis of matter[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Emphasis of Matter", "Emphasis Matter"],
    confidence: 0.82,
  },
  {
    key: "other_matter",
    label: "Other Matter",
    patterns: [
      /\b(other matter[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Other Matter", "Other Matters"],
    confidence: 0.78,
  },
  {
    key: "material_weakness",
    label: "Material Weakness",
    patterns: [
      /\b(material weakness(?:es)?[^.\n;]{0,220})/i,
      /\b(significant deficiency(?:ies)?[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Material Weakness", "Significant Deficiency", "Internal Control Finding"],
    confidence: 0.86,
  },
  {
    key: "internal_control_scope",
    label: "Internal Control Scope",
    patterns: [
      /\b(we do not express an opinion on internal control|not designed to identify all deficiencies in internal control|internal control over financial reporting[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Internal Control Scope", "Internal Control", "ICFR"],
    confidence: 0.78,
  },
  {
    key: "subsequent_events",
    label: "Subsequent Events",
    patterns: [
      /\b(subsequent events?[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Subsequent Events", "Subsequent Event"],
    confidence: 0.8,
  },
  {
    key: "restatement_disclosure",
    label: "Restatement Disclosure",
    patterns: [
      /\b(restatement|restated financial statements?|prior period adjustment[^.\n;]{0,180})/i,
    ],
    tableLabels: ["Restatement", "Restatement Disclosure", "Prior Period Adjustment"],
    confidence: 0.8,
  },
  {
    key: "related_party_disclosure",
    label: "Related Party Disclosure",
    patterns: [
      /\b(related party transactions?[^.\n;]{0,220}|related parties[^.\n;]{0,220})/i,
    ],
    tableLabels: ["Related Party", "Related Party Disclosure", "Related Party Transactions"],
    confidence: 0.76,
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
  const match = text.match(/\b(?:independent auditor'?s report|independent audit report|audit report)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Audit Report",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

const OPINION_CLASSIFICATIONS = [
  {
    value: "Adverse opinion",
    pattern: /\badverse(?: opinion)?\b/i,
    confidence: 0.97,
  },
  {
    value: "Disclaimer of opinion",
    pattern: /\bdisclaimer(?: of opinion)?\b|\bwe do not express an opinion\b/i,
    confidence: 0.97,
  },
  {
    value: "Qualified opinion",
    pattern: /\bqualified(?: opinion)?\b|\bexcept for the effects? of\b/i,
    confidence: 0.95,
  },
  {
    value: "Unmodified opinion",
    pattern: /\bunmodified(?: opinion)?\b|\bunqualified(?: opinion)?\b|\bpresent fairly, in all material respects\b/i,
    confidence: 0.94,
  },
]

function extractOpinion(source) {
  const text = source.text || ""
  for (const classification of OPINION_CLASSIFICATIONS) {
    const match = text.match(classification.pattern)
    if (match) {
      return point({
        key: "audit_opinion",
        label: "Audit Opinion",
        value: classification.value,
        sourceReference: match[0],
        confidence: classification.confidence,
      })
    }
  }
  const tableOpinion = matchTablePoint(source, {
    key: "audit_opinion",
    label: "Audit Opinion",
    tableLabels: ["Audit Opinion", "Opinion", "Opinion Type", "Independent Auditor Opinion"],
    confidence: 0.9,
  })
  if (!tableOpinion) return null
  const classified = OPINION_CLASSIFICATIONS.find((classification) => classification.pattern.test(tableOpinion.value_text))
  return classified
    ? { ...tableOpinion, value_text: classified.value, confidence: Math.max(tableOpinion.confidence || 0, classified.confidence - 0.03) }
    : tableOpinion
}

function extractReviewFlags(text) {
  const keyPoints = []
  const goingConcern = text.match(/\bsubstantial doubt\b[^.\n]{0,140}\bgoing concern\b|\bmaterial uncertainty\b[^.\n]{0,140}\bgoing concern\b/i)
  if (goingConcern) {
    keyPoints.push(
      point({
        key: "going_concern_warning",
        label: "Going Concern Warning",
        value: "Material uncertainty identified",
        sourceReference: goingConcern[0],
        confidence: 0.96,
      }),
    )
  }
  const keyAuditMatters = text.match(/\bkey audit matters?\b/i)
  if (keyAuditMatters) {
    keyPoints.push(
      point({
        key: "key_audit_matters_section",
        label: "Key Audit Matters",
        value: "Section present",
        sourceReference: keyAuditMatters[0],
        confidence: 0.91,
      }),
    )
  }
  const emphasis = text.match(/\bemphasis of matter\b/i)
  if (emphasis) {
    keyPoints.push(point({
      key: "emphasis_of_matter_section",
      label: "Emphasis of Matter Section",
      value: "Section present",
      sourceReference: emphasis[0],
      confidence: 0.9,
    }))
  }
  const materialWeakness = text.match(/\bmaterial weakness(?:es)?\b|\bsignificant deficiency(?:ies)?\b/i)
  if (materialWeakness) {
    keyPoints.push(point({
      key: "internal_control_warning",
      label: "Internal Control Warning",
      value: "Material weakness or significant deficiency detected",
      sourceReference: materialWeakness[0],
      confidence: 0.9,
    }))
  }
  return keyPoints
}

class AuditReportReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const standardPoints = AUDIT_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const opinion = extractOpinion(source)
    const identity = identityPoint(source)
    const reviewFlags = extractReviewFlags(text)
    const keyPoints = [...(identity ? [identity] : []), ...(opinion ? [opinion] : []), ...standardPoints, ...reviewFlags]
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = [
      !foundKeys.has("audit_opinion") ? "audit opinion" : null,
      !foundKeys.has("audited_period") ? "audited period" : null,
    ].filter(Boolean)

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !missing.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} audit report opinion, scope, accounting, and review flag fact(s).`
        : "No standard audit report facts were detected automatically.",
      confidence: keyPoints.length ? Math.min(0.97, 0.55 + keyPoints.length * 0.045) : 0.2,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        going_concern_warning_detected: foundKeys.has("going_concern_warning"),
        internal_control_warning_detected: foundKeys.has("internal_control_warning") || foundKeys.has("material_weakness"),
        emphasis_of_matter_detected: foundKeys.has("emphasis_of_matter") || foundKeys.has("emphasis_of_matter_section"),
        non_clean_opinion_detected: ["Qualified opinion", "Adverse opinion", "Disclaimer of opinion"].some((value) =>
          keyPoints.some((entry) => entry.point_key === "audit_opinion" && entry.value_text === value),
        ),
        missing_core_fields: missing,
      },
      issues_json: missing.length
        ? [{ code: "audit_report_core_fields_not_found", message: `Review missing audit fields: ${missing.join(", ")}.` }]
        : [],
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = AuditReportReader
