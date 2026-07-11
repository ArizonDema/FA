const { matchPoint, matchTablePoint, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "governance_minutes"
const READER_VERSION = "governance-minutes.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const HEADER_ALIASES = {
  topic: ["topic", "matter", "agenda item", "approval topic", "resolution topic"],
  resolution: ["resolution", "action", "approved action", "approval", "description"],
  status: ["status", "approval status", "result"],
  effective_date: ["effective date", "approval date", "date"],
  amount: ["amount", "approved amount", "value"],
  owner: ["owner", "responsible party", "assigned to"],
  deadline: ["deadline", "due date", "delivery date"],
  notes: ["notes", "comments", "supporting documents"],
}

const GOVERNANCE_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Company"],
    patterns: [
      /\b(?:fund|fund name|entity|company)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "governance_body",
    label: "Governance Body",
    tableLabels: ["Governance Body", "Approving Body", "Committee", "Board", "Body"],
    patterns: [
      /\b(board of directors|board of managers|investment committee|limited partner advisory committee|LPAC|advisory committee|general partner|manager)\b/i,
    ],
    confidence: 0.88,
  },
  {
    key: "meeting_date",
    label: "Meeting / Consent Date",
    tableLabels: ["Meeting Date", "Consent Date", "Date", "Approval Date"],
    patterns: [
      new RegExp(`\\b(?:meeting date|consent date|approval date|dated as of|date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "meeting_type",
    label: "Meeting Type",
    tableLabels: ["Meeting Type", "Consent Type", "Document Type", "Proceeding"],
    patterns: [
      /\b(unanimous written consent|written consent|board meeting|committee meeting|meeting minutes|minutes of meeting|resolutions?)\b/i,
    ],
    confidence: 0.86,
  },
  {
    key: "chairperson",
    label: "Chairperson",
    tableLabels: ["Chair", "Chairperson", "Meeting Chair"],
    patterns: [
      /\b(?:chair|chairperson|meeting chair)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,120})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "meeting_location",
    label: "Meeting Location",
    tableLabels: ["Meeting Location", "Location", "Venue"],
    patterns: [
      /\b(?:meeting location|location|venue)\s*(?:is|:)?\s*([^.\n;]{3,120})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "attendees",
    label: "Attendees",
    tableLabels: ["Attendees", "Present", "Members Present", "Directors Present"],
    patterns: [
      /\b(?:attendees|members present|directors present|present)\s*(?:are|is|:)?\s*([^.\n;]{4,180})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "reporting_period",
    label: "Reporting Period",
    tableLabels: ["Reporting Period", "Period", "Fiscal Period", "Quarter"],
    patterns: [
      /\b(?:reporting period|fiscal period|quarter)\s*(?:is|:)?\s*([^.\n;]{4,120})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "approval_method",
    label: "Approval Method",
    tableLabels: ["Approval Method", "Voting Method", "Consent Method"],
    patterns: [
      /\b(?:approval method|voting method|consent method)\s*(?:is|:)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "dissenting_votes",
    label: "Dissenting Votes",
    tableLabels: ["Dissenting Votes", "Dissent", "Votes Against"],
    patterns: [
      /\b(?:dissenting votes|votes against|dissent)\s*(?:is|:)?\s*([^.\n;]{2,120})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "minutes_preparer",
    label: "Minutes Preparer",
    tableLabels: ["Minutes Preparer", "Secretary", "Prepared By"],
    patterns: [
      /\b(?:minutes preparer|secretary|prepared by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,120})(?:[.;\n]|$)/i,
    ],
    confidence: 0.72,
  },
  {
    key: "quorum",
    label: "Quorum",
    tableLabels: ["Quorum", "Attendance", "Consent"],
    patterns: [
      /\b(quorum[^.\n;]{0,140}(?:present|satisfied)|all (?:directors|members|managers) consented|unanimous consent[^.\n;]{0,120})/i,
    ],
    confidence: 0.82,
  },
]

const APPROVAL_DEFINITIONS = [
  {
    key: "nav_approval",
    label: "NAV / Valuation Approval",
    topic: "NAV / valuation",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:NAV|net asset value|valuation package|valuation)\b/i,
      /\b(?:NAV|net asset value|valuation package|valuation)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "financial_statement_approval",
    label: "Financial Statement Approval",
    topic: "financial statements",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:financial statements?|annual accounts|audited accounts)\b/i,
      /\b(?:financial statements?|annual accounts|audited accounts)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "capital_call_approval",
    label: "Capital Call Approval",
    topic: "capital call",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:capital call|drawdown|capital contribution notice)\b/i,
      /\b(?:capital call|drawdown|capital contribution notice)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "distribution_approval",
    label: "Distribution Approval",
    topic: "distribution",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:distribution|cash distribution|notice of distribution)\b/i,
      /\b(?:distribution|cash distribution|notice of distribution)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "audit_approval",
    label: "Audit / Auditor Approval",
    topic: "audit",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized|appointed)\b[\s\S]{0,160}\b(?:audit report|auditor|audit firm|independent auditor)\b/i,
      /\b(?:audit report|auditor|audit firm|independent auditor)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized|appointed)\b/i,
    ],
  },
  {
    key: "service_provider_approval",
    label: "Service Provider Approval",
    topic: "service provider",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized|appointed)\b[\s\S]{0,160}\b(?:administrator|custodian|service provider|transfer agent|valuation agent)\b/i,
      /\b(?:administrator|custodian|service provider|transfer agent|valuation agent)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized|appointed)\b/i,
    ],
  },
  {
    key: "tax_reporting_approval",
    label: "Tax Reporting Approval",
    topic: "tax reporting",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:tax package|tax reporting|schedule k-1|k-1)\b/i,
      /\b(?:tax package|tax reporting|schedule k-1|k-1)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "valuation_policy_approval",
    label: "Valuation Policy Approval",
    topic: "valuation policy",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:valuation policy|fair value policy|valuation procedures)\b/i,
      /\b(?:valuation policy|fair value policy|valuation procedures)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "subscription_approval",
    label: "Subscription / Admission Approval",
    topic: "subscription / admission",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized|admitted)\b[\s\S]{0,160}\b(?:subscription|admission|new limited partner|new investor)\b/i,
      /\b(?:subscription|admission|new limited partner|new investor)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized|admitted)\b/i,
    ],
  },
  {
    key: "redemption_approval",
    label: "Redemption / Withdrawal Approval",
    topic: "redemption / withdrawal",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:redemption|withdrawal|repurchase)\b/i,
      /\b(?:redemption|withdrawal|repurchase)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "transfer_approval",
    label: "Transfer Approval",
    topic: "transfer",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized|consented)\b[\s\S]{0,160}\b(?:transfer|assignment)\b/i,
      /\b(?:transfer|assignment)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized|consented)\b/i,
    ],
  },
  {
    key: "lpa_amendment_approval",
    label: "LPA Amendment Approval",
    topic: "LPA amendment",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:lpa amendment|amendment to (?:the )?(?:limited partnership agreement|agreement of limited partnership))\b/i,
      /\b(?:lpa amendment|amendment to (?:the )?(?:limited partnership agreement|agreement of limited partnership))\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "side_letter_approval",
    label: "Side Letter Approval",
    topic: "side letter",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:side letter|investor letter agreement|mfn)\b/i,
      /\b(?:side letter|investor letter agreement|mfn)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "expense_approval",
    label: "Expense Approval",
    topic: "expense",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:expense|invoice|fee accrual|accrual)\b/i,
      /\b(?:expense|invoice|fee accrual|accrual)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "conflict_approval",
    label: "Conflict / Related-Party Approval",
    topic: "conflict / related party",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:conflict|related-party|related party|affiliate transaction)\b/i,
      /\b(?:conflict|related-party|related party|affiliate transaction)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "budget_approval",
    label: "Budget Approval",
    topic: "budget",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:budget|operating budget|expense budget)\b/i,
      /\b(?:budget|operating budget|expense budget)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
  {
    key: "borrowing_approval",
    label: "Borrowing / Facility Approval",
    topic: "borrowing / facility",
    patterns: [
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:borrowing|credit facility|loan|subscription line|nav facility)\b/i,
      /\b(?:borrowing|credit facility|loan|subscription line|nav facility)\b[\s\S]{0,160}\b(?:approved|ratified|adopted|authorized)\b/i,
    ],
  },
]

const REPORTING_APPROVAL_KEYS = [
  "nav_approval",
  "valuation_policy_approval",
  "financial_statement_approval",
  "audit_approval",
  "tax_reporting_approval",
]

const CAPITAL_ACTIVITY_APPROVAL_KEYS = [
  "capital_call_approval",
  "distribution_approval",
  "subscription_approval",
  "redemption_approval",
  "transfer_approval",
]

const OPERATING_APPROVAL_KEYS = [
  "service_provider_approval",
  "budget_approval",
  "borrowing_approval",
  "expense_approval",
  "conflict_approval",
  "lpa_amendment_approval",
  "side_letter_approval",
]

function normalizeHeader(value) {
  return singleLine(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function columnMapping(row) {
  const mapping = {}
  row.forEach((cell, index) => {
    const normalized = normalizeHeader(cell)
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      if (mapping[key] === undefined && aliases.map(normalizeHeader).includes(normalized)) mapping[key] = index
    })
  })
  return mapping
}

function selectResolutionTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 25).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["topic", "resolution", "status", "effective_date", "amount"].filter((key) => mapping[key] !== undefined).length
      const hasResolutionShape = mapping.resolution !== undefined || (mapping.topic !== undefined && mapping.status !== undefined)
      if (hasResolutionShape && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
    })
  }
  return best?.score >= 2 ? best : null
}

function cell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function isSummaryRow(row) {
  const label = singleLine((row || []).find((value) => singleLine(value)) || "")
  return /^(?:total|summary|notes?)$/i.test(label)
}

function parseResolutionRows(source) {
  const selected = selectResolutionTable(source.tables)
  if (!selected) return { rows: [], tableMeta: null }
  const { table, headerIndex, mapping } = selected
  const rows = (table.rows || [])
    .slice(headerIndex + 1)
    .filter((row) => !isSummaryRow(row))
    .map((row) => ({
      topic: singleLine(cell(row, mapping, "topic")),
      resolution: singleLine(cell(row, mapping, "resolution")),
      status: singleLine(cell(row, mapping, "status")),
      effective_date: singleLine(cell(row, mapping, "effective_date")),
      amount: singleLine(cell(row, mapping, "amount")),
      owner: singleLine(cell(row, mapping, "owner")),
      deadline: singleLine(cell(row, mapping, "deadline")),
      notes: singleLine(cell(row, mapping, "notes")),
    }))
    .filter((row) => row.topic || row.resolution || row.status)
  return {
    rows,
    tableMeta: { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping },
  }
}

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(?:board minutes|board meeting minutes|meeting minutes|minutes of meeting|unanimous written consent|written consent|board resolutions?|committee resolutions?|lpac minutes|advisory committee minutes|investment committee minutes)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Governance Minutes / Consent",
    sourceReference: match[0],
    confidence: 0.96,
  })
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

function isApproved(row) {
  const combined = singleLine([row.status, row.resolution].filter(Boolean).join(" "))
  if (!combined) return false
  if (/\b(?:rejected|not approved|deferred|tabled|withdrawn)\b/i.test(combined)) return false
  return /\b(?:approved|ratified|adopted|authorized|appointed|resolved)\b/i.test(combined)
}

function approvalPoint(sourceText, resolutionRows, definition) {
  const row = resolutionRows.find((entry) => {
    const combined = [entry.topic, entry.resolution, entry.status].filter(Boolean).join(" ")
    return isApproved(entry) && definition.patterns.some((pattern) => pattern.test(combined))
  })
  if (row) {
    return point({
      key: definition.key,
      label: definition.label,
      value: "Approved",
      valueJson: row,
      sourceReference: [row.topic, row.resolution, row.status].filter(Boolean).join(" | "),
      confidence: 0.9,
    })
  }
  for (const pattern of definition.patterns) {
    const match = String(sourceText || "").match(pattern)
    if (!match) continue
    return point({
      key: definition.key,
      label: definition.label,
      value: "Approved",
      valueJson: { topic: definition.topic },
      sourceReference: match[0],
      confidence: 0.84,
    })
  }
  return null
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function foundSubset(foundKeys, keys) {
  return keys.filter((key) => foundKeys.has(key))
}

function groupPoint({ key, label, foundKeys, keys, confidence = 0.78 }) {
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

class GovernanceMinutesReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = GOVERNANCE_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const { rows: resolutionRows, tableMeta } = parseResolutionRows(source)
    const approvedRows = resolutionRows.filter(isApproved)
    const approvalPoints = APPROVAL_DEFINITIONS.map((definition) => approvalPoint(text, resolutionRows, definition)).filter(Boolean)
    keyPoints.push(...approvalPoints)
    const approvalTopics = uniqueValues([
      ...approvalPoints.map((entry) => APPROVAL_DEFINITIONS.find((definition) => definition.key === entry.point_key)?.topic),
      ...approvedRows.map((row) => row.topic),
    ])
    const approvalKeys = new Set(approvalPoints.map((entry) => entry.point_key))
    const approvalCategoryPoints = [
      groupPoint({ key: "reporting_approvals_detected", label: "Reporting Approvals Detected", foundKeys: approvalKeys, keys: REPORTING_APPROVAL_KEYS }),
      groupPoint({ key: "capital_activity_approvals_detected", label: "Capital Activity Approvals Detected", foundKeys: approvalKeys, keys: CAPITAL_ACTIVITY_APPROVAL_KEYS }),
      groupPoint({ key: "operating_approvals_detected", label: "Operating Approvals Detected", foundKeys: approvalKeys, keys: OPERATING_APPROVAL_KEYS }),
    ].filter(Boolean)
    keyPoints.push(...approvalCategoryPoints)
    keyPoints.push(
      point({
        key: "resolution_count",
        label: "Resolution Count",
        value: resolutionRows.length ? String(resolutionRows.length) : null,
        valueJson: { total: resolutionRows.length, approved: approvedRows.length },
        confidence: 0.88,
      }),
      point({
        key: "approved_actions",
        label: "Approved Actions",
        value: approvedRows.length ? String(approvedRows.length) : null,
        valueJson: approvedRows,
        confidence: 0.9,
      }),
      point({
        key: "governance_approval_topics",
        label: "Governance Approval Topics",
        value: approvalTopics.join(", "),
        valueJson: approvalTopics,
        confidence: 0.84,
      }),
    )

    const finalKeyPoints = keyPoints.filter(Boolean)
    const foundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))
    const missingCore = ["meeting_date", "governance_body"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missingCore.length) {
      issues.push({
        code: "governance_minutes_core_fields_not_detected",
        message: `Review missing governance fields: ${missingCore.join(", ")}.`,
      })
    }
    if (!approvalPoints.length && !approvedRows.length) {
      issues.push({
        code: "governance_minutes_approvals_not_detected",
        message: "No approved reporting, valuation, capital activity, audit, provider, budget, or borrowing actions were detected.",
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: finalKeyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: finalKeyPoints.length
        ? `Extracted ${finalKeyPoints.length} governance approval fact(s) for report context review.`
        : "No standard governance approval facts were detected automatically.",
      confidence: finalKeyPoints.length && !issues.length ? 0.92 : finalKeyPoints.length ? 0.68 : 0.16,
      key_points: finalKeyPoints,
      structured_data_json: {
        ...(tableMeta || {}),
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missingCore,
        approvals_detected: approvalPoints.map((entry) => entry.point_key),
        reporting_approvals: foundSubset(approvalKeys, REPORTING_APPROVAL_KEYS),
        capital_activity_approvals: foundSubset(approvalKeys, CAPITAL_ACTIVITY_APPROVAL_KEYS),
        operating_approvals: foundSubset(approvalKeys, OPERATING_APPROVAL_KEYS),
        resolution_rows: resolutionRows,
        approved_rows: approvedRows,
        approval_topics: approvalTopics,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveText(text), 1200),
    }
  }
}

module.exports = GovernanceMinutesReader
