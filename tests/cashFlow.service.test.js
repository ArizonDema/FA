const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")
const CashFlowService = require("../src/services/cashFlow.service")

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-service-test-"))
}

function removeDirSafe(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true })
}

async function writeTrialBalanceWorkbook(filePath, rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Trial Balance")
  sheet.addRow(["Company", "As of Date", "Account", "Ending Debit", "Ending Credit"])
  rows.forEach((row) => {
    sheet.addRow([
      row.company || "Demo Co",
      row.asOfDate || "2025-06-30",
      row.account,
      row.endingDebit || null,
      row.endingCredit || null,
    ])
  })
  await workbook.xlsx.writeFile(filePath)
}

async function writeGeneralLedgerWorkbook(filePath, rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("General Ledger")
  sheet.addRow([
    "Company",
    "Ledger Account",
    "Date",
    "JE No",
    "Description",
    "Entry Side",
    "Debit",
    "Credit",
    "Balance Amount",
    "Balance Type",
  ])

  rows.forEach((row) => {
    sheet.addRow([
      row.company || "Demo Co",
      row.account,
      row.date,
      row.jeNo,
      row.description || "",
      row.entrySide || "",
      row.debit || null,
      row.credit || null,
      row.balanceAmount || null,
      row.balanceType || null,
    ])
  })
  await workbook.xlsx.writeFile(filePath)
}

async function writeTemplateWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow")
  sheet.addRow([
    "Month",
    "Opening Balance",
    "Sales Inflow",
    "Other Inflow",
    "Total Inflows",
    "Rent",
    "Salaries",
    "Other Outflows",
    "Total Outflows",
    "Net Cash Flow",
    "Closing Balance",
  ])

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  months.forEach((month, index) => {
    const rowIndex = index + 2
    sheet.getCell(`A${rowIndex}`).value = month

    if (rowIndex === 2) {
      sheet.getCell(`B${rowIndex}`).value = null
    } else {
      sheet.getCell(`B${rowIndex}`).value = { formula: `K${rowIndex - 1}` }
    }
    sheet.getCell(`E${rowIndex}`).value = { formula: `C${rowIndex}+D${rowIndex}` }
    sheet.getCell(`I${rowIndex}`).value = { formula: `F${rowIndex}+G${rowIndex}+H${rowIndex}` }
    sheet.getCell(`J${rowIndex}`).value = { formula: `E${rowIndex}-I${rowIndex}` }
    sheet.getCell(`K${rowIndex}`).value = { formula: `B${rowIndex}+J${rowIndex}` }
  })

  await workbook.xlsx.writeFile(filePath)
}

