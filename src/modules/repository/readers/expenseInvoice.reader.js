const { formatNumber, matchPointFromSource, parseNumber, point, redactSensitiveIdentifiers, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "expense_invoice"
const READER_VERSION = "expense-invoice.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"

const HEADER_ALIASES = {
  description: ["description", "service", "services", "expense description", "line item", "item", "narrative"],
  category: ["category", "expense category", "type", "expense type"],
  service_period: ["service period", "period", "billing period"],
  amount: ["amount", "line amount", "net amount", "fee", "expense amount", "charge", "total"],
  tax_amount: ["tax", "vat", "tax amount", "vat amount", "sales tax"],
  currency: ["currency", "ccy"],
  gl_account: ["gl account", "g l account", "account", "account code", "expense account"],
  cost_center: ["cost center", "cost centre", "department", "project", "allocation"],
  approval_status: ["approval status", "status", "approved"],
}

const INVOICE_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Client", "Entity", "Bill To"],
    patterns: [
      /\b(?:fund name|client|entity|bill to|fund)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "service_provider",
    label: "Service Provider",
    tableLabels: ["Service Provider", "Vendor", "Supplier", "Payee", "Administrator", "Custodian", "Auditor", "Legal Counsel"],
    patterns: [
      /\b(?:service provider|vendor|supplier|payee|administrator|custodian|auditor|legal counsel)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.9,
  },
  {
    key: "provider_role",
    label: "Provider Role",
    tableLabels: ["Provider Role", "Service Role", "Role", "Service Type"],
    patterns: [
      /\b(?:provider role|service role|service type|role)\s*(?:is|:)?\s*([^.\n;]{4,120})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "invoice_number",
    label: "Invoice Number",
    tableLabels: ["Invoice Number", "Invoice No.", "Invoice #", "Reference", "Document Number"],
    patterns: [
      /\b(?:invoice number|invoice no\.?|invoice #|document number|reference)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,60})/i,
    ],
    confidence: 0.86,
  },
  {
    key: "purchase_order",
    label: "Purchase Order / Engagement",
    tableLabels: ["Purchase Order", "PO Number", "Engagement Letter", "Engagement Reference"],
    patterns: [
      /\b(?:purchase order|po number|engagement letter|engagement reference)\s*(?:is|:|#)?\s*([A-Za-z0-9-]{2,80})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "invoice_date",
    label: "Invoice Date",
    tableLabels: ["Invoice Date", "Statement Date", "Date"],
    patterns: [
      new RegExp(`\\b(?:invoice date|statement date|date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "due_date",
    label: "Due Date",
    tableLabels: ["Due Date", "Payment Due Date", "Payable Date"],
    patterns: [
      new RegExp(`\\b(?:due date|payment due date|payable date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
      new RegExp(`\\bpayment\\s+(?:is\\s+)?due\\s+(?:on|by)\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "payment_terms",
    label: "Payment Terms",
    tableLabels: ["Payment Terms", "Terms", "Payment Term"],
    patterns: [
      /\b(?:payment terms|payment term|terms)\s*(?:are|is|:)?\s*([^.\n;]{3,120})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "service_period",
    label: "Service Period",
    tableLabels: ["Service Period", "Billing Period", "Period Covered", "Invoice Period"],
    patterns: [
      /\b(?:service period|billing period|period covered|invoice period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i,
    ],
    confidence: 0.86,
  },
  {
    key: "expense_category",
    label: "Expense Category",
    tableLabels: ["Expense Category", "Category", "Type", "Expense Type"],
    patterns: [
      /\b(?:expense category|category|expense type)\s*(?:is|:)?\s*([^.\n;]{4,120})/i,
      /\b(fund administration fee|administration fee|audit fee|tax preparation fee|legal fee|custody fee|depositary fee|professional fee)\b/i,
    ],
    confidence: 0.84,
  },
  {
    key: "invoice_description",
    label: "Description",
    tableLabels: ["Description", "Services Provided", "Scope", "Narrative"],
    patterns: [
      /\b(?:description|services provided|scope|narrative)\s*(?:is|:)?\s*([^.\n;]{6,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "subtotal",
    label: "Subtotal",
    tableLabels: ["Subtotal", "Net Fees", "Fees", "Service Fees"],
    patterns: [
      new RegExp(`\\b(?:subtotal|net fees|service fees|fees before tax)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "tax_rate",
    label: "Tax / VAT Rate",
    tableLabels: ["Tax Rate", "VAT Rate", "Sales Tax Rate"],
    patterns: [
      /\b(?:tax rate|vat rate|sales tax rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "tax_amount",
    label: "Tax / VAT",
    tableLabels: ["Tax", "VAT", "Sales Tax", "Tax Amount", "VAT Amount"],
    patterns: [
      new RegExp(`\\b(?:tax amount|vat amount|sales tax|tax|vat)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.8,
  },
  {
    key: "withholding_tax",
    label: "Withholding Tax",
    tableLabels: ["Withholding Tax", "Withholding", "Tax Withheld"],
    patterns: [
      new RegExp(`\\b(?:withholding tax|withholding|tax withheld)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "reimbursable_expenses",
    label: "Reimbursable Expenses",
    tableLabels: ["Reimbursable Expenses", "Out-of-pocket Expenses", "Disbursements", "Expenses"],
    patterns: [
      new RegExp(`\\b(?:reimbursable expenses|out-of-pocket expenses|disbursements)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "credit_amount",
    label: "Credit / Discount",
    tableLabels: ["Credit", "Credit Amount", "Discount", "Discount Amount", "Prior Credit"],
    patterns: [
      new RegExp(`\\b(?:credit amount|prior credit|credit|discount amount|discount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.76,
  },
  {
    key: "total_amount",
    label: "Total Amount",
    tableLabels: ["Total", "Invoice Total", "Total Amount", "Gross Amount"],
    patterns: [
      new RegExp(`\\b(?:invoice total|total amount|gross amount|total)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "paid_amount",
    label: "Paid Amount",
    tableLabels: ["Paid Amount", "Amount Paid", "Payments", "Payment Amount"],
    patterns: [
      new RegExp(`\\b(?:paid amount|amount paid|payments?|payment amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "amount_due",
    label: "Amount Due",
    tableLabels: ["Amount Due", "Balance Due", "Total Due", "Payable Amount"],
    patterns: [
      new RegExp(`\\b(?:amount due|balance due|total due|payable amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "accrued_amount",
    label: "Accrued Amount",
    tableLabels: ["Accrued Amount", "Accrual Amount", "Amount Accrued"],
    patterns: [
      new RegExp(`\\b(?:accrued amount|accrual amount|amount accrued)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "payment_status",
    label: "Payment Status",
    tableLabels: ["Payment Status", "Payment State", "Paid Status"],
    patterns: [
      /\b(?:payment status|payment state|paid status)\s*(?:is|:)?\s*(paid|unpaid|open|partially paid|pending|scheduled|overdue|voided)(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "payment_date",
    label: "Payment Date",
    tableLabels: ["Payment Date", "Paid Date", "Settlement Date"],
    patterns: [
      new RegExp(`\\b(?:payment date|paid date|settlement date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.76,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Status", "Invoice Status"],
    patterns: [
      /\b(?:approval status|invoice status|status)\s*(?:is|:)?\s*(approved|pending approval|rejected|in review|posted|voided)(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approved_by",
    label: "Approved By",
    tableLabels: ["Approved By", "Approver", "Reviewer"],
    patterns: [
      /\b(?:approved by|approver|reviewer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,120})(?:[.;\n]|$)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Approved Date", "Review Date"],
    patterns: [
      new RegExp(`\\b(?:approval date|approved date|review date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.76,
  },
  {
    key: "accrual_status",
    label: "Accrual Status",
    tableLabels: ["Accrual Status", "Accrued", "Accrual"],
    patterns: [
      /\b(?:accrual status|accrued|accrual)\s*(?:is|:)?\s*(accrued|not accrued|partially accrued|reversed|posted)(?:[.;\n]|$)/i,
    ],
    confidence: 0.74,
  },
  {
    key: "gl_account",
    label: "GL Account",
    tableLabels: ["GL Account", "G/L Account", "Account", "Account Code", "Expense Account"],
    patterns: [
      /\b(?:gl account|g\/l account|account code|expense account)\s*(?:is|:)?\s*([A-Za-z0-9 -]{3,80})/i,
    ],
    confidence: 0.74,
  },
  {
    key: "cost_center",
    label: "Cost Center / Allocation",
    tableLabels: ["Cost Center", "Cost Centre", "Department", "Project", "Allocation"],
    patterns: [
      /\b(?:cost center|cost centre|department|project|allocation)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
    ],
    confidence: 0.72,
  },
  {
    key: "functional_currency",
    label: "Functional Currency",
    tableLabels: ["Functional Currency", "Reporting Currency", "Base Currency"],
    patterns: [
      /\b(?:functional currency|reporting currency|base currency)\s*(?:is|:)?\s*(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i,
    ],
    confidence: 0.76,
  },
  {
    key: "invoice_currency",
    label: "Invoice Currency",
    tableLabels: ["Invoice Currency", "Currency", "Billing Currency"],
    patterns: [
      /\b(?:invoice currency|billing currency|currency)\s*(?:is|:)?\s*(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i,
    ],
    confidence: 0.78,
  },
  {
    key: "fx_rate",
    label: "FX Rate",
    tableLabels: ["FX Rate", "Exchange Rate", "Conversion Rate"],
    patterns: [
      /\b(?:fx rate|exchange rate|conversion rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ],
    confidence: 0.72,
  },
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
      if (mapping[key] === undefined && aliases.includes(normalized)) mapping[key] = index
    })
  })
  return mapping
}

function selectLineItemTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 20).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["description", "category", "service_period", "amount"].filter((key) => mapping[key] !== undefined).length
      if (!best || score > best.score) best = { table, headerIndex: index, mapping, score }
    })
  }
  return best?.score >= 2 && best.mapping.amount !== undefined ? best : null
}

function cell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function isSummaryRow(row) {
  const label = singleLine((row || []).find((value) => singleLine(value)) || "")
  return /^(?:sub)?total$|^tax$|^vat$|^balance due$|^amount due$|^invoice total$/i.test(label)
}

function parseLineItems(source) {
  const selected = selectLineItemTable(source.tables)
  if (!selected) return { items: [], lineTotal: null, taxTotal: null, tableMeta: null }
  const { table, headerIndex, mapping } = selected
  const items = (table.rows || [])
    .slice(headerIndex + 1)
    .filter((row) => !isSummaryRow(row))
    .map((row) => ({
      description: singleLine(cell(row, mapping, "description")),
      category: singleLine(cell(row, mapping, "category")),
      service_period: singleLine(cell(row, mapping, "service_period")),
      amount: parseNumber(cell(row, mapping, "amount")),
      tax_amount: parseNumber(cell(row, mapping, "tax_amount")),
      currency: singleLine(cell(row, mapping, "currency")),
      gl_account: singleLine(cell(row, mapping, "gl_account")),
      cost_center: singleLine(cell(row, mapping, "cost_center")),
      approval_status: singleLine(cell(row, mapping, "approval_status")),
    }))
    .filter((row) => row.description || row.category || row.amount !== null)
  const lineAmounts = items.map((row) => row.amount).filter((value) => value !== null)
  const taxAmounts = items.map((row) => row.tax_amount).filter((value) => value !== null)
  return {
    items,
    lineTotal: lineAmounts.length ? lineAmounts.reduce((total, value) => total + value, 0) : null,
    taxTotal: taxAmounts.length ? taxAmounts.reduce((total, value) => total + value, 0) : null,
    tableMeta: { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping },
  }
}

function invoiceIdentity(text) {
  const match = String(text || "").match(/\b(fund expense invoice|service provider invoice|administrator invoice|audit fee invoice|legal fee invoice|custody fee invoice|expense statement|invoice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Expense Invoice",
    sourceReference: match[0],
    confidence: 0.94,
  })
}

function detectCurrency(values, lineItems) {
  const sourceText = [
    ...Object.values(values || {}),
    ...lineItems.flatMap((item) => [item.currency, item.amount === null ? "" : String(item.amount)]),
  ].join(" ")
  const match = sourceText.match(/\b(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i)
  if (match) return match[1].toUpperCase()
  if (/\$/.test(sourceText)) return "USD"
  return null
}

function categoryTotals(items) {
  const totals = {}
  items.forEach((item) => {
    if (!item.category || item.amount === null) return
    totals[item.category] = (totals[item.category] || 0) + item.amount
  })
  return totals
}

function largestLineItem(items) {
  const withAmounts = items.filter((item) => item.amount !== null)
  if (!withAmounts.length) return null
  return withAmounts.reduce((largest, item) => (Math.abs(item.amount) > Math.abs(largest.amount) ? item : largest), withAmounts[0])
}

function reconciliationPoint({ key, label, variance, confidence }) {
  if (variance === null || variance === undefined) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(variance, 2)}`,
    confidence,
  })
}

class ExpenseInvoiceReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = INVOICE_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = invoiceIdentity(text)
    if (identity) keyPoints.unshift(identity)

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const { items, lineTotal, taxTotal, tableMeta } = parseLineItems(source)
    const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean)))
    const glAccounts = Array.from(new Set(items.map((item) => item.gl_account).filter(Boolean)))
    const costCenters = Array.from(new Set(items.map((item) => item.cost_center).filter(Boolean)))
    const categoryAmountTotals = categoryTotals(items)
    const largestItem = largestLineItem(items)
    const currency = values.invoice_currency || values.functional_currency || detectCurrency(values, items)
    const subtotal = parseNumber(values.subtotal)
    const taxAmount = parseNumber(values.tax_amount)
    const reimbursableExpenses = parseNumber(values.reimbursable_expenses)
    const totalAmount = parseNumber(values.total_amount)
    const paidAmount = parseNumber(values.paid_amount)
    const creditAmount = parseNumber(values.credit_amount)
    const withholdingTax = parseNumber(values.withholding_tax)
    const amountDue = parseNumber(values.amount_due)
    const accruedAmount = parseNumber(values.accrued_amount)
    const subtotalVariance = subtotal !== null && lineTotal !== null ? lineTotal - subtotal : null
    const taxVariance = taxAmount !== null && taxTotal !== null ? taxTotal - taxAmount : null
    const totalVariance = subtotal !== null && totalAmount !== null
      ? subtotal + (taxAmount || 0) + (reimbursableExpenses || 0) - totalAmount
      : null
    const amountDueVariance = totalAmount !== null && amountDue !== null
      ? totalAmount - (paidAmount || 0) - (creditAmount || 0) - (withholdingTax || 0) - amountDue
      : null
    const accruedVariance = accruedAmount !== null && totalAmount !== null ? accruedAmount - totalAmount : null
    const missingCore = [
      foundKeys.has("service_provider") ? null : "service_provider",
      foundKeys.has("amount_due") || foundKeys.has("total_amount") ? null : "amount_due_or_total_amount",
      foundKeys.has("invoice_date") || foundKeys.has("service_period") ? null : "invoice_date_or_service_period",
    ].filter(Boolean)
    const issues = []

    if (lineTotal !== null) {
      keyPoints.push(point({
        key: "invoice_line_item_total",
        label: "Invoice Line Item Total",
        value: `${currency ? `${currency} ` : ""}${formatNumber(lineTotal, 2)}`,
        confidence: 0.9,
      }))
    }
    if (taxTotal !== null) {
      keyPoints.push(point({
        key: "invoice_line_tax_total",
        label: "Invoice Line Tax Total",
        value: `${currency ? `${currency} ` : ""}${formatNumber(taxTotal, 2)}`,
        confidence: 0.82,
      }))
    }
    if (items.length) {
      keyPoints.push(point({
        key: "invoice_line_items",
        label: "Invoice Line Items",
        value: String(items.length),
        valueJson: items,
        confidence: 0.9,
      }))
    }
    if (categories.length) {
      keyPoints.push(point({
        key: "invoice_expense_categories",
        label: "Invoice Expense Categories",
        value: categories.join(", "),
        valueJson: categories,
        confidence: 0.84,
      }))
    }
    if (Object.keys(categoryAmountTotals).length) {
      keyPoints.push(point({
        key: "invoice_category_totals",
        label: "Invoice Category Totals",
        value: Object.entries(categoryAmountTotals).map(([category, amount]) => `${category}: ${formatNumber(amount, 2)}`).join("; "),
        valueJson: categoryAmountTotals,
        confidence: 0.82,
      }))
    }
    if (glAccounts.length) {
      keyPoints.push(point({
        key: "invoice_gl_accounts",
        label: "Invoice GL Accounts",
        value: glAccounts.join(", "),
        valueJson: glAccounts,
        confidence: 0.78,
      }))
    }
    if (costCenters.length) {
      keyPoints.push(point({
        key: "invoice_cost_centers",
        label: "Invoice Cost Centers",
        value: costCenters.join(", "),
        valueJson: costCenters,
        confidence: 0.76,
      }))
    }
    if (largestItem) {
      keyPoints.push(point({
        key: "invoice_largest_line_item",
        label: "Largest Invoice Line Item",
        value: `${largestItem.category || largestItem.description}: ${currency ? `${currency} ` : ""}${formatNumber(largestItem.amount, 2)}`,
        valueJson: largestItem,
        confidence: 0.82,
      }))
    }
    keyPoints.push(
      reconciliationPoint({ key: "invoice_subtotal_reconciliation", label: "Invoice Subtotal Reconciliation", variance: subtotalVariance, confidence: 0.9 }),
      reconciliationPoint({ key: "invoice_tax_reconciliation", label: "Invoice Tax Reconciliation", variance: taxVariance, confidence: 0.82 }),
      reconciliationPoint({ key: "invoice_total_reconciliation", label: "Invoice Total Reconciliation", variance: totalVariance, confidence: 0.88 }),
      reconciliationPoint({ key: "invoice_amount_due_reconciliation", label: "Invoice Amount Due Reconciliation", variance: amountDueVariance, confidence: 0.86 }),
      reconciliationPoint({ key: "invoice_accrual_reconciliation", label: "Invoice Accrual Reconciliation", variance: accruedVariance, confidence: 0.78 }),
    )

    if (missingCore.length) {
      issues.push({
        code: "expense_invoice_fields_not_detected",
        message: `Review missing invoice fields: ${missingCore.join(", ")}.`,
      })
    }
    if (subtotalVariance !== null && Math.abs(subtotalVariance) > 0.01) {
      issues.push({
        code: "expense_invoice_line_total_mismatch",
        message: `Invoice line total does not agree to subtotal by ${subtotalVariance.toFixed(2)}.`,
      })
    }
    if (taxVariance !== null && Math.abs(taxVariance) > 0.01) {
      issues.push({
        code: "expense_invoice_tax_total_mismatch",
        message: `Invoice line tax total does not agree to invoice tax by ${taxVariance.toFixed(2)}.`,
      })
    }
    if (totalVariance !== null && Math.abs(totalVariance) > 0.01) {
      issues.push({
        code: "expense_invoice_total_mismatch",
        message: `Invoice subtotal, tax, and reimbursable expenses do not agree to total by ${totalVariance.toFixed(2)}.`,
      })
    }
    if (amountDueVariance !== null && Math.abs(amountDueVariance) > 0.01) {
      issues.push({
        code: "expense_invoice_amount_due_mismatch",
        message: `Invoice total less payments and credits does not agree to amount due by ${amountDueVariance.toFixed(2)}.`,
      })
    }

    const finalKeyPoints = keyPoints.filter(Boolean)
    const finalFoundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: finalKeyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: finalKeyPoints.length
        ? `Extracted ${finalKeyPoints.length} expense invoice fact(s) for provider, accrual, approval, payment, coding, and reconciliation review.`
        : "No standard expense invoice facts were detected automatically.",
      confidence: finalKeyPoints.length && !issues.length ? Math.min(0.94, 0.4 + finalKeyPoints.length * 0.045) : finalKeyPoints.length ? 0.7 : 0.16,
      key_points: finalKeyPoints,
      structured_data_json: {
        ...(tableMeta || {}),
        extracted_fields: Array.from(finalFoundKeys),
        missing_core_fields: missingCore,
        currency,
        line_items: items,
        line_item_total: lineTotal,
        line_tax_total: taxTotal,
        category_totals: categoryAmountTotals,
        gl_accounts: glAccounts,
        cost_centers: costCenters,
        largest_line_item: largestItem,
        subtotal_variance: subtotalVariance,
        tax_reconciliation_variance: taxVariance,
        total_reconciliation_variance: totalVariance,
        amount_due_reconciliation_variance: amountDueVariance,
        accrual_reconciliation_variance: accruedVariance,
        sensitive_identifiers_excluded: true,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveIdentifiers(text), 1200),
    }
  }
}

module.exports = ExpenseInvoiceReader
