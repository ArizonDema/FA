const { formatNumber, matchPointFromSource, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "bank_statement"
const READER_VERSION = "bank-statement.v3"

const STATEMENT_FIELDS = [
  {
    key: "bank_name",
    label: "Bank",
    patterns: [
      /\b(?:bank name|financial institution|institution)\s*(?:is|:|\|)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    tableLabels: ["Bank", "Bank Name", "Financial Institution", "Institution"],
    confidence: 0.82,
  },
  {
    key: "account_name",
    label: "Account Name",
    patterns: [
      /\b(?:account name|account title|account holder)\s*(?:is|:|\|)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    tableLabels: ["Account Name", "Account Title", "Account Holder"],
    confidence: 0.82,
  },
  {
    key: "statement_date",
    label: "Statement Date",
    patterns: [
      /\b(?:statement date|report date)\s*(?:is|:|\|)?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ],
    tableLabels: ["Statement Date", "Report Date", "Date"],
    confidence: 0.8,
  },
  {
    key: "statement_period",
    label: "Statement Period",
    patterns: [
      /\b(?:statement period|period covered|statement dates?)\s*(?:is|:|\|)?\s*([A-Za-z0-9, /-]{6,60}(?:\s+(?:to|through|-)\s+[A-Za-z0-9, /-]{6,40})?)/i,
    ],
    tableLabels: ["Period", "Period Covered", "Statement Dates", "Statement Date Range"],
  },
  {
    key: "account_tail",
    label: "Account Ending",
    patterns: [
      /\b(?:account (?:number|no\.?)|account)\s*(?:ending (?:in|with)|(?:x{2,}|\*{2,}))\s*([0-9]{4})\b/i,
    ],
    confidence: 0.92,
    tableLabels: ["Account Ending", "Account Ending In", "Account Number", "Account No", "Account #"],
  },
  {
    key: "currency",
    label: "Account Currency",
    patterns: [
      /\b(?:account currency|currency)\s*(?:is|:|\|)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i,
    ],
    tableLabels: ["Currency", "Account Currency", "Base Currency"],
  },
  {
    key: "opening_balance",
    label: "Opening Balance",
    patterns: [
      /\b(?:opening|beginning|previous)\s+balance\s*(?:is|:|\|)?\s*((?:US\$|USD|EUR|GBP|\$)?\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ],
    confidence: 0.92,
    tableLabels: ["Opening Balance", "Beginning Balance", "Previous Balance", "Opening Book Balance"],
  },
  {
    key: "closing_balance",
    label: "Closing Balance",
    patterns: [
      /\b(?:closing|ending|new)\s+balance\s*(?:is|:|\|)?\s*((?:US\$|USD|EUR|GBP|\$)?\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ],
    confidence: 0.94,
    tableLabels: ["Closing Balance", "Ending Balance", "New Balance", "Closing Book Balance"],
  },
]

const TRANSACTION_HEADERS = {
  date: ["date", "transaction date", "value date", "posting date"],
  description: ["description", "details", "transaction description", "narrative", "reference"],
  reference: ["reference number", "reference", "transaction id", "transaction reference", "check number", "cheque number"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "payments", "outflow"],
  credit: ["credit", "deposit", "deposits", "money in", "receipts", "inflow"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance"],
}

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function transactionColumnMapping(row) {
  const mapping = {}
  row.forEach((cell, index) => {
    const normalized = normalizeHeader(cell)
    Object.entries(TRANSACTION_HEADERS).forEach(([key, aliases]) => {
      if (mapping[key] === undefined && aliases.includes(normalized)) mapping[key] = index
    })
  })
  return mapping
}

function selectTransactionTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 40).forEach((row, index) => {
      const mapping = transactionColumnMapping(row)
      const hasAmountColumns =
        mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined
      const score = ["date", "description", "reference", "debit", "credit", "amount", "balance"].filter(
        (key) => mapping[key] !== undefined,
      ).length
      if (hasAmountColumns && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
    })
  }
  return best?.score >= 2 ? best : null
}

function transactionCell(row, mapping, key) {
  return mapping[key] === undefined ? null : row[mapping[key]]
}

function classifyTransaction(description, debit, credit) {
  const text = singleLine(description).toLowerCase()
  if (/\b(capital call|capital contribution|drawdown|subscription|contribution)\b/.test(text)) return "capital_call_receipt"
  if (/\b(distribution|dividend|return of capital)\b/.test(text)) return debit ? "distribution_payment" : "distribution_receipt"
  if (/\b(redemption|withdrawal|repurchase)\b/.test(text)) return "redemption_payment"
  if (/\b(management fee|admin(?:istration)? fee|audit fee|legal fee|custody fee|professional fee)\b/.test(text)) return "fund_expense"
  if (/\b(bank charge|wire fee|service charge|fee)\b/.test(text)) return "bank_fee"
  if (/\b(interest|yield)\b/.test(text)) return credit ? "interest_income" : "interest_expense"
  if (/\b(wire|ach|transfer)\b/.test(text)) return credit ? "transfer_in" : "transfer_out"
  if (credit) return "other_credit"
  if (debit) return "other_debit"
  return "uncategorized"
}

function categorySummary(transactions) {
  return transactions.reduce((summary, row) => {
    const entry = summary[row.category] || { count: 0, debit: 0, credit: 0 }
    entry.count += 1
    entry.debit += row.debit || 0
    entry.credit += row.credit || 0
    summary[row.category] = entry
    return summary
  }, {})
}

function formatCategorySummary(summary) {
  return Object.entries(summary)
    .map(([category, entry]) => {
      const amount = entry.credit ? entry.credit : entry.debit
      return `${category}: ${entry.count} (${formatNumber(amount, 2)})`
    })
    .join(", ")
}

function maxTransaction(transactions, key) {
  return transactions
    .filter((row) => Number.isFinite(row[key]) && row[key] > 0)
    .sort((left, right) => right[key] - left[key])[0] || null
}

function uniqueDates(transactions) {
  return Array.from(new Set(transactions.map((row) => row.date).filter(Boolean))).sort()
}

function summarizeTransactions(source, openingBalance, closingBalance) {
  const selected = selectTransactionTable(source.tables)
  if (!selected) return null
  const { table, headerIndex, mapping } = selected
  const transactions = (table.rows || [])
    .slice(headerIndex + 1)
    .map((row) => {
      const signedAmount = parseNumber(transactionCell(row, mapping, "amount"))
      const debit = parseNumber(transactionCell(row, mapping, "debit"))
      const credit = parseNumber(transactionCell(row, mapping, "credit"))
      const derivedDebit = debit === null && signedAmount !== null && signedAmount < 0 ? Math.abs(signedAmount) : debit
      const derivedCredit = credit === null && signedAmount !== null && signedAmount > 0 ? signedAmount : credit
      return {
        date: singleLine(transactionCell(row, mapping, "date")),
        description: singleLine(transactionCell(row, mapping, "description")),
        reference: singleLine(transactionCell(row, mapping, "reference")),
        debit: derivedDebit === null ? null : Math.abs(derivedDebit),
        credit: derivedCredit === null ? null : Math.abs(derivedCredit),
      }
    })
    .filter((row) => row.date || row.description || row.debit !== null || row.credit !== null)
    .map((row) => ({
      ...row,
      category: classifyTransaction(row.description, row.debit, row.credit),
    }))
  if (!transactions.length) return null
  const totalDebits = transactions.reduce((total, row) => total + (row.debit || 0), 0)
  const totalCredits = transactions.reduce((total, row) => total + (row.credit || 0), 0)
  const netMovement = totalCredits - totalDebits
  const expectedMovement =
    openingBalance !== null && closingBalance !== null ? closingBalance - openingBalance : null
  const variance = expectedMovement === null ? null : netMovement - expectedMovement
  const reconciled = variance === null ? null : Math.abs(variance) <= 0.01
  const categories = categorySummary(transactions)
  const dates = uniqueDates(transactions)
  const largestCredit = maxTransaction(transactions, "credit")
  const largestDebit = maxTransaction(transactions, "debit")
  return {
    sheet_name: table.name || null,
    header_row: headerIndex + 1,
    transaction_count: transactions.length,
    transaction_dates: dates,
    first_transaction_date: dates[0] || null,
    last_transaction_date: dates[dates.length - 1] || null,
    total_debits: totalDebits,
    total_credits: totalCredits,
    net_movement: netMovement,
    expected_movement: expectedMovement,
    reconciliation_variance: variance,
    reconciled,
    categories,
    largest_credit: largestCredit,
    largest_debit: largestDebit,
  }
}

class BankStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = STATEMENT_FIELDS.map((field) => matchPointFromSource(source, field))
      .filter(Boolean)
      .map((entry) => {
        if (entry.point_key !== "account_tail") return entry
        const tail = String(entry.value_text || "").match(/([0-9]{4})\b/)
        return tail ? { ...entry, value_text: tail[1] } : entry
      })
    const keyedValues = new Map(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const transactionSummary = summarizeTransactions(
      source,
      parseNumber(keyedValues.get("opening_balance")),
      parseNumber(keyedValues.get("closing_balance")),
    )
    if (transactionSummary) {
      keyPoints.push(...[
        point({ key: "transaction_count", label: "Transactions Detected", value: String(transactionSummary.transaction_count), confidence: 0.94 }),
        point({ key: "total_credits", label: "Total Credits", value: formatNumber(transactionSummary.total_credits, 2), confidence: 0.92 }),
        point({ key: "total_debits", label: "Total Debits", value: formatNumber(transactionSummary.total_debits, 2), confidence: 0.92 }),
        point({ key: "net_transaction_movement", label: "Net Transaction Movement", value: formatNumber(transactionSummary.net_movement, 2), confidence: 0.92 }),
        point({
          key: "transaction_date_range",
          label: "Transaction Date Range",
          value: transactionSummary.first_transaction_date && transactionSummary.last_transaction_date
            ? `${transactionSummary.first_transaction_date} to ${transactionSummary.last_transaction_date}`
            : null,
          valueJson: {
            first_transaction_date: transactionSummary.first_transaction_date,
            last_transaction_date: transactionSummary.last_transaction_date,
          },
          confidence: 0.84,
        }),
        point({
          key: "transaction_category_summary",
          label: "Transaction Categories",
          value: formatCategorySummary(transactionSummary.categories),
          valueJson: transactionSummary.categories,
          confidence: 0.82,
        }),
        point({
          key: "largest_credit",
          label: "Largest Credit",
          value: transactionSummary.largest_credit ? formatNumber(transactionSummary.largest_credit.credit, 2) : null,
          valueJson: transactionSummary.largest_credit,
          confidence: 0.84,
        }),
        point({
          key: "largest_credit_description",
          label: "Largest Credit Description",
          value: transactionSummary.largest_credit?.description,
          confidence: 0.78,
        }),
        point({
          key: "largest_debit",
          label: "Largest Debit",
          value: transactionSummary.largest_debit ? formatNumber(transactionSummary.largest_debit.debit, 2) : null,
          valueJson: transactionSummary.largest_debit,
          confidence: 0.84,
        }),
        point({
          key: "largest_debit_description",
          label: "Largest Debit Description",
          value: transactionSummary.largest_debit?.description,
          confidence: 0.78,
        }),
        point({
          key: "balance_reconciliation",
          label: "Balance Reconciliation",
          value:
            transactionSummary.reconciled === null
              ? null
              : transactionSummary.reconciled
                ? "Reconciled"
                : `Variance ${formatNumber(transactionSummary.reconciliation_variance, 2)}`,
          confidence: 0.94,
        }),
      ].filter(Boolean))
    }
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["statement_period", "closing_balance"].filter((key) => !foundKeys.has(key))
    const reconciliationFailed = Boolean(transactionSummary && transactionSummary.reconciled === false)
    const issues = missing.length
      ? [{ code: "bank_statement_fields_not_detected", message: `Review missing bank statement fields: ${missing.join(", ")}.` }]
      : []
    if (reconciliationFailed) {
      issues.push({
        code: "bank_statement_not_reconciled",
        message: `Transaction movement differs from the opening-to-closing balance change by ${formatNumber(transactionSummary.reconciliation_variance, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: !missing.length && !reconciliationFailed ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Identified ${keyPoints.length} bank statement fact(s), transaction categories, and reconciliation checks for later analysis.`
        : "No standard bank statement facts were detected automatically.",
      confidence: keyPoints.length ? (reconciliationFailed ? 0.68 : Math.min(0.95, 0.42 + keyPoints.length * 0.055)) : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_reconciliation_fields: missing,
        transaction_summary: transactionSummary,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = BankStatementReader