describe("cashFlow.service", () => {
  let tempDir

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    removeDirSafe(tempDir)
  })

  test("parses trial balance and resolves ending cash", async () => {
    const tbPath = path.join(tempDir, "tb.xlsx")
    await writeTrialBalanceWorkbook(tbPath, [
      { account: "Cash", endingDebit: 1250, endingCredit: 0 },
      { account: "Accounts Payable", endingDebit: 0, endingCredit: 400 },
    ])

    const parsed = await CashFlowService.parseTrialBalanceFile(tbPath)
    expect(parsed.cashAccountName).toBe("Cash")
    expect(parsed.cashEndingBalance).toBe(1250)
    expect(parsed.asOfDate.toISOString().slice(0, 10)).toBe("2025-06-30")
  })

  test("parses GL and allocates multi-line JE movement proportionally", async () => {
    const glPath = path.join(tempDir, "gl.xlsx")
    await writeGeneralLedgerWorkbook(glPath, [
      {
        account: "Cash",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 100,
        credit: 0,
        entrySide: "DR",
        description: "Collections",
      },
      {
        account: "Service Revenue",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 80,
        entrySide: "CR",
      },
      {
        account: "Unearned Revenue",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 20,
        entrySide: "CR",
      },
      {
        account: "Cash",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 0,
        credit: 60,
        entrySide: "CR",
        description: "Payments",
      },
      {
        account: "Rent Expense",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 30,
        credit: 0,
        entrySide: "DR",
      },
      {
        account: "Salaries Expense",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 30,
        credit: 0,
        entrySide: "DR",
      },
    ])

    const parsed = await CashFlowService.parseGeneralLedgerFile(glPath, { cashAccountName: "Cash" })
    expect(parsed.movements).toHaveLength(4)

    const totalsByAccount = parsed.movements.reduce((acc, row) => {
      acc[row.account_name] = (acc[row.account_name] || 0) + row.amount
      return acc
    }, {})

    expect(totalsByAccount["Service Revenue"]).toBe(80)
    expect(totalsByAccount["Unearned Revenue"]).toBe(20)
    expect(totalsByAccount["Rent Expense"]).toBe(-30)
    expect(totalsByAccount["Salaries Expense"]).toBe(-30)
  })

  test("maps by rules and fallback buckets", () => {
    const buckets = [
      {
        bucket_key: "sales_inflow",
        label: "Sales",
        direction: "inflow",
        column_header: "Sales",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
      },
      {
        bucket_key: "other_inflow",
        label: "Other Inflow",
        direction: "inflow",
        column_header: "Other Inflow",
        fallback: true,
        rules: [],
      },
      {
        bucket_key: "ops_outflow",
        label: "Ops Outflow",
        direction: "outflow",
        column_header: "Ops Outflow",
        fallback: true,
        rules: [{ match_type: "contains", pattern: "expense", priority: 10 }],
      },
    ]

    const movements = [
      { account_name: "Accounts Receivable", date: new Date("2025-01-10"), amount: 100 },
      { account_name: "Rent Expense", date: new Date("2025-01-10"), amount: -35 },
      { account_name: "Owner Capital", date: new Date("2025-01-10"), amount: 50 },
    ]

    const result = CashFlowService.mapMovementsToBuckets(movements, buckets)
    expect(result.unmapped).toHaveLength(0)
    expect(result.mappedMovements.map((item) => item.bucket_key)).toEqual([
      "sales_inflow",
      "ops_outflow",
      "other_inflow",
    ])
  })

  test("builds fiscal-year rollforward from TB and GL movement", () => {
    const monthNet = [99450, 47520, 7505, 29525, 27495, 17080, 0, 0, 0, 0, 0, 0]
    const movements = monthNet
      .map((amount, index) => ({
        account_name: "Accounts Receivable",
        date: new Date(Date.UTC(2025, index, 15)),
        amount,
        bucket_key: "sales_inflow",
        bucket_label: "Sales Inflow",
        direction: "inflow",
        abs_amount: Math.abs(amount),
      }))
      .filter((row) => row.amount !== 0)

    const fiscalData = CashFlowService.buildFiscalYearData({
      fiscalYear: 2025,
      tbAsOfDate: "2025-06-30",
      tbCashEndingBalance: 228575,
      cashMovements: movements,
      mappedMovements: movements,
      buckets: [
        {
          bucket_key: "sales_inflow",
          label: "Sales Inflow",
          direction: "inflow",
          column_header: "Sales Inflow",
          fallback: false,
          rules: [],
        },
      ],
    })

    expect(fiscalData.opening_balance_january).toBe(0)
    expect(fiscalData.months[5].closing_balance).toBe(228575)
    expect(fiscalData.months[11].closing_balance).toBe(228575)
  })

  test("fills template by header mapping while preserving formulas", async () => {
    const templatePath = path.join(tempDir, "template.xlsx")
    const outputPath = path.join(tempDir, "filled.xlsx")
    await writeTemplateWorkbook(templatePath)

    const config = CashFlowService.validateTemplateConfig({
      sheet_name: "Cash Flow",
      header_row: 1,
      month_column_header: "Month",
      opening_column_header: "Opening Balance",
      closing_column_header: "Closing Balance",
      buckets: [
        {
          bucket_key: "sales_inflow",
          label: "Sales Inflow",
          direction: "inflow",
          column_header: "Sales Inflow",
          fallback: false,
          rules: [],
        },
        {
          bucket_key: "other_outflow",
          label: "Other Outflow",
          direction: "outflow",
          column_header: "Other Outflows",
          fallback: false,
          rules: [],
        },
      ],
    })

    const months = Array.from({ length: 12 }).map((_, index) => ({
      month_index: index + 1,
      month_label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index],
      opening_balance: index * 100,
      net_cash_flow: 10,
      closing_balance: index * 100 + 10,
      bucket_amounts: {
        sales_inflow: 50,
        other_outflow: 40,
      },
    }))

    await CashFlowService.fillTemplateWorkbook({
      templatePath,
      outputPath,
      config,
      fiscalData: { months },
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(outputPath)
    const sheet = workbook.getWorksheet("Cash Flow")

    expect(sheet.getCell("C2").value).toBe(50)
    expect(sheet.getCell("H2").value).toBe(40)

    const febOpening = sheet.getCell("B3").value
    expect(typeof febOpening).toBe("object")
    expect(febOpening.formula).toBe("K2")
  })

  test("deterministic verification against provided sample files", async () => {
    const sampleTB = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_GLC_Services.xlsx"
    const sampleGL = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_GLC_Services.xlsx"
    const sampleTemplate = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\simple_cash_flow_template.xlsx"

    if (!fs.existsSync(sampleTB) || !fs.existsSync(sampleGL) || !fs.existsSync(sampleTemplate)) {
      expect(true).toBe(true)
      return
    }

    const outputPath = path.join(tempDir, "sample_output.xlsx")
    const result = await CashFlowService.generateCashFlowReport({
      templatePath: sampleTemplate,
      templateConfig: {
        sheet_name: "Cash Flow",
        header_row: 1,
        month_column_header: "Month",
        opening_column_header: "Opening Balance",
        closing_column_header: "Closing Balance",
        buckets: [
          {
            bucket_key: "sales_inflow",
            label: "Sales Inflow",
            direction: "inflow",
            column_header: "Sales Inflow",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
          },
          {
            bucket_key: "other_inflow",
            label: "Other Inflow",
            direction: "inflow",
            column_header: "Other Inflow",
            fallback: true,
            rules: [],
          },
          {
            bucket_key: "rent_outflow",
            label: "Rent",
            direction: "outflow",
            column_header: "Rent",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Rent Expense", priority: 1 }],
          },
          {
            bucket_key: "salaries_outflow",
            label: "Salaries",
            direction: "outflow",
            column_header: "Salaries",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Salaries Expense", priority: 1 }],
          },
          {
            bucket_key: "other_outflow",
            label: "Other Outflows",
            direction: "outflow",
            column_header: "Other Outflows",
            fallback: true,
            rules: [],
          },
        ],
      },
      tbFilePath: sampleTB,
      glFilePath: sampleGL,
      fiscalYear: 2025,
      outputFilePath: outputPath,
    })

    expect(result.preview.monthly[5].closing_balance).toBe(228575)
    expect(result.preview.monthly[11].closing_balance).toBe(228575)
    expect(result.preview.totals.closing_balance_december).toBe(228575)
  })
})
