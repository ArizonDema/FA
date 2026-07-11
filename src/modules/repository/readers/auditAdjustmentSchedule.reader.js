const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "audit_adjustment_schedule"
const READER_VERSION = "audit-adjustment-schedule.v1"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"

const HEADER_ALIASES = {
  adjustment_id: ["adjustment id", "adjustment #", "adjustment no", "aje", "paje", "reference", "ref"],
  adjustment_type: ["type", "adjustment type", "entry type", "classification"],
  account: ["account", "account name", "gl account", "ledger account", "financial statement line"],
  description: ["description", "adjustment description", "details", "reason", "narrative"],
  debit: ["debit", "debits", "dr"],
  credit: ["credit", "credits", "cr"],
  amount: ["amount", "net amount", "adjustment amount"],
  statement_area: ["statement area", "fs area", "financial statement area", "caption", "assertion area"],
  status: ["status", "posting status", "audit status", "disposition"],
  posted_date: ["posted date", "recorded date", "booking date", "date posted"],
}

const SCHEDULE_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Company"],
    patterns: [/\b(?:fund|fund name|entity|company)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "audit_period",
    label: "Audit Period",
    tableLabels: ["Audit Period", "Period", "Year Ended", "Period End"],
    patterns: [/\b(?:audit period|year ended|period ended|period end|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{6,100})/i],
    confidence: 0.86,
  },
  {
    key: "schedule_date",
    label: "Schedule Date",
    tableLabels: ["Schedule Date", "Prepared Date", "Date"],
    patterns: [new RegExp(`\\b(?:schedule date|prepared date|date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "auditor",
    label: "Auditor",
    tableLabels: ["Auditor", "Audit Firm", "Prepared By"],
    patterns: [/\b(?:auditor|audit firm|prepared by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.8,
  },
]

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9# ]/g, " ").replace(/\s+/g, " ").trim()
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

function selectAdjustmentTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 30).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["adjustment_id", "adjustment_type", "account", "description", "debit", "credit", "amount", "status"].filter((key) => mapping[key] !== undefined).length
      const hasAdjustmentShape = (mapping.debit !== undefined || mapping.credit !== undefined || mapping.amount !== undefined) && (mapping.account !== undefined || mapping.description !== undefined)
      if (hasAdjustmentShape && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
    })
  }
  return best?.score >= 3 ? best : null
}

function cell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function firstTextCell(row) {
  return singleLine((row || []).find((value) => singleLine(value)) || "")
}

function isSummaryLabel(value) {
  return /^(?:grand\s+)?totals?$|^subtotals?$|^net adjustment$|^balance check$/i.test(singleLine(value))
}

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(audit adjustment schedule|proposed audit adjustments?|passed audit adjustments?|summary of audit adjustments?|adjusting entries schedule|reclassification adjustments?|unrecorded adjustments?)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Audit Adjustment Schedule",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function normalizedStatus(value) {
  const status = singleLine(value).toLowerCase()
  if (/\b(?:unposted|unrecorded|passed|waived|proposed|pending|not posted|not recorded)\b/.test(status)) return "unposted"
  if (/\b(?:posted|recorded|booked|accepted|passed to ledger)\b/.test(status)) return "posted"
  return status || "unknown"
}

function parseAdjustmentRow(row, mapping, index) {
  const debit = parseNumber(cell(row, mapping, "debit"))
  const credit = parseNumber(cell(row, mapping, "credit"))
  const amount = parseNumber(cell(row, mapping, "amount"))
  return {
    row_number: index + 1,
    row_label: firstTextCell(row),
    adjustment_id: singleLine(cell(row, mapping, "adjustment_id")),
    adjustment_type: singleLine(cell(row, mapping, "adjustment_type")),
    account: singleLine(cell(row, mapping, "account")),
    description: singleLine(cell(row, mapping, "description")),
    debit: debit === null && amount !== null && amount > 0 ? amount : debit,
    credit: credit === null && amount !== null && amount < 0 ? Math.abs(amount) : credit,
    statement_area: singleLine(cell(row, mapping, "statement_area")),
    status: normalizedStatus(cell(row, mapping, "status")),
    posted_date: singleLine(cell(row, mapping, "posted_date")),
  }
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "unknown"
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function countText(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(", ")
}

function maxAbsRow(rows) {
  return rows
    .map((row) => ({ ...row, absolute_amount: Math.max(Math.abs(row.debit || 0), Math.abs(row.credit || 0)) }))
    .filter((row) => row.absolute_amount > 0)
    .sort((left, right) => right.absolute_amount - left.absolute_amount)[0] || null
}

class AuditAdjustmentScheduleReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = SCHEDULE_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const selected = selectAdjustmentTable(source.tables)

    if (!selected) {
      const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
      return {
        reader_key: READER_KEY,
        reader_version: READER_VERSION,
        status: "partial",
        summary_text: "An audit adjustment schedule table could not be mapped automatically.",
        confidence: keyPoints.length ? 0.3 : 0.16,
        key_points: keyPoints,
        structured_data_json: { extracted_fields: Array.from(foundKeys), table_count: source.tables?.length || 0 },
        issues_json: [{ code: "audit_adjustment_headers_not_found", message: "Identify adjustment reference, account, debit, credit, amount, or status columns manually." }],
        source_text_excerpt: snippet(text, 1200),
      }
    }

    const { table, headerIndex, mapping } = selected
    const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row, index) => parseAdjustmentRow(row, mapping, index))
    const summaryRows = parsedRows.filter((row) => isSummaryLabel(row.adjustment_id || row.account || row.row_label))
    const adjustments = parsedRows
      .filter((row) => !isSummaryLabel(row.adjustment_id || row.account || row.row_label))
      .filter((row) => row.account || row.description || row.debit !== null || row.credit !== null)
    const totalDebits = sumValues(adjustments, "debit")
    const totalCredits = sumValues(adjustments, "credit")
    const debitCreditVariance = totalDebits !== null && totalCredits !== null ? totalDebits - totalCredits : null
    const adjustmentIds = uniqueValues(adjustments, "adjustment_id")
    const accounts = uniqueValues(adjustments, "account")
    const statementAreas = uniqueValues(adjustments, "statement_area")
    const statusCounts = countBy(adjustments, "status")
    const largest = maxAbsRow(adjustments)

    keyPoints.push(
      point({ key: "audit_adjustment_count", label: "Audit Adjustments", value: String(adjustmentIds.length || adjustments.length), valueJson: adjustments, confidence: 0.94 }),
      point({ key: "affected_accounts", label: "Affected Accounts", value: accounts.join(", "), valueJson: accounts, confidence: 0.84 }),
      point({ key: "affected_statement_areas", label: "Affected Statement Areas", value: statementAreas.join(", "), valueJson: statementAreas, confidence: 0.82 }),
      point({ key: "adjustment_status_counts", label: "Adjustment Status Counts", value: countText(statusCounts), valueJson: statusCounts, confidence: 0.84 }),
      point({ key: "posted_adjustments", label: "Posted Adjustments", value: statusCounts.posted === undefined ? null : String(statusCounts.posted), confidence: 0.84 }),
      point({ key: "unposted_adjustments", label: "Unposted / Passed Adjustments", value: statusCounts.unposted === undefined ? null : String(statusCounts.unposted), confidence: 0.84 }),
      point({ key: "total_adjustment_debits", label: "Total Adjustment Debits", value: formatNumber(totalDebits, 2), confidence: 0.9 }),
      point({ key: "total_adjustment_credits", label: "Total Adjustment Credits", value: formatNumber(totalCredits, 2), confidence: 0.9 }),
      point({ key: "largest_adjustment_account", label: "Largest Adjustment Account", value: largest?.account, valueJson: largest, confidence: 0.84 }),
      point({ key: "largest_adjustment_amount", label: "Largest Adjustment Amount", value: largest ? formatNumber(largest.absolute_amount, 2) : null, confidence: 0.84 }),
      point({
        key: "adjustment_balance_reconciliation",
        label: "Adjustment Balance Reconciliation",
        value: debitCreditVariance === null ? null : Math.abs(debitCreditVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(debitCreditVariance, 2)}`,
        confidence: 0.9,
      }),
    )

    const finalKeyPoints = keyPoints.filter(Boolean)
    const foundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))
    const missing = ["audit_period"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (!adjustments.length) {
      issues.push({ code: "audit_adjustment_rows_not_found", message: "No readable audit adjustment rows were detected." })
    }
    if (missing.length) {
      issues.push({ code: "audit_adjustment_core_fields_not_detected", message: `Review missing audit adjustment fields: ${missing.join(", ")}.` })
    }
    if (debitCreditVariance !== null && Math.abs(debitCreditVariance) > 0.01) {
      issues.push({ code: "audit_adjustment_schedule_unbalanced", message: `Adjustment debits differ from credits by ${formatNumber(debitCreditVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: finalKeyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: adjustments.length
        ? `Read ${adjustments.length} audit adjustment row(s) from ${table.name || "the adjustment schedule"}.`
        : "No readable audit adjustment rows were found in the detected schedule.",
      confidence: adjustments.length && !issues.length ? 0.93 : adjustments.length ? 0.7 : 0.18,
      key_points: finalKeyPoints,
      structured_data_json: {
        sheet_name: table.name || null,
        header_row: headerIndex + 1,
        column_mapping: mapping,
        extracted_fields: Array.from(foundKeys),
        adjustments,
        summary_rows: summaryRows.length,
        adjustment_ids: adjustmentIds,
        status_counts: statusCounts,
        totals: {
          debits: totalDebits,
          credits: totalCredits,
          debit_credit_variance: debitCreditVariance,
        },
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = AuditAdjustmentScheduleReader
