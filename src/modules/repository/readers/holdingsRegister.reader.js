const { formatNumber, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "holdings_register"
const READER_VERSION = "holdings-register.v2"

const HEADER_ALIASES = {
  holding_name: ["investment", "investment name", "asset", "asset name", "security", "security name", "issuer", "portfolio company", "holding"],
  security_identifier: ["security id", "security identifier", "isin", "cusip", "ticker", "security code"],
  asset_class: ["asset class", "investment type", "security type", "category"],
  sector: ["sector", "industry", "industry sector"],
  geography: ["geography", "country", "region", "issuer country", "domicile"],
  investment_stage: ["stage", "investment stage", "deal stage"],
  quantity: ["quantity", "shares", "units", "number of shares", "number of units"],
  cost: ["cost", "acquisition cost", "invested cost", "book cost", "cost basis"],
  fair_value: ["fair value", "market value", "current value", "valuation", "nav", "carrying value"],
  unrealized_gain_loss: ["unrealized gain loss", "unrealised gain loss", "unrealized gain", "unrealised gain", "gain loss"],
  commitment: ["commitment", "committed capital", "capital commitment"],
  unfunded_commitment: ["unfunded commitment", "remaining commitment", "uncalled commitment"],
  currency: ["currency", "valuation currency", "reporting currency"],
  ownership_percent: ["ownership %", "ownership", "equity stake %", "stake %"],
  valuation_date: ["valuation date", "as of date", "as at date", "date"],
  valuation_method: ["valuation method", "valuation methodology", "methodology", "pricing source"],
  fair_value_level: ["fair value level", "asc 820 level", "valuation level"],
  liquidity_status: ["liquidity status", "liquidity", "tradability", "restriction status"],
  maturity_date: ["maturity date", "maturity", "due date"],
  interest_rate: ["interest rate", "coupon", "coupon rate", "yield"],
}

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/[^a-z0-9% ]/g, " ").replace(/\s+/g, " ").trim()
}

function columnMapping(headerRow) {
  const mapping = {}
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell)
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      if (mapping[key] === undefined && aliases.includes(normalized)) {
        mapping[key] = index
      }
    })
  })
  return mapping
}

