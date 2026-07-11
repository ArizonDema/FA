const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "bank_reconciliation"
const READER_VERSION = "bank-reconciliation.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"

const HEADER_ALIASES = {
  item_date: ["date", "item date", "transaction date", "check date", "payment date", "deposit date"],
  item_type: ["type", "item type", "reconciling item type", "category", "adjustment type"],
  description: ["description", "details", "reconciling item", "item", "narrative"],
  amount: ["amount", "adjustment amount", "reconciling amount", "value"],
  status: ["status", "cleared status", "reconciliation status"],
  cleared_date: ["cleared date", "clear date", "settlement date", "date cleared"],
}

const RECONCILIATION_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Company"],
    patterns: [/\b(?:fund|fund name|entity|company)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "bank_name",
    label: "Bank",
    tableLabels: ["Bank", "Bank Name", "Financial Institution", "Depository"],
    patterns: [/\b(?:bank|bank name|financial institution|depository)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "account_tail",
    label: "Account Ending",
    tableLabels: ["Account Ending", "Account Ending In", "Account Number", "Account No.", "Account #"],
    patterns: [/\b(?:account (?:number|no\.?)|account)\s*(?:ending (?:in|with)|(?:x{2,}|\*{2,}))\s*([0-9]{4})\b/i],
    confidence: 0.9,
  },
  {
    key: "currency",
    label: "Currency",
    tableLabels: ["Currency", "Account Currency", "Base Currency"],
    patterns: [/\b(?:currency|account currency|base currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
    confidence: 0.8,
  },
  {
    key: "reconciliation_date",
    label: "Reconciliation Date",
    tableLabels: ["Reconciliation Date", "As Of Date", "Bank Reconciliation Date", "Date"],
    patterns: [new RegExp(`\\b(?:reconciliation date|bank reconciliation date|as of date|as of)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "statement_period",
    label: "Statement Period",
    tableLabels: ["Statement Period", "Period", "Bank Statement Period", "Period Covered"],
    patterns: [/\b(?:statement period|bank statement period|period covered|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{6,100})/i],
    confidence: 0.82,
  },
  {
    key: "prepared_by",
    label: "Prepared By",
    tableLabels: ["Prepared By", "Preparer", "Prepared"],
    patterns: [/\b(?:prepared by|preparer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "prepared_date",
    label: "Prepared Date",
    tableLabels: ["Prepared Date", "Date Prepared"],
    patterns: [new RegExp(`\\b(?:prepared date|date prepared)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "reviewed_by",
    label: "Reviewed By",
    tableLabels: ["Reviewed By", "Reviewer", "Approved By"],
    patterns: [/\b(?:reviewed by|reviewer|approved by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "reviewed_date",
    label: "Reviewed Date",
    tableLabels: ["Reviewed Date", "Review Date", "Approved Date"],
    patterns: [new RegExp(`\\b(?:reviewed date|review date|approved date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.76,
  },
  {
    key: "review_status",
    label: "Review Status",
    tableLabels: ["Review Status", "Approval Status"],
    patterns: [/\b(?:review status|approval status)\s*(?:is|:)?\s*(approved|reviewed|pending|rejected|prepared)\b/i],
    confidence: 0.76,
  },
  {
    key: "variance_threshold",
    label: "Variance Threshold",
    tableLabels: ["Variance Threshold", "Tolerance", "Reconciliation Tolerance"],
    patterns: [new RegExp(`\\b(?:variance threshold|tolerance|reconciliation tolerance)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.74,
  },
  {
    key: "bank_balance",
    label: "Bank Statement Balance",
    tableLabels: ["Bank Statement Balance", "Statement Balance", "Bank Balance", "Ending Bank Balance"],
    patterns: [new RegExp(`\\b(?:bank statement balance|statement balance|bank balance|ending bank balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
    numeric: true,
  },
  {
    key: "book_balance",
    label: "Book Balance",
    tableLabels: ["Book Balance", "GL Balance", "General Ledger Balance", "Ledger Balance", "Cash Book Balance"],
    patterns: [new RegExp(`\\b(?:book balance|gl balance|general ledger balance|ledger balance|cash book balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
    numeric: true,
  },
  {
    key: "adjusted_bank_balance",
    label: "Adjusted Bank Balance",
    tableLabels: ["Adjusted Bank Balance", "Reconciled Bank Balance", "Adjusted Statement Balance"],
    patterns: [new RegExp(`\\b(?:adjusted bank balance|reconciled bank balance|adjusted statement balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
    numeric: true,
  },
  {
    key: "adjusted_book_balance",
    label: "Adjusted Book Balance",
    tableLabels: ["Adjusted Book Balance", "Reconciled Book Balance", "Adjusted GL Balance", "Adjusted Ledger Balance"],
    patterns: [new RegExp(`\\b(?:adjusted book balance|reconciled book balance|adjusted gl balance|adjusted ledger balance)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
    numeric: true,
  },
  {
    key: "outstanding_deposits",
    label: "Outstanding Deposits",
    tableLabels: ["Outstanding Deposits", "Deposits In Transit", "Deposit In Transit"],
    patterns: [new RegExp(`\\b(?:outstanding deposits|deposits in transit|deposit in transit)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
    numeric: true,
  },
  {
    key: "outstanding_checks",
    label: "Outstanding Checks / Payments",
    tableLabels: ["Outstanding Checks", "Outstanding Payments", "Unpresented Checks", "Uncleared Payments"],
    patterns: [new RegExp(`\\b(?:outstanding checks|outstanding payments|unpresented checks|uncleared payments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
    numeric: true,
  },
]

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
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

function selectReconcilingItemsTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 30).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["item_type", "description", "amount", "status", "cleared_date"].filter((key) => mapping[key] !== undefined).length
      if (mapping.amount !== undefined && (mapping.item_type !== undefined || mapping.description !== undefined) && (!best || score > best.score)) {
        best = { table, headerIndex: index, mapping, score }
      }
    })
  }
  return best?.score >= 2 ? best : null
}

function cell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function sourcePoint(source, definition) {
  const tablePoint = matchTablePoint(source, definition)
  if (tablePoint && (!definition.numeric || parseNumber(tablePoint.value_text) !== null)) return tablePoint
  const textPoint = matchPoint(source.text || "", definition)
  if (textPoint && (!definition.numeric || parseNumber(textPoint.value_text) !== null)) return textPoint
  return null
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(bank reconciliation|bank reconciliation statement|cash reconciliation|cash account reconciliation|bank rec(?:onciliation)?)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Bank Reconciliation",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function itemBucket(item) {
  const text = `${item.item_type} ${item.description}`.toLowerCase()
  if (/\b(?:deposit|receipt|credit|in transit)\b/.test(text)) return "outstanding_deposits"
  if (/\b(?:check|cheque|payment|wire|debit|withdrawal|unpresented|uncleared)\b/.test(text)) return "outstanding_checks"
  if (/\b(?:fee|charge|bank fee|service charge)\b/.test(text)) return "bank_fees"
  if (/\b(?:interest)\b/.test(text)) return "interest_income"
  return "other"
}

function parseItems(source) {
  const selected = selectReconcilingItemsTable(source.tables)
  if (!selected) return { items: [], tableMeta: null }
  const { table, headerIndex, mapping } = selected
  const items = (table.rows || [])
    .slice(headerIndex + 1)
    .map((row) => ({
      item_date: singleLine(cell(row, mapping, "item_date")),
      item_type: singleLine(cell(row, mapping, "item_type")),
      description: singleLine(cell(row, mapping, "description")),
      amount: parseNumber(cell(row, mapping, "amount")),
      status: singleLine(cell(row, mapping, "status")),
      cleared_date: singleLine(cell(row, mapping, "cleared_date")),
    }))
    .filter((row) => row.item_type || row.description || row.amount !== null)
    .map((row) => ({ ...row, bucket: itemBucket(row) }))
  return {
    items,
    tableMeta: { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping },
  }
}

function itemStatusBucket(item) {
  const text = `${item.status} ${item.cleared_date}`.toLowerCase()
  if (/\b(?:cleared|resolved|matched|posted|complete|completed)\b/.test(text) || item.cleared_date) return "cleared"
  if (/\b(?:pending|open|outstanding|unresolved|uncleared)\b/.test(text)) return "open"
  return "unknown"
}

function parseDate(value) {
  const parsed = Date.parse(singleLine(value))
  return Number.isFinite(parsed) ? new Date(parsed) : null
}

function daysBetween(start, end) {
  if (!start || !end) return null
  const ms = end.getTime() - start.getTime()
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 86400000)
}

function itemAgeDays(item, reconciliationDate) {
  const itemDate = parseDate(item.item_date)
  const asOf = parseDate(reconciliationDate)
  if (!itemDate || !asOf) return null
  return daysBetween(itemDate, asOf)
}

function enrichItemStatuses(items, reconciliationDate) {
  return items.map((item) => {
    const status_bucket = itemStatusBucket(item)
    const age_days = itemAgeDays(item, reconciliationDate)
    return {
      ...item,
      status_bucket,
      age_days,
      stale: status_bucket === "open" && Number.isFinite(age_days) && age_days > 30,
    }
  })
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown"
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function formatCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(", ")
}

function maxAbsItem(items) {
  return items
    .filter((item) => Number.isFinite(item.amount))
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))[0] || null
}

function sumBucket(items, bucket) {
  const values = items.filter((item) => item.bucket === bucket).map((item) => item.amount).filter((value) => Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + Math.abs(value), 0) : null
}

function formatMoney(value, currency) {
  if (!Number.isFinite(value)) return null
  return `${currency ? `${currency} ` : ""}${formatNumber(value, 2)}`
}

function detectCurrency(values) {
  const sourceText = Object.values(values || {}).join(" ")
  const match = sourceText.match(/\b(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i)
  if (match) return match[1].toUpperCase()
  if (/\$/.test(sourceText)) return "USD"
  return null
}

class BankReconciliationReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = RECONCILIATION_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const currency = detectCurrency(values)
    const { items, tableMeta } = parseItems(source)
    const enrichedItems = enrichItemStatuses(items, values.reconciliation_date)
    const statusCounts = countBy(enrichedItems, "status_bucket")
    const bucketCounts = countBy(enrichedItems, "bucket")
    const openItems = enrichedItems.filter((item) => item.status_bucket === "open")
    const clearedItems = enrichedItems.filter((item) => item.status_bucket === "cleared")
    const staleItems = enrichedItems.filter((item) => item.stale)
    const largestItem = maxAbsItem(enrichedItems)
    const itemTotals = {
      outstanding_deposits: sumBucket(enrichedItems, "outstanding_deposits"),
      outstanding_checks: sumBucket(enrichedItems, "outstanding_checks"),
      bank_fees: sumBucket(enrichedItems, "bank_fees"),
      interest_income: sumBucket(enrichedItems, "interest_income"),
      other: sumBucket(enrichedItems, "other"),
    }
    const bankBalance = parseNumber(values.bank_balance)
    const bookBalance = parseNumber(values.book_balance)
    const adjustedBankBalance = parseNumber(values.adjusted_bank_balance)
    const adjustedBookBalance = parseNumber(values.adjusted_book_balance)
    const outstandingDeposits = parseNumber(values.outstanding_deposits) ?? itemTotals.outstanding_deposits
    const outstandingChecks = parseNumber(values.outstanding_checks) ?? itemTotals.outstanding_checks
    const computedAdjustedBank =
      bankBalance === null ? null : bankBalance + (outstandingDeposits || 0) - (outstandingChecks || 0)
    const adjustedBankVariance =
      computedAdjustedBank !== null && adjustedBankBalance !== null ? computedAdjustedBank - adjustedBankBalance : null
    const finalVariance =
      adjustedBookBalance !== null && adjustedBankBalance !== null ? adjustedBookBalance - adjustedBankBalance : null

    if (enrichedItems.length) {
      keyPoints.push(
        point({ key: "reconciling_item_count", label: "Reconciling Items", value: String(enrichedItems.length), valueJson: enrichedItems, confidence: 0.9 }),
        point({ key: "reconciling_item_status_counts", label: "Reconciling Item Status Counts", value: formatCounts(statusCounts), valueJson: statusCounts, confidence: 0.84 }),
        point({ key: "reconciling_item_type_counts", label: "Reconciling Item Type Counts", value: formatCounts(bucketCounts), valueJson: bucketCounts, confidence: 0.82 }),
        point({ key: "open_reconciling_items", label: "Open Reconciling Items", value: String(openItems.length), valueJson: openItems, confidence: 0.84 }),
        point({ key: "cleared_reconciling_items", label: "Cleared Reconciling Items", value: String(clearedItems.length), valueJson: clearedItems, confidence: 0.82 }),
        point({ key: "stale_reconciling_items", label: "Stale Reconciling Items", value: String(staleItems.length), valueJson: staleItems, confidence: 0.82 }),
        point({
          key: "largest_reconciling_item",
          label: "Largest Reconciling Item",
          value: largestItem ? formatMoney(Math.abs(largestItem.amount), currency) : null,
          valueJson: largestItem,
          confidence: 0.84,
        }),
        point({
          key: "largest_reconciling_item_description",
          label: "Largest Reconciling Item Description",
          value: largestItem?.description || largestItem?.item_type,
          confidence: 0.78,
        }),
      )
    }
    if (!values.outstanding_deposits) {
      keyPoints.push(point({ key: "outstanding_deposits", label: "Outstanding Deposits", value: formatMoney(outstandingDeposits, currency), confidence: 0.88 }))
    }
    if (!values.outstanding_checks) {
      keyPoints.push(point({ key: "outstanding_checks", label: "Outstanding Checks / Payments", value: formatMoney(outstandingChecks, currency), confidence: 0.88 }))
    }
    keyPoints.push(
      point({ key: "bank_fees", label: "Bank Fees / Charges", value: formatMoney(itemTotals.bank_fees, currency), confidence: 0.78 }),
      point({ key: "interest_income", label: "Interest Income", value: formatMoney(itemTotals.interest_income, currency), confidence: 0.78 }),
      point({
        key: "adjusted_bank_reconciliation",
        label: "Adjusted Bank Reconciliation",
        value: adjustedBankVariance === null ? null : Math.abs(adjustedBankVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(adjustedBankVariance, 2)}`,
        confidence: 0.9,
      }),
      point({
        key: "book_bank_reconciliation",
        label: "Book to Bank Reconciliation",
        value: finalVariance === null ? null : Math.abs(finalVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(finalVariance, 2)}`,
        confidence: 0.92,
      }),
    )

    const finalKeyPoints = keyPoints.filter(Boolean)
    const foundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))
    const missing = ["reconciliation_date", "bank_balance", "book_balance"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "bank_reconciliation_fields_not_detected", message: `Review missing bank reconciliation fields: ${missing.join(", ")}.` })
    }
    if (adjustedBankVariance !== null && Math.abs(adjustedBankVariance) > 0.01) {
      issues.push({ code: "bank_reconciliation_adjusted_bank_mismatch", message: `Bank balance plus reconciling items differs from adjusted bank balance by ${formatNumber(adjustedBankVariance, 2)}.` })
    }
    if (finalVariance !== null && Math.abs(finalVariance) > 0.01) {
      issues.push({ code: "bank_reconciliation_book_bank_mismatch", message: `Adjusted book balance differs from adjusted bank balance by ${formatNumber(finalVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: finalKeyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: finalKeyPoints.length
        ? `Extracted ${finalKeyPoints.length} bank reconciliation fact(s), review controls, item status summaries, and variance checks.`
        : "No standard bank reconciliation facts were detected automatically.",
      confidence: finalKeyPoints.length && !issues.length ? 0.93 : finalKeyPoints.length ? 0.68 : 0.16,
      key_points: finalKeyPoints,
      structured_data_json: {
        ...(tableMeta || {}),
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        reconciling_items: enrichedItems,
        status_counts: statusCounts,
        bucket_counts: bucketCounts,
        open_item_count: openItems.length,
        stale_item_count: staleItems.length,
        largest_reconciling_item: largestItem,
        item_totals: itemTotals,
        computed_adjusted_bank_balance: computedAdjustedBank,
        adjusted_bank_variance: adjustedBankVariance,
        book_bank_variance: finalVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = BankReconciliationReader
