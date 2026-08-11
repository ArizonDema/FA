const { Op } = require("sequelize")
const {
  Commitment,
  InvestorProfile,
  ShareClass,
  CapitalCall,
  CapitalCallLine,
  Distribution,
  DistributionLine,
} = require("../models")

const REPORT_TYPE = "capital_account_statement"

function createValidationError(message, details = null) {
  const error = new Error(message)
  error.statusCode = 400
  error.code = "capital_account_statement_validation"
  error.details = details
  return error
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : record
}

function normalizeDateOnly(value, fieldName) {
  if (!value) throw createValidationError(`${fieldName} is required`)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError(`${fieldName} must be a valid date`)
  }
  return parsed.toISOString().slice(0, 10)
}

function dateFrom(value, fallback = null) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString().slice(0, 10)
}

function isBefore(value, boundary) {
  return Boolean(value && boundary && value < boundary)
}

function isWithin(value, start, end) {
  return Boolean(value && value >= start && value <= end)
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0)
}

function groupKey(commitment) {
  return `${commitment.investor_profile_id || "unknown"}:${commitment.share_class_id || "unknown"}`
}

function createStatementGroup(commitment, { periodStart, periodEnd, currency }) {
  const investor = toPlain(commitment.investor) || {}
  const shareClass = toPlain(commitment.shareClass) || {}
  return {
    investor_profile_id: commitment.investor_profile_id,
    investor_name: investor.legal_name || "Unknown investor",
    investor_type: investor.investor_type || null,
    contact_email: investor.contact_email || null,
    share_class_id: commitment.share_class_id,
    share_class: shareClass.class_name || "Unassigned class",
    currency: shareClass.currency || currency || "USD",
    period_start: periodStart,
    period_end: periodEnd,
    commitment_ids: [],
    commitment_amount: 0,
    beginning_capital: 0,
    contributions: 0,
    distributions: 0,
    distribution_withholding: 0,
    net_distributions_paid: 0,
    allocated_net_income_loss: null,
    ending_capital: 0,
    called_capital: 0,
    paid_capital: 0,
    outstanding_called_capital: 0,
    unfunded_commitment: 0,
    ownership_percentage: 0,
    rollforward_variance: 0,
    activity: [],
  }
}

function uniqueSheetName(baseName, usedNames) {
  const cleaned = String(baseName || "Capital Account")
    .replace(/[\\/?*:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Capital Account"
  const base = cleaned.slice(0, 31)
  let candidate = base
  let counter = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` ${counter}`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
    counter += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

function styleTitleRow(row) {
  row.height = 26
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } }
    cell.alignment = { vertical: "middle" }
  })
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D637F" } }
    cell.alignment = { vertical: "middle", wrapText: true }
  })
}

function applyMoneyFormat(cell) {
  cell.numFmt = "#,##0.00;[Red]-#,##0.00;'-'"
}

