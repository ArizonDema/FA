const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")

const CashFlowService = require("../src/services/cashFlow.service")

async function writeTestingTemplate2Style(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow")
  sheet.mergeCells("B2:P2")
  sheet.getCell("B2").value = "CASH FLOW STATEMENT"
  sheet.mergeCells("B3:P3")
  sheet.getCell("B3").value = "Single-sheet treasury model"
  sheet.addRow([])
  sheet.getCell("B5").value = { formula: "D31", result: 180000 }
  sheet.getCell("F5").value = { formula: "SUM(D30:O30)", result: 421200 }
  sheet.addRow([])
  sheet.addRow([])
  sheet.addRow([])
  sheet.getRow(9).values = [
    null,
    "Section",
    "Line Item",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Total",
  ]

  const rows = [
    ["OPERATING CASH FLOW", "Cash receipts from customers", 220000, 235000, 240000, 255000, 265000, 275000, 280000, 290000, 300000, 310000, 320000, 335000],
    ["OPERATING CASH FLOW", "Refunds / other operating inflows", 4000, 3500, 4500, 3000, 4800, 4000, 5200, 4500, 4000, 5000, 5200, 6000],
    ["OPERATING CASH FLOW", "Payments to suppliers", -110000, -118000, -120000, -126000, -130000, -134000, -137000, -141000, -145000, -149000, -152000, -158000],
    ["OPERATING CASH FLOW", "Payroll and benefits", -52000, -52000, -53000, -53000, -54000, -54000, -55000, -55000, -56000, -56000, -57000, -58000],
    ["OPERATING CASH FLOW", "Rent and facilities", -9500, -9500, -9500, -9500, -9800, -9800, -9800, -9800, -10200, -10200, -10200, -10200],
    ["OPERATING CASH FLOW", "Sales & marketing", -12000, -13500, -15000, -14000, -14500, -15000, -15500, -16000, -16500, -17000, -17500, -18500],
    ["OPERATING CASH FLOW", "General & admin", -8000, -8200, -8300, -8400, -8600, -8700, -8800, -9000, -9100, -9300, -9400, -9500],
    ["OPERATING CASH FLOW", "Income taxes paid", 0, 0, -12000, 0, 0, -14000, 0, 0, -16000, 0, 0, -18000],
    ["OPERATING CASH FLOW", "Net cash from operations", ...Array(12).fill({ formula: "SUM(D10:D17)", result: 0 })],
    ["INVESTING CASH FLOW", "Capital expenditures", -30000, -18000, -12000, -40000, -10000, -15000, -22000, -12000, -55000, -9000, -14000, -28000],
    ["INVESTING CASH FLOW", "Software development capitalization", -8000, -8000, -8500, -8500, -9000, -9000, -9500, -9500, -10000, -10000, -10500, -10500],
    ["INVESTING CASH FLOW", "Asset sale proceeds", 0, 0, 0, 12000, 0, 0, 0, 15000, 0, 0, 0, 18000],
    ["INVESTING CASH FLOW", "Net cash from investing", ...Array(12).fill({ formula: "SUM(D19:D21)", result: 0 })],
    ["FINANCING CASH FLOW", "Debt drawdown", 0, 150000, 0, 0, 0, 0, 0, 0, 120000, 0, 0, 0],
    ["FINANCING CASH FLOW", "Debt principal repayments", -10000, -10000, -10000, -10000, -10000, -10000, -12000, -12000, -12000, -12000, -12000, -15000],
    ["FINANCING CASH FLOW", "Interest paid", -3000, -3200, -3200, -3400, -3400, -3600, -3600, -3800, -3800, -4000, -4000, -4200],
    ["FINANCING CASH FLOW", "Equity injection", 0, 0, 0, 0, 100000, 0, 0, 0, 0, 0, 0, 0],
    ["FINANCING CASH FLOW", "Dividends paid", 0, 0, 0, -20000, 0, 0, 0, -25000, 0, 0, 0, -30000],
    ["FINANCING CASH FLOW", "Net cash from financing", ...Array(12).fill({ formula: "SUM(D23:D27)", result: 0 })],
    ["SUMMARY", "Free cash flow", ...Array(12).fill({ formula: "D18+D22", result: 0 })],
    ["SUMMARY", "Net increase / (decrease) in cash", ...Array(12).fill({ formula: "D18+D22+D28", result: 0 })],
    ["SUMMARY", "Opening cash balance", 180000, ...Array(11).fill({ formula: "D32", result: 0 })],
    ["SUMMARY", "Ending cash balance", ...Array(12).fill({ formula: "D31+D30", result: 0 })],
  ]

  rows.forEach((row, index) => {
    const rowNumber = 10 + index
    sheet.getCell(`B${rowNumber}`).value = row[0]
    sheet.getCell(`C${rowNumber}`).value = row[1]
    row.slice(2).forEach((value, periodIndex) => {
      sheet.getRow(rowNumber).getCell(4 + periodIndex).value = value
    })
    sheet.getRow(rowNumber).getCell(16).value = { formula: `SUM(D${rowNumber}:O${rowNumber})`, result: 0 }
  })

  await workbook.xlsx.writeFile(filePath)
}

