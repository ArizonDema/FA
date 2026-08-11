const CapitalAccountTemplateService = require("../src/modules/templates/services/capitalAccountTemplate.service")
const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")

function readyConfig() {
  return {
    version: "cas_v1",
    summary: {
      sheet_name: "Summary",
      scalar_bindings: {
        fund_name: "B1",
        period_start: "B2",
        period_end: "B3",
      },
      table: {
        data_start_row: 5,
        columns: {
          investor_name: "A",
          share_class: "B",
          beginning_capital: "C",
          contributions: "D",
          distributions: "E",
          ending_capital: "F",
          unfunded_commitment: "G",
        },
      },
    },
    statement: {
      prototype_sheet_name: "Statement Prototype",
      scalar_bindings: Object.fromEntries(
        CapitalAccountTemplateService.STATEMENT_REQUIRED_SCALARS.map((field, index) => [field, `B${index + 1}`]),
      ),
      activity_table: {
        data_start_row: 25,
        columns: { date: "A", type: "B", amount: "C" },
      },
    },
  }
}

describe("CapitalAccountTemplateService", () => {
  test("accepts the required summary, statement, and activity mappings", () => {
    const review = CapitalAccountTemplateService.evaluateReadiness(readyConfig())
    expect(review.can_activate).toBe(true)
    expect(review.required_anchors).toEqual([])
  })

  test("keeps optional fields optional but reports missing core mappings", () => {
    const config = readyConfig()
    delete config.statement.scalar_bindings.ending_capital
    const review = CapitalAccountTemplateService.evaluateReadiness(config)
    expect(review.can_activate).toBe(false)
    expect(review.required_anchors).toContain("statement_scalars")
    expect(review.activation_block_reason).toContain("ending capital")
  })

  test("requires separate summary and statement prototype sheets", () => {
    const config = readyConfig()
    config.statement.prototype_sheet_name = "Summary"
    const review = CapitalAccountTemplateService.evaluateReadiness(config)
    expect(review.can_activate).toBe(false)
    expect(review.required_anchors).toContain("distinct_sheets")
  })

  test("rejects duplicate write targets within a mapping section", () => {
    const config = readyConfig()
    config.summary.scalar_bindings.period_start = "B1"
    expect(() => CapitalAccountTemplateService.validateConfig(config)).toThrow("duplicate targets")
  })

  test("normalizes cell and column addresses", () => {
    const config = readyConfig()
    config.summary.scalar_bindings.fund_name = " b1 "
    config.summary.table.columns.investor_name = " a "
    const normalized = CapitalAccountTemplateService.validateConfig(config)
    expect(normalized.summary.scalar_bindings.fund_name.cell).toBe("B1")
    expect(normalized.summary.table.columns.investor_name).toBe("A")
  })

  test("suggests sheet roles, scalar cells, and repeating table columns from aliases", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cas-template-analysis-"))
    const filePath = path.join(tempDir, "cas.xlsx")
    try {
      const workbook = new ExcelJS.Workbook()
      const summary = workbook.addWorksheet("Capital Account Summary")
      summary.addRow(["Fund Name", ""])
      summary.addRow(["Period Start", ""])
      summary.addRow(["Period End", ""])
      summary.addRow([
        "Investor", "Share Class", "Beginning Capital", "Contributions",
        "Distributions", "Ending Capital", "Unfunded Commitment",
      ])
      const prototype = workbook.addWorksheet("Investor Statement Prototype")
      CapitalAccountTemplateService.STATEMENT_REQUIRED_SCALARS.forEach((field) => {
        const aliases = {
          fund_name: "Fund Name", investor_name: "Investor Name", share_class: "Share Class",
          period_start: "Period Start", period_end: "Period End", beginning_capital: "Beginning Capital",
          contributions: "Contributions", distributions: "Distributions", ending_capital: "Ending Capital",
          commitment_amount: "Commitment Amount", called_capital: "Called Capital", paid_capital: "Paid Capital",
          unfunded_commitment: "Unfunded Commitment",
        }
        prototype.addRow([aliases[field], ""])
      })
      prototype.addRow([])
      prototype.addRow(["Date", "Transaction Type", "Amount", "Memo"])
      await workbook.xlsx.writeFile(filePath)

      const result = await CapitalAccountTemplateService.analyzeTemplate({
        templatePath: filePath,
        sourceFileName: "cas.xlsx",
      })
      expect(result.suggested_config_json.summary.sheet_name).toBe("Capital Account Summary")
      expect(result.suggested_config_json.statement.prototype_sheet_name).toBe("Investor Statement Prototype")
      expect(result.suggested_config_json.summary.table.columns.ending_capital).toBe("F")
      expect(result.suggested_config_json.statement.scalar_bindings.investor_name.cell).toBe("B2")
      expect(result.suggested_config_json.statement.activity_table.columns.amount).toBe("C")
      expect(result.review.can_activate).toBe(true)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