async function buildStatementData({
  portfolioId,
  periodStart,
  periodEnd,
  investorProfileId = null,
  shareClassId = null,
  currency = "USD",
}) {
  if (!portfolioId) throw createValidationError("portfolio_id is required")
  const start = normalizeDateOnly(periodStart, "period_start")
  const end = normalizeDateOnly(periodEnd, "period_end")
  if (start > end) throw createValidationError("period_start must be on or before period_end")

  const commitmentWhere = {
    status: { [Op.ne]: "cancelled" },
    ...(investorProfileId ? { investor_profile_id: investorProfileId } : {}),
    ...(shareClassId ? { share_class_id: shareClassId } : {}),
  }
  const commitments = (
    await Commitment.findAll({
      where: commitmentWhere,
      include: [
        { model: InvestorProfile, as: "investor", required: true },
        {
          model: ShareClass,
          as: "shareClass",
          where: { portfolio_id: portfolioId },
          required: true,
        },
      ],
      order: [["commitment_date", "ASC"]],
    })
  )
    .map(toPlain)
    .filter((commitment) => !commitment.commitment_date || dateFrom(commitment.commitment_date) <= end)

  const commitmentIds = commitments.map((commitment) => commitment.id)
  const capitalCallLines = commitmentIds.length
    ? (
        await CapitalCallLine.findAll({
          where: { commitment_id: { [Op.in]: commitmentIds } },
          include: [
            {
              model: CapitalCall,
              as: "capitalCall",
              where: {
                call_date: { [Op.lte]: end },
                status: { [Op.ne]: "draft" },
              },
              required: true,
            },
          ],
          order: [[{ model: CapitalCall, as: "capitalCall" }, "call_date", "ASC"]],
        })
      ).map(toPlain)
    : []
  const distributionLines = commitmentIds.length
    ? (
        await DistributionLine.findAll({
          where: { commitment_id: { [Op.in]: commitmentIds } },
          include: [
            {
              model: Distribution,
              as: "distribution",
              where: {
                distribution_date: { [Op.lte]: end },
                status: { [Op.ne]: "draft" },
              },
              required: true,
            },
          ],
          order: [[{ model: Distribution, as: "distribution" }, "distribution_date", "ASC"]],
        })
      ).map(toPlain)
    : []

  const groups = new Map()
  const commitmentGroupKeys = new Map()
  commitments.forEach((commitment) => {
    const key = groupKey(commitment)
    if (!groups.has(key)) {
      groups.set(key, createStatementGroup(commitment, { periodStart: start, periodEnd: end, currency }))
    }
    const group = groups.get(key)
    group.commitment_ids.push(commitment.id)
    group.commitment_amount += toNumber(commitment.commitment_amount)
    commitmentGroupKeys.set(commitment.id, key)
  })

  let usedFallbackCallDates = false
  capitalCallLines.forEach((line) => {
    const group = groups.get(commitmentGroupKeys.get(line.commitment_id))
    if (!group) return
    const capitalCall = toPlain(line.capitalCall) || {}
    const callDate = dateFrom(capitalCall.call_date)
    const paidDate = dateFrom(line.paid_date, callDate)
    const calledAmount = toNumber(line.called_amount)
    const paidAmount = toNumber(line.paid_amount)
    if (callDate && callDate <= end) group.called_capital += calledAmount
    if (!line.paid_date && paidAmount) usedFallbackCallDates = true
    if (paidDate && paidDate <= end) group.paid_capital += paidAmount
    if (isBefore(paidDate, start)) group.beginning_capital += paidAmount
    if (isWithin(paidDate, start, end) && paidAmount) {
      group.contributions += paidAmount
      group.activity.push({
        date: paidDate,
        type: "Capital contribution",
        amount: paidAmount,
        withholding: 0,
        net_amount: paidAmount,
        reference: capitalCall.id || line.capital_call_id || null,
        memo: capitalCall.memo || null,
      })
    }
  })

  let usedFallbackDistributionDates = false
  distributionLines.forEach((line) => {
    const group = groups.get(commitmentGroupKeys.get(line.commitment_id))
    if (!group) return
    const distribution = toPlain(line.distribution) || {}
    const distributionDate = dateFrom(distribution.distribution_date)
    const paidDate = dateFrom(line.paid_date, distributionDate)
    const grossAmount = toNumber(line.gross_amount || line.net_amount)
    const withholding = toNumber(line.withholding)
    const netAmount = toNumber(line.net_amount)
    if (!line.paid_date && grossAmount) usedFallbackDistributionDates = true
    if (isBefore(paidDate, start)) group.beginning_capital -= grossAmount
    if (isWithin(paidDate, start, end) && grossAmount) {
      group.distributions += grossAmount
      group.distribution_withholding += withholding
      group.net_distributions_paid += netAmount
      group.activity.push({
        date: paidDate,
        type: distribution.distribution_type === "return_of_capital" ? "Return of capital" : "Distribution",
        amount: -grossAmount,
        withholding,
        net_amount: netAmount,
        reference: distribution.id || line.distribution_id || null,
        memo: distribution.memo || null,
      })
    }
  })

  const statements = Array.from(groups.values())
    .map((statement) => {
      const endingCapital = statement.beginning_capital + statement.contributions - statement.distributions
      const outstandingCalledCapital = Math.max(statement.called_capital - statement.paid_capital, 0)
      const unfundedCommitment = Math.max(statement.commitment_amount - statement.called_capital, 0)
      return {
        ...statement,
        ending_capital: endingCapital,
        outstanding_called_capital: outstandingCalledCapital,
        unfunded_commitment: unfundedCommitment,
        rollforward_variance:
          endingCapital - (statement.beginning_capital + statement.contributions - statement.distributions),
        activity: statement.activity.sort((left, right) => left.date.localeCompare(right.date)),
      }
    })
    .sort((left, right) =>
      `${left.investor_name}:${left.share_class}`.localeCompare(`${right.investor_name}:${right.share_class}`),
    )

  const totalEndingCapital = sumBy(statements, "ending_capital")
  const totalPaidCapital = sumBy(statements, "paid_capital")
  const totalCommitment = sumBy(statements, "commitment_amount")
  statements.forEach((statement) => {
    const basis = totalEndingCapital > 0
      ? statement.ending_capital / totalEndingCapital
      : totalPaidCapital > 0
        ? statement.paid_capital / totalPaidCapital
        : totalCommitment > 0
          ? statement.commitment_amount / totalCommitment
          : 0
    statement.ownership_percentage = basis * 100
  })

  const totals = {
    investors: new Set(statements.map((statement) => statement.investor_profile_id)).size,
    statements: statements.length,
    commitment_amount: totalCommitment,
    beginning_capital: sumBy(statements, "beginning_capital"),
    contributions: sumBy(statements, "contributions"),
    distributions: sumBy(statements, "distributions"),
    distribution_withholding: sumBy(statements, "distribution_withholding"),
    net_distributions_paid: sumBy(statements, "net_distributions_paid"),
    ending_capital: totalEndingCapital,
    called_capital: sumBy(statements, "called_capital"),
    paid_capital: totalPaidCapital,
    outstanding_called_capital: sumBy(statements, "outstanding_called_capital"),
    unfunded_commitment: sumBy(statements, "unfunded_commitment"),
    rollforward_variance: sumBy(statements, "rollforward_variance"),
  }

  const warnings = []
  if (!statements.length) {
    warnings.push({
      code: "capital_account_no_commitments",
      message: "No non-cancelled commitments matched the selected fund and filters.",
    })
  }
  warnings.push({
    code: "capital_account_allocations_not_available",
    message:
      "Investor-level income, fee, and carry allocations are not stored in the current ledger, so ending capital is transaction-based.",
  })
  if (usedFallbackCallDates) {
    warnings.push({
      code: "capital_account_call_date_fallback",
      message: "One or more contribution payment dates were missing; the capital-call date was used.",
    })
  }
  if (usedFallbackDistributionDates) {
    warnings.push({
      code: "capital_account_distribution_date_fallback",
      message: "One or more distribution payment dates were missing; the distribution date was used.",
    })
  }
  if (statements.some((statement) => statement.ending_capital < -0.01)) {
    warnings.push({
      code: "capital_account_negative_balance",
      message: "At least one transaction-based ending capital balance is negative and should be reviewed.",
    })
  }
  if (statements.some((statement) => statement.called_capital - statement.commitment_amount > 0.01)) {
    warnings.push({
      code: "capital_account_overcalled_commitment",
      message: "At least one investor/share-class account has called capital above its commitment.",
    })
  }

  return {
    report_type: REPORT_TYPE,
    accounting_basis: "transactional_capital",
    period: { start, end },
    filters: {
      investor_profile_id: investorProfileId || null,
      share_class_id: shareClassId || null,
    },
    statements,
    totals,
    warnings,
  }
}

