const { formatNumber, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "commitment_schedule"
const READER_VERSION = "commitment-schedule.v2"

const HEADER_ALIASES = {
  fund_name: ["fund", "fund name", "partnership", "entity"],
  investor_name: ["investor", "investor name", "limited partner", "lp", "partner", "holder", "holder name"],
  investor_type: ["investor type", "partner type", "lp type", "entity type"],
  investor_status: ["investor status", "status", "commitment status", "lp status"],
  tax_residency: ["tax residency", "tax residence", "tax domicile", "tax jurisdiction"],
  domicile: ["domicile", "jurisdiction", "investor domicile", "country"],
  share_class: ["share class", "class", "unit class", "interest class"],
  side_letter_status: ["side letter", "side letter status", "side letter flag"],
  prior_commitment: ["prior commitment", "opening commitment", "beginning commitment"],
  commitment_increase: ["commitment increase", "increase", "additional commitment", "upsized commitment"],
  commitment_decrease: ["commitment decrease", "decrease", "reduction", "transferred commitment"],
  commitment: ["commitment", "capital commitment", "committed capital", "commitment amount", "total commitment"],
  called_capital: ["called capital", "capital called", "drawn commitment", "drawn capital", "capital contributions", "contributed capital"],
  contributed_capital: ["contributed capital", "paid in capital", "paid-in capital", "capital contributed", "contributions"],
  unfunded_commitment: ["unfunded commitment", "uncalled commitment", "remaining commitment", "undrawn commitment", "unused commitment"],
  recallable_amount: ["recallable amount", "recallable distribution", "recyclable amount", "recallable capital"],
  defaulted_commitment: ["defaulted commitment", "default amount", "defaulted amount"],
  excluded_commitment: ["excluded commitment", "excluded amount", "ineligible commitment"],
  ownership_percent: ["ownership %", "commitment %", "commitment percentage", "percentage", "allocation %"],
  called_percent: ["called %", "called percentage", "funded %", "funded percentage"],
  unfunded_percent: ["unfunded %", "unfunded percentage", "remaining %", "uncalled %"],
  close_date: ["close date", "admission date", "subscription date", "commitment date"],
  effective_date: ["effective date", "change effective date", "transfer date"],
}

function normalizeHeader(value) {
  return singleLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9% ]/g, " ").replace(/\s+/g, " ").trim()
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

function selectCommitmentTable(tables) {
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
        "prior_commitment",
        "commitment_increase",
        "commitment_decrease",
        "commitment",
        "called_capital",
        "contributed_capital",
        "unfunded_commitment",
        "recallable_amount",
        "ownership_percent",
        "called_percent",
        "unfunded_percent",
      ].filter((key) => mapping[key] !== undefined).length
      const hasCommitmentShape = mapping.commitment !== undefined && (mapping.investor_name !== undefined || mapping.unfunded_commitment !== undefined)
      if (hasCommitmentShape && (!best || score > best.score)) best = { table, headerIndex: index, mapping, score }
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
  return /^(?:grand\s+)?totals?$|^subtotals?$|^aggregate(?:\s+total)?$|^commitment\s+total$/i.test(singleLine(value))
}

function sumValues(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value))
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

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)))
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

function commitmentReconciliationVariance(totals) {
  if (totals.commitment === null || totals.unfunded_commitment === null) return null
  const called = totals.called_capital ?? totals.contributed_capital
  if (called === null) return null
  return totals.commitment - called - totals.unfunded_commitment
}

function commitmentChangeVariance(totals) {
  if (totals.prior_commitment === null || totals.commitment === null) return null
  const increase = totals.commitment_increase || 0
  const decrease = totals.commitment_decrease || 0
  return totals.prior_commitment + increase - decrease - totals.commitment
}

function percentageVariance(totals, declaredTotals, valueKey, percentKey) {
  const reportedPercent = declaredTotals[percentKey]
  if (totals.commitment === null || totals[valueKey] === null || reportedPercent === null) return null
  return percentValue(totals[valueKey], totals.commitment) - reportedPercent
}