async function writeNumericOnlyArizonStyle(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow")
  sheet.getCell("A1").value = "Arizon PLC Cash Flow"
  sheet.getCell("A3").value = "Line"
  sheet.getCell("B3").value = "Amount"
  ;[
    ["Opening cash", 125000],
    ["Customer receipts", 15000],
    ["Supplier payments", -20000],
    ["Ending cash", 120000],
  ].forEach((row) => sheet.addRow(row))
  await workbook.xlsx.writeFile(filePath)
}

async function writePlcIndirectTemplate(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow Statement")
  sheet.getCell("A1").value = "Cash Flow Statement (Indirect Method)"
  sheet.getRow(3).values = [null, "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12", "Total"]
  const labels = [
    "Net Income",
    "Depreciation & Amortization",
    "Change in Receivables",
    "Change in Inventory",
    "Change in Payables",
    "Other Working Capital Changes",
    "Cash Flow from Operations",
    "Capital Expenditures",
    "Asset Sales",
    "Cash Flow from Investing",
    "Capital Contributions",
    "Debt Issued",
    "Debt Repaid",
    "Interest Paid",
    "Dividends Paid",
    "Cash Flow from Financing",
    "Net Change in Cash",
    "Cash at Beginning",
    "Cash at End",
  ]
  labels.forEach((label, index) => {
    const rowNumber = 4 + index
    sheet.getCell(`A${rowNumber}`).value = label
    for (let col = 2; col <= 13; col += 1) {
      sheet.getRow(rowNumber).getCell(col).value = label.includes("Cash Flow") || label.includes("Cash at End")
        ? { formula: `B${rowNumber}`, result: 0 }
        : 10
    }
    sheet.getRow(rowNumber).getCell(14).value = { formula: `SUM(B${rowNumber}:M${rowNumber})`, result: 120 }
  })
  await workbook.xlsx.writeFile(filePath)
}

describe("cash-flow template detection fixtures", () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-detection-fixtures-"))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("Testing_Template_2-style workbook is read as monthly columns with totals excluded", async () => {
    const templatePath = path.join(tempDir, "Testing_Template_2.xlsx")
    await writeTestingTemplate2Style(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
    const config = analysis.suggested_config_json

    expect(config.statement_method).toBe("direct")
    expect(config.period_axis.orientation).toBe("column")
    expect(config.period_axis.labels).toHaveLength(12)
    expect(config.period_axis.period_bindings.map((binding) => binding.cell)).toEqual([
      "D9",
      "E9",
      "F9",
      "G9",
      "H9",
      "I9",
      "J9",
      "K9",
      "L9",
      "M9",
      "N9",
      "O9",
    ])
    expect(config.opening_binding.cells[0].cell).toBe("D31")
    expect(config.closing_binding.cells[0].cell).toBe("D32")
    expect(config.bucket_bindings.some((bucket) => bucket.cells.some((cell) => cell.cell.startsWith("P")))).toBe(false)
  })

  test("Arizon-style numeric rows are not promoted into fake custom periods", async () => {
    const templatePath = path.join(tempDir, "Arizon_PLC_Cash_Flow_2026.xlsx")
    await writeNumericOnlyArizonStyle(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
    const labels = analysis.suggested_config_json.period_axis.labels.map((label) => label.label)

    expect(analysis.detected_layout_type).toBe("freeform")
    expect(labels).toEqual(["Period 1"])
  })

  test("PLC v2-style indirect monthly template remains supported", async () => {
    const templatePath = path.join(tempDir, "PLC_Cash_Flow_Template_v2.xlsx")
    await writePlcIndirectTemplate(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
    const config = analysis.suggested_config_json

    expect(analysis.detected_layout_type).toBe("columns")
    expect(config.statement_method).toBe("indirect")
    expect(config.period_axis.labels).toHaveLength(12)
    expect(config.row_bindings.length).toBeGreaterThanOrEqual(18)
    expect(config.opening_binding).toBeTruthy()
    expect(config.closing_binding).toBeTruthy()
  })
})
