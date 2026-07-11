const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "custodian_statement"
const READER_VERSION = "custodian-statement.v1"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"

const SUMMARY_FIELDS = [
  {
    key: "custodian_name",
    label: "Custodian",
    tableLabels: ["Custodian", "Custodian Name", "Bank", "Broker", "Prime Broker"],
    patterns: [/\b(?:custodian|custodian name|bank|broker|prime broker)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.86,
  },
  {
    key: "account_name",
    label: "Account Name",
    tableLabels: ["Account Name", "Account", "Portfolio", "Entity", "Fund"],
    patterns: [/\b(?:account name|account|portfolio|entity|fund)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i],
    confidence: 0.78,
  },
  {
    key: "account_tail",
    label: "Account Ending",
    tableLabels: ["Account Ending", "Account Number", "Account No", "Account #"],
    patterns: [
      /\b(?:account (?:number|no\.?)|account)\s*(?:ending (?:in|with)|(?:x{2,}|\*{2,})|#)?\s*([0-9]{4})\b/i,
      /\b(?:account (?:number|no\.?)|account)\s*(?:is|:|#)?\s*[A-Z0-9 -]*([0-9]{4})\b/i,
    ],
    confidence: 0.88,
  },
  {
    key: "statement_period",
    label: "Statement Period",
    tableLabels: ["Statement Period", "Period", "Period Covered", "Date Range"],
    patterns: [
      /\b(?:statement period|period covered|date range|period)\s*(?:is|:)?\s*([A-Za-z0-9, /-]{6,70}(?:\s+(?:to|through|-)\s+[A-Za-z0-9, /-]{6,40})?)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "statement_date",
    label: "Statement Date",
    tableLabels: ["Statement Date", "As Of Date", "Report Date", "Date"],
    patterns: [new RegExp(`\\b(?:statement date|as of date|report date|as of|dated)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i")],
    confidence: 0.86,
  },
  {
    key: "reporting_currency",
    label: "Reporting Currency",
    tableLabels: ["Currency", "Reporting Currency", "Base Currency"],
    patterns: [/\b(?:reporting currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i],
    confidence: 0.82,
  },
  {
    key: "cash_balance",
    label: "Cash Balance",
    tableLabels: ["Cash Balance", "Cash", "Cash and Cash Equivalents", "Cash Balance Total"],
    patterns: [new RegExp(`\\b(?:cash balance|cash and cash equivalents|cash)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "securities_market_value",
    label: "Securities Market Value",
    tableLabels: ["Securities Market Value", "Market Value", "Investments", "Total Securities", "Total Investments"],
    patterns: [new RegExp(`\\b(?:securities market value|market value of securities|total securities|total investments|investments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "total_account_value",
    label: "Total Account Value",
    tableLabels: ["Total Account Value", "Total Market Value", "Total Portfolio Value", "Ending Market Value", "Net Asset Value"],
    patterns: [new RegExp(`\\b(?:total account value|total market value|total portfolio value|ending market value|net asset value)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.94,
  },
  {
    key: "accrued_income",
    label: "Accrued Income",
    tableLabels: ["Accrued Income", "Interest Receivable", "Dividends Receivable"],
    patterns: [new RegExp(`\\b(?:accrued income|interest receivable|dividends receivable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "unsettled_trades",
    label: "Unsettled Trades",
    tableLabels: ["Unsettled Trades", "Pending Trades", "Receivable Payable", "Trade Receivable Payable"],
    patterns: [new RegExp(`\\b(?:unsettled trades|pending trades|trade receivable payable|receivable payable)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
]

const POSITION_HEADERS = {
  security_name: ["security", "security name", "holding", "investment", "asset", "description", "instrument"],
  asset_class: ["asset class", "security type", "investment type", "category"],
  quantity: ["quantity", "shares", "units", "par", "notional"],
  market_value: ["market value", "fair value", "current value", "value"],
  cost: ["cost", "book cost", "cost basis", "amortized cost", "amortised cost"],
  currency: ["currency", "local currency", "security currency"],
}

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function columnMapping(row) {
  const mapping = {}
  row.forEach((cell, index) => {
    const normalized = normalizeHeader(cell)
    Object.entries(POSITION_HEADERS).forEach(([key, aliases]) => {
      if (mapping[key] === undefined && aliases.map(normalizeHeader).includes(normalized)) mapping[key] = index
    })
  })
  return mapping
}

function selectPositionTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 30).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["security_name", "asset_class", "quantity", "market_value", "cost", "currency"].filter(
        (key) => mapping[key] !== undefined,
      ).length
      if (mapping.market_value !== undefined && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
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
  return /^(?:grand\s+)?totals?$|^subtotals?$|^aggregate(?:\s+total)?$|^total\s+market\s+value$/i.test(singleLine(value))
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function maxByValue(rows, key) {
  return rows
    .filter((row) => Number.isFinite(row[key]))
    .sort((left, right) => right[key] - left[key])[0] || null
}

function topConcentration(rows, key, total, count = 5) {
  if (!Number.isFinite(total) || Math.abs(total) <= 0.0000001) return null
  const topTotal = rows
    .filter((row) => Number.isFinite(row[key]))
    .sort((left, right) => right[key] - left[key])
    .slice(0, count)
    .reduce((sum, row) => sum + row[key], 0)
  return (topTotal / total) * 100
}

function groupCounts(rows, key) {
  return rows.reduce((counts, row) => {
    if (!row[key]) return counts
    counts[row[key]] = (counts[row[key]] || 0) + 1
    return counts
  }, {})
}

function groupCountText(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")
}

function numberDifference(left, right) {
  if (left === null || right === null) return 0
  return Math.abs(Number(left) - Number(right))
}

function identityPoint(text) {
  const match = String(text || "").match(/\b(custodian statement|custody statement|brokerage statement|prime broker statement|custody account statement)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Custodian Statement",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function normalizeAccountTail(entry) {
  if (entry?.point_key !== "account_tail") return entry
  const match = String(entry.value_text || "").match(/([0-9]{4})\b/)
  return match ? { ...entry, value_text: match[1] } : entry
}

function summaryPoint(source, field) {
  return matchTablePoint(source, field) || matchPoint(source.text || "", field)
}

class CustodianStatementReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = SUMMARY_FIELDS.map((field) => summaryPoint(source, field)).filter(Boolean).map(normalizeAccountTail)
    const identity = identityPoint(text)
    if (identity) keyPoints.unshift(identity)
    const selected = selectPositionTable(source.tables)
    let positions = []
    let summaryRows = []
    let tableTotalMarketValue = null
    let tableMeta = null

    if (selected) {
      const { table, headerIndex, mapping } = selected
      const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row) => ({
        row_label: firstTextCell(row),
        security_name: singleLine(cell(row, mapping, "security_name")),
        asset_class: singleLine(cell(row, mapping, "asset_class")),
        quantity: parseNumber(cell(row, mapping, "quantity")),
        market_value: parseNumber(cell(row, mapping, "market_value")),
        cost: parseNumber(cell(row, mapping, "cost")),
        currency: singleLine(cell(row, mapping, "currency")),
      }))
      summaryRows = parsedRows.filter((row) => isSummaryLabel(row.security_name || row.row_label))
      positions = parsedRows
        .filter((row) => !isSummaryLabel(row.security_name || row.row_label))
        .filter((row) => row.security_name || row.market_value !== null || row.quantity !== null)
      tableTotalMarketValue = summaryRows.reduce((total, row) => total ?? row.market_value, null)
      tableMeta = { sheet_name: table.name || null, header_row: headerIndex + 1, column_mapping: mapping }
    }

    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const totalPositionMarketValue = sumValues(positions, "market_value")
    const largestPosition = maxByValue(positions, "market_value")
    const topFiveMarketValue = topConcentration(positions, "market_value", totalPositionMarketValue)
    const assetClassCounts = groupCounts(positions, "asset_class")
    const positionCurrencies = Array.from(new Set(positions.map((row) => row.currency).filter(Boolean)))
    const computedAccountValue =
      parseNumber(values.cash_balance) !== null && parseNumber(values.securities_market_value) !== null
        ? parseNumber(values.cash_balance) + parseNumber(values.securities_market_value)
        : null
    const accountValue = parseNumber(values.total_account_value)
    const custodyValueVariance = computedAccountValue === null || accountValue === null ? null : computedAccountValue - accountValue
    const positionValueVariance =
      totalPositionMarketValue === null || parseNumber(values.securities_market_value) === null
        ? null
        : totalPositionMarketValue - parseNumber(values.securities_market_value)

    keyPoints.push(...[
      point({ key: "custody_positions", label: "Custody Positions", value: positions.length ? String(positions.length) : null, confidence: 0.94 }),
      point({ key: "custody_position_currencies", label: "Position Currencies", value: positionCurrencies.join(", "), valueJson: positionCurrencies, confidence: 0.82 }),
      point({ key: "custody_asset_class_counts", label: "Custody Asset Class Counts", value: groupCountText(assetClassCounts), valueJson: assetClassCounts, confidence: 0.82 }),
      point({ key: "position_market_value_total", label: "Position Market Value Total", value: formatNumber(totalPositionMarketValue, 2), confidence: 0.92 }),
      point({ key: "largest_custody_position", label: "Largest Custody Position", value: largestPosition?.security_name, valueJson: largestPosition, confidence: 0.9 }),
      point({ key: "largest_custody_position_value", label: "Largest Custody Position Value", value: largestPosition ? formatNumber(largestPosition.market_value, 2) : null, confidence: 0.9 }),
      point({ key: "largest_custody_position_percent", label: "Largest Custody Position % of Market Value", value: largestPosition && totalPositionMarketValue ? `${formatNumber((largestPosition.market_value / totalPositionMarketValue) * 100, 2)}%` : null, confidence: 0.88 }),
      point({ key: "top_5_custody_market_value_percent", label: "Top 5 Custody Market Value Concentration", value: topFiveMarketValue === null ? null : `${formatNumber(topFiveMarketValue, 2)}%`, confidence: 0.86 }),
      point({
        key: "custody_value_reconciliation",
        label: "Custody Value Reconciliation",
        value: custodyValueVariance === null ? null : Math.abs(custodyValueVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(custodyValueVariance, 2)}`,
        confidence: 0.9,
      }),
      point({
        key: "custody_positions_reconciliation",
        label: "Custody Positions Reconciliation",
        value: positionValueVariance === null ? null : Math.abs(positionValueVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(positionValueVariance, 2)}`,
        confidence: 0.88,
      }),
    ].filter(Boolean))

    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const issues = []
    if (!foundKeys.has("total_account_value") && !foundKeys.has("position_market_value_total")) {
      issues.push({ code: "custodian_statement_value_not_detected", message: "Review missing custody account value or position market value totals." })
    }
    if (custodyValueVariance !== null && Math.abs(custodyValueVariance) > 0.01) {
      issues.push({
        code: "custodian_statement_value_reconciliation_mismatch",
        message: `Cash plus securities does not agree to total account value by ${formatNumber(custodyValueVariance, 2)}.`,
      })
    }
    if (positionValueVariance !== null && Math.abs(positionValueVariance) > 0.01) {
      issues.push({
        code: "custodian_statement_positions_reconciliation_mismatch",
        message: `Position market value total does not agree to securities market value by ${formatNumber(positionValueVariance, 2)}.`,
      })
    }
    if (tableTotalMarketValue !== null && numberDifference(totalPositionMarketValue, tableTotalMarketValue) > 0.01) {
      issues.push({
        code: "custodian_statement_declared_positions_total_mismatch",
        message: `Computed position market value differs from the statement summary row by ${formatNumber(totalPositionMarketValue - tableTotalMarketValue, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: positions.length
        ? `Read ${positions.length} custody position(s) from ${tableMeta?.sheet_name || "the custodian statement"}.`
        : keyPoints.length
          ? `Extracted ${keyPoints.length} custodian statement fact(s) for review.`
          : "No standard custodian statement facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.7 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        ...tableMeta,
        extracted_fields: Array.from(foundKeys),
        positions,
        summary_rows: summaryRows.length,
        declared_position_market_value: tableTotalMarketValue,
        totals: {
          position_market_value: totalPositionMarketValue,
          top_5_market_value_percent: topFiveMarketValue,
          custody_value_reconciliation_variance: custodyValueVariance,
          position_value_reconciliation_variance: positionValueVariance,
        },
        asset_class_counts: assetClassCounts,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = CustodianStatementReader