function selectHoldingsTable(tables) {
  let best = null
  for (const table of tables || []) {
    ;(table.rows || []).slice(0, 20).forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["holding_name", "fair_value", "cost", "quantity", "asset_class", "valuation_method"].filter(
        (key) => mapping[key] !== undefined,
      ).length
      if (!best || score > best.score) best = { table, headerIndex: index, mapping, score }
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

function groupSums(rows, groupKey, valueKey) {
  return rows.reduce((sums, row) => {
    if (!row[groupKey] || !Number.isFinite(row[valueKey])) return sums
    sums[row[groupKey]] = (sums[row[groupKey]] || 0) + row[valueKey]
    return sums
  }, {})
}

function groupSumText(sums) {
  return Object.entries(sums)
    .map(([key, value]) => `${key}: ${formatNumber(value, 2)}`)
    .join(", ")
}

function maxByAbsValue(rows, key) {
  return rows
    .filter((row) => Number.isFinite(row[key]))
    .sort((left, right) => Math.abs(right[key]) - Math.abs(left[key]))[0] || null
}

function unrealizedVariance(suppliedUnrealized, computedUnrealized) {
  if (suppliedUnrealized === null || computedUnrealized === null) return null
  return suppliedUnrealized - computedUnrealized
}

function groupCountText(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")
}

class HoldingsRegisterReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const selected = selectHoldingsTable(source.tables)
    if (!selected) {
      return {
        reader_key: READER_KEY,
        reader_version: READER_VERSION,
        status: "partial",
        summary_text: "A portfolio holdings table could not be mapped automatically.",
        confidence: 0.18,
        key_points: [],
        structured_data_json: { table_count: source.tables?.length || 0 },
        issues_json: [{ code: "holdings_headers_not_found", message: "Identify investment name, fair value, or cost columns manually." }],
        source_text_excerpt: snippet(source.text, 1200),
      }
    }

    const { table, headerIndex, mapping } = selected
    const parsedRows = (table.rows || [])
      .slice(headerIndex + 1)
      .map((row) => ({
        row_label: firstTextCell(row),
        holding_name: singleLine(cell(row, mapping, "holding_name")),
        security_identifier: singleLine(cell(row, mapping, "security_identifier")),
        asset_class: singleLine(cell(row, mapping, "asset_class")),
        sector: singleLine(cell(row, mapping, "sector")),
        geography: singleLine(cell(row, mapping, "geography")),
        investment_stage: singleLine(cell(row, mapping, "investment_stage")),
        quantity: parseNumber(cell(row, mapping, "quantity")),
        cost: parseNumber(cell(row, mapping, "cost")),
        fair_value: parseNumber(cell(row, mapping, "fair_value")),
        unrealized_gain_loss: parseNumber(cell(row, mapping, "unrealized_gain_loss")),
        commitment: parseNumber(cell(row, mapping, "commitment")),
        unfunded_commitment: parseNumber(cell(row, mapping, "unfunded_commitment")),
        currency: singleLine(cell(row, mapping, "currency")),
        ownership_percent: parseNumber(cell(row, mapping, "ownership_percent")),
        valuation_date: singleLine(cell(row, mapping, "valuation_date")),
        valuation_method: singleLine(cell(row, mapping, "valuation_method")),
        fair_value_level: singleLine(cell(row, mapping, "fair_value_level")),
        liquidity_status: singleLine(cell(row, mapping, "liquidity_status")),
        maturity_date: singleLine(cell(row, mapping, "maturity_date")),
        interest_rate: singleLine(cell(row, mapping, "interest_rate")),
      }))

    const summaryRows = parsedRows.filter((row) => isSummaryLabel(row.holding_name || row.row_label))
    const holdings = parsedRows
      .filter((row) => !isSummaryLabel(row.holding_name || row.row_label))
      .filter((row) => row.holding_name || row.fair_value !== null || row.cost !== null)

    const assetClasses = Array.from(new Set(holdings.map((row) => row.asset_class).filter(Boolean)))
    const currencies = Array.from(new Set(holdings.map((row) => row.currency).filter(Boolean)))
    const valuationDates = Array.from(new Set(holdings.map((row) => row.valuation_date).filter(Boolean)))
    const totalCost = sumValues(holdings, "cost")
    const totalFairValue = sumValues(holdings, "fair_value")
    const suppliedUnrealized = sumValues(holdings, "unrealized_gain_loss")
    const declaredTotals = summaryRows.reduce(
      (totals, row) => ({
        quantity: totals.quantity ?? row.quantity,
        cost: totals.cost ?? row.cost,
        fair_value: totals.fair_value ?? row.fair_value,
        unrealized_gain_loss: totals.unrealized_gain_loss ?? row.unrealized_gain_loss,
        commitment: totals.commitment ?? row.commitment,
        unfunded_commitment: totals.unfunded_commitment ?? row.unfunded_commitment,
      }),
      { quantity: null, cost: null, fair_value: null, unrealized_gain_loss: null, commitment: null, unfunded_commitment: null },
    )
    const computedUnrealized =
      totalFairValue !== null && totalCost !== null ? totalFairValue - totalCost : null
    const totalUnrealized = suppliedUnrealized === null ? computedUnrealized : suppliedUnrealized
    const totalQuantity = sumValues(holdings, "quantity")
    const totalCommitment = sumValues(holdings, "commitment")
    const totalUnfundedCommitment = sumValues(holdings, "unfunded_commitment")
    const suppliedVsComputedUnrealizedVariance = unrealizedVariance(suppliedUnrealized, computedUnrealized)
    const largestHolding = maxByValue(holdings, "fair_value")
    const largestUnrealized = maxByAbsValue(holdings, "unrealized_gain_loss")
    const topFiveFairValue = topConcentration(holdings, "fair_value", totalFairValue)
    const assetClassCounts = groupCounts(holdings, "asset_class")
    const sectorCounts = groupCounts(holdings, "sector")
    const geographyCounts = groupCounts(holdings, "geography")
    const valuationMethodCounts = groupCounts(holdings, "valuation_method")
    const fairValueLevelCounts = groupCounts(holdings, "fair_value_level")
    const liquidityStatusCounts = groupCounts(holdings, "liquidity_status")
    const fairValueByAssetClass = groupSums(holdings, "asset_class", "fair_value")
    const fairValueByGeography = groupSums(holdings, "geography", "fair_value")
    const keyPoints = [
      point({ key: "portfolio_holdings", label: "Portfolio Holdings", value: String(holdings.length), confidence: 0.96 }),
      point({ key: "asset_classes", label: "Asset Classes", value: assetClasses.join(", "), valueJson: assetClasses, confidence: 0.86 }),
      point({ key: "asset_class_counts", label: "Asset Class Counts", value: groupCountText(assetClassCounts), valueJson: assetClassCounts, confidence: 0.82 }),
      point({ key: "sector_counts", label: "Sector Counts", value: groupCountText(sectorCounts), valueJson: sectorCounts, confidence: 0.78 }),
      point({ key: "geography_counts", label: "Geography Counts", value: groupCountText(geographyCounts), valueJson: geographyCounts, confidence: 0.78 }),
      point({ key: "valuation_method_counts", label: "Valuation Method Counts", value: groupCountText(valuationMethodCounts), valueJson: valuationMethodCounts, confidence: 0.78 }),
      point({ key: "fair_value_level_counts", label: "Fair Value Level Counts", value: groupCountText(fairValueLevelCounts), valueJson: fairValueLevelCounts, confidence: 0.78 }),
      point({ key: "liquidity_status_counts", label: "Liquidity Status Counts", value: groupCountText(liquidityStatusCounts), valueJson: liquidityStatusCounts, confidence: 0.76 }),
      point({ key: "fair_value_by_asset_class", label: "Fair Value by Asset Class", value: groupSumText(fairValueByAssetClass), valueJson: fairValueByAssetClass, confidence: 0.84 }),
      point({ key: "fair_value_by_geography", label: "Fair Value by Geography", value: groupSumText(fairValueByGeography), valueJson: fairValueByGeography, confidence: 0.8 }),
      point({ key: "valuation_currency", label: "Valuation Currency", value: currencies.length === 1 ? currencies[0] : currencies.join(", "), valueJson: currencies, confidence: 0.84 }),
      point({ key: "valuation_date", label: "Valuation Date", value: valuationDates.length === 1 ? valuationDates[0] : valuationDates.join(", "), valueJson: valuationDates, confidence: 0.86 }),
      point({ key: "largest_holding", label: "Largest Holding", value: largestHolding?.holding_name, valueJson: largestHolding, confidence: 0.9 }),
      point({ key: "largest_holding_fair_value", label: "Largest Holding Fair Value", value: largestHolding ? formatNumber(largestHolding.fair_value, 2) : null, confidence: 0.9 }),
      point({ key: "largest_holding_percent_of_fair_value", label: "Largest Holding % of Fair Value", value: largestHolding && totalFairValue ? `${formatNumber((largestHolding.fair_value / totalFairValue) * 100, 2)}%` : null, confidence: 0.88 }),
      point({ key: "top_5_fair_value_percent", label: "Top 5 Fair Value Concentration", value: topFiveFairValue === null ? null : `${formatNumber(topFiveFairValue, 2)}%`, confidence: 0.86 }),
      point({ key: "largest_unrealized_holding", label: "Largest Unrealized Gain / Loss Holding", value: largestUnrealized?.holding_name, valueJson: largestUnrealized, confidence: 0.82 }),
      point({ key: "largest_unrealized_gain_loss", label: "Largest Unrealized Gain / Loss", value: largestUnrealized ? formatNumber(largestUnrealized.unrealized_gain_loss, 2) : null, confidence: 0.82 }),
      point({ key: "total_quantity", label: "Total Quantity / Units", value: formatNumber(totalQuantity, 4), confidence: 0.82 }),
      point({ key: "total_cost", label: "Total Cost", value: formatNumber(totalCost, 2), confidence: 0.91 }),
      point({ key: "total_fair_value", label: "Total Fair Value", value: formatNumber(totalFairValue, 2), confidence: 0.94 }),
      point({ key: "total_unrealized_gain_loss", label: "Total Unrealized Gain / Loss", value: formatNumber(totalUnrealized, 2), confidence: suppliedUnrealized === null ? 0.86 : 0.92 }),
      point({ key: "total_commitment", label: "Total Commitment", value: formatNumber(totalCommitment, 2), confidence: 0.82 }),
      point({ key: "total_unfunded_commitment", label: "Total Unfunded Commitment", value: formatNumber(totalUnfundedCommitment, 2), confidence: 0.82 }),
      point({
        key: "unrealized_gain_loss_reconciliation",
        label: "Unrealized Gain / Loss Reconciliation",
        value: suppliedVsComputedUnrealizedVariance === null
          ? null
          : Math.abs(suppliedVsComputedUnrealizedVariance) <= 0.01
            ? "Reconciled"
            : `Variance ${formatNumber(suppliedVsComputedUnrealizedVariance, 2)}`,
        confidence: 0.9,
      }),
    ].filter(Boolean)

    const issues = []
    if (!holdings.length) {
      issues.push({ code: "holdings_has_no_rows", message: "The detected holdings header has no readable investment rows." })
    }
    if (totalFairValue === null) {
      issues.push({ code: "holdings_fair_value_missing", message: "No fair value total could be calculated from the holdings file." })
    }
    if (currencies.length > 1) {
      issues.push({ code: "holdings_multiple_currencies", message: "Holdings contain multiple currencies; confirm totals before report use." })
    }
    const mismatches = [
      numberDifference(totalCost, declaredTotals.cost) > 0.01 ? "cost" : null,
      numberDifference(totalFairValue, declaredTotals.fair_value) > 0.01 ? "fair value" : null,
      numberDifference(totalUnrealized, declaredTotals.unrealized_gain_loss) > 0.01 ? "unrealized gain/loss" : null,
      numberDifference(totalCommitment, declaredTotals.commitment) > 0.01 ? "commitment" : null,
      numberDifference(totalUnfundedCommitment, declaredTotals.unfunded_commitment) > 0.01 ? "unfunded commitment" : null,
    ].filter(Boolean)
    if (mismatches.length) {
      issues.push({
        code: "holdings_declared_totals_mismatch",
        message: `Computed holdings totals differ from the register summary row for: ${mismatches.join(", ")}.`,
      })
    }
    if (suppliedVsComputedUnrealizedVariance !== null && Math.abs(suppliedVsComputedUnrealizedVariance) > 0.01) {
      issues.push({
        code: "holdings_unrealized_gain_loss_mismatch",
        message: `Supplied unrealized gain/loss differs from fair value less cost by ${formatNumber(suppliedVsComputedUnrealizedVariance, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: holdings.length && totalFairValue !== null ? (issues.length ? "partial" : "completed") : "partial",
      summary_text: holdings.length
        ? `Read ${holdings.length} portfolio holding record(s) from ${table.name || "the register"}.`
        : "No readable portfolio holdings were found in the detected register.",
      confidence: holdings.length && totalFairValue !== null ? (issues.length ? 0.77 : 0.94) : 0.24,
      key_points: keyPoints,
      structured_data_json: {
        sheet_name: table.name || null,
        header_row: headerIndex + 1,
        column_mapping: mapping,
        holdings,
        summary_rows: summaryRows.length,
        declared_totals: declaredTotals,
        totals: {
          quantity: totalQuantity,
          cost: totalCost,
          fair_value: totalFairValue,
          unrealized_gain_loss: totalUnrealized,
          commitment: totalCommitment,
          unfunded_commitment: totalUnfundedCommitment,
          top_5_fair_value_percent: topFiveFairValue,
          unrealized_gain_loss_reconciliation_variance: suppliedVsComputedUnrealizedVariance,
        },
        asset_class_counts: assetClassCounts,
        sector_counts: sectorCounts,
        geography_counts: geographyCounts,
        valuation_method_counts: valuationMethodCounts,
        fair_value_level_counts: fairValueLevelCounts,
        liquidity_status_counts: liquidityStatusCounts,
        fair_value_by_asset_class: fairValueByAssetClass,
        fair_value_by_geography: fairValueByGeography,
      },
      issues_json: issues,
      source_text_excerpt: snippet(source.text, 1200),
    }
  }
}

module.exports = HoldingsRegisterReader
