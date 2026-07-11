const { formatNumber, matchPointFromSource, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "capital_account_statement"
const READER_VERSION = "capital-account-statement.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"
const PERCENT_PATTERN = "([0-9]+(?:\\.[0-9]+)?\\s*%)"

const HEADER_ALIASES = {
  fund_name: ["fund", "fund name", "partnership", "entity"],
  investor_name: ["investor", "investor name", "limited partner", "lp", "partner", "holder name"],
  investor_type: ["investor type", "partner type", "lp type", "class type"],
  share_class: ["share class", "class", "unit class", "interest class", "series"],
  statement_period: ["period", "reporting period", "statement period", "capital account period"],
  statement_date: ["statement date", "report date", "as of date", "date"],
  reporting_currency: ["reporting currency", "currency", "base currency"],
  capital_account_method: ["capital account method", "capital basis", "basis", "accounting basis"],
  ownership_percentage: ["ownership percentage", "ownership percent", "ownership %", "capital percentage", "capital %", "ending ownership"],
  beginning_capital: ["beginning capital", "opening capital", "beginning capital account", "opening capital account"],
  contributions: ["contributions", "capital contributions", "capital called", "contribution"],
  transfer_in: ["transfer in", "transfers in", "capital transfer in", "transfer in amount"],
  transfer_out: ["transfer out", "transfers out", "capital transfer out", "transfer out amount"],
  distributions: ["distributions", "capital distributions", "distribution"],
  recallable_distributions: ["recallable distributions", "recallable amount", "recyclable distributions", "recallable distribution"],
  net_income_loss: ["net income loss", "net income", "net loss", "allocation", "allocations", "profit loss", "p&l allocation"],
  investment_income: ["investment income", "interest income", "dividend income", "income allocation"],
  realized_gain_loss: ["realized gain loss", "realized gain", "realized loss", "net realized gain loss"],
  unrealized_gain_loss: ["unrealized gain loss", "unrealized gain", "unrealized loss", "net unrealized gain loss"],
  management_fees: ["management fees", "management fee allocation", "management fee"],
  incentive_allocation: ["incentive allocation", "performance allocation", "carry allocation", "carried interest allocation"],
  other_expenses: ["other expenses", "fund expenses", "expense allocation", "expenses"],
  withholding: ["withholding", "tax withholding", "withholding tax"],
  ending_capital: ["ending capital", "closing capital", "ending capital account", "closing capital account"],
  commitment: ["commitment", "capital commitment", "committed capital"],
  called_capital: ["called capital", "capital called to date", "cumulative contributions", "funded commitment", "funded capital"],
  unfunded_commitment: ["unfunded commitment", "remaining commitment", "uncalled commitment"],
}

const KEY_VALUE_FIELDS = [
  {
    key: "document_identity",
    label: "Document Type",
    tableLabels: ["Document Type", "Statement Type"],
    patterns: [/\b(capital account statement|partner capital statement|investor capital account statement)\b/i],
    confidence: 0.94,
  },
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity"],
    patterns: [/\b(?:fund|fund name|partnership|entity)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
  },
  {
    key: "investor_name",
    label: "Investor",
    tableLabels: ["Investor", "Investor Name", "Limited Partner", "LP"],
    patterns: [/\b(?:investor name|investor|limited partner|lp)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
  },
  {
    key: "investor_type",
    label: "Investor Type",
    tableLabels: ["Investor Type", "Partner Type", "LP Type"],
    patterns: [/\b(?:investor type|partner type|lp type)\s*(?:is|:)?\s*([A-Za-z0-9 /.-]{3,80})(?:[.;\n]|$)/i],
  },
  {
    key: "share_class",
    label: "Share / Interest Class",
    tableLabels: ["Share Class", "Class", "Unit Class", "Interest Class", "Series"],
    patterns: [/\b(?:share class|class|unit class|interest class|series)\s*(?:is|:)?\s*([A-Za-z0-9 .-]{1,60})(?:[.;\n]|$)/i],
  },
  {
    key: "statement_period",
    label: "Statement Period",
    tableLabels: ["Statement Period", "Reporting Period", "Period"],
    patterns: [/\b(?:statement period|reporting period|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,80})/i],
  },
  {
    key: "statement_date",
    label: "Statement Date",
    tableLabels: ["Statement Date", "Report Date", "As Of Date", "Date"],
    patterns: [new RegExp(`\\b(?:statement date|report date|as of date|as of)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Currency", "Base Currency"],
    patterns: [/\b(?:reporting currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
  },
  {
    key: "capital_account_method",
    label: "Capital Account Method",
    tableLabels: ["Capital Account Method", "Capital Basis", "Basis", "Accounting Basis"],
    patterns: [/\b(?:capital account method|capital basis|basis|accounting basis)\s*(?:is|:)?\s*([^.\n;]{4,120})/i],
  },
  {
    key: "ownership_percentage",
    label: "Ownership Percentage",
    tableLabels: ["Ownership Percentage", "Ownership %", "Capital Percentage", "Capital %"],
    patterns: [new RegExp(`\\b(?:ownership percentage|ownership %|capital percentage|capital %)\\s*(?:is|:)?\\s*${PERCENT_PATTERN}`, "i")],
  },
  {
    key: "beginning_capital",
    label: "Beginning Capital",
    tableLabels: ["Beginning Capital", "Opening Capital", "Beginning Capital Account"],
    patterns: [new RegExp(`\\b(?:beginning|opening)\\s+capital(?: account)?\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "contributions",
    label: "Capital Contributions",
    tableLabels: ["Contributions", "Capital Contributions", "Capital Called"],
    patterns: [new RegExp(`\\b(?:capital contributions|contributions|capital called)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "transfer_in",
    label: "Transfer In",
    tableLabels: ["Transfer In", "Transfers In", "Capital Transfer In"],
    patterns: [new RegExp(`\\b(?:transfer in|transfers in|capital transfer in)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "transfer_out",
    label: "Transfer Out",
    tableLabels: ["Transfer Out", "Transfers Out", "Capital Transfer Out"],
    patterns: [new RegExp(`\\b(?:transfer out|transfers out|capital transfer out)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "distributions",
    label: "Distributions",
    tableLabels: ["Distributions", "Capital Distributions"],
    patterns: [new RegExp(`\\b(?:capital distributions|distributions)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "recallable_distributions",
    label: "Recallable Distributions",
    tableLabels: ["Recallable Distributions", "Recallable Amount", "Recyclable Distributions"],
    patterns: [new RegExp(`\\b(?:recallable distributions|recallable amount|recyclable distributions)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "net_income_loss",
    label: "Net Income / Loss",
    tableLabels: ["Net Income", "Net Loss", "Net Income (Loss)", "Allocation", "Profit / Loss"],
    patterns: [new RegExp(`\\b(?:net income|net loss|net income loss|allocation|profit loss)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "investment_income",
    label: "Investment Income",
    tableLabels: ["Investment Income", "Interest Income", "Dividend Income", "Income Allocation"],
    patterns: [new RegExp(`\\b(?:investment income|interest income|dividend income|income allocation)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "realized_gain_loss",
    label: "Realized Gain / Loss",
    tableLabels: ["Realized Gain/Loss", "Realized Gain", "Realized Loss", "Net Realized Gain/Loss"],
    patterns: [new RegExp(`\\b(?:realized|realised) (?:gain|loss|gain/loss)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "unrealized_gain_loss",
    label: "Unrealized Gain / Loss",
    tableLabels: ["Unrealized Gain/Loss", "Unrealized Gain", "Unrealized Loss", "Net Unrealized Gain/Loss"],
    patterns: [new RegExp(`\\b(?:unrealized|unrealised) (?:gain|loss|gain/loss)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "management_fees",
    label: "Management Fees",
    tableLabels: ["Management Fees", "Management Fee Allocation", "Management Fee"],
    patterns: [new RegExp(`\\b(?:management fees?|management fee allocation)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "incentive_allocation",
    label: "Incentive / Carry Allocation",
    tableLabels: ["Incentive Allocation", "Performance Allocation", "Carry Allocation", "Carried Interest Allocation"],
    patterns: [new RegExp(`\\b(?:incentive allocation|performance allocation|carry allocation|carried interest allocation)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "other_expenses",
    label: "Other Expenses",
    tableLabels: ["Other Expenses", "Fund Expenses", "Expense Allocation", "Expenses"],
    patterns: [new RegExp(`\\b(?:other expenses|fund expenses|expense allocation|expenses)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "withholding",
    label: "Withholding",
    tableLabels: ["Withholding", "Tax Withholding", "Withholding Tax"],
    patterns: [new RegExp(`\\b(?:withholding|tax withholding|withholding tax)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "ending_capital",
    label: "Ending Capital",
    tableLabels: ["Ending Capital", "Closing Capital", "Ending Capital Account"],
    patterns: [new RegExp(`\\b(?:ending|closing)\\s+capital(?: account)?\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "commitment",
    label: "Capital Commitment",
    tableLabels: ["Commitment", "Capital Commitment", "Committed Capital"],
    patterns: [new RegExp(`\\b(?:capital commitment|commitment|committed capital)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "called_capital",
    label: "Called / Funded Capital",
    tableLabels: ["Called Capital", "Capital Called to Date", "Cumulative Contributions", "Funded Commitment", "Funded Capital"],
    patterns: [new RegExp(`\\b(?:called capital|capital called to date|cumulative contributions|funded commitment|funded capital)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
  },
  {
    key: "unfunded_commitment",
    label: "Unfunded Commitment",
    tableLabels: ["Unfunded Commitment", "Remaining Commitment", "Uncalled Commitment"],
    patterns: [new RegExp(`\\b(?:unfunded commitment|remaining commitment|uncalled commitment)\\s*(?:is|:)?\\s*${MONEY_PATTERN}`, "i")],
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

function selectAccountTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 25).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["investor_name", "beginning_capital", "contributions", "distributions", "ending_capital", "commitment"].filter(
        (key) => mapping[key] !== undefined,
      ).length
      if (!best || score > best.score) best = { table, headerIndex: index, mapping, score }
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
  return /^(?:grand\s+)?totals?$|^subtotals?$|^aggregate(?:\s+total)?$/i.test(singleLine(value))
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => value !== null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function numberDifference(left, right) {
  if (left === null || right === null) return 0
  return Math.abs(Number(left) - Number(right))
}

function rollforwardVariance(totals) {
  const required = [totals.beginning_capital, totals.contributions, totals.distributions, totals.net_income_loss, totals.ending_capital]
  if (required.some((value) => value === null)) return null
  return (
    totals.beginning_capital +
    totals.contributions +
    (totals.transfer_in || 0) -
    (totals.transfer_out || 0) -
    totals.distributions +
    totals.net_income_loss -
    totals.ending_capital
  )
}

function commitmentVariance(totals) {
  const required = [totals.commitment, totals.called_capital, totals.unfunded_commitment]
  if (required.some((value) => value === null)) return null
  return totals.commitment - totals.called_capital - totals.unfunded_commitment
}

function allocationVariance(totals) {
  if (totals.net_income_loss === null) return null
  const componentKeys = ["investment_income", "realized_gain_loss", "unrealized_gain_loss", "management_fees", "incentive_allocation", "other_expenses"]
  let componentCount = 0
  const computed = componentKeys.reduce((sum, key) => {
    const value = totals[key]
    if (value === null) return sum
    componentCount += 1
    const sign = ["management_fees", "incentive_allocation", "other_expenses"].includes(key) ? -1 : 1
    return sum + sign * Math.abs(value)
  }, 0)
  if (!componentCount) return null
  return computed - totals.net_income_loss
}

function largestByValue(rows, key) {
  return rows.reduce((largest, row) => {
    if (row[key] === null) return largest
    if (!largest || Math.abs(row[key]) > Math.abs(largest[key])) return row
    return largest
  }, null)
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
}

function parseKeyValueAccount(source) {
  const matched = KEY_VALUE_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
  const values = Object.fromEntries(matched.map((entry) => [entry.point_key, entry.value_text]))
  if (!matched.length || (!values.investor_name && !values.ending_capital)) return null
  return {
    points: matched,
    accounts: [{
      investor_name: values.investor_name || null,
      statement_period: values.statement_period || null,
      beginning_capital: parseNumber(values.beginning_capital),
      contributions: parseNumber(values.contributions),
      transfer_in: parseNumber(values.transfer_in),
      transfer_out: parseNumber(values.transfer_out),
      distributions: parseNumber(values.distributions),
      recallable_distributions: parseNumber(values.recallable_distributions),
      net_income_loss: parseNumber(values.net_income_loss),
      investment_income: parseNumber(values.investment_income),
      realized_gain_loss: parseNumber(values.realized_gain_loss),
      unrealized_gain_loss: parseNumber(values.unrealized_gain_loss),
      management_fees: parseNumber(values.management_fees),
      incentive_allocation: parseNumber(values.incentive_allocation),
      other_expenses: parseNumber(values.other_expenses),
      withholding: parseNumber(values.withholding),
      ending_capital: parseNumber(values.ending_capital),
      commitment: parseNumber(values.commitment),
      called_capital: parseNumber(values.called_capital),
      unfunded_commitment: parseNumber(values.unfunded_commitment),
      fund_name: values.fund_name || null,
      investor_type: values.investor_type || null,
      share_class: values.share_class || null,
      statement_date: values.statement_date || null,
      reporting_currency: values.reporting_currency || null,
      capital_account_method: values.capital_account_method || null,
      ownership_percentage: parseNumber(values.ownership_percentage),
    }],
  }
}

class CapitalAccountStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const selected = selectAccountTable(source.tables)
    let accounts = []
    let summaryRows = []
    let keyPoints = []
    let tableMeta = null

    if (selected) {
      const { table, headerIndex, mapping } = selected
      const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row) => ({
        row_label: firstTextCell(row),
        fund_name: singleLine(cell(row, mapping, "fund_name")),
        investor_name: singleLine(cell(row, mapping, "investor_name")),
        investor_type: singleLine(cell(row, mapping, "investor_type")),
        share_class: singleLine(cell(row, mapping, "share_class")),
        statement_period: singleLine(cell(row, mapping, "statement_period")),
        statement_date: singleLine(cell(row, mapping, "statement_date")),
        reporting_currency: singleLine(cell(row, mapping, "reporting_currency")),
        capital_account_method: singleLine(cell(row, mapping, "capital_account_method")),
        ownership_percentage: parseNumber(cell(row, mapping, "ownership_percentage")),
        beginning_capital: parseNumber(cell(row, mapping, "beginning_capital")),
        contributions: parseNumber(cell(row, mapping, "contributions")),
        transfer_in: parseNumber(cell(row, mapping, "transfer_in")),
        transfer_out: parseNumber(cell(row, mapping, "transfer_out")),
        distributions: parseNumber(cell(row, mapping, "distributions")),
        recallable_distributions: parseNumber(cell(row, mapping, "recallable_distributions")),
        net_income_loss: parseNumber(cell(row, mapping, "net_income_loss")),
        investment_income: parseNumber(cell(row, mapping, "investment_income")),
        realized_gain_loss: parseNumber(cell(row, mapping, "realized_gain_loss")),
        unrealized_gain_loss: parseNumber(cell(row, mapping, "unrealized_gain_loss")),
        management_fees: parseNumber(cell(row, mapping, "management_fees")),
        incentive_allocation: parseNumber(cell(row, mapping, "incentive_allocation")),
        other_expenses: parseNumber(cell(row, mapping, "other_expenses")),
        withholding: parseNumber(cell(row, mapping, "withholding")),
        ending_capital: parseNumber(cell(row, mapping, "ending_capital")),
        commitment: parseNumber(cell(row, mapping, "commitment")),
        called_capital: parseNumber(cell(row, mapping, "called_capital")),
        unfunded_commitment: parseNumber(cell(row, mapping, "unfunded_commitment")),
      }))
      summaryRows = parsedRows.filter((row) => isSummaryLabel(row.investor_name || row.row_label))
      accounts = parsedRows
        .filter((row) => !isSummaryLabel(row.investor_name || row.row_label))
        .filter((row) => row.investor_name || row.ending_capital !== null || row.beginning_capital !== null)
      tableMeta = { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping }
    } else {
      const keyValue = parseKeyValueAccount(source)
      if (keyValue) {
        accounts = keyValue.accounts
        keyPoints = keyValue.points
      }
    }

    const investors = Array.from(new Set(accounts.map((row) => row.investor_name).filter(Boolean)))
    const fundNames = uniqueValues(accounts, "fund_name")
    const shareClasses = uniqueValues(accounts, "share_class")
    const investorTypes = uniqueValues(accounts, "investor_type")
    const periods = Array.from(new Set(accounts.map((row) => row.statement_period).filter(Boolean)))
    const statementDates = uniqueValues(accounts, "statement_date")
    const reportingCurrencies = uniqueValues(accounts, "reporting_currency")
    const capitalAccountMethods = uniqueValues(accounts, "capital_account_method")
    const totals = {
      ownership_percentage: sumValues(accounts, "ownership_percentage"),
      beginning_capital: sumValues(accounts, "beginning_capital"),
      contributions: sumValues(accounts, "contributions"),
      transfer_in: sumValues(accounts, "transfer_in"),
      transfer_out: sumValues(accounts, "transfer_out"),
      distributions: sumValues(accounts, "distributions"),
      recallable_distributions: sumValues(accounts, "recallable_distributions"),
      net_income_loss: sumValues(accounts, "net_income_loss"),
      investment_income: sumValues(accounts, "investment_income"),
      realized_gain_loss: sumValues(accounts, "realized_gain_loss"),
      unrealized_gain_loss: sumValues(accounts, "unrealized_gain_loss"),
      management_fees: sumValues(accounts, "management_fees"),
      incentive_allocation: sumValues(accounts, "incentive_allocation"),
      other_expenses: sumValues(accounts, "other_expenses"),
      withholding: sumValues(accounts, "withholding"),
      ending_capital: sumValues(accounts, "ending_capital"),
      commitment: sumValues(accounts, "commitment"),
      called_capital: sumValues(accounts, "called_capital"),
      unfunded_commitment: sumValues(accounts, "unfunded_commitment"),
    }
    const declaredTotals = summaryRows.reduce(
      (declared, row) => ({
        beginning_capital: declared.beginning_capital ?? row.beginning_capital,
        contributions: declared.contributions ?? row.contributions,
        transfer_in: declared.transfer_in ?? row.transfer_in,
        transfer_out: declared.transfer_out ?? row.transfer_out,
        distributions: declared.distributions ?? row.distributions,
        recallable_distributions: declared.recallable_distributions ?? row.recallable_distributions,
        net_income_loss: declared.net_income_loss ?? row.net_income_loss,
        investment_income: declared.investment_income ?? row.investment_income,
        realized_gain_loss: declared.realized_gain_loss ?? row.realized_gain_loss,
        unrealized_gain_loss: declared.unrealized_gain_loss ?? row.unrealized_gain_loss,
        management_fees: declared.management_fees ?? row.management_fees,
        incentive_allocation: declared.incentive_allocation ?? row.incentive_allocation,
        other_expenses: declared.other_expenses ?? row.other_expenses,
        withholding: declared.withholding ?? row.withholding,
        ending_capital: declared.ending_capital ?? row.ending_capital,
        commitment: declared.commitment ?? row.commitment,
        called_capital: declared.called_capital ?? row.called_capital,
        unfunded_commitment: declared.unfunded_commitment ?? row.unfunded_commitment,
      }),
      {
        beginning_capital: null,
        contributions: null,
        transfer_in: null,
        transfer_out: null,
        distributions: null,
        recallable_distributions: null,
        net_income_loss: null,
        investment_income: null,
        realized_gain_loss: null,
        unrealized_gain_loss: null,
        management_fees: null,
        incentive_allocation: null,
        other_expenses: null,
        withholding: null,
        ending_capital: null,
        commitment: null,
        called_capital: null,
        unfunded_commitment: null,
      },
    )
    const variance = rollforwardVariance(totals)
    const commitmentReconciliationVariance = commitmentVariance(totals)
    const allocationReconciliationVariance = allocationVariance(totals)
    const largestEndingCapital = largestByValue(accounts, "ending_capital")
    keyPoints.push(
      ...[
        point({ key: "document_identity", label: "Document Type", value: "Capital Account Statement", confidence: 0.94 }),
        point({ key: "funds", label: "Funds", value: fundNames.join(", "), valueJson: fundNames, confidence: 0.84 }),
        point({ key: "capital_account_investors", label: "Capital Account Investors", value: String(accounts.length), confidence: 0.95 }),
        point({ key: "statement_periods", label: "Statement Periods", value: periods.join(", "), valueJson: periods, confidence: 0.84 }),
        point({ key: "statement_dates", label: "Statement Dates", value: statementDates.join(", "), valueJson: statementDates, confidence: 0.82 }),
        point({ key: "reporting_currencies", label: "Reporting Currencies", value: reportingCurrencies.join(", "), valueJson: reportingCurrencies, confidence: 0.82 }),
        point({ key: "capital_account_methods", label: "Capital Account Methods", value: capitalAccountMethods.join(", "), valueJson: capitalAccountMethods, confidence: 0.82 }),
        point({ key: "investors", label: "Investors", value: investors.join(", "), valueJson: investors, confidence: 0.84 }),
        point({ key: "share_classes", label: "Share / Interest Classes", value: shareClasses.join(", "), valueJson: shareClasses, confidence: 0.82 }),
        point({ key: "investor_types", label: "Investor Types", value: investorTypes.join(", "), valueJson: investorTypes, confidence: 0.8 }),
        point({ key: "ownership_percentage_total", label: "Total Ownership Percentage", value: formatNumber(totals.ownership_percentage, 4), confidence: 0.86 }),
        point({ key: "total_beginning_capital", label: "Total Beginning Capital", value: formatNumber(totals.beginning_capital, 2), confidence: 0.9 }),
        point({ key: "total_contributions", label: "Total Contributions", value: formatNumber(totals.contributions, 2), confidence: 0.9 }),
        point({ key: "total_transfer_in", label: "Total Transfer In", value: formatNumber(totals.transfer_in, 2), confidence: 0.84 }),
        point({ key: "total_transfer_out", label: "Total Transfer Out", value: formatNumber(totals.transfer_out, 2), confidence: 0.84 }),
        point({ key: "total_distributions", label: "Total Distributions", value: formatNumber(totals.distributions, 2), confidence: 0.9 }),
        point({ key: "total_recallable_distributions", label: "Total Recallable Distributions", value: formatNumber(totals.recallable_distributions, 2), confidence: 0.82 }),
        point({ key: "total_net_income_loss", label: "Total Net Income / Loss", value: formatNumber(totals.net_income_loss, 2), confidence: 0.88 }),
        point({ key: "total_investment_income", label: "Total Investment Income", value: formatNumber(totals.investment_income, 2), confidence: 0.84 }),
        point({ key: "total_realized_gain_loss", label: "Total Realized Gain / Loss", value: formatNumber(totals.realized_gain_loss, 2), confidence: 0.84 }),
        point({ key: "total_unrealized_gain_loss", label: "Total Unrealized Gain / Loss", value: formatNumber(totals.unrealized_gain_loss, 2), confidence: 0.84 }),
        point({ key: "total_management_fees", label: "Total Management Fees", value: formatNumber(totals.management_fees, 2), confidence: 0.82 }),
        point({ key: "total_incentive_allocation", label: "Total Incentive / Carry Allocation", value: formatNumber(totals.incentive_allocation, 2), confidence: 0.82 }),
        point({ key: "total_other_expenses", label: "Total Other Expenses", value: formatNumber(totals.other_expenses, 2), confidence: 0.82 }),
        point({ key: "total_withholding", label: "Total Withholding", value: formatNumber(totals.withholding, 2), confidence: 0.8 }),
        point({ key: "total_ending_capital", label: "Total Ending Capital", value: formatNumber(totals.ending_capital, 2), confidence: 0.94 }),
        point({ key: "total_commitment", label: "Total Commitment", value: formatNumber(totals.commitment, 2), confidence: 0.86 }),
        point({ key: "total_called_capital", label: "Total Called / Funded Capital", value: formatNumber(totals.called_capital, 2), confidence: 0.86 }),
        point({ key: "total_unfunded_commitment", label: "Total Unfunded Commitment", value: formatNumber(totals.unfunded_commitment, 2), confidence: 0.86 }),
        point({ key: "largest_capital_investor", label: "Largest Ending Capital Investor", value: largestEndingCapital?.investor_name, confidence: 0.82 }),
        point({ key: "largest_capital_amount", label: "Largest Ending Capital Amount", value: formatNumber(largestEndingCapital?.ending_capital, 2), confidence: 0.82 }),
        point({
          key: "capital_rollforward_reconciliation",
          label: "Capital Rollforward",
          value: variance === null ? null : Math.abs(variance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(variance, 2)}`,
          confidence: 0.92,
        }),
        point({
          key: "commitment_reconciliation",
          label: "Commitment Reconciliation",
          value:
            commitmentReconciliationVariance === null
              ? null
              : Math.abs(commitmentReconciliationVariance) <= 0.01
                ? "Reconciled"
                : `Variance ${formatNumber(commitmentReconciliationVariance, 2)}`,
          confidence: 0.9,
        }),
        point({
          key: "allocation_reconciliation",
          label: "Income Allocation Reconciliation",
          value:
            allocationReconciliationVariance === null
              ? null
              : Math.abs(allocationReconciliationVariance) <= 0.01
                ? "Reconciled"
                : `Variance ${formatNumber(allocationReconciliationVariance, 2)}`,
          confidence: 0.88,
        }),
      ].filter(Boolean),
    )

    const issues = []
    if (!accounts.length) {
      issues.push({ code: "capital_account_rows_not_found", message: "No readable capital account rows were detected." })
    }
    if (totals.ending_capital === null) {
      issues.push({ code: "capital_account_ending_capital_missing", message: "No ending capital total could be calculated." })
    }
    if (variance !== null && Math.abs(variance) > 0.01) {
      issues.push({ code: "capital_account_rollforward_mismatch", message: `Capital rollforward differs by ${formatNumber(variance, 2)}.` })
    }
    if (commitmentReconciliationVariance !== null && Math.abs(commitmentReconciliationVariance) > 0.01) {
      issues.push({
        code: "capital_account_commitment_mismatch",
        message: `Called plus unfunded capital does not agree to commitments by ${formatNumber(commitmentReconciliationVariance, 2)}.`,
      })
    }
    if (allocationReconciliationVariance !== null && Math.abs(allocationReconciliationVariance) > 0.01) {
      issues.push({
        code: "capital_account_allocation_mismatch",
        message: `Allocation components do not agree to net income/loss by ${formatNumber(allocationReconciliationVariance, 2)}.`,
      })
    }
    if (totals.ownership_percentage !== null && Math.abs(totals.ownership_percentage - 100) > 0.01) {
      issues.push({
        code: "capital_account_ownership_percentage_mismatch",
        message: `Ownership percentages total ${formatNumber(totals.ownership_percentage, 4)} instead of 100.0000.`,
      })
    }
    const mismatches = [
      numberDifference(totals.beginning_capital, declaredTotals.beginning_capital) > 0.01 ? "beginning capital" : null,
      numberDifference(totals.contributions, declaredTotals.contributions) > 0.01 ? "contributions" : null,
      numberDifference(totals.transfer_in, declaredTotals.transfer_in) > 0.01 ? "transfer in" : null,
      numberDifference(totals.transfer_out, declaredTotals.transfer_out) > 0.01 ? "transfer out" : null,
      numberDifference(totals.distributions, declaredTotals.distributions) > 0.01 ? "distributions" : null,
      numberDifference(totals.recallable_distributions, declaredTotals.recallable_distributions) > 0.01 ? "recallable distributions" : null,
      numberDifference(totals.net_income_loss, declaredTotals.net_income_loss) > 0.01 ? "net income/loss" : null,
      numberDifference(totals.ending_capital, declaredTotals.ending_capital) > 0.01 ? "ending capital" : null,
      numberDifference(totals.called_capital, declaredTotals.called_capital) > 0.01 ? "called capital" : null,
      numberDifference(totals.unfunded_commitment, declaredTotals.unfunded_commitment) > 0.01 ? "unfunded commitment" : null,
    ].filter(Boolean)
    if (mismatches.length) {
      issues.push({
        code: "capital_account_declared_totals_mismatch",
        message: `Computed account totals differ from the statement summary row for: ${mismatches.join(", ")}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: accounts.length && totals.ending_capital !== null && !issues.length ? "completed" : "partial",
      summary_text: accounts.length
        ? `Read ${accounts.length} capital account record(s) for reporting context.`
        : "No capital account records were detected automatically.",
      confidence: accounts.length && totals.ending_capital !== null ? (issues.length ? 0.76 : 0.94) : 0.18,
      key_points: keyPoints,
      structured_data_json: {
        ...(tableMeta || {}),
        accounts,
        summary_rows: summaryRows.length,
        declared_totals: declaredTotals,
        totals,
        rollforward_variance: variance,
        commitment_reconciliation_variance: commitmentReconciliationVariance,
        allocation_reconciliation_variance: allocationReconciliationVariance,
        largest_ending_capital: largestEndingCapital,
      },
      issues_json: issues,
      source_text_excerpt: snippet(source.text, 1200),
    }
  }
}

module.exports = CapitalAccountStatementReader
