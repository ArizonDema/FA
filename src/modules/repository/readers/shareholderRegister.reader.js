const { formatNumber, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "shareholder_register"
const READER_VERSION = "shareholder-register.v2"

const HEADER_ALIASES = {
  investor_id: ["investor id", "holder id", "shareholder id", "account id", "investor number", "holder number"],
  holder_name: ["shareholder", "investor", "holder", "investor name", "shareholder name", "legal name"],
  investor_type: ["investor type", "holder type", "shareholder type", "entity type", "investor category"],
  status: ["status", "investor status", "holder status", "account status"],
  tax_residency: ["tax residency", "tax residence", "jurisdiction of tax residence", "tax jurisdiction"],
  domicile: ["domicile", "jurisdiction", "country", "country of residence"],
  admission_date: ["admission date", "admitted date", "subscription date", "entry date"],
  commitment_date: ["commitment date", "closing date", "subscription closing date"],
  share_class: ["class", "share class", "unit class"],
  units: ["shares", "units", "number of shares", "number of units", "units held"],
  ownership_percent: ["ownership %", "ownership", "holding %", "percentage", "percentage ownership"],
  commitment: ["commitment", "committed capital", "commitment amount"],
  called_capital: ["called capital", "capital called", "funded commitment", "paid in capital", "paid-in capital"],
  unfunded_commitment: ["unfunded commitment", "remaining commitment", "uncalled commitment"],
  nav: ["nav", "net asset value", "value"],
  as_of_date: ["as of date", "valuation date", "date"],
}

function normalizeHeader(value) {
  return singleLine(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
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

function selectRegisterTable(tables) {
  let best = null
  for (const table of tables || []) {
    const candidateRows = (table.rows || []).slice(0, 20)
    candidateRows.forEach((row, index) => {
      const mapping = columnMapping(row)
      const score = ["holder_name", "units", "ownership_percent", "share_class", "commitment", "called_capital", "unfunded_commitment"].filter(
        (key) => mapping[key] !== undefined,
      ).length
      if (!best || score > best.score) {
        best = { table, headerIndex: index, mapping, score }
      }
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

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
}

function countsByValue(rows, key) {
  return rows.reduce((counts, row) => {
    const value = singleLine(row[key])
    if (!value) return counts
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function formatCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(", ")
}

function percentage(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) <= 0.0000001) return null
  return (numerator / denominator) * 100
}

function commitmentVariance(totalCommitments, totalCalledCapital, totalUnfundedCommitment) {
  if ([totalCommitments, totalCalledCapital, totalUnfundedCommitment].some((value) => value === null)) return null
  return totalCalledCapital + totalUnfundedCommitment - totalCommitments
}

function identityPoint(source) {
  const text = [
    source.text,
    ...(source.tables || []).map((table) => table.name),
    ...(source.tables || []).flatMap((table) => (table.rows || []).slice(0, 5).map((row) => row.join(" | "))),
  ]
    .filter(Boolean)
    .join("\n")
  const match = text.match(/\b(?:investor register|shareholder register|holder register|limited partner register|lp register)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Investor / Shareholder Register",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function redactSensitiveIdentifiers(text) {
  return String(text || "")
    .replace(
      /\b((?:tax identification number|taxpayer identification number|tax id|tin|ein|ssn|social security number)\s*(?:is|:|#|\|)?\s*)([A-Z0-9-]{4,})/gi,
      "$1[redacted]",
    )
    .replace(/\b\d{2}-\d{7}\b/g, "[redacted tax id]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted tax id]")
}

class ShareholderRegisterReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const selected = selectRegisterTable(source.tables)
    if (!selected) {
      return {
        reader_key: READER_KEY,
        reader_version: READER_VERSION,
        status: "partial",
        summary_text: "A shareholder register table could not be mapped automatically.",
        confidence: 0.18,
        key_points: [],
        structured_data_json: { table_count: source.tables?.length || 0 },
        issues_json: [{ code: "register_headers_not_found", message: "Identify shareholder, units, or ownership columns manually." }],
        source_text_excerpt: snippet(redactSensitiveIdentifiers(source.text), 1200),
      }
    }

    const { table, headerIndex, mapping } = selected
    const parsedRows = (table.rows || [])
      .slice(headerIndex + 1)
      .map((row) => ({
        row_label: firstTextCell(row),
        investor_id: singleLine(cell(row, mapping, "investor_id")),
        holder_name: singleLine(cell(row, mapping, "holder_name")),
        investor_type: singleLine(cell(row, mapping, "investor_type")),
        status: singleLine(cell(row, mapping, "status")),
        tax_residency: singleLine(cell(row, mapping, "tax_residency")),
        domicile: singleLine(cell(row, mapping, "domicile")),
        admission_date: singleLine(cell(row, mapping, "admission_date")),
        commitment_date: singleLine(cell(row, mapping, "commitment_date")),
        share_class: singleLine(cell(row, mapping, "share_class")),
        units: parseNumber(cell(row, mapping, "units")),
        ownership_percent: parseNumber(cell(row, mapping, "ownership_percent")),
        commitment: parseNumber(cell(row, mapping, "commitment")),
        called_capital: parseNumber(cell(row, mapping, "called_capital")),
        unfunded_commitment: parseNumber(cell(row, mapping, "unfunded_commitment")),
        nav: parseNumber(cell(row, mapping, "nav")),
        as_of_date: singleLine(cell(row, mapping, "as_of_date")),
      }))

    const summaryRows = parsedRows.filter((row) => isSummaryLabel(row.holder_name || row.row_label))
    const holders = parsedRows
      .filter((row) => !isSummaryLabel(row.holder_name || row.row_label))
      .filter((row) => row.holder_name || row.units !== null || row.ownership_percent !== null)

    const units = holders.map((row) => row.units).filter((value) => value !== null)
    const ownership = holders.map((row) => row.ownership_percent).filter((value) => value !== null)
    const commitments = holders.map((row) => row.commitment).filter((value) => value !== null)
    const calledCapital = holders.map((row) => row.called_capital).filter((value) => value !== null)
    const unfundedCommitments = holders.map((row) => row.unfunded_commitment).filter((value) => value !== null)
    const classes = Array.from(new Set(holders.map((row) => row.share_class).filter(Boolean)))
    const investorTypes = uniqueValues(holders, "investor_type")
    const taxResidencies = uniqueValues(holders, "tax_residency")
    const domiciles = uniqueValues(holders, "domicile")
    const admissionDates = uniqueValues(holders, "admission_date")
    const statusCounts = countsByValue(holders, "status")
    const activeHolderCount = holders.filter((row) => /\b(?:active|admitted|current|open)\b/i.test(row.status)).length
    const asOfDates = uniqueValues(holders, "as_of_date")
    const totalUnits = units.length ? units.reduce((total, value) => total + value, 0) : null
    const totalOwnership = ownership.length ? ownership.reduce((total, value) => total + value, 0) : null
    const totalCommitments = commitments.length ? commitments.reduce((total, value) => total + value, 0) : null
    const totalCalledCapital = calledCapital.length ? calledCapital.reduce((total, value) => total + value, 0) : null
    const totalUnfundedCommitment = unfundedCommitments.length ? unfundedCommitments.reduce((total, value) => total + value, 0) : null
    const largestByOwnership = maxByValue(holders, "ownership_percent")
    const largestByCommitment = maxByValue(holders, "commitment")
    const topFiveOwnership = topConcentration(holders, "ownership_percent", totalOwnership)
    const topFiveCommitment = topConcentration(holders, "commitment", totalCommitments)
    const calledPercent = percentage(totalCalledCapital, totalCommitments)
    const unfundedPercent = percentage(totalUnfundedCommitment, totalCommitments)
    const commitmentRollforwardVariance = commitmentVariance(totalCommitments, totalCalledCapital, totalUnfundedCommitment)
    const declaredTotals = summaryRows.reduce(
      (totals, row) => ({
        units: totals.units ?? row.units,
        ownership_percent: totals.ownership_percent ?? row.ownership_percent,
        commitments: totals.commitments ?? row.commitment,
        called_capital: totals.called_capital ?? row.called_capital,
        unfunded_commitment: totals.unfunded_commitment ?? row.unfunded_commitment,
        nav: totals.nav ?? row.nav,
      }),
      { units: null, ownership_percent: null, commitments: null, called_capital: null, unfunded_commitment: null, nav: null },
    )
    const keyPoints = [
      identityPoint(source),
      point({ key: "registered_holders", label: "Registered Holders", value: String(holders.length), confidence: 0.96 }),
      point({ key: "active_registered_holders", label: "Active Registered Holders", value: activeHolderCount ? String(activeHolderCount) : null, confidence: 0.88 }),
      point({ key: "share_classes", label: "Share Classes", value: classes.join(", "), valueJson: classes, confidence: 0.88 }),
      point({ key: "investor_types", label: "Investor Types", value: investorTypes.join(", "), valueJson: investorTypes, confidence: 0.82 }),
      point({ key: "investor_status_counts", label: "Investor Status Counts", value: formatCounts(statusCounts), valueJson: statusCounts, confidence: 0.84 }),
      point({ key: "tax_residencies", label: "Tax Residencies", value: taxResidencies.join(", "), valueJson: taxResidencies, confidence: 0.78 }),
      point({ key: "investor_domiciles", label: "Investor Domiciles", value: domiciles.join(", "), valueJson: domiciles, confidence: 0.76 }),
      point({ key: "admission_dates", label: "Admission Dates", value: admissionDates.join(", "), valueJson: admissionDates, confidence: 0.74 }),
      point({ key: "register_as_of_date", label: "Register As Of Date", value: asOfDates.length === 1 ? asOfDates[0] : asOfDates.join(", "), valueJson: asOfDates, confidence: 0.84 }),
      point({ key: "total_units", label: "Total Units / Shares", value: formatNumber(totalUnits), confidence: 0.92 }),
      point({ key: "total_commitments", label: "Total Commitments", value: formatNumber(totalCommitments, 2), confidence: 0.88 }),
      point({ key: "total_called_capital", label: "Total Called Capital", value: formatNumber(totalCalledCapital, 2), confidence: 0.88 }),
      point({ key: "total_unfunded_commitment", label: "Total Unfunded Commitment", value: formatNumber(totalUnfundedCommitment, 2), confidence: 0.88 }),
      point({ key: "commitment_called_percent", label: "Commitment Called Percent", value: calledPercent === null ? null : `${formatNumber(calledPercent, 2)}%`, confidence: 0.86 }),
      point({ key: "unfunded_commitment_percent", label: "Unfunded Commitment Percent", value: unfundedPercent === null ? null : `${formatNumber(unfundedPercent, 2)}%`, confidence: 0.86 }),
      point({ key: "largest_holder_by_ownership", label: "Largest Holder by Ownership", value: largestByOwnership?.holder_name, valueJson: largestByOwnership, confidence: 0.9 }),
      point({ key: "largest_holder_ownership", label: "Largest Holder Ownership", value: largestByOwnership ? `${formatNumber(largestByOwnership.ownership_percent, 2)}%` : null, confidence: 0.9 }),
      point({ key: "largest_holder_by_commitment", label: "Largest Holder by Commitment", value: largestByCommitment?.holder_name, valueJson: largestByCommitment, confidence: 0.88 }),
      point({ key: "largest_holder_commitment", label: "Largest Holder Commitment", value: largestByCommitment ? formatNumber(largestByCommitment.commitment, 2) : null, confidence: 0.88 }),
      point({ key: "top_5_ownership_percent", label: "Top 5 Ownership Concentration", value: topFiveOwnership === null ? null : `${formatNumber(topFiveOwnership, 2)}%`, confidence: 0.86 }),
      point({ key: "top_5_commitment_percent", label: "Top 5 Commitment Concentration", value: topFiveCommitment === null ? null : `${formatNumber(topFiveCommitment, 2)}%`, confidence: 0.84 }),
      point({
        key: "ownership_reconciliation",
        label: "Ownership Total",
        value: totalOwnership === null ? null : `${formatNumber(totalOwnership, 2)}%`,
        confidence: 0.92,
      }),
      point({
        key: "commitment_reconciliation",
        label: "Commitment Reconciliation",
        value: commitmentRollforwardVariance === null
          ? null
          : Math.abs(commitmentRollforwardVariance) <= 0.01
            ? "Reconciled"
            : `Variance ${formatNumber(commitmentRollforwardVariance, 2)}`,
        confidence: 0.9,
      }),
    ].filter(Boolean)

    const issues = []
    if (!holders.length) {
      issues.push({ code: "register_has_no_rows", message: "The detected register header has no readable holdings rows." })
    }
    if (totalOwnership !== null && Math.abs(totalOwnership - 100) > 0.05) {
      issues.push({ code: "ownership_not_reconciled", message: `Ownership totals ${formatNumber(totalOwnership, 2)}%, not 100.00%.` })
    }
    const mismatches = [
      numberDifference(totalUnits, declaredTotals.units) > 0.01 ? "units" : null,
      numberDifference(totalOwnership, declaredTotals.ownership_percent) > 0.05 ? "ownership" : null,
      numberDifference(totalCommitments, declaredTotals.commitments) > 0.01 ? "commitments" : null,
      numberDifference(totalCalledCapital, declaredTotals.called_capital) > 0.01 ? "called capital" : null,
      numberDifference(totalUnfundedCommitment, declaredTotals.unfunded_commitment) > 0.01 ? "unfunded commitment" : null,
    ].filter(Boolean)
    if (mismatches.length) {
      issues.push({
        code: "register_declared_totals_mismatch",
        message: `Computed holder totals differ from the register summary row for: ${mismatches.join(", ")}.`,
      })
    }
    if (commitmentRollforwardVariance !== null && Math.abs(commitmentRollforwardVariance) > 0.01) {
      issues.push({
        code: "register_commitment_rollforward_mismatch",
        message: `Called plus unfunded capital differs from total commitments by ${formatNumber(commitmentRollforwardVariance, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: holders.length ? (issues.length ? "partial" : "completed") : "partial",
      summary_text: holders.length
        ? `Read ${holders.length} holder record(s) from ${table.name || "the register"}.`
        : "No readable holder entries were found in the detected register.",
      confidence: holders.length ? (issues.length ? 0.74 : 0.94) : 0.24,
      key_points: keyPoints,
      structured_data_json: {
        sheet_name: table.name || null,
        header_row: headerIndex + 1,
        column_mapping: mapping,
        holders,
        summary_rows: summaryRows.length,
        declared_totals: declaredTotals,
        totals: {
          units: totalUnits,
          ownership_percent: totalOwnership,
          commitments: totalCommitments,
          called_capital: totalCalledCapital,
          unfunded_commitment: totalUnfundedCommitment,
          commitment_called_percent: calledPercent,
          unfunded_commitment_percent: unfundedPercent,
          commitment_rollforward_variance: commitmentRollforwardVariance,
          top_5_ownership_percent: topFiveOwnership,
          top_5_commitment_percent: topFiveCommitment,
        },
        investor_types: investorTypes,
        investor_status_counts: statusCounts,
        tax_residencies: taxResidencies,
        domiciles,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactSensitiveIdentifiers(source.text), 1200),
    }
  }
}

module.exports = ShareholderRegisterReader
