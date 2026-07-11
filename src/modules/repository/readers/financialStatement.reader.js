const { formatNumber, matchPointFromSource, parseNumber, point, snippet } = require("./reader.utils")

const READER_KEY = "financial_statement"
const READER_VERSION = "financial-statement.v3"

const MONEY = "\\(?(?:US\\$|USD|EUR|GBP|\\$)?\\s*-?[0-9][0-9,]*(?:\\.[0-9]{2})?\\)?"

function metricPattern(label) {
  return new RegExp(`\\b${label}\\s*(?:is|:|\\|)?\\s*(${MONEY})`, "i")
}

const FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Partnership"],
    patterns: [/\b(?:fund name|entity|partnership)\s*(?:is|:|\|)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "reporting_period",
    label: "Reporting Period",
    tableLabels: ["Reporting Period", "Statement Period", "Period Ended", "Year Ended", "As Of Date"],
    patterns: [
      /\b(?:year|period)\s+ended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /\bas of\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    ],
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Currency", "Presentation Currency"],
    patterns: [
      /\b(?:presented|denominated|expressed)\s+in\s+([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i,
      /\b(?:reporting currency|currency)\s*(?:is|:|\|)?\s*([A-Z]{3})\b/i,
    ],
  },
  {
    key: "basis_of_accounting",
    label: "Basis of Accounting",
    tableLabels: ["Basis of Accounting", "Accounting Basis", "Financial Reporting Framework"],
    patterns: [
      /\b(?:basis of accounting|accounting basis|financial reporting framework)\s*(?:is|:|\|)?\s*([^.\n;]{4,160})/i,
      /\bfinancial statements\s+are\s+prepared\s+in\s+accordance\s+with\s+([^.\n;]{4,160})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "auditor_opinion",
    label: "Auditor Opinion",
    tableLabels: ["Auditor Opinion", "Audit Opinion"],
    patterns: [/\b(unqualified opinion|qualified opinion|adverse opinion|disclaimer of opinion)\b/i],
  },
  {
    key: "investments_at_fair_value",
    label: "Investments at Fair Value",
    tableLabels: ["Investments at Fair Value", "Investment Securities at Fair Value", "Portfolio Investments"],
    patterns: [metricPattern("investments? (?:at fair value|securities at fair value|portfolio investments)")],
    confidence: 0.92,
  },
  {
    key: "receivables",
    label: "Receivables",
    tableLabels: ["Receivables", "Subscriptions Receivable", "Other Receivables"],
    patterns: [metricPattern("(?:subscriptions receivable|other receivables|receivables)")],
    confidence: 0.8,
  },
  {
    key: "total_assets",
    label: "Total Assets",
    tableLabels: ["Total Assets", "Assets"],
    patterns: [metricPattern("total assets?")],
    confidence: 0.94,
  },
  {
    key: "payables_and_accruals",
    label: "Payables and Accruals",
    tableLabels: ["Payables and Accruals", "Accounts Payable and Accrued Expenses", "Accrued Expenses"],
    patterns: [metricPattern("(?:accounts payable and accrued expenses|payables and accruals|accrued expenses|accounts payable)")],
    confidence: 0.82,
  },
  {
    key: "total_liabilities",
    label: "Total Liabilities",
    tableLabels: ["Total Liabilities", "Liabilities"],
    patterns: [metricPattern("total liabilities")],
    confidence: 0.94,
  },
  {
    key: "net_assets",
    label: "Net Assets",
    tableLabels: ["Net Assets", "Net Assets Attributable to Partners", "Net Assets Attributable to Shareholders"],
    patterns: [new RegExp(`\\bnet assets?\\s*(?:attributable to (?:partners|shareholders|holders))?\\s*(?:is|:|\\|)?\\s*(${MONEY})`, "i")],
    confidence: 0.96,
  },
  {
    key: "cash_and_cash_equivalents",
    label: "Cash and Cash Equivalents",
    tableLabels: ["Cash and Cash Equivalents", "Cash", "Cash Equivalents"],
    patterns: [metricPattern("cash and cash equivalents?")],
    confidence: 0.92,
  },
  {
    key: "investment_income",
    label: "Investment Income",
    tableLabels: ["Investment Income", "Interest and Dividend Income", "Income"],
    patterns: [metricPattern("(?:investment income|interest and dividend income|income)")],
    confidence: 0.84,
  },
  {
    key: "management_fees",
    label: "Management Fees",
    tableLabels: ["Management Fees", "Management Fee", "Investment Management Fees"],
    patterns: [metricPattern("(?:management fees?|investment management fees?)")],
    confidence: 0.84,
  },
  {
    key: "professional_fees",
    label: "Professional Fees",
    tableLabels: ["Professional Fees", "Audit Fees", "Legal and Professional Fees"],
    patterns: [metricPattern("(?:professional fees|audit fees|legal and professional fees)")],
    confidence: 0.78,
  },
  {
    key: "total_expenses",
    label: "Total Expenses",
    tableLabels: ["Total Expenses", "Expenses"],
    patterns: [metricPattern("total expenses?")],
    confidence: 0.86,
  },
  {
    key: "net_investment_income",
    label: "Net Investment Income",
    tableLabels: ["Net Investment Income", "Net Investment Loss"],
    patterns: [metricPattern("net investment income")],
    confidence: 0.9,
  },
  {
    key: "net_realized_gain_loss",
    label: "Net Realized Gain / Loss",
    tableLabels: ["Net Realized Gain (Loss)", "Net Realized Gain", "Net Realized Loss"],
    patterns: [metricPattern("net (?:realized|realised) (?:gain|loss)(?: on investments?)?")],
    confidence: 0.88,
  },
  {
    key: "net_unrealized_gain_loss",
    label: "Net Unrealized Gain / Loss",
    tableLabels: ["Net Unrealized Gain (Loss)", "Net Unrealized Gain", "Net Unrealized Loss"],
    patterns: [metricPattern("net (?:unrealized|unrealised) (?:gain|loss)(?: on investments?)?")],
    confidence: 0.88,
  },
  {
    key: "net_increase_from_operations",
    label: "Net Increase / Decrease from Operations",
    tableLabels: ["Net Increase (Decrease) from Operations", "Net Increase from Operations", "Net Decrease from Operations"],
    patterns: [metricPattern("net (?:increase|decrease) (?:in net assets )?from operations")],
    confidence: 0.9,
  },
  {
    key: "beginning_net_assets",
    label: "Beginning Net Assets",
    tableLabels: ["Beginning Net Assets", "Net Assets, Beginning of Period", "Partners' Capital, Beginning"],
    patterns: [metricPattern("(?:beginning net assets|net assets, beginning of period|partners'? capital, beginning)")],
    confidence: 0.9,
  },
  {
    key: "capital_contributions",
    label: "Capital Contributions",
    tableLabels: ["Capital Contributions", "Contributions", "Subscriptions"],
    patterns: [metricPattern("(?:capital contributions|contributions|subscriptions)")],
    confidence: 0.88,
  },
  {
    key: "redemptions_withdrawals",
    label: "Redemptions / Withdrawals",
    tableLabels: ["Redemptions", "Withdrawals", "Repurchases"],
    patterns: [metricPattern("(?:redemptions|withdrawals|repurchases)")],
    confidence: 0.86,
  },
  {
    key: "distributions",
    label: "Distributions",
    tableLabels: ["Distributions", "Partner Distributions", "Shareholder Distributions"],
    patterns: [metricPattern("(?:distributions|partner distributions|shareholder distributions)")],
    confidence: 0.86,
  },
  {
    key: "ending_net_assets",
    label: "Ending Net Assets",
    tableLabels: ["Ending Net Assets", "Net Assets, End of Period", "Partners' Capital, Ending"],
    patterns: [metricPattern("(?:ending net assets|net assets, end of period|partners'? capital, ending)")],
    confidence: 0.92,
  },
]

function sourceSearchText(source = {}) {
  const tableText = (source.tables || [])
    .flatMap((table) => [
      table.name,
      ...(table.rows || []).slice(0, 25).map((row) => row.join(" | ")),
    ])
    .filter(Boolean)
    .join("\n")
  return [source.text, tableText].filter(Boolean).join("\n")
}

function identityPoint(source) {
  const text = sourceSearchText(source)
  const statementsMatch = text.match(/\bfinancial statements?\b/i)
  if (statementsMatch) {
    return point({
      key: "document_identity",
      label: "Document Type",
      value: "Financial Statements",
      sourceReference: statementsMatch[0],
      confidence: 0.96,
    })
  }
  const statementMatch = text.match(/\bstatement of (?:assets and liabilities|financial position|operations|changes in (?:partners'? capital|net assets))\b/i)
  if (!statementMatch) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: statementMatch[0].replace(/\b\w/g, (letter) => letter.toUpperCase()),
    sourceReference: statementMatch[0],
    confidence: 0.92,
  })
}

function numberValue(values, ...keys) {
  for (const key of keys) {
    const value = parseNumber(values[key])
    if (value !== null) return value
  }
  return null
}

function balanceSheetVariance(values) {
  const assets = numberValue(values, "total_assets")
  const liabilities = numberValue(values, "total_liabilities")
  const netAssets = numberValue(values, "net_assets", "ending_net_assets")
  if ([assets, liabilities, netAssets].some((value) => value === null)) return null
  return assets - liabilities - netAssets
}

function operationsVariance(values) {
  const netInvestmentIncome = numberValue(values, "net_investment_income")
  const realized = numberValue(values, "net_realized_gain_loss")
  const unrealized = numberValue(values, "net_unrealized_gain_loss")
  const netIncrease = numberValue(values, "net_increase_from_operations")
  if ([netInvestmentIncome, realized, unrealized, netIncrease].some((value) => value === null)) return null
  return netInvestmentIncome + realized + unrealized - netIncrease
}

function netAssetsRollforwardVariance(values) {
  const beginning = numberValue(values, "beginning_net_assets")
  const ending = numberValue(values, "ending_net_assets", "net_assets")
  if (beginning === null || ending === null) return null
  const contributions = numberValue(values, "capital_contributions") || 0
  const redemptions = numberValue(values, "redemptions_withdrawals") || 0
  const distributions = numberValue(values, "distributions") || 0
  const operations = numberValue(values, "net_increase_from_operations") || 0
  if (!["capital_contributions", "redemptions_withdrawals", "distributions", "net_increase_from_operations"].some((key) => values[key])) {
    return null
  }
  return beginning + contributions + operations - Math.abs(redemptions) - Math.abs(distributions) - ending
}

function reconciliationPoint({ key, label, variance, fractionDigits = 2 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(variance, fractionDigits)}`,
    confidence: 0.92,
  })
}

class FinancialStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const balanceVariance = balanceSheetVariance(values)
    const operationsVarianceValue = operationsVariance(values)
    const rollforwardVariance = netAssetsRollforwardVariance(values)
    keyPoints.push(
      ...[
        reconciliationPoint({ key: "balance_sheet_reconciliation", label: "Balance Sheet Reconciliation", variance: balanceVariance }),
        reconciliationPoint({ key: "operations_reconciliation", label: "Operations Reconciliation", variance: operationsVarianceValue }),
        reconciliationPoint({ key: "net_assets_rollforward_reconciliation", label: "Net Assets Rollforward", variance: rollforwardVariance }),
      ].filter(Boolean),
    )
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = [
      foundKeys.has("reporting_period") ? null : "reporting_period",
      foundKeys.has("net_assets") || foundKeys.has("ending_net_assets") ? null : "net_assets",
    ].filter(Boolean)
    const issues = []
    if (missing.length) {
      issues.push({ code: "financial_statement_fields_not_found", message: `Review missing financial statement fields: ${missing.join(", ")}.` })
    }
    if (balanceVariance !== null && Math.abs(balanceVariance) > 0.01) {
      issues.push({ code: "financial_statement_balance_sheet_mismatch", message: `Assets less liabilities differs from net assets by ${formatNumber(balanceVariance, 2)}.` })
    }
    if (operationsVarianceValue !== null && Math.abs(operationsVarianceValue) > 0.01) {
      issues.push({ code: "financial_statement_operations_mismatch", message: `Operations components differ from net increase by ${formatNumber(operationsVarianceValue, 2)}.` })
    }
    if (rollforwardVariance !== null && Math.abs(rollforwardVariance) > 0.01) {
      issues.push({ code: "financial_statement_net_assets_rollforward_mismatch", message: `Net asset rollforward differs by ${formatNumber(rollforwardVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} financial statement fact(s), including statement totals and reconciliation checks.`
        : "No standard financial statement facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? Math.min(0.95, 0.55 + keyPoints.length * 0.045) : keyPoints.length ? 0.7 : 0.2,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        balance_sheet_variance: balanceVariance,
        operations_variance: operationsVarianceValue,
        net_assets_rollforward_variance: rollforwardVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = FinancialStatementReader