function addWorkbookSheets(workbook, data, { fundName = "Fund" } = {}) {
  const summary = workbook.addWorksheet("Capital Account Summary")
  summary.views = [{ state: "frozen", ySplit: 5 }]
  summary.mergeCells("A1:M1")
  summary.getCell("A1").value = `${fundName} - Capital Account Statements`
  styleTitleRow(summary.getRow(1))
  summary.addRow(["Accounting basis", "Transaction-based; investor income, fee and carry allocations are not included"])
  summary.addRow(["Period", `${data.period.start} to ${data.period.end}`])
  summary.addRow([])
  const summaryHeader = summary.addRow([
    "Investor",
    "Share Class",
    "Beginning Capital",
    "Contributions",
    "Distributions",
    "Ending Capital",
    "Commitment",
    "Called Capital",
    "Paid Capital",
    "Outstanding Calls",
    "Unfunded Commitment",
    "Ownership %",
    "Rollforward Variance",
  ])
  styleHeaderRow(summaryHeader)
  data.statements.forEach((statement) => {
    const row = summary.addRow([
      statement.investor_name,
      statement.share_class,
      statement.beginning_capital,
      statement.contributions,
      -statement.distributions,
      statement.ending_capital,
      statement.commitment_amount,
      statement.called_capital,
      statement.paid_capital,
      statement.outstanding_called_capital,
      statement.unfunded_commitment,
      statement.ownership_percentage / 100,
      statement.rollforward_variance,
    ])
    for (let index = 3; index <= 11; index += 1) applyMoneyFormat(row.getCell(index))
    row.getCell(12).numFmt = "0.00%"
    applyMoneyFormat(row.getCell(13))
  })
  const totals = data.totals
  const totalRow = summary.addRow([
    "Total",
    "",
    totals.beginning_capital,
    totals.contributions,
    -totals.distributions,
    totals.ending_capital,
    totals.commitment_amount,
    totals.called_capital,
    totals.paid_capital,
    totals.outstanding_called_capital,
    totals.unfunded_commitment,
    data.statements.length ? 1 : 0,
    totals.rollforward_variance,
  ])
  totalRow.font = { bold: true }
  for (let index = 3; index <= 11; index += 1) applyMoneyFormat(totalRow.getCell(index))
  totalRow.getCell(12).numFmt = "0.00%"
  applyMoneyFormat(totalRow.getCell(13))
  summary.columns = [
    { width: 28 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 20 },
  ]

  const usedNames = new Set(["capital account summary"])
  data.statements.forEach((statement) => {
    const sheet = workbook.addWorksheet(uniqueSheetName(`${statement.investor_name} ${statement.share_class}`, usedNames))
    sheet.mergeCells("A1:B1")
    sheet.getCell("A1").value = "Capital Account Statement"
    styleTitleRow(sheet.getRow(1))
    sheet.addRow(["Fund", fundName])
    sheet.addRow(["Investor", statement.investor_name])
    sheet.addRow(["Share class", statement.share_class])
    sheet.addRow(["Period", `${statement.period_start} to ${statement.period_end}`])
    sheet.addRow(["Currency", statement.currency])
    sheet.addRow(["Accounting basis", "Transaction-based capital"])
    sheet.addRow([])
    const rollforwardHeader = sheet.addRow(["Capital Account Rollforward", "Amount"])
    styleHeaderRow(rollforwardHeader)
    const rollforwardRows = [
      ["Beginning capital", statement.beginning_capital],
      ["Capital contributions", statement.contributions],
      ["Distributions", -statement.distributions],
      ["Allocated net income / (loss)", "Not available in investor ledger"],
      ["Ending capital", statement.ending_capital],
      ["Rollforward variance", statement.rollforward_variance],
    ]
    rollforwardRows.forEach(([label, amount]) => {
      const row = sheet.addRow([label, amount])
      if (typeof amount === "number") applyMoneyFormat(row.getCell(2))
      if (label === "Ending capital" || label === "Rollforward variance") row.font = { bold: true }
    })
    sheet.addRow([])
    const commitmentHeader = sheet.addRow(["Commitment Reconciliation", "Amount"])
    styleHeaderRow(commitmentHeader)
    ;[
      ["Commitment", statement.commitment_amount],
      ["Called capital", statement.called_capital],
      ["Paid capital", statement.paid_capital],
      ["Outstanding called capital", statement.outstanding_called_capital],
      ["Unfunded commitment", statement.unfunded_commitment],
      ["Ownership", statement.ownership_percentage / 100],
    ].forEach(([label, amount]) => {
      const row = sheet.addRow([label, amount])
      if (label === "Ownership") row.getCell(2).numFmt = "0.00%"
      else applyMoneyFormat(row.getCell(2))
    })

    if (statement.activity.length) {
      sheet.addRow([])
      const activityTitle = sheet.addRow(["Period Activity", "Type", "Gross Amount", "Withholding", "Net / Paid", "Memo"])
      styleHeaderRow(activityTitle)
      statement.activity.forEach((activity) => {
        const row = sheet.addRow([
          activity.date,
          activity.type,
          activity.amount,
          activity.withholding,
          activity.net_amount,
          activity.memo || "",
        ])
        applyMoneyFormat(row.getCell(3))
        applyMoneyFormat(row.getCell(4))
        applyMoneyFormat(row.getCell(5))
      })
    }
    sheet.addRow([])
    const note = sheet.addRow([
      "Important",
      "This statement reflects recorded capital-call payments and distributions. Add approved investor allocations before treating it as a final GAAP/tax capital account statement.",
    ])
    note.getCell(2).alignment = { wrapText: true, vertical: "top" }
    sheet.columns = [{ width: 30 }, { width: 34 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 40 }]
  })

  return workbook
}

module.exports = {
  REPORT_TYPE,
  buildStatementData,
  addWorkbookSheets,
  _private: {
    createValidationError,
    normalizeDateOnly,
    uniqueSheetName,
  },
}
