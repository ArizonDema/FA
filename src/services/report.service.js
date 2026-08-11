const fs = require("fs")
const path = require("path")
const ExcelJS = require("exceljs")
const Handlebars = require("handlebars")
const { Op } = require("sequelize")
const {
  Portfolio,
  PortfolioRound,
  CashLedger,
  Commitment,
  InvestorProfile,
  ShareClass,
  CapitalCall,
  CapitalCallLine,
  Distribution,
  DistributionLine,
  JournalEntry,
  JournalLine,
  GLAccount,
  ReportTemplate,
} = require("../models")
const CapitalAccountStatementService = require("./capitalAccountStatement.service")
const CapitalAccountTemplateWriterService = require("../modules/templates/services/capitalAccountTemplateWriter.service")

let puppeteer = null
try {
  puppeteer = require("puppeteer")
} catch (error) {
  puppeteer = null
}

Handlebars.registerHelper("json", (context) => JSON.stringify(context, null, 2))

const REPORT_DIR = path.join(__dirname, "..", "..", "uploads", "reports")

function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
  }
}

function normalizeDate(value, fallback = null) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed
}

async function buildCashFlowData(portfolioId, startDate, endDate) {
  const where = {}
  if (startDate && endDate) {
    where.recorded_at = { [Op.between]: [startDate, endDate] }
  }

  const entries = await CashLedger.findAll({
    where,
    include: [
      {
        model: PortfolioRound,
        as: "round",
        where: { portfolio_id: portfolioId },
        required: true,
      },
    ],
    order: [["recorded_at", "ASC"]],
  })

  const byType = {}
  let totalIn = 0
  let totalOut = 0

  entries.forEach((entry) => {
    const type = entry.type
    const amount = Number.parseFloat(entry.amount || 0)
    byType[type] = (byType[type] || 0) + amount
    if (amount >= 0) {
      totalIn += amount
    } else {
      totalOut += amount
    }
  })

  return {
    entries,
    byType,
    totalIn,
    totalOut,
    net: totalIn + totalOut,
  }
}

async function buildShareholderRegister(portfolioId, asOfDate) {
  const commitments = await Commitment.findAll({
    include: [
      {
        model: ShareClass,
        as: "shareClass",
        where: { portfolio_id: portfolioId },
        required: true,
      },
      {
        model: InvestorProfile,
        as: "investor",
      },
    ],
    order: [["created_at", "ASC"]],
  })

  const commitmentIds = commitments.map((item) => item.id)
  const callLines = commitmentIds.length
    ? await CapitalCallLine.findAll({
        where: { commitment_id: { [Op.in]: commitmentIds } },
        include: [
          {
            model: CapitalCall,
            as: "capitalCall",
            where: asOfDate ? { call_date: { [Op.lte]: asOfDate } } : {},
            required: Boolean(asOfDate),
          },
        ],
      })
    : []

  const distributionLines = commitmentIds.length
    ? await DistributionLine.findAll({
        where: { commitment_id: { [Op.in]: commitmentIds } },
        include: [
          {
            model: Distribution,
            as: "distribution",
            where: asOfDate ? { distribution_date: { [Op.lte]: asOfDate } } : {},
            required: Boolean(asOfDate),
          },
        ],
      })
    : []

  const callByCommitment = {}
  const paidByCommitment = {}
  callLines.forEach((line) => {
    const commitmentId = line.commitment_id
    const called = Number.parseFloat(line.called_amount || 0)
    const paid = Number.parseFloat(line.paid_amount || 0)
    callByCommitment[commitmentId] = (callByCommitment[commitmentId] || 0) + called
    paidByCommitment[commitmentId] = (paidByCommitment[commitmentId] || 0) + paid
  })

  const distByCommitment = {}
  distributionLines.forEach((line) => {
    const commitmentId = line.commitment_id
    const net = Number.parseFloat(line.net_amount || 0)
    distByCommitment[commitmentId] = (distByCommitment[commitmentId] || 0) + net
  })

  const totalCommitment = commitments.reduce(
    (sum, item) => sum + Number.parseFloat(item.commitment_amount || 0),
    0,
  )
  const totalPaid = commitments.reduce(
    (sum, item) => sum + (paidByCommitment[item.id] || 0),
    0,
  )

  const rows = commitments.map((commitment) => {
    const called = callByCommitment[commitment.id] || 0
    const paid = paidByCommitment[commitment.id] || 0
    const distributed = distByCommitment[commitment.id] || 0
    const base = totalPaid > 0 ? totalPaid : totalCommitment
    const ownership = base > 0 ? (paid || Number.parseFloat(commitment.commitment_amount || 0)) / base : 0
    const capitalAccount = paid - distributed
    return {
      commitment_id: commitment.id,
      investor_name: commitment.investor?.legal_name || "-",
      investor_type: commitment.investor?.investor_type || "-",
      share_class: commitment.shareClass?.class_name || "-",
      share_class_id: commitment.shareClass?.id,
      commitment_amount: Number.parseFloat(commitment.commitment_amount || 0),
      called_amount: called,
      paid_amount: paid,
      distributed_amount: distributed,
      capital_account_balance: capitalAccount,
      ownership_percent: ownership,
    }
  })

  return {
    asOfDate,
    totalCommitment,
    totalPaid,
    rows,
  }
}

