const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "nav_package"
const READER_VERSION = "nav-package.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const NAV_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity"],
    patterns: [/\b(?:fund|fund name|partnership|entity)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "administrator",
    label: "Administrator",
    tableLabels: ["Administrator", "Fund Administrator", "Prepared By", "NAV Prepared By"],
    patterns: [/\b(?:administrator|fund administrator|prepared by|nav prepared by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "reporting_period",
    label: "Reporting Period",
    tableLabels: ["Reporting Period", "NAV Period", "Period", "Period Ended"],
    patterns: [/\b(?:reporting period|nav period|period ended|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i],
    confidence: 0.88,
  },
  {
    key: "report_date",
    label: "Report Date",
    tableLabels: ["Report Date", "Package Date", "Statement Date", "NAV Package Date"],
    patterns: [new RegExp(`\\b(?:report date|package date|statement date|nav package date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "valuation_date",
    label: "Valuation Date",
    tableLabels: ["Valuation Date", "NAV Date", "As Of Date", "Date"],
    patterns: [new RegExp(`\\b(?:valuation date|nav date|as of date|as of)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Base Currency", "Currency"],
    patterns: [/\b(?:reporting currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
    confidence: 0.82,
  },
  {
    key: "nav_frequency",
    label: "NAV Frequency",
    tableLabels: ["NAV Frequency", "Valuation Frequency", "Reporting Frequency"],
    patterns: [
      /\b(?:nav frequency|valuation frequency|reporting frequency)\s*(?:is|:)?\s*(daily|weekly|monthly|quarterly|semi-annual|semiannual|annual|annually)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "accounting_basis",
    label: "Accounting Basis",
    tableLabels: ["Accounting Basis", "Basis of Accounting", "Accounting Framework", "Financial Reporting Framework"],
    patterns: [
      /\b(?:accounting basis|basis of accounting|accounting framework|financial reporting framework)\s*(?:is|:)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.82,
  },
  {
    key: "valuation_policy",
    label: "Valuation Policy",
    tableLabels: ["Valuation Policy", "Valuation Methodology", "Pricing Policy", "Fair Value Policy"],
    patterns: [
      /\b(?:valuation policy|valuation methodology|pricing policy|fair value policy)\s*(?:is|:)?\s*([^.\n;]{8,220})/i,
    ],
    confidence: 0.8,
  },
  {
    key: "price_source",
    label: "Price Source",
    tableLabels: ["Price Source", "Pricing Source", "Primary Price Source", "Market Data Source"],
    patterns: [
      /\b(?:price source|pricing source|primary price source|market data source)\s*(?:is|:)?\s*([^.\n;]{3,140})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "beginning_nav",
    label: "Beginning NAV",
    tableLabels: ["Beginning NAV", "Opening NAV", "Beginning Net Asset Value", "Opening Net Asset Value"],
    patterns: [new RegExp(`\\b(?:beginning nav|opening nav|beginning net asset value|opening net asset value)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    tableLabels: ["Subscriptions", "Capital Subscriptions", "Investor Subscriptions", "Capital Contributions"],
    patterns: [new RegExp(`\\b(?:subscriptions?|capital subscriptions?|investor subscriptions?|capital contributions?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "redemptions",
    label: "Redemptions",
    tableLabels: ["Redemptions", "Withdrawals", "Repurchases"],
    patterns: [new RegExp(`\\b(?:redemptions?|withdrawals?|repurchases?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "distributions",
    label: "Distributions",
    tableLabels: ["Distributions", "Capital Distributions", "Income Distributions"],
    patterns: [new RegExp(`\\b(?:distributions?|capital distributions?|income distributions?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "net_capital_activity",
    label: "Net Capital Activity",
    tableLabels: ["Net Capital Activity", "Net Investor Activity", "Net Subscriptions", "Net Capital Movement"],
    patterns: [new RegExp(`\\b(?:net capital activity|net investor activity|net subscriptions?|net capital movement)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "net_investment_income",
    label: "Net Investment Income",
    tableLabels: ["Net Investment Income", "Investment Income", "Net Income"],
    patterns: [new RegExp(`\\b(?:net investment income|investment income|net income)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "realized_gain_loss",
    label: "Realized Gain / Loss",
    tableLabels: ["Realized Gain/Loss", "Realized Gain", "Realized Loss", "Net Realized Gain/Loss"],
    patterns: [new RegExp(`\\b(?:realized|realised) (?:gain|loss|gain/loss)(?: on investments?)?\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "unrealized_gain_loss",
    label: "Unrealized Gain / Loss",
    tableLabels: ["Unrealized Gain/Loss", "Unrealized Gain", "Unrealized Loss", "Net Unrealized Gain/Loss"],
    patterns: [new RegExp(`\\b(?:unrealized|unrealised) (?:gain|loss|gain/loss)(?: on investments?)?\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "management_fees",
    label: "Management Fees",
    tableLabels: ["Management Fees", "Management Fee", "Investment Management Fee"],
    patterns: [new RegExp(`\\b(?:management fees?|investment management fee)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "management_fee_accrual",
    label: "Management Fee Accrual",
    tableLabels: ["Management Fee Accrual", "Accrued Management Fee", "Management Fee Payable"],
    patterns: [new RegExp(`\\b(?:management fee accrual|accrued management fee|management fee payable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "incentive_allocation",
    label: "Incentive / Carry Allocation",
    tableLabels: ["Incentive Allocation", "Performance Allocation", "Carry Allocation", "Carried Interest Allocation"],
    patterns: [new RegExp(`\\b(?:incentive allocation|performance allocation|carry allocation|carried interest allocation)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "fund_expenses",
    label: "Fund Expenses",
    tableLabels: ["Fund Expenses", "Operating Expenses", "Expenses", "Total Expenses"],
    patterns: [new RegExp(`\\b(?:fund expenses|operating expenses|total expenses|expenses)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "ending_nav",
    label: "Ending NAV",
    tableLabels: ["Ending NAV", "Closing NAV", "Net Asset Value", "Ending Net Asset Value", "Closing Net Asset Value"],
    patterns: [new RegExp(`\\b(?:ending nav|closing nav|net asset value|ending net asset value|closing net asset value)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
  },
  {
    key: "gross_asset_value",
    label: "Gross Asset Value",
    tableLabels: ["Gross Asset Value", "GAV", "Total Assets"],
    patterns: [new RegExp(`\\b(?:gross asset value|gav|total assets)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "investments_at_fair_value",
    label: "Investments at Fair Value",
    tableLabels: ["Investments at Fair Value", "Investment Assets", "Portfolio Fair Value", "Investments"],
    patterns: [new RegExp(`\\b(?:investments at fair value|investment assets|portfolio fair value|investments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "investment_cost",
    label: "Investment Cost",
    tableLabels: ["Investment Cost", "Cost Basis", "Investments at Cost", "Portfolio Cost"],
    patterns: [new RegExp(`\\b(?:investment cost|cost basis|investments at cost|portfolio cost)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "level_3_investments",
    label: "Level 3 Investments",
    tableLabels: ["Level 3 Investments", "Level III Investments", "Level 3 Assets", "Level III Assets"],
    patterns: [new RegExp(`\\b(?:level 3 investments|level iii investments|level 3 assets|level iii assets)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "illiquid_investments",
    label: "Illiquid Investments",
    tableLabels: ["Illiquid Investments", "Illiquid Assets", "Restricted Investments"],
    patterns: [new RegExp(`\\b(?:illiquid investments|illiquid assets|restricted investments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "unfunded_commitments",
    label: "Unfunded Commitments",
    tableLabels: ["Unfunded Commitments", "Remaining Commitments", "Uncalled Commitments", "Open Commitments"],
    patterns: [new RegExp(`\\b(?:unfunded commitments|remaining commitments|uncalled commitments|open commitments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "total_liabilities",
    label: "Total Liabilities",
    tableLabels: ["Total Liabilities", "Liabilities"],
    patterns: [new RegExp(`\\b(?:total liabilities|liabilities)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "payables_and_accruals",
    label: "Payables and Accruals",
    tableLabels: ["Payables and Accruals", "Accrued Expenses", "Accounts Payable", "Payables"],
    patterns: [new RegExp(`\\b(?:payables and accruals|accrued expenses|accounts payable|payables)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "receivables",
    label: "Receivables",
    tableLabels: ["Receivables", "Subscriptions Receivable", "Interest Receivable", "Accounts Receivable"],
    patterns: [new RegExp(`\\b(?:receivables|subscriptions receivable|interest receivable|accounts receivable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "cash_balance",
    label: "Cash Balance",
    tableLabels: ["Cash Balance", "Cash", "Cash and Cash Equivalents"],
    patterns: [new RegExp(`\\b(?:cash balance|cash and cash equivalents|cash)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "restricted_cash",
    label: "Restricted Cash",
    tableLabels: ["Restricted Cash", "Escrow Cash", "Cash Collateral"],
    patterns: [new RegExp(`\\b(?:restricted cash|escrow cash|cash collateral)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "units_outstanding",
    label: "Units / Shares Outstanding",
    tableLabels: ["Units Outstanding", "Shares Outstanding", "Interests Outstanding", "Ending Units", "Ending Shares"],
    patterns: [new RegExp(`\\b(?:units outstanding|shares outstanding|interests outstanding|ending units|ending shares)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "share_class",
    label: "Share / Unit Class",
    tableLabels: ["Share Class", "Unit Class", "Class", "Series"],
    patterns: [/\b(?:share class|unit class|class|series)\s*(?:is|:)?\s*([A-Za-z0-9 .-]{1,60})(?:[.;\n]|$)/i],
    confidence: 0.76,
  },
  {
    key: "class_nav",
    label: "Class NAV",
    tableLabels: ["Class NAV", "Class Net Asset Value", "Series NAV"],
    patterns: [new RegExp(`\\b(?:class nav|class net asset value|series nav)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "nav_per_unit",
    label: "NAV Per Unit / Share",
    tableLabels: ["NAV Per Unit", "NAV Per Share", "Unit Price", "Share Price"],
    patterns: [new RegExp(`\\b(?:nav per (?:unit|share)|unit price|share price)\\s*(?:is|:|of)?\\s*((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,]*(?:\\.[0-9]{2,6})?)`, "i")],
    confidence: 0.9,
  },
  {
    key: "investor_count",
    label: "Investor Count",
    tableLabels: ["Investor Count", "Number of Investors", "Shareholder Count", "Holder Count"],
    patterns: [/\b(?:investor count|number of investors|shareholder count|holder count)\s*(?:is|:)?\s*([0-9][0-9,]*)/i],
    confidence: 0.78,
  },
  {
    key: "approval_status",
    label: "Approval Status",
    tableLabels: ["Approval Status", "Review Status", "NAV Status"],
    patterns: [
      /\b(?:approval status|review status|nav status)\s*(?:is|:)?\s*(approved|reviewed|pending|draft|final|rejected)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "approved_by",
    label: "Approved By",
    tableLabels: ["Approved By", "Reviewed By", "Authorized By"],
    patterns: [/\b(?:approved by|reviewed by|authorized by)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,100})(?:[.;\n]|$)/i],
    confidence: 0.78,
  },
  {
    key: "approval_date",
    label: "Approval Date",
    tableLabels: ["Approval Date", "Review Date", "Authorized Date"],
    patterns: [new RegExp(`\\b(?:approval date|review date|authorized date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.78,
  },
]

function identityPoint(text) {
  const match = String(text || "").match(/\b(nav package|nav pack|net asset value package|administrator report|fund administrator report|monthly nav report|quarterly nav report)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "NAV Package",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function navRollforwardVariance(values) {
  const beginning = parseNumber(values.beginning_nav)
  const ending = parseNumber(values.ending_nav)
  if (beginning === null || ending === null) return null
  const componentKeys = [
    ["subscriptions", 1],
    ["redemptions", -1],
    ["distributions", -1],
    ["net_investment_income", 1],
    ["realized_gain_loss", 1],
    ["unrealized_gain_loss", 1],
    ["management_fees", -1],
    ["fund_expenses", -1],
  ]
  let componentCount = 0
  const computedEnding = componentKeys.reduce((total, [key, sign]) => {
    const value = parseNumber(values[key])
    if (value === null) return total
    componentCount += 1
    return total + sign * Math.abs(value)
  }, beginning)
  if (!componentCount) return null
  return computedEnding - ending
}

function navPerUnitVariance(values) {
  const ending = parseNumber(values.ending_nav)
  const units = parseNumber(values.units_outstanding)
  const navPerUnit = parseNumber(values.nav_per_unit)
  if (ending === null || units === null || navPerUnit === null || Math.abs(units) <= 0.0000001) return null
  return ending / units - navPerUnit
}

function navBalanceSheetVariance(values) {
  const grossAssetValue = parseNumber(values.gross_asset_value)
  const totalLiabilities = parseNumber(values.total_liabilities)
  const ending = parseNumber(values.ending_nav)
  if (grossAssetValue === null || totalLiabilities === null || ending === null) return null
  return grossAssetValue - totalLiabilities - ending
}

function netCapitalActivityVariance(values) {
  const subscriptions = parseNumber(values.subscriptions)
  const redemptions = parseNumber(values.redemptions)
  const distributions = parseNumber(values.distributions)
  const netActivity = parseNumber(values.net_capital_activity)
  if (subscriptions === null || netActivity === null) return null
  return subscriptions - Math.abs(redemptions || 0) - Math.abs(distributions || 0) - netActivity
}

class NavPackageReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = NAV_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = identityPoint(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const rollforwardVariance = navRollforwardVariance(values)
    const unitPriceVariance = navPerUnitVariance(values)
    const balanceSheetVariance = navBalanceSheetVariance(values)
    const capitalActivityVariance = netCapitalActivityVariance(values)
    if (rollforwardVariance !== null) {
      keyPoints.push(point({
        key: "nav_rollforward_reconciliation",
        label: "NAV Rollforward Reconciliation",
        value: Math.abs(rollforwardVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(rollforwardVariance, 2)}`,
        confidence: 0.92,
      }))
    }
    if (unitPriceVariance !== null) {
      keyPoints.push(point({
        key: "nav_per_unit_reconciliation",
        label: "NAV Per Unit Reconciliation",
        value: Math.abs(unitPriceVariance) <= 0.000001 ? "Reconciled" : `Variance ${formatNumber(unitPriceVariance, 6)}`,
        confidence: 0.9,
      }))
    }
    if (balanceSheetVariance !== null) {
      keyPoints.push(point({
        key: "nav_balance_sheet_reconciliation",
        label: "NAV Balance Sheet Reconciliation",
        value: Math.abs(balanceSheetVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(balanceSheetVariance, 2)}`,
        confidence: 0.9,
      }))
    }
    if (capitalActivityVariance !== null) {
      keyPoints.push(point({
        key: "net_capital_activity_reconciliation",
        label: "Net Capital Activity Reconciliation",
        value: Math.abs(capitalActivityVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(capitalActivityVariance, 2)}`,
        confidence: 0.88,
      }))
    }
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["valuation_date", "ending_nav"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "nav_package_core_fields_not_detected", message: `Review missing NAV package fields: ${missing.join(", ")}.` })
    }
    if (rollforwardVariance !== null && Math.abs(rollforwardVariance) > 0.01) {
      issues.push({ code: "nav_package_rollforward_mismatch", message: `NAV rollforward does not agree to ending NAV by ${formatNumber(rollforwardVariance, 2)}.` })
    }
    if (unitPriceVariance !== null && Math.abs(unitPriceVariance) > 0.000001) {
      issues.push({ code: "nav_package_unit_price_mismatch", message: `Ending NAV divided by units differs from NAV per unit by ${formatNumber(unitPriceVariance, 6)}.` })
    }
    if (balanceSheetVariance !== null && Math.abs(balanceSheetVariance) > 0.01) {
      issues.push({ code: "nav_package_balance_sheet_mismatch", message: `Gross asset value less liabilities does not agree to ending NAV by ${formatNumber(balanceSheetVariance, 2)}.` })
    }
    if (capitalActivityVariance !== null && Math.abs(capitalActivityVariance) > 0.01) {
      issues.push({ code: "nav_package_capital_activity_mismatch", message: `Subscriptions less redemptions and distributions does not agree to net capital activity by ${formatNumber(capitalActivityVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} NAV package fact(s) for report context review.`
        : "No standard NAV package facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.7 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        nav_rollforward_variance: rollforwardVariance,
        nav_per_unit_variance: unitPriceVariance,
        nav_balance_sheet_variance: balanceSheetVariance,
        net_capital_activity_variance: capitalActivityVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = NavPackageReader
