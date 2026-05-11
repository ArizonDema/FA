const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")

const TemplateFileLoader = require("../src/modules/templates/parsing/templateFileLoader.service")
const WorkbookParser = require("../src/modules/templates/parsing/workbookParser.service")
const TemplateNormalizer = require("../src/modules/templates/parsing/templateNormalizer.service")

async function writeWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()

  const cashFlow = workbook.addWorksheet("Cash Flow")
  cashFlow.mergeCells("A1:C1")
  cashFlow.getCell("A1").value = "Operating Activities"
  cashFlow.getCell("A1").font = { bold: true }

  cashFlow.getCell("A2").value = "Subscriptions"
  cashFlow.getCell("B2").value = 100
  cashFlow.getCell("C2").value = 120

  cashFlow.getCell("A3").value = "Redemptions"
  cashFlow.getCell("A3").alignment = { indent: 1 }
  cashFlow.getCell("B3").value = 40
  cashFlow.getCell("C3").value = 55

  cashFlow.getCell("A4").value = "Subtotal"
  cashFlow.getCell("B4").value = { formula: "SUM(B2:B3)", result: 140 }
  cashFlow.getCell("C4").value = { formula: "SUM(C2:C3)", result: 175 }

  cashFlow.getCell("A6").value = "Notes: prepared from manager workbook"

  const cover = workbook.addWorksheet("Cover")
  cover.mergeCells("A1:B1")
  cover.getCell("A1").value = "Cover Page"

  await workbook.xlsx.writeFile(filePath)
}

describe("Template parsing pipeline", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-parsing-pipeline-"))
  const workbookPath = path.join(tempDir, "template-parsing.xlsx")

  beforeAll(async () => {
    await writeWorkbook(workbookPath)
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("parses workbook structure with sheets, merges, formulas, and ordering", async () => {
    const filePayload = TemplateFileLoader.load({
      filePath: workbookPath,
      sourceFileName: "template-parsing.xlsx",
    })

    const workbookStructure = await WorkbookParser.parse(filePayload)
    const cashFlowSheet = workbookStructure.worksheets[0]
    const subtotalRow = cashFlowSheet.rows.find((row) => row.row_index === 4)

    expect(workbookStructure.worksheet_count).toBe(2)
    expect(cashFlowSheet.name).toBe("Cash Flow")
    expect(cashFlowSheet.merged_regions).toEqual(
      expect.arrayContaining([expect.objectContaining({ range: "A1:C1" })]),
    )
    expect(subtotalRow.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: "B4",
          formula_text: "SUM(B2:B3)",
        }),
      ]),
    )
  })

  test("returns a validation error when the workbook payload is not a real xlsx file", async () => {
    const invalidWorkbookPath = path.join(tempDir, "invalid-template.xlsx")
    fs.writeFileSync(invalidWorkbookPath, "not a real workbook")

    const filePayload = TemplateFileLoader.load({
      filePath: invalidWorkbookPath,
      sourceFileName: "invalid-template.xlsx",
    })

    await expect(WorkbookParser.parse(filePayload)).rejects.toMatchObject({
      name: "CashFlowValidationError",
      message: "Cash flow template is not a valid .xlsx workbook or is corrupted. Re-export it as an Excel .xlsx file and try again.",
    })
  })

  test("normalizes template rows into section, data, subtotal, blank, and note rows", async () => {
    const filePayload = TemplateFileLoader.load({
      filePath: workbookPath,
      sourceFileName: "template-parsing.xlsx",
    })
    const workbookStructure = await WorkbookParser.parse(filePayload)
    const normalized = TemplateNormalizer.normalize({
      templateVersionId: "version-1",
      workbookStructure,
    })

    const cashFlowSheet = normalized.sheets.find((sheet) => sheet.name === "Cash Flow")
    const sectionRow = cashFlowSheet.rows.find((row) => row.rowIndex === 1)
    const indentedRow = cashFlowSheet.rows.find((row) => row.rowIndex === 3)
    const subtotalRow = cashFlowSheet.rows.find((row) => row.rowIndex === 4)
    const blankRow = cashFlowSheet.rows.find((row) => row.rowIndex === 5)
    const noteRow = cashFlowSheet.rows.find((row) => row.rowIndex === 6)

    expect(sectionRow).toEqual(
      expect.objectContaining({
        rowLabel: "Operating Activities",
        rowType: "section_header",
        sectionName: "Operating Activities",
      }),
    )
    expect(indentedRow).toEqual(
      expect.objectContaining({
        rowLabel: "Redemptions",
        rowType: "data_row",
        indentationLevel: 1,
        sectionName: "Operating Activities",
      }),
    )
    expect(subtotalRow).toEqual(
      expect.objectContaining({
        rowLabel: "Subtotal",
        rowType: "subtotal",
        isFormula: true,
      }),
    )
    expect(blankRow.rowType).toBe("blank")
    expect(noteRow).toEqual(
      expect.objectContaining({
        rowType: "note",
        rowLabel: "Notes: prepared from manager workbook",
      }),
    )
    expect(normalized.summary.section_header).toBe(2)
  })
})