async function buildFinancialStatements(portfolioId, startDate, endDate) {
  const entryWhere = { portfolio_id: portfolioId, status: "posted" }
  if (startDate && endDate) {
    entryWhere.entry_date = { [Op.between]: [startDate, endDate] }
  }

  const lines = await JournalLine.findAll({
    include: [
      {
        model: JournalEntry,
        as: "entry",
        where: entryWhere,
        required: true,
      },
      {
        model: GLAccount,
        as: "account",
      },
    ],
  })

  const balanceLines = await JournalLine.findAll({
    include: [
      {
        model: JournalEntry,
        as: "entry",
        where: {
          portfolio_id: portfolioId,
          status: "posted",
          ...(endDate ? { entry_date: { [Op.lte]: endDate } } : {}),
        },
        required: true,
      },
      {
        model: GLAccount,
        as: "account",
      },
    ],
  })

  const incomeStatement = { income: 0, expense: 0, netIncome: 0 }
  lines.forEach((line) => {
    const type = line.account?.type
    const debit = Number.parseFloat(line.debit || 0)
    const credit = Number.parseFloat(line.credit || 0)
    if (type === "income") {
      incomeStatement.income += credit - debit
    }
    if (type === "expense") {
      incomeStatement.expense += debit - credit
    }
  })
  incomeStatement.netIncome = incomeStatement.income - incomeStatement.expense

  const balanceSheet = { assets: 0, liabilities: 0, equity: 0 }
  const balancesByAccount = {}
  balanceLines.forEach((line) => {
    const account = line.account
    if (!account) return
    const debit = Number.parseFloat(line.debit || 0)
    const credit = Number.parseFloat(line.credit || 0)
    const base = account.type === "asset" ? debit - credit : credit - debit
    balancesByAccount[account.code] = (balancesByAccount[account.code] || 0) + base
  })

  Object.entries(balancesByAccount).forEach(([code, balance]) => {
    const account = balanceLines.find((line) => line.account?.code === code)?.account
    if (!account) return
    if (account.type === "asset") balanceSheet.assets += balance
    if (account.type === "liability") balanceSheet.liabilities += balance
    if (account.type === "equity") balanceSheet.equity += balance
  })

  return {
    incomeStatement,
    balanceSheet,
  }
}