function percentValue(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) <= 0.0000001) return null
  return (numerator / denominator) * 100
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(capital commitment schedule|commitment schedule|unfunded commitment schedule|uncalled commitment schedule)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Commitment Schedule",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

class CommitmentScheduleReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const selected = selectCommitmentTable(source.tables)
    const identity = documentIdentity(source.text)
    if (!selected) {
      return {
        reader_key: READER_KEY,
        reader_version: READER_VERSION,
        status: identity ? "partial" : "partial",
        summary_text: "A commitment schedule table could not be mapped automatically.",
        confidence: identity ? 0.28 : 0.16,
        key_points: [identity].filter(Boolean),
        structured_data_json: { table_count: source.tables?.length || 0 },
        issues_json: [{ code: "commitment_schedule_headers_not_found", message: "Identify investor, commitment, called, or unfunded commitment columns manually." }],
        source_text_excerpt: snippet(source.text, 1200),
      }
    }

    const { table, headerIndex, mapping } = selected
    const parsedRows = (table.rows || []).slice(headerIndex + 1).map((row) => ({
      row_label: firstTextCell(row),
      fund_name: singleLine(cell(row, mapping, "fund_name")),
      investor_name: singleLine(cell(row, mapping, "investor_name")),
      investor_type: singleLine(cell(row, mapping, "investor_type")),
      investor_status: singleLine(cell(row, mapping, "investor_status")),
      tax_residency: singleLine(cell(row, mapping, "tax_residency")),
      domicile: singleLine(cell(row, mapping, "domicile")),
      share_class: singleLine(cell(row, mapping, "share_class")),
      side_letter_status: singleLine(cell(row, mapping, "side_letter_status")),
      prior_commitment: parseNumber(cell(row, mapping, "prior_commitment")),
      commitment_increase: parseNumber(cell(row, mapping, "commitment_increase")),
      commitment_decrease: parseNumber(cell(row, mapping, "commitment_decrease")),
      commitment: parseNumber(cell(row, mapping, "commitment")),
      called_capital: parseNumber(cell(row, mapping, "called_capital")),
      contributed_capital: parseNumber(cell(row, mapping, "contributed_capital")),
      unfunded_commitment: parseNumber(cell(row, mapping, "unfunded_commitment")),
      recallable_amount: parseNumber(cell(row, mapping, "recallable_amount")),
      defaulted_commitment: parseNumber(cell(row, mapping, "defaulted_commitment")),
      excluded_commitment: parseNumber(cell(row, mapping, "excluded_commitment")),
      ownership_percent: parseNumber(cell(row, mapping, "ownership_percent")),
      called_percent: parseNumber(cell(row, mapping, "called_percent")),
      unfunded_percent: parseNumber(cell(row, mapping, "unfunded_percent")),
      close_date: singleLine(cell(row, mapping, "close_date")),
      effective_date: singleLine(cell(row, mapping, "effective_date")),
    }))
    const summaryRows = parsedRows.filter((row) => isSummaryLabel(row.investor_name || row.row_label))
    const commitments = parsedRows
      .filter((row) => !isSummaryLabel(row.investor_name || row.row_label))
      .filter((row) => row.investor_name || row.commitment !== null || row.unfunded_commitment !== null)
    const funds = uniqueValues(commitments, "fund_name")
    const shareClasses = uniqueValues(commitments, "share_class")
    const investorTypes = uniqueValues(commitments, "investor_type")
    const investorStatuses = uniqueValues(commitments, "investor_status")
    const taxResidencies = uniqueValues(commitments, "tax_residency")
    const domiciles = uniqueValues(commitments, "domicile")
    const sideLetterStatuses = uniqueValues(commitments, "side_letter_status")
    const closeDates = uniqueValues(commitments, "close_date")
    const effectiveDates = uniqueValues(commitments, "effective_date")
    const investorStatusCounts = valueCounts(commitments, "investor_status")
    const investorTypeCounts = valueCounts(commitments, "investor_type")
    const sideLetterCounts = valueCounts(commitments, "side_letter_status")
    const totals = {
      prior_commitment: sumValues(commitments, "prior_commitment"),
      commitment_increase: sumValues(commitments, "commitment_increase"),
      commitment_decrease: sumValues(commitments, "commitment_decrease"),
      commitment: sumValues(commitments, "commitment"),
      called_capital: sumValues(commitments, "called_capital"),
      contributed_capital: sumValues(commitments, "contributed_capital"),
      unfunded_commitment: sumValues(commitments, "unfunded_commitment"),
      recallable_amount: sumValues(commitments, "recallable_amount"),
      defaulted_commitment: sumValues(commitments, "defaulted_commitment"),
      excluded_commitment: sumValues(commitments, "excluded_commitment"),
      ownership_percent: sumValues(commitments, "ownership_percent"),
      called_percent: sumValues(commitments, "called_percent"),
      unfunded_percent: sumValues(commitments, "unfunded_percent"),
    }
    const declaredTotals = summaryRows.reduce(
      (declared, row) => ({
        prior_commitment: declared.prior_commitment ?? row.prior_commitment,
        commitment_increase: declared.commitment_increase ?? row.commitment_increase,
        commitment_decrease: declared.commitment_decrease ?? row.commitment_decrease,
        commitment: declared.commitment ?? row.commitment,
        called_capital: declared.called_capital ?? row.called_capital,
        contributed_capital: declared.contributed_capital ?? row.contributed_capital,
        unfunded_commitment: declared.unfunded_commitment ?? row.unfunded_commitment,
        recallable_amount: declared.recallable_amount ?? row.recallable_amount,
        defaulted_commitment: declared.defaulted_commitment ?? row.defaulted_commitment,
        excluded_commitment: declared.excluded_commitment ?? row.excluded_commitment,
        ownership_percent: declared.ownership_percent ?? row.ownership_percent,
        called_percent: declared.called_percent ?? row.called_percent,
        unfunded_percent: declared.unfunded_percent ?? row.unfunded_percent,
      }),
      {
        prior_commitment: null,
        commitment_increase: null,
        commitment_decrease: null,
        commitment: null,
        called_capital: null,
        contributed_capital: null,
        unfunded_commitment: null,
        recallable_amount: null,
        defaulted_commitment: null,
        excluded_commitment: null,
        ownership_percent: null,
        called_percent: null,
        unfunded_percent: null,
      },
    )
    const calledForRatio = totals.called_capital ?? totals.contributed_capital
    const reconciliationVariance = commitmentReconciliationVariance(totals)
    const changeVariance = commitmentChangeVariance(totals)
    const calledPercentVariance = percentageVariance(totals, declaredTotals, "called_capital", "called_percent")
    const unfundedPercentVariance = percentageVariance(totals, declaredTotals, "unfunded_commitment", "unfunded_percent")
    const largestCommitment = maxByValue(commitments, "commitment")
    const largestUnfunded = maxByValue(commitments, "unfunded_commitment")
    const largestDefaulted = maxByValue(commitments, "defaulted_commitment")
    const activeInvestors = commitments.filter((row) => !/\b(?:inactive|closed|withdrawn|transferred|defaulted|excluded)\b/i.test(row.investor_status || "")).length
    const topFiveCommitment = topConcentration(commitments, "commitment", totals.commitment)
    const topFiveUnfunded = topConcentration(commitments, "unfunded_commitment", totals.unfunded_commitment)
    const keyPoints = [
      identity,
      point({ key: "funds", label: "Funds", value: funds.join(", "), valueJson: funds, confidence: 0.82 }),
      point({ key: "commitment_schedule_investors", label: "Commitment Schedule Investors", value: String(commitments.length), confidence: 0.95 }),
      point({ key: "active_commitment_investors", label: "Active Commitment Investors", value: String(activeInvestors), confidence: 0.84 }),
      point({ key: "share_classes", label: "Share Classes", value: shareClasses.join(", "), valueJson: shareClasses, confidence: 0.84 }),
      point({ key: "investor_types", label: "Investor Types", value: investorTypes.join(", "), valueJson: investorTypes, confidence: 0.82 }),
      point({ key: "investor_statuses", label: "Investor Statuses", value: investorStatuses.join(", "), valueJson: investorStatuses, confidence: 0.82 }),
      point({ key: "investor_status_counts", label: "Investor Status Counts", value: countsText(investorStatusCounts), valueJson: investorStatusCounts, confidence: 0.84 }),
      point({ key: "investor_type_counts", label: "Investor Type Counts", value: countsText(investorTypeCounts), valueJson: investorTypeCounts, confidence: 0.8 }),
      point({ key: "tax_residencies", label: "Tax Residencies", value: taxResidencies.join(", "), valueJson: taxResidencies, confidence: 0.78 }),
      point({ key: "domiciles", label: "Investor Domiciles", value: domiciles.join(", "), valueJson: domiciles, confidence: 0.78 }),
      point({ key: "side_letter_statuses", label: "Side Letter Statuses", value: sideLetterStatuses.join(", "), valueJson: sideLetterStatuses, confidence: 0.78 }),
      point({ key: "side_letter_counts", label: "Side Letter Counts", value: countsText(sideLetterCounts), valueJson: sideLetterCounts, confidence: 0.78 }),
      point({ key: "close_dates", label: "Commitment Close Dates", value: closeDates.join(", "), valueJson: closeDates, confidence: 0.78 }),
      point({ key: "effective_dates", label: "Commitment Effective Dates", value: effectiveDates.join(", "), valueJson: effectiveDates, confidence: 0.76 }),
      point({ key: "total_prior_commitment", label: "Total Prior Commitment", value: formatNumber(totals.prior_commitment, 2), confidence: 0.86 }),
      point({ key: "total_commitment_increase", label: "Total Commitment Increase", value: formatNumber(totals.commitment_increase, 2), confidence: 0.84 }),
      point({ key: "total_commitment_decrease", label: "Total Commitment Decrease", value: formatNumber(totals.commitment_decrease, 2), confidence: 0.84 }),
      point({ key: "total_commitment", label: "Total Commitment", value: formatNumber(totals.commitment, 2), confidence: 0.94 }),
      point({ key: "total_called_capital", label: "Total Called Capital", value: formatNumber(totals.called_capital, 2), confidence: 0.9 }),
      point({ key: "total_contributed_capital", label: "Total Contributed Capital", value: formatNumber(totals.contributed_capital, 2), confidence: 0.88 }),
      point({ key: "total_unfunded_commitment", label: "Total Unfunded Commitment", value: formatNumber(totals.unfunded_commitment, 2), confidence: 0.94 }),
      point({ key: "total_recallable_amount", label: "Total Recallable Amount", value: formatNumber(totals.recallable_amount, 2), confidence: 0.86 }),
      point({ key: "total_defaulted_commitment", label: "Total Defaulted Commitment", value: formatNumber(totals.defaulted_commitment, 2), confidence: 0.82 }),
      point({ key: "total_excluded_commitment", label: "Total Excluded Commitment", value: formatNumber(totals.excluded_commitment, 2), confidence: 0.82 }),
      point({ key: "ownership_percent_total", label: "Total Ownership Percent", value: formatNumber(totals.ownership_percent, 4), confidence: 0.84 }),
      point({ key: "reported_called_percent_total", label: "Reported Called Percent Total", value: formatNumber(declaredTotals.called_percent, 4), confidence: 0.78 }),
      point({ key: "reported_unfunded_percent_total", label: "Reported Unfunded Percent Total", value: formatNumber(declaredTotals.unfunded_percent, 4), confidence: 0.78 }),
      point({ key: "called_commitment_percent", label: "Called Commitment Percent", value: percentValue(calledForRatio, totals.commitment) === null ? null : `${formatNumber(percentValue(calledForRatio, totals.commitment), 2)}%`, confidence: 0.88 }),
      point({ key: "unfunded_commitment_percent", label: "Unfunded Commitment Percent", value: percentValue(totals.unfunded_commitment, totals.commitment) === null ? null : `${formatNumber(percentValue(totals.unfunded_commitment, totals.commitment), 2)}%`, confidence: 0.88 }),
      point({ key: "largest_investor_by_commitment", label: "Largest Investor by Commitment", value: largestCommitment?.investor_name, valueJson: largestCommitment, confidence: 0.9 }),
      point({ key: "largest_commitment_amount", label: "Largest Commitment Amount", value: largestCommitment ? formatNumber(largestCommitment.commitment, 2) : null, confidence: 0.9 }),
      point({ key: "largest_unfunded_investor", label: "Largest Unfunded Investor", value: largestUnfunded?.investor_name, valueJson: largestUnfunded, confidence: 0.9 }),
      point({ key: "largest_unfunded_commitment", label: "Largest Unfunded Commitment", value: largestUnfunded ? formatNumber(largestUnfunded.unfunded_commitment, 2) : null, confidence: 0.9 }),
      point({ key: "largest_defaulted_investor", label: "Largest Defaulted Investor", value: largestDefaulted?.investor_name, valueJson: largestDefaulted, confidence: 0.82 }),
      point({ key: "largest_defaulted_commitment", label: "Largest Defaulted Commitment", value: largestDefaulted ? formatNumber(largestDefaulted.defaulted_commitment, 2) : null, confidence: 0.82 }),
      point({ key: "top_5_commitment_percent", label: "Top 5 Commitment Concentration", value: topFiveCommitment === null ? null : `${formatNumber(topFiveCommitment, 2)}%`, confidence: 0.86 }),
      point({ key: "top_5_unfunded_percent", label: "Top 5 Unfunded Commitment Concentration", value: topFiveUnfunded === null ? null : `${formatNumber(topFiveUnfunded, 2)}%`, confidence: 0.86 }),
      point({
        key: "commitment_change_reconciliation",
        label: "Commitment Change Reconciliation",
        value: changeVariance === null ? null : Math.abs(changeVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(changeVariance, 2)}`,
        confidence: 0.88,
      }),
      point({
        key: "commitment_schedule_reconciliation",
        label: "Commitment Schedule Reconciliation",
        value: reconciliationVariance === null ? null : Math.abs(reconciliationVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(reconciliationVariance, 2)}`,
        confidence: 0.9,
      }),
      point({
        key: "called_percent_reconciliation",
        label: "Called Percent Reconciliation",
        value: calledPercentVariance === null ? null : Math.abs(calledPercentVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(calledPercentVariance, 4)}%`,
        confidence: 0.84,
      }),
      point({
        key: "unfunded_percent_reconciliation",
        label: "Unfunded Percent Reconciliation",
        value: unfundedPercentVariance === null ? null : Math.abs(unfundedPercentVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(unfundedPercentVariance, 4)}%`,
        confidence: 0.84,
      }),
    ].filter(Boolean)

    const issues = []
    if (!commitments.length) {
      issues.push({ code: "commitment_schedule_rows_not_found", message: "No readable investor commitment rows were detected." })
    }
    if (totals.commitment === null) {
      issues.push({ code: "commitment_schedule_total_commitment_missing", message: "No total commitment could be calculated." })
    }
    if (reconciliationVariance !== null && Math.abs(reconciliationVariance) > 0.01) {
      issues.push({ code: "commitment_schedule_reconciliation_mismatch", message: `Called plus unfunded capital does not agree to total commitments by ${formatNumber(reconciliationVariance, 2)}.` })
    }
    if (changeVariance !== null && Math.abs(changeVariance) > 0.01) {
      issues.push({ code: "commitment_schedule_change_mismatch", message: `Prior commitments plus increases less decreases does not agree to current commitments by ${formatNumber(changeVariance, 2)}.` })
    }
    if (calledPercentVariance !== null && Math.abs(calledPercentVariance) > 0.01) {
      issues.push({ code: "commitment_schedule_called_percent_mismatch", message: `Reported called percentage differs from called capital divided by commitments by ${formatNumber(calledPercentVariance, 4)}%.` })
    }
    if (unfundedPercentVariance !== null && Math.abs(unfundedPercentVariance) > 0.01) {
      issues.push({ code: "commitment_schedule_unfunded_percent_mismatch", message: `Reported unfunded percentage differs from unfunded commitments divided by commitments by ${formatNumber(unfundedPercentVariance, 4)}%.` })
    }
    if (totals.ownership_percent !== null && Math.abs(totals.ownership_percent - 100) > 0.05) {
      issues.push({ code: "commitment_schedule_ownership_total_mismatch", message: `Ownership percentages total ${formatNumber(totals.ownership_percent, 4)} instead of 100.0000.` })
    }
    const mismatches = [
      numberDifference(totals.prior_commitment, declaredTotals.prior_commitment) > 0.01 ? "prior commitment" : null,
      numberDifference(totals.commitment_increase, declaredTotals.commitment_increase) > 0.01 ? "commitment increase" : null,
      numberDifference(totals.commitment_decrease, declaredTotals.commitment_decrease) > 0.01 ? "commitment decrease" : null,
      numberDifference(totals.commitment, declaredTotals.commitment) > 0.01 ? "commitment" : null,
      numberDifference(totals.called_capital, declaredTotals.called_capital) > 0.01 ? "called capital" : null,
      numberDifference(totals.contributed_capital, declaredTotals.contributed_capital) > 0.01 ? "contributed capital" : null,
      numberDifference(totals.unfunded_commitment, declaredTotals.unfunded_commitment) > 0.01 ? "unfunded commitment" : null,
      numberDifference(totals.recallable_amount, declaredTotals.recallable_amount) > 0.01 ? "recallable amount" : null,
      numberDifference(totals.defaulted_commitment, declaredTotals.defaulted_commitment) > 0.01 ? "defaulted commitment" : null,
      numberDifference(totals.excluded_commitment, declaredTotals.excluded_commitment) > 0.01 ? "excluded commitment" : null,
      numberDifference(totals.ownership_percent, declaredTotals.ownership_percent) > 0.05 ? "ownership percentage" : null,
    ].filter(Boolean)
    if (mismatches.length) {
      issues.push({
        code: "commitment_schedule_declared_totals_mismatch",
        message: `Computed commitment totals differ from the schedule summary row for: ${mismatches.join(", ")}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: commitments.length && totals.commitment !== null && !issues.length ? "completed" : "partial",
      summary_text: commitments.length
        ? `Read ${commitments.length} investor commitment record(s) from ${table.name || "the commitment schedule"}.`
        : "No readable investor commitment rows were found in the detected schedule.",
      confidence: commitments.length && totals.commitment !== null ? (issues.length ? 0.74 : 0.94) : 0.2,
      key_points: keyPoints,
      structured_data_json: {
        sheet_name: table.name || null,
        header_row: headerIndex + 1,
        column_mapping: mapping,
        commitments,
        summary_rows: summaryRows.length,
        declared_totals: declaredTotals,
        totals: {
          ...totals,
          called_commitment_percent: percentValue(calledForRatio, totals.commitment),
          unfunded_commitment_percent: percentValue(totals.unfunded_commitment, totals.commitment),
          top_5_commitment_percent: topFiveCommitment,
          top_5_unfunded_percent: topFiveUnfunded,
          reconciliation_variance: reconciliationVariance,
          commitment_change_variance: changeVariance,
          called_percent_variance: calledPercentVariance,
          unfunded_percent_variance: unfundedPercentVariance,
        },
        investor_status_counts: investorStatusCounts,
        investor_type_counts: investorTypeCounts,
        side_letter_counts: sideLetterCounts,
      },
      issues_json: issues,
      source_text_excerpt: snippet(source.text, 1200),
    }
  }
}

module.exports = CommitmentScheduleReader
