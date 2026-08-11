const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")
const JSZip = require("jszip")
const Writer = require("../src/modules/templates/services/capitalAccountTemplateWriter.service")

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII="

function config() {
  const statementFields = [
    "fund_name", "investor_name", "share_class", "period_start", "period_end",
    "beginning_capital", "contributions", "distributions", "ending_capital",
    "commitment_amount", "called_capital", "paid_capital", "unfunded_commitment",
  ]
  return {
    version: "cas_v1",
    summary: {
      sheet_name: "Summary",
      scalar_bindings: { fund_name: "B1", period_start: "B2", period_end: "B3" },
      table: {
        data_start_row: 5,
        style_source_row: 5,
        columns: {
          investor_name: "A", share_class: "B", beginning_capital: "C", contributions: "D",
          distributions: "E", ending_capital: "F", unfunded_commitment: "G",
        },
      },
    },
    statement: {
      prototype_sheet_name: "Prototype",
      scalar_bindings: Object.fromEntries(statementFields.map((field, index) => [
        field,
        field === "ending_capital" ? { cell: `B${index + 1}`, mode: "preserve_formula" } : `B${index + 1}`,
      ])),
      activity_table: {
        data_start_row: 20,
        style_source_row: 20,
        columns: { date: "A", type: "B", amount: "C", memo: "D" },
      },
    },
  }
}

async function createTemplate(filePath) {
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet("Summary")
  summary.addRow(["Fund", ""])
  summary.addRow(["Period start", ""])
  summary.addRow(["Period end", ""])
  summary.addRow(["Investor", "Class", "Beginning", "Contributions", "Distributions", "Ending", "Unfunded"])
  const summaryStyleRow = summary.getRow(5)
  summaryStyleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F6F0" } }

  const prototype = workbook.addWorksheet("Prototype")
  for (let row = 1; row <= 13; row += 1) prototype.getCell(`A${row}`).value = `Field ${row}`
  prototype.getCell("B9").value = { formula: "B6+B7-B8", result: 0 }
  prototype.getCell("A19").value = "Date"
  prototype.getCell("B19").value = "Type"
  prototype.getCell("C19").value = "Amount"
  prototype.getCell("D19").value = "Memo"
  prototype.getRow(20).getCell(1).numFmt = "yyyy-mm-dd"
  const imageId = workbook.addImage({ base64: ONE_PIXEL_PNG, extension: "png" })
  prototype.addImage(imageId, "D1:D2")
  await workbook.xlsx.writeFile(filePath)
}

function statement(overrides = {}) {
  return {
    investor_name: "Alpha Investor",
    share_class: "Class A",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    beginning_capital: 100,
    contributions: 50,
    distributions: 20,
    ending_capital: 130,
    commitment_amount: 500,
    called_capital: 200,
    paid_capital: 150,
    unfunded_commitment: 300,
    activity: [{ date: "2026-02-01", type: "Capital contribution", amount: 50, memo: "Call 1" }],
    ...overrides,
  }
}

describe("CapitalAccountTemplateWriterService", () => {
  let tempDir
  let templatePath
  let outputPath

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cas-template-writer-"))
    templatePath = path.join(tempDir, "template.xlsx")
    outputPath = path.join(tempDir, "output.xlsx")
    await createTemplate(templatePath)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("fills the summary and clones a styled statement sheet per investor/class", async () => {
    await Writer.write({
      templatePath,
      config: config(),
      fundName: "Example Fund",
      outputPath,
      data: {
        accounting_basis: "transactional_capital",
        period: { start: "2026-01-01", end: "2026-12-31" },
        statements: [statement(), statement()],
        totals: { ending_capital: 260 },
      },
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(outputPath)
    expect(workbook.getWorksheet("Prototype")).toBeUndefined()
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary", "Alpha Investor Class A", "Alpha Investor Class A 2",
    ])
    expect(workbook.getWorksheet("Summary").getCell("A5").value).toBe("Alpha Investor")
    expect(workbook.getWorksheet("Summary").getCell("A6").value).toBe("Alpha Investor")
    const detail = workbook.getWorksheet("Alpha Investor Class A")
    expect(detail.getCell("B2").value).toBe("Alpha Investor")
    expect(detail.getCell("B9").value.formula).toBe("B6+B7-B8")
    expect(detail.getCell("B20").value).toBe("Capital contribution")
    expect(detail.getImages()).toHaveLength(1)
    const zip = await JSZip.loadAsync(fs.readFileSync(outputPath))
    const workbookXml = await zip.file("xl/workbook.xml").async("string")
    expect(workbookXml).toContain('fullCalcOnLoad="1"')
  })

  test("removes the prototype and leaves an empty summary when no statements match", async () => {
    await Writer.write({
      templatePath,
      config: config(),
      fundName: "Example Fund",
      outputPath,
      data: {
        accounting_basis: "transactional_capital",
        period: { start: "2026-01-01", end: "2026-12-31" },
        statements: [],
        totals: {},
      },
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(outputPath)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary"])
    expect(workbook.getWorksheet("Summary").getCell("A5").value).toBeNull()
  })
})