function defaultHtmlTemplate(title, data) {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #1d2733; padding: 24px; }
          h1 { margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d9dee6; padding: 6px 8px; text-align: left; font-size: 12px; }
          .section { margin-top: 18px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      </body>
    </html>
  `
}

async function generatePdfReport(runId, title, data, templateBody = null) {
  ensureReportDir()
  const filePath = path.join(REPORT_DIR, `${runId}.pdf`)

  if (!puppeteer) {
    throw new Error("PDF generation unavailable (puppeteer not installed).")
  }

  const html = templateBody
    ? Handlebars.compile(templateBody)(data)
    : defaultHtmlTemplate(title, data)

  const browser = await puppeteer.launch({ headless: "new" })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })
    await page.pdf({ path: filePath, format: "A4", printBackground: true })
  } finally {
    await browser.close()
  }

  return filePath
}

async function generateXlsxReport(runId, title, data) {
  ensureReportDir()
  const filePath = path.join(REPORT_DIR, `${runId}.xlsx`)
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet("Summary")

  summary.addRow([title])
  summary.addRow([])
  summary.addRow(["Generated At", new Date().toISOString()])
  summary.addRow(["Period Start", data.period?.start || ""])
  summary.addRow(["Period End", data.period?.end || ""])

  if (data.cashFlow) {
    const sheet = workbook.addWorksheet("Cash Flow")
    sheet.addRow(["Type", "Amount"])
    Object.entries(data.cashFlow.byType || {}).forEach(([type, amount]) => {
      sheet.addRow([type, Number(amount || 0)])
    })
    sheet.addRow([])
    sheet.addRow(["Total In", data.cashFlow.totalIn])
    sheet.addRow(["Total Out", data.cashFlow.totalOut])
    sheet.addRow(["Net", data.cashFlow.net])
  }

  if (data.shareholderRegister) {
    const sheet = workbook.addWorksheet("Shareholder Register")
    sheet.addRow([
      "Investor",
      "Type",
      "Share Class",
      "Commitment",
      "Called",
      "Paid",
      "Distributed",
      "Capital Account",
      "Ownership %",
    ])
    data.shareholderRegister.rows.forEach((row) => {
      sheet.addRow([
        row.investor_name,
        row.investor_type,
        row.share_class,
        row.commitment_amount,
        row.called_amount,
        row.paid_amount,
        row.distributed_amount,
        row.capital_account_balance,
        row.ownership_percent,
      ])
    })
  }

  if (data.financialStatements) {
    const sheet = workbook.addWorksheet("Financial Statements")
    sheet.addRow(["Income Statement"])
    sheet.addRow(["Income", data.financialStatements.incomeStatement.income])
    sheet.addRow(["Expense", data.financialStatements.incomeStatement.expense])
    sheet.addRow(["Net Income", data.financialStatements.incomeStatement.netIncome])
    sheet.addRow([])
    sheet.addRow(["Balance Sheet"])
    sheet.addRow(["Assets", data.financialStatements.balanceSheet.assets])
    sheet.addRow(["Liabilities", data.financialStatements.balanceSheet.liabilities])
    sheet.addRow(["Equity", data.financialStatements.balanceSheet.equity])
  }

  if (data.capitalAccountStatements) {
    CapitalAccountStatementService.addWorkbookSheets(workbook, data.capitalAccountStatements, {
      fundName: data.fund?.name || "Fund",
    })
  }

  await workbook.xlsx.writeFile(filePath)
  return filePath
}

async function generateCapitalAccountTemplateReport(runId, data, { templatePath, config }) {
  ensureReportDir()
  const filePath = path.join(REPORT_DIR, `${runId}.xlsx`)
  await CapitalAccountTemplateWriterService.write({
    templatePath,
    config,
    data: data.capitalAccountStatements,
    fundName: data.fund?.name || "Fund",
    outputPath: filePath,
  })
  return filePath
}

async function buildReportData({
  type,
  portfolioId,
  periodStart,
  periodEnd,
  shareClassId,
  investorProfileId,
}) {
  const portfolio = await Portfolio.findByPk(portfolioId)
  const startDate = normalizeDate(periodStart)
  const endDate = normalizeDate(periodEnd)

  const payload = {
    fund: portfolio ? portfolio.toJSON() : null,
    period: {
      start: startDate ? startDate.toISOString().slice(0, 10) : null,
      end: endDate ? endDate.toISOString().slice(0, 10) : null,
    },
  }

  if (type === "cash_flow") {
    payload.cashFlow = await buildCashFlowData(portfolioId, startDate, endDate)
  }

  if (type === "shareholder_register") {
    payload.shareholderRegister = await buildShareholderRegister(portfolioId, endDate || new Date())
    if (shareClassId) {
      payload.shareholderRegister.rows = payload.shareholderRegister.rows.filter(
        (row) => row.share_class_id === shareClassId || row.share_class_id === undefined,
      )
    }
  }

  if (type === "financial_statements") {
    payload.financialStatements = await buildFinancialStatements(portfolioId, startDate, endDate)
  }

  if (type === CapitalAccountStatementService.REPORT_TYPE) {
    payload.capitalAccountStatements = await CapitalAccountStatementService.buildStatementData({
      portfolioId,
      periodStart: payload.period.start,
      periodEnd: payload.period.end,
      investorProfileId,
      shareClassId,
      currency: portfolio?.base_currency || "USD",
    })
  }

  return payload
}

async function getTemplate(templateId) {
  if (!templateId) return null
  return await ReportTemplate.findByPk(templateId)
}

module.exports = {
  buildReportData,
  generatePdfReport,
  generateXlsxReport,
  generateCapitalAccountTemplateReport,
  getTemplate,
}
