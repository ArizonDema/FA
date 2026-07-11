const { formatNumber, matchPointFromSource, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "investor_activity_statement"
const READER_VERSION = "investor-activity-statement.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"

const HEADER_ALIASES = {
  fund_name: ["fund", "fund name", "partnership", "entity"],
  investor_name: ["investor", "investor name", "shareholder", "holder", "holder name", "account name", "subscriber"],
  investor_type: ["investor type", "holder type", "shareholder type", "partner type"],
  investor_status: ["investor status", "holder status", "account status", "status"],
  share_class: ["share class", "class", "unit class", "series", "interest class"],
  notice_reference: ["notice reference", "reference", "transaction reference", "activity reference", "request number"],
  transaction_type: ["activity type", "transaction type", "transaction", "movement type", "type", "activity"],
  trade_date: ["trade date", "transaction date", "activity date", "request date"],
  effective_date: ["effective date", "nav date", "valuation date", "date"],
  settlement_date: ["settlement date", "payment date", "cash date", "funding date"],
  subscription_amount: ["subscription amount", "subscriptions", "capital subscriptions", "capital contributions", "contributions", "purchases"],
  redemption_amount: ["redemption amount", "redemptions", "withdrawals", "repurchases"],
  transfer_in_amount: ["transfer in", "transfer in amount", "units transferred in", "amount transferred in"],
  transfer_out_amount: ["transfer out", "transfer out amount", "units transferred out", "amount transferred out"],
  gross_amount: ["gross amount", "gross activity", "gross transaction amount", "requested amount"],
  fee_amount: ["fee", "fees", "transaction fee", "redemption fee", "subscription fee"],
  holdback_amount: ["holdback", "holdback amount", "reserve", "retention"],
  net_amount: ["net amount", "net activity", "net proceeds", "cash movement", "net cash movement"],
  amount: ["amount", "transaction amount", "capital amount"],
  beginning_units: ["beginning units", "opening units", "beginning shares", "opening shares"],
  units: ["units", "shares", "unit movement", "share movement", "units shares", "net units", "number of units"],
  ending_units: ["ending units", "closing units", "ending shares", "closing shares"],
  nav_per_unit: ["nav per unit", "nav per share", "unit price", "share price", "price"],
  currency: ["currency", "transaction currency", "base currency"],
  settlement_status: ["settlement status", "payment status", "cash status"],
  approval_status: ["approval status", "activity status", "processing status"],
  source_investor: ["source investor", "transferor", "from investor"],
  destination_investor: ["destination investor", "transferee", "to investor"],
}

const SUMMARY_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Partnership", "Entity"],
    patterns: [/\b(?:fund|fund name|partnership|entity)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.82,
  },
  {
    key: "activity_period",
    label: "Activity Period",
    tableLabels: ["Activity Period", "Reporting Period", "Statement Period", "Period"],
    patterns: [
      /\b(?:activity period|reporting period|statement period|period covered|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{4,100})/i,
    ],
    confidence: 0.88,
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Reporting Currency", "Base Currency", "Currency"],
    patterns: [/\b(?:reporting currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
    confidence: 0.82,
  },
  {
    key: "subscription_amount",
    label: "Subscription Amount",
    tableLabels: ["Subscriptions", "Subscription Amount", "Capital Subscriptions", "Capital Contributions"],
    patterns: [new RegExp(`\\b(?:subscriptions?|capital subscriptions?|capital contributions?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "redemption_amount",
    label: "Redemption Amount",
    tableLabels: ["Redemptions", "Redemption Amount", "Withdrawals", "Repurchases"],
    patterns: [new RegExp(`\\b(?:redemptions?|withdrawals?|repurchases?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "transfer_in_amount",
    label: "Transfer In Amount",
    tableLabels: ["Transfer In", "Transfer In Amount", "Amount Transferred In"],
    patterns: [new RegExp(`\\b(?:transfer in|transfer in amount|amount transferred in)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "transfer_out_amount",
    label: "Transfer Out Amount",
    tableLabels: ["Transfer Out", "Transfer Out Amount", "Amount Transferred Out"],
    patterns: [new RegExp(`\\b(?:transfer out|transfer out amount|amount transferred out)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "gross_activity_amount",
    label: "Gross Activity Amount",
    tableLabels: ["Gross Activity", "Gross Amount", "Gross Transaction Amount"],
    patterns: [new RegExp(`\\b(?:gross activity|gross amount|gross transaction amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "activity_fee_amount",
    label: "Activity Fees",
    tableLabels: ["Fees", "Activity Fees", "Transaction Fees", "Redemption Fees"],
    patterns: [new RegExp(`\\b(?:activity fees|transaction fees|redemption fees|fees)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "holdback_amount",
    label: "Holdback Amount",
    tableLabels: ["Holdback", "Holdback Amount", "Reserve", "Retention"],
    patterns: [new RegExp(`\\b(?:holdback|holdback amount|reserve|retention)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "net_activity_amount",
    label: "Net Activity Amount",
    tableLabels: ["Net Activity", "Net Capital Activity", "Net Subscriptions", "Net Movement"],
    patterns: [new RegExp(`\\b(?:net activity|net capital activity|net subscriptions?|net movement)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "beginning_units",
    label: "Beginning Units / Shares",
    tableLabels: ["Beginning Units", "Opening Units", "Beginning Shares", "Opening Shares"],
    patterns: [/\b(?:beginning units|opening units|beginning shares|opening shares)\s*(?:is|:)?\s*([0-9][0-9,.]*(?:\.[0-9]{2,6})?)/i],
    confidence: 0.82,
  },
  {
    key: "ending_units",
    label: "Ending Units / Shares",
    tableLabels: ["Ending Units", "Closing Units", "Ending Shares", "Closing Shares"],
    patterns: [/\b(?:ending units|closing units|ending shares|closing shares)\s*(?:is|:)?\s*([0-9][0-9,.]*(?:\.[0-9]{2,6})?)/i],
    confidence: 0.84,
  },
  {
    key: "nav_per_unit",
    label: "NAV Per Unit / Share",
    tableLabels: ["NAV Per Unit", "NAV Per Share", "Unit Price", "Share Price"],
    patterns: [
      /\b(?:nav per (?:unit|share)|unit price|share price)\s*(?:is|:|\|)?\s*((?:US\$|USD|EUR|GBP|\$)?\s*[0-9][0-9,]*(?:\.[0-9]{2,6})?)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "statement_date",
    label: "Statement Date",
    tableLabels: ["Statement Date", "Report Date", "Date"],
    patterns: [new RegExp(`\\b(?:statement date|report date|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.82,
  },
]

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function columnMapping(headerRow) {
  const mapping = {}
  rowAliases(headerRow).forEach(({ normalized, index }) => {
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      const normalizedAliases = aliases.map(normalizeHeader)
      if (mapping[key] === undefined && normalizedAliases.includes(normalized)) mapping[key] = index
    })
  })
  return mapping
}

function rowAliases(row) {
  return row.map((cell, index) => ({ normalized: normalizeHeader(cell), index })).filter((entry) => entry.normalized)
}

function selectActivityTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 30).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = [
        "fund_name",
        "investor_name",
        "investor_type",
        "investor_status",
        "share_class",
        "notice_reference",
        "transaction_type",
        "effective_date",
        "settlement_date",
        "subscription_amount",
        "redemption_amount",
        "transfer_in_amount",
        "transfer_out_amount",
        "gross_amount",
        "net_amount",
        "amount",
        "units",
        "nav_per_unit",
      ].filter((key) => mapping[key] !== undefined).length
      const hasActivityColumn =
        mapping.transaction_type !== undefined ||
        mapping.subscription_amount !== undefined ||
        mapping.redemption_amount !== undefined ||
        mapping.transfer_in_amount !== undefined ||
        mapping.transfer_out_amount !== undefined ||
        mapping.net_amount !== undefined
      if (hasActivityColumn && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
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
  return /^(?:grand\s+)?totals?$|^subtotals?$|^aggregate(?:\s+total)?$|^net\s+activity$/i.test(singleLine(value))
}

function normalizeActivityType(typeValue, rowLabel) {
  const text = `${singleLine(typeValue)} ${singleLine(rowLabel)}`.toLowerCase()
  if (/\b(?:subscription|contribution|purchase|issuance|capital in)\b/.test(text)) return "subscription"
  if (/\b(?:redemption|withdrawal|repurchase|capital out)\b/.test(text)) return "redemption"
  if (/\btransfer\s+in\b/.test(text)) return "transfer_in"
  if (/\btransfer\s+out\b/.test(text)) return "transfer_out"
  if (/\btransfer\b/.test(text)) return "transfer"
  return singleLine(typeValue || rowLabel) || "unknown"
}

function classifiedAmounts(row) {
  const result = {
    subscription_amount: row.subscription_amount,
    redemption_amount: row.redemption_amount,
    transfer_in_amount: row.transfer_in_amount,
    transfer_out_amount: row.transfer_out_amount,
  }
  const sourceAmount = row.amount ?? row.gross_amount ?? row.net_amount
  if (sourceAmount === null) return result
  const amount = Math.abs(sourceAmount)
  if (row.transaction_type === "subscription") result.subscription_amount ??= amount
  else if (row.transaction_type === "redemption") result.redemption_amount ??= amount
  else if (row.transaction_type === "transfer_in") result.transfer_in_amount ??= amount
  else if (row.transaction_type === "transfer_out") result.transfer_out_amount ??= amount
  else if (sourceAmount < 0) result.redemption_amount ??= amount
  else result.subscription_amount ??= amount
  return result
}

function unitDelta(row) {
  if (row.units === null) return null
  if (["redemption", "transfer_out"].includes(row.transaction_type)) return -Math.abs(row.units)
  return row.units
}

function parseActivityRow(row, mapping) {
  const base = {
    row_label: firstTextCell(row),
    fund_name: singleLine(cell(row, mapping, "fund_name")),
    investor_name: singleLine(cell(row, mapping, "investor_name")),
    investor_type: singleLine(cell(row, mapping, "investor_type")),
    investor_status: singleLine(cell(row, mapping, "investor_status")),
    share_class: singleLine(cell(row, mapping, "share_class")),
    notice_reference: singleLine(cell(row, mapping, "notice_reference")),
    trade_date: singleLine(cell(row, mapping, "trade_date")),
    effective_date: singleLine(cell(row, mapping, "effective_date")),
    settlement_date: singleLine(cell(row, mapping, "settlement_date")),
    transaction_type: normalizeActivityType(cell(row, mapping, "transaction_type"), firstTextCell(row)),
    gross_amount: parseNumber(cell(row, mapping, "gross_amount")),
    fee_amount: parseNumber(cell(row, mapping, "fee_amount")),
    holdback_amount: parseNumber(cell(row, mapping, "holdback_amount")),
    net_amount: parseNumber(cell(row, mapping, "net_amount")),
    amount: parseNumber(cell(row, mapping, "amount")),
    subscription_amount: parseNumber(cell(row, mapping, "subscription_amount")),
    redemption_amount: parseNumber(cell(row, mapping, "redemption_amount")),
    transfer_in_amount: parseNumber(cell(row, mapping, "transfer_in_amount")),
    transfer_out_amount: parseNumber(cell(row, mapping, "transfer_out_amount")),
    beginning_units: parseNumber(cell(row, mapping, "beginning_units")),
    units: parseNumber(cell(row, mapping, "units")),
    ending_units: parseNumber(cell(row, mapping, "ending_units")),
    nav_per_unit: parseNumber(cell(row, mapping, "nav_per_unit")),
    currency: singleLine(cell(row, mapping, "currency")),
    settlement_status: singleLine(cell(row, mapping, "settlement_status")),
    approval_status: singleLine(cell(row, mapping, "approval_status")),
    source_investor: singleLine(cell(row, mapping, "source_investor")),
    destination_investor: singleLine(cell(row, mapping, "destination_investor")),
  }
  return { ...base, ...classifiedAmounts(base) }
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function firstFinite(rows, key) {
  const row = rows.find((entry) => Number.isFinite(entry[key]))
  return row ? row[key] : null
}

function lastFinite(rows, key) {
  const reversed = [...rows].reverse()
  const row = reversed.find((entry) => Number.isFinite(entry[key]))
  return row ? row[key] : null
}

function numberDifference(left, right) {
  if (left === null || right === null) return 0
  return Math.abs(Number(left) - Number(right))
}

function identityPoint(text) {
  const match = String(text || "").match(/\b(investor activity statement|shareholder activity statement|capital activity statement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Investor Activity Statement",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
}

function activityTypeCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.transaction_type] = (counts[row.transaction_type] || 0) + 1
    return counts
  }, {})
}

function valueCounts(rows, key) {
  return rows.reduce((counts, row) => {
    const value = singleLine(row[key])
    if (!value) return counts
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function countsText(counts) {
  return Object.entries(counts)
    .map(([value, count]) => `${value}: ${count}`)
    .join(", ")
}

function largestByValue(rows, key) {
  return rows.reduce((largest, row) => {
    if (!Number.isFinite(row[key])) return largest
    if (!largest || Math.abs(row[key]) > Math.abs(largest[key])) return row
    return largest
  }, null)
}

function netCashVariance(totals) {
  if (totals.gross_amount === null || totals.net_amount === null) return null
  return totals.gross_amount - (totals.fee_amount || 0) - (totals.holdback_amount || 0) - totals.net_amount
}

function endingUnitsVariance(totals) {
  if (totals.beginning_units === null || totals.net_units === null || totals.ending_units === null) return null
  return totals.beginning_units + totals.net_units - totals.ending_units
}

class InvestorActivityStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const selected = selectActivityTable(source.tables)
    const summaryPoints = SUMMARY_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(text)
    if (identity) summaryPoints.unshift(identity)

    let transactions = []
    let summaryRows = []
    let declaredTotals = {
      subscriptions: null,
      redemptions: null,
      transfer_in: null,
      transfer_out: null,
      gross_amount: null,
      fee_amount: null,
      holdback_amount: null,
      net_amount: null,
      beginning_units: null,
      units: null,
      ending_units: null,
    }
    let tableMeta = null

    if (selected) {
      const { table, headerIndex, mapping } = selected
      const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row) => parseActivityRow(row, mapping))
      summaryRows = parsedRows.filter((row) => isSummaryLabel(row.investor_name || row.row_label))
      transactions = parsedRows
        .filter((row) => !isSummaryLabel(row.investor_name || row.row_label))
        .filter((row) =>
          row.investor_name ||
          row.effective_date ||
          row.trade_date ||
          row.settlement_date ||
          row.subscription_amount !== null ||
          row.redemption_amount !== null ||
          row.transfer_in_amount !== null ||
          row.transfer_out_amount !== null ||
          row.net_amount !== null ||
          row.units !== null,
        )
      declaredTotals = summaryRows.reduce(
        (totals, row) => ({
          subscriptions: totals.subscriptions ?? row.subscription_amount,
          redemptions: totals.redemptions ?? row.redemption_amount,
          transfer_in: totals.transfer_in ?? row.transfer_in_amount,
          transfer_out: totals.transfer_out ?? row.transfer_out_amount,
          gross_amount: totals.gross_amount ?? row.gross_amount,
          fee_amount: totals.fee_amount ?? row.fee_amount,
          holdback_amount: totals.holdback_amount ?? row.holdback_amount,
          net_amount: totals.net_amount ?? row.net_amount,
          beginning_units: totals.beginning_units ?? row.beginning_units,
          units: totals.units ?? unitDelta(row),
          ending_units: totals.ending_units ?? row.ending_units,
        }),
        declaredTotals,
      )
      tableMeta = { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping }
    }

    const investors = uniqueValues(transactions, "investor_name")
    const funds = uniqueValues(transactions, "fund_name")
    const investorTypes = uniqueValues(transactions, "investor_type")
    const investorStatuses = uniqueValues(transactions, "investor_status")
    const shareClasses = uniqueValues(transactions, "share_class")
    const tradeDates = uniqueValues(transactions, "trade_date")
    const transactionDates = uniqueValues(transactions, "effective_date")
    const settlementDates = uniqueValues(transactions, "settlement_date")
    const navValues = uniqueValues(transactions, "nav_per_unit")
    const currencies = uniqueValues(transactions, "currency")
    const settlementStatusCounts = valueCounts(transactions, "settlement_status")
    const approvalStatusCounts = valueCounts(transactions, "approval_status")
    const subscriptionAmount = sumValues(transactions, "subscription_amount")
    const redemptionAmount = sumValues(transactions, "redemption_amount")
    const transferInAmount = sumValues(transactions, "transfer_in_amount")
    const transferOutAmount = sumValues(transactions, "transfer_out_amount")
    const grossAmount = sumValues(transactions, "gross_amount")
    const feeAmount = sumValues(transactions, "fee_amount")
    const holdbackAmount = sumValues(transactions, "holdback_amount")
    const netAmount = sumValues(transactions, "net_amount")
    const beginningUnits = firstFinite(transactions, "beginning_units")
    const endingUnits = lastFinite(transactions, "ending_units")
    const unitMovements = transactions.map(unitDelta).filter((value) => Number.isFinite(value))
    const netUnits = unitMovements.length ? unitMovements.reduce((total, value) => total + value, 0) : null
    const netActivityAmount =
      [subscriptionAmount, redemptionAmount, transferInAmount, transferOutAmount].some((value) => value !== null)
        ? (subscriptionAmount || 0) - (redemptionAmount || 0) + (transferInAmount || 0) - (transferOutAmount || 0)
        : null
    const totals = {
      subscriptions: subscriptionAmount,
      redemptions: redemptionAmount,
      transfer_in: transferInAmount,
      transfer_out: transferOutAmount,
      gross_amount: grossAmount,
      fee_amount: feeAmount,
      holdback_amount: holdbackAmount,
      net_amount: netAmount,
      net_activity: netActivityAmount,
      beginning_units: beginningUnits,
      net_units: netUnits,
      ending_units: endingUnits,
    }
    const typeCounts = activityTypeCounts(transactions)
    const cashVariance = netCashVariance(totals)
    const unitVariance = endingUnitsVariance(totals)
    const largestSubscription = largestByValue(transactions, "subscription_amount")
    const largestRedemption = largestByValue(transactions, "redemption_amount")
    const computedPoints = [
      point({ key: "funds", label: "Funds", value: funds.join(", "), valueJson: funds, confidence: 0.82 }),
      point({ key: "activity_transactions", label: "Investor Activity Transactions", value: String(transactions.length), confidence: 0.96 }),
      point({ key: "investor_count", label: "Investors With Activity", value: String(investors.length), confidence: 0.94 }),
      point({ key: "investor_types", label: "Investor Types", value: investorTypes.join(", "), valueJson: investorTypes, confidence: 0.8 }),
      point({ key: "investor_statuses", label: "Investor Statuses", value: investorStatuses.join(", "), valueJson: investorStatuses, confidence: 0.8 }),
      point({ key: "share_classes", label: "Share Classes", value: shareClasses.join(", "), valueJson: shareClasses, confidence: 0.84 }),
      point({ key: "transaction_currencies", label: "Transaction Currencies", value: currencies.join(", "), valueJson: currencies, confidence: 0.82 }),
      point({ key: "trade_dates", label: "Trade / Request Dates", value: tradeDates.join(", "), valueJson: tradeDates, confidence: 0.78 }),
      point({ key: "effective_dates", label: "Effective / NAV Dates", value: transactionDates.join(", "), valueJson: transactionDates, confidence: 0.78 }),
      point({ key: "settlement_dates", label: "Settlement / Cash Dates", value: settlementDates.join(", "), valueJson: settlementDates, confidence: 0.78 }),
      point({ key: "settlement_status_counts", label: "Settlement Status Counts", value: countsText(settlementStatusCounts), valueJson: settlementStatusCounts, confidence: 0.78 }),
      point({ key: "approval_status_counts", label: "Approval Status Counts", value: countsText(approvalStatusCounts), valueJson: approvalStatusCounts, confidence: 0.78 }),
      point({ key: "subscription_amount", label: "Subscription Amount", value: formatNumber(subscriptionAmount, 2), confidence: 0.92 }),
      point({ key: "redemption_amount", label: "Redemption Amount", value: formatNumber(redemptionAmount, 2), confidence: 0.92 }),
      point({ key: "transfer_in_amount", label: "Transfer In Amount", value: formatNumber(transferInAmount, 2), confidence: 0.84 }),
      point({ key: "transfer_out_amount", label: "Transfer Out Amount", value: formatNumber(transferOutAmount, 2), confidence: 0.84 }),
      point({ key: "gross_activity_amount", label: "Gross Activity Amount", value: formatNumber(grossAmount, 2), confidence: 0.84 }),
      point({ key: "activity_fee_amount", label: "Activity Fees", value: formatNumber(feeAmount, 2), confidence: 0.82 }),
      point({ key: "holdback_amount", label: "Holdback Amount", value: formatNumber(holdbackAmount, 2), confidence: 0.82 }),
      point({ key: "net_cash_activity_amount", label: "Net Cash Activity Amount", value: formatNumber(netAmount, 2), confidence: 0.84 }),
      point({ key: "net_activity_amount", label: "Net Activity Amount", value: formatNumber(netActivityAmount, 2), confidence: 0.9 }),
      point({ key: "beginning_units", label: "Beginning Units / Shares", value: formatNumber(beginningUnits, 4), confidence: 0.84 }),
      point({ key: "net_unit_activity", label: "Net Unit / Share Activity", value: formatNumber(netUnits, 4), confidence: 0.88 }),
      point({ key: "ending_units", label: "Ending Units / Shares", value: formatNumber(endingUnits, 4), confidence: 0.84 }),
      point({ key: "nav_per_unit", label: "NAV Per Unit / Share", value: navValues.length === 1 ? formatNumber(navValues[0], 4) : navValues.map((value) => formatNumber(value, 4)).join(", "), valueJson: navValues, confidence: 0.84 }),
      point({ key: "activity_type_counts", label: "Activity Type Counts", value: Object.entries(typeCounts).map(([key, value]) => `${key}: ${value}`).join(", "), valueJson: typeCounts, confidence: 0.82 }),
      point({ key: "largest_subscription_investor", label: "Largest Subscription Investor", value: largestSubscription?.investor_name, valueJson: largestSubscription, confidence: 0.84 }),
      point({ key: "largest_subscription_amount", label: "Largest Subscription Amount", value: largestSubscription ? formatNumber(largestSubscription.subscription_amount, 2) : null, confidence: 0.84 }),
      point({ key: "largest_redemption_investor", label: "Largest Redemption Investor", value: largestRedemption?.investor_name, valueJson: largestRedemption, confidence: 0.84 }),
      point({ key: "largest_redemption_amount", label: "Largest Redemption Amount", value: largestRedemption ? formatNumber(largestRedemption.redemption_amount, 2) : null, confidence: 0.84 }),
      point({
        key: "net_cash_activity_reconciliation",
        label: "Net Cash Activity Reconciliation",
        value: cashVariance === null ? null : Math.abs(cashVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(cashVariance, 2)}`,
        confidence: 0.88,
      }),
      point({
        key: "ending_units_reconciliation",
        label: "Ending Units Reconciliation",
        value: unitVariance === null ? null : Math.abs(unitVariance) <= 0.0001 ? "Reconciled" : `Variance ${formatNumber(unitVariance, 4)}`,
        confidence: 0.88,
      }),
    ].filter(Boolean)
    const keyPointsByKey = new Map()
    ;[...computedPoints, ...summaryPoints].forEach((entry) => {
      if (!entry || keyPointsByKey.has(entry.point_key)) return
      keyPointsByKey.set(entry.point_key, entry)
    })
    const keyPoints = Array.from(keyPointsByKey.values())
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const issues = []

    if (!transactions.length) {
      issues.push({ code: "investor_activity_rows_not_found", message: "No investor activity transaction rows were detected." })
    }
    if (!foundKeys.has("activity_period") && !transactionDates.length && !tradeDates.length) {
      issues.push({ code: "investor_activity_period_not_detected", message: "Review the activity period or transaction dates." })
    }
    if (subscriptionAmount === null && redemptionAmount === null && transferInAmount === null && transferOutAmount === null && netUnits === null) {
      issues.push({ code: "investor_activity_amounts_not_detected", message: "No subscription, redemption, transfer, or unit activity totals were detected." })
    }
    const mismatches = [
      numberDifference(subscriptionAmount, declaredTotals.subscriptions) > 0.01 ? "subscriptions" : null,
      numberDifference(redemptionAmount, declaredTotals.redemptions) > 0.01 ? "redemptions" : null,
      numberDifference(transferInAmount, declaredTotals.transfer_in) > 0.01 ? "transfer in" : null,
      numberDifference(transferOutAmount, declaredTotals.transfer_out) > 0.01 ? "transfer out" : null,
      numberDifference(grossAmount, declaredTotals.gross_amount) > 0.01 ? "gross activity" : null,
      numberDifference(feeAmount, declaredTotals.fee_amount) > 0.01 ? "activity fees" : null,
      numberDifference(holdbackAmount, declaredTotals.holdback_amount) > 0.01 ? "holdbacks" : null,
      numberDifference(netAmount, declaredTotals.net_amount) > 0.01 ? "net cash activity" : null,
      numberDifference(beginningUnits, declaredTotals.beginning_units) > 0.0001 ? "beginning units" : null,
      numberDifference(netUnits, declaredTotals.units) > 0.0001 ? "units" : null,
      numberDifference(endingUnits, declaredTotals.ending_units) > 0.0001 ? "ending units" : null,
    ].filter(Boolean)
    if (mismatches.length) {
      issues.push({
        code: "investor_activity_declared_totals_mismatch",
        message: `Computed investor activity totals differ from the summary row for: ${mismatches.join(", ")}.`,
      })
    }
    if (cashVariance !== null && Math.abs(cashVariance) > 0.01) {
      issues.push({ code: "investor_activity_net_cash_mismatch", message: `Gross activity less fees and holdbacks does not agree to net cash activity by ${formatNumber(cashVariance, 2)}.` })
    }
    if (unitVariance !== null && Math.abs(unitVariance) > 0.0001) {
      issues.push({ code: "investor_activity_ending_units_mismatch", message: `Beginning units plus net unit activity does not agree to ending units by ${formatNumber(unitVariance, 4)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: transactions.length
        ? `Read ${transactions.length} investor activity transaction(s) from ${tableMeta?.sheet_name || "the activity statement"}.`
        : keyPoints.length
          ? `Extracted ${keyPoints.length} investor activity summary fact(s).`
          : "No standard investor activity facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.7 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        ...tableMeta,
        extracted_fields: Array.from(foundKeys),
        transactions,
        summary_rows: summaryRows.length,
        declared_totals: declaredTotals,
        totals: {
          ...totals,
          net_cash_variance: cashVariance,
          ending_units_variance: unitVariance,
        },
        transaction_dates: transactionDates,
        settlement_dates: settlementDates,
        settlement_status_counts: settlementStatusCounts,
        approval_status_counts: approvalStatusCounts,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = InvestorActivityStatementReader
