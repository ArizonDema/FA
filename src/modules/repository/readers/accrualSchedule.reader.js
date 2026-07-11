const { formatNumber, matchPointFromSource, parseNumber, point, redactSensitiveIdentifiers, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "accrual_schedule"
const READER_VERSION = "accrual-schedule.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"

const HEADER_ALIASES = {
  vendor_name: ["vendor", "vendor name", "service provider", "provider", "payee", "supplier"],
  expense_category: ["expense category", "category", "expense type", "account", "gl account"],
  service_period: ["service period", "period", "accrual period", "billing period"],
  invoice_number: ["invoice number", "invoice no", "invoice #", "reference", "ref"],
  invoice_date: ["invoice date", "accrual date", "date"],
  invoice_received_date: ["invoice received date", "received date", "invoice received"],
  due_date: ["due date", "payment due date", "payable date"],
  payment_date: ["payment date", "paid date", "settlement date"],
  reversal_date: ["reversal date", "reversal period", "reverse date", "reversing date"],
  amount: ["amount", "accrued amount", "accrual amount", "payable amount", "expense amount"],
  currency: ["currency", "ccy"],
  status: ["status", "payment status", "accrual status"],
  approval_status: ["approval status", "approved", "review status"],
  reviewed_by: ["reviewed by", "approved by", "reviewer", "approver"],
  gl_account: ["gl account", "g l account", "account", "account code", "expense account"],
  cost_center: ["cost center", "cost centre", "department", "project", "allocation"],
  accrual_basis: ["accrual basis", "basis", "estimate basis", "support"],
}

const ACCRUAL_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Client", "Entity"],
    patterns: [/\b(?:fund|fund name|client|entity)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "accrual_period",
    label: "Accrual Period",
    tableLabels: ["Accrual Period", "Reporting Period", "Service Period", "Billing Period", "Period"],
    patterns: [/\b(?:accrual period|reporting period|service period|billing period|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i],
    confidence: 0.88,
  },
  {
    key: "reporting_date",
    label: "Reporting Date",
    tableLabels: ["Reporting Date", "As Of Date", "Schedule Date", "Date"],
    patterns: [new RegExp(`\\b(?:reporting date|as of date|schedule date|as of)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "total_accrued_expenses",
    label: "Total Accrued Expenses",
    tableLabels: ["Total Accrued Expenses", "Total Accruals", "Accrued Expenses", "Accrual Total"],
    patterns: [new RegExp(`\\b(?:total accrued expenses|total accruals|accrued expenses|accrual total)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "total_payables",
    label: "Total Payables",
    tableLabels: ["Total Payables", "Accounts Payable", "Payables Total", "Total Accounts Payable"],
    patterns: [new RegExp(`\\b(?:total payables|accounts payable|payables total|total accounts payable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Base Currency"],
    patterns: [/\b(?:reporting currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
    confidence: 0.8,
  },
  {
    key: "prepared_by",
    label: "Prepared By",
    tableLabels: ["Prepared By", "Owner", "Controller", "Prepared"],
    patterns: [/\b(?:prepared by|owner|controller|prepared)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,120})(?:[.;\n]|$)/i],
    confidence: 0.74,
  },
  {
    key: "reviewed_by",
    label: "Reviewed By",
    tableLabels: ["Reviewed By", "Reviewer", "Approved By", "Approver"],
    patterns: [/\b(?:reviewed by|reviewer|approved by|approver)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,120})(?:[.;\n]|$)/i],
    confidence: 0.74,
  },
  {
    key: "review_date",
    label: "Review Date",
    tableLabels: ["Review Date", "Reviewed Date", "Approval Date", "Approved Date"],
    patterns: [new RegExp(`\\b(?:review date|reviewed date|approval date|approved date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.74,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Review Status", "Status"],
    patterns: [/\b(?:approval status|review status|status)\s*(?:is|:)?\s*(approved|pending approval|reviewed|in review|rejected|posted)(?:[.;\n]|$)/i],
    confidence: 0.74,
  },
  {
    key: "accrual_basis",
    label: "Accrual Basis",
    tableLabels: ["Accrual Basis", "Estimate Basis", "Basis", "Support"],
    patterns: [/\b(?:accrual basis|estimate basis|basis|support)\s*(?:is|:)?\s*([^.\n;]{4,160})/i],
    confidence: 0.72,
  },
]

function normalizeHeader(value) {
  return singleLine(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9#% ]/g, " ")
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

function selectAccrualTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 30).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = Object.keys(HEADER_ALIASES).filter((key) => mapping[key] !== undefined).length
      const hasAccrualShape = mapping.amount !== undefined && (
        mapping.vendor_name !== undefined ||
        mapping.expense_category !== undefined ||
        mapping.service_period !== undefined ||
        mapping.due_date !== undefined ||
        mapping.status !== undefined
      )
      if (hasAccrualShape && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
    })
  }
  return best?.score >= 2 ? best : null
}

function cell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function firstTextCell(row) {
  return singleLine((row || []).find((value) => singleLine(value)) || "")
}

function isSummaryLabel(value) {
  return /^(?:grand\s+)?totals?$|^subtotals?$|^total accrued expenses?$|^total accruals?$|^accrual total$|^payables? total$|^total payables?$/i.test(singleLine(value))
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function sumBy(rows, groupKey, amountKey) {
  return rows.reduce((totals, row) => {
    if (!row[groupKey] || !Number.isFinite(row[amountKey])) return totals
    totals[row[groupKey]] = (totals[row[groupKey]] || 0) + row[amountKey]
    return totals
  }, {})
}

function maxByValue(rows, key) {
  return rows
    .filter((row) => Number.isFinite(row[key]))
    .sort((left, right) => right[key] - left[key])[0] || null
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
}

function countValues(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key]
    if (!value) return counts
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function countLabel(counts) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")
}

function isOpenStatus(value) {
  const status = singleLine(value).toLowerCase()
  if (!status) return true
  if (/\b(?:unpaid|open|accrued|pending|approved|payable|partially paid|pending approval)\b/i.test(status)) return true
  if (/\b(?:paid|settled|closed|cancelled|canceled|reversed|void)\b/i.test(status)) return false
  return true
}

function numberDifference(left, right) {
  if (left === null || right === null) return 0
  return Math.abs(Number(left) - Number(right))
}

function formatMoney(value, currency) {
  if (!Number.isFinite(value)) return null
  return `${currency ? `${currency} ` : ""}${formatNumber(value, 2)}`
}

function parseDateValue(value) {
  const text = singleLine(value)
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const slash = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    return Date.UTC(Number(slash[3]), month - 1, day)
  }
  const parsed = Date.parse(`${text} UTC`)
  return Number.isFinite(parsed) ? parsed : null
}

function daysBetween(start, end) {
  if (start === null || end === null) return null
  return Math.floor((end - start) / 86400000)
}

function agingBucket(daysPastDue) {
  if (daysPastDue === null) return null
  if (daysPastDue <= 0) return "Not due"
  if (daysPastDue <= 30) return "1-30 days"
  if (daysPastDue <= 60) return "31-60 days"
  if (daysPastDue <= 90) return "61-90 days"
  return "90+ days"
}

function hasInvoiceReference(value) {
  const normalized = singleLine(value).toLowerCase()
  return Boolean(normalized) && !/^(?:n\/?a|none|tbd|pending|estimate)$/i.test(normalized)
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(?:expense accrual schedule|accrual schedule|payables schedule|accrued expenses schedule|accounts payable schedule)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Accrual Schedule",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function detectCurrency(values, items) {
  const sourceText = [
    ...Object.values(values || {}),
    ...items.flatMap((item) => [item.currency, item.amount_raw]),
  ].join(" ")
  const match = sourceText.match(/\b(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i)
  if (match) return match[1].toUpperCase()
  if (/\$/.test(sourceText)) return "USD"
  return null
}

function firstAmount(rows) {
  const row = rows.find((entry) => Number.isFinite(entry.amount))
  return row ? row.amount : null
}

function mappedRow(row, mapping, reportingDate) {
  const dueDate = singleLine(cell(row, mapping, "due_date"))
  const daysPastDue = daysBetween(parseDateValue(dueDate), reportingDate)
  return {
    row_label: firstTextCell(row),
    vendor_name: singleLine(cell(row, mapping, "vendor_name")),
    expense_category: singleLine(cell(row, mapping, "expense_category")),
    service_period: singleLine(cell(row, mapping, "service_period")),
    invoice_number: singleLine(cell(row, mapping, "invoice_number")),
    invoice_date: singleLine(cell(row, mapping, "invoice_date")),
    invoice_received_date: singleLine(cell(row, mapping, "invoice_received_date")),
    due_date: dueDate,
    payment_date: singleLine(cell(row, mapping, "payment_date")),
    reversal_date: singleLine(cell(row, mapping, "reversal_date")),
    amount_raw: singleLine(cell(row, mapping, "amount")),
    amount: parseNumber(cell(row, mapping, "amount")),
    currency: singleLine(cell(row, mapping, "currency")),
    status: singleLine(cell(row, mapping, "status")),
    approval_status: singleLine(cell(row, mapping, "approval_status")),
    reviewed_by: singleLine(cell(row, mapping, "reviewed_by")),
    gl_account: singleLine(cell(row, mapping, "gl_account")),
    cost_center: singleLine(cell(row, mapping, "cost_center")),
    accrual_basis: singleLine(cell(row, mapping, "accrual_basis")),
    days_past_due: daysPastDue,
    aging_bucket: agingBucket(daysPastDue),
  }
}

class AccrualScheduleReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = ACCRUAL_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const selected = selectAccrualTable(source.tables)

    if (!selected) {
      return {
        reader_key: READER_KEY,
        reader_version: READER_VERSION,
        status: "partial",
        summary_text: "An accrual schedule table could not be mapped automatically.",
        confidence: keyPoints.length ? 0.3 : 0.16,
        key_points: keyPoints,
        structured_data_json: {
          extracted_fields: Array.from(foundKeys),
          table_count: source.tables?.length || 0,
          sensitive_identifiers_excluded: true,
        },
        issues_json: [{
          code: "accrual_schedule_headers_not_found",
          message: "Identify service provider, expense category, amount, due date, or status columns manually.",
        }],
        source_text_excerpt: snippet(redactSensitiveIdentifiers(text), 1200),
      }
    }

    const { table, headerIndex, mapping } = selected
    const reportingDate = parseDateValue(values.reporting_date)
    const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row) => mappedRow(row, mapping, reportingDate))
    const summaryRows = parsedRows.filter((row) => isSummaryLabel(row.vendor_name || row.row_label))
    const items = parsedRows
      .filter((row) => !isSummaryLabel(row.vendor_name || row.row_label))
      .filter((row) => row.vendor_name || row.expense_category || row.invoice_number || row.amount !== null)
    const statusRows = items.filter((row) => row.status)
    const openItems = statusRows.length ? items.filter((row) => isOpenStatus(row.status)) : []
    const overdueItems = openItems.filter((row) => Number.isFinite(row.days_past_due) && row.days_past_due > 0)
    const invoiceLinkedItems = items.filter((row) => hasInvoiceReference(row.invoice_number))
    const unlinkedItems = items.filter((row) => !hasInvoiceReference(row.invoice_number))
    const categoryTotals = sumBy(items, "expense_category", "amount")
    const totals = {
      total_accrued_expenses: sumValues(items, "amount"),
      total_payables: statusRows.length ? sumValues(openItems, "amount") : null,
      open_accruals: statusRows.length ? openItems.length : null,
      overdue_accruals: overdueItems.length,
      invoice_linked_accruals: invoiceLinkedItems.length,
      unlinked_accruals: unlinkedItems.length,
    }
    const declaredTotals = {
      total_accrued_expenses: parseNumber(values.total_accrued_expenses) ?? firstAmount(summaryRows),
      total_payables: parseNumber(values.total_payables),
    }
    const reconciliationVariance = totals.total_accrued_expenses !== null && declaredTotals.total_accrued_expenses !== null
      ? totals.total_accrued_expenses - declaredTotals.total_accrued_expenses
      : null
    const currency = detectCurrency(values, items)
    const serviceProviders = uniqueValues(items, "vendor_name")
    const expenseCategories = uniqueValues(items, "expense_category")
    const categoryCounts = countValues(items, "expense_category")
    const statusCounts = countValues(items, "status")
    const approvalStatusCounts = countValues(items, "approval_status")
    const agingBucketCounts = countValues(items, "aging_bucket")
    const dueDates = uniqueValues(items, "due_date")
    const reversalDates = uniqueValues(items, "reversal_date")
    const glAccounts = uniqueValues(items, "gl_account")
    const costCenters = uniqueValues(items, "cost_center")
    const rowReviewers = uniqueValues(items, "reviewed_by")
    const largestAccrual = maxByValue(items, "amount")

    if (!foundKeys.has("total_accrued_expenses")) {
      keyPoints.push(point({
        key: "total_accrued_expenses",
        label: "Total Accrued Expenses",
        value: formatMoney(totals.total_accrued_expenses, currency),
        confidence: 0.94,
      }))
    }
    if (!foundKeys.has("total_payables")) {
      keyPoints.push(point({
        key: "total_payables",
        label: "Total Payables",
        value: formatMoney(totals.total_payables, currency),
        confidence: 0.88,
      }))
    }
    keyPoints.push(
      point({ key: "accrual_items", label: "Accrual Items", value: String(items.length), valueJson: items, confidence: 0.95 }),
      point({ key: "service_providers", label: "Service Providers", value: serviceProviders.join(", "), valueJson: serviceProviders, confidence: 0.86 }),
      point({ key: "expense_categories", label: "Expense Categories", value: expenseCategories.join(", "), valueJson: expenseCategories, confidence: 0.86 }),
      point({ key: "expense_category_counts", label: "Expense Category Counts", value: countLabel(categoryCounts), valueJson: categoryCounts, confidence: 0.82 }),
      point({ key: "accrual_category_totals", label: "Accrual Category Totals", value: Object.entries(categoryTotals).map(([category, amount]) => `${category}: ${formatNumber(amount, 2)}`).join("; "), valueJson: categoryTotals, confidence: 0.82 }),
      point({ key: "accrual_status_counts", label: "Accrual Status Counts", value: countLabel(statusCounts), valueJson: statusCounts, confidence: 0.82 }),
      point({ key: "accrual_approval_status_counts", label: "Accrual Approval Status Counts", value: countLabel(approvalStatusCounts), valueJson: approvalStatusCounts, confidence: 0.8 }),
      point({ key: "accrual_aging_buckets", label: "Accrual Aging Buckets", value: countLabel(agingBucketCounts), valueJson: agingBucketCounts, confidence: 0.78 }),
      point({ key: "open_accruals", label: "Open Accruals", value: totals.open_accruals === null ? null : String(totals.open_accruals), confidence: 0.86 }),
      point({ key: "overdue_accruals", label: "Overdue Accruals", value: String(totals.overdue_accruals), valueJson: overdueItems, confidence: 0.8 }),
      point({ key: "invoice_linked_accruals", label: "Invoice-Linked Accruals", value: String(totals.invoice_linked_accruals), confidence: 0.82 }),
      point({ key: "unlinked_accruals", label: "Unlinked Accruals", value: String(totals.unlinked_accruals), valueJson: unlinkedItems, confidence: 0.78 }),
      point({ key: "due_dates", label: "Due Dates", value: dueDates.join(", "), valueJson: dueDates, confidence: 0.8 }),
      point({ key: "reversal_dates", label: "Reversal Dates", value: reversalDates.join(", "), valueJson: reversalDates, confidence: 0.76 }),
      point({ key: "accrual_gl_accounts", label: "Accrual GL Accounts", value: glAccounts.join(", "), valueJson: glAccounts, confidence: 0.78 }),
      point({ key: "accrual_cost_centers", label: "Accrual Cost Centers", value: costCenters.join(", "), valueJson: costCenters, confidence: 0.76 }),
      point({ key: "row_reviewers", label: "Row Reviewers", value: rowReviewers.join(", "), valueJson: rowReviewers, confidence: 0.74 }),
      point({ key: "largest_accrual_provider", label: "Largest Accrual Provider", value: largestAccrual?.vendor_name, valueJson: largestAccrual, confidence: 0.88 }),
      point({ key: "largest_accrual_amount", label: "Largest Accrual Amount", value: largestAccrual ? formatMoney(largestAccrual.amount, currency) : null, confidence: 0.88 }),
      point({
        key: "accrual_schedule_reconciliation",
        label: "Accrual Schedule Reconciliation",
        value: reconciliationVariance === null ? null : Math.abs(reconciliationVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(reconciliationVariance, 2)}`,
        confidence: 0.9,
      }),
    )

    const finalKeyPoints = keyPoints.filter(Boolean)
    const finalFoundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))
    const issues = []
    if (!items.length) {
      issues.push({ code: "accrual_schedule_rows_not_found", message: "No readable accrual rows were detected." })
    }
    if (totals.total_accrued_expenses === null) {
      issues.push({ code: "accrual_schedule_amounts_not_detected", message: "No accrued or payable amount could be calculated." })
    }
    if (reconciliationVariance !== null && Math.abs(reconciliationVariance) > 0.01) {
      issues.push({
        code: "accrual_schedule_declared_total_mismatch",
        message: `Computed accrual total differs from the schedule summary by ${formatNumber(reconciliationVariance, 2)}.`,
      })
    }
    if (numberDifference(totals.total_payables, declaredTotals.total_payables) > 0.01) {
      issues.push({
        code: "accrual_schedule_payables_total_mismatch",
        message: "Computed open payable total differs from the stated total payables amount.",
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: items.length && totals.total_accrued_expenses !== null && !issues.length ? "completed" : "partial",
      summary_text: items.length
        ? `Read ${items.length} accrual record(s) from ${table.name || "the accrual schedule"}.`
        : "No readable accrual rows were found in the detected schedule.",
      confidence: items.length && totals.total_accrued_expenses !== null ? (issues.length ? 0.74 : 0.94) : 0.2,
      key_points: finalKeyPoints,
      structured_data_json: {
        sheet_name: table.name || null,
        header_row: headerIndex + 1,
        column_mapping: mapping,
        extracted_fields: Array.from(finalFoundKeys),
        items,
        summary_rows: summaryRows,
        declared_totals: declaredTotals,
        totals: {
          ...totals,
          accrual_reconciliation_variance: reconciliationVariance,
        },
        service_providers: serviceProviders,
        expense_categories: expenseCategories,
        expense_category_counts: categoryCounts,
        category_totals: categoryTotals,
        status_counts: statusCounts,
        approval_status_counts: approvalStatusCounts,
        aging_bucket_counts: agingBucketCounts,
        overdue_items: overdueItems,
        invoice_linked_items: invoiceLinkedItems,
        unlinked_items: unlinkedItems,
        due_dates: dueDates,
        reversal_dates: reversalDates,
        gl_accounts: glAccounts,
        cost_centers: costCenters,
        row_reviewers: rowReviewers,
        sensitive_identifiers_excluded: true,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveIdentifiers(text), 1200),
    }
  }
}

module.exports = AccrualScheduleReader
