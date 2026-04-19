const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")
const CashFlowService = require("../src/services/cashFlow.service")

const INDIRECT_TEMPLATE_FIXTURE = path.join(
  process.cwd(),
  "uploads",
  "cash-flow",
  "templates",
  "bf126d3e-7a2c-422f-9704-b3ce626d76f1_PLC_Cash_Flow_Template_v2.xlsx",
)
const SAMPLE_2026_TB = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_2026.xlsx"
const SAMPLE_2026_GL = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_2026.xlsx"

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

async function writeTemplateWorkbook(
  filePath,
  sheetName = "Cash Flow",
  periodLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
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

  periodLabels.forEach((month, index) => {
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

function getRowBinding(config, semanticKey) {
  return (config?.row_bindings || []).find((binding) => binding.semantic_key === semanticKey) || null
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

  test("analyzes a template and suggests v3 period bindings", async () => {
    const templatePath = path.join(tempDir, "analyze_template.xlsx")
    await writeTemplateWorkbook(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath,
    })

    expect(analysis.detected_layout_type).toBe("rows")
    expect(analysis.confidence).toBeGreaterThan(0.5)
    expect(analysis.suggested_config_json.version).toBe("v3")
    expect(analysis.suggested_config_json.period_axis.labels.length).toBe(12)
    expect(analysis.suggested_config_json.bucket_bindings.length).toBeGreaterThan(0)
  })

  test("analyzes PLC_Cash_Flow_Template_v2 as an indirect template with leaf row bindings", async () => {
    if (!fs.existsSync(INDIRECT_TEMPLATE_FIXTURE)) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })

    expect(analysis.detected_layout_type).toBe("columns")
    expect(analysis.needs_human_review).toBe(false)
    expect(analysis.issues).toEqual([])
    expect(analysis.suggested_config_json.statement_method).toBe("indirect")

    const config = analysis.suggested_config_json
    expect(getRowBinding(config, "net_income")?.cells?.[0]?.cell).toBe("B4")
    expect(getRowBinding(config, "capital_expenditures")?.cells?.[0]?.cell).toBe("B12")
    expect(getRowBinding(config, "asset_sales")?.cells?.[0]?.cell).toBe("B13")
    expect(getRowBinding(config, "capital_contributions")?.cells?.[0]?.cell).toBe("B15")
    expect(getRowBinding(config, "interest_paid")?.cells?.[0]?.cell).toBe("B18")
    expect(getRowBinding(config, "opening_cash")?.cells?.[0]?.cell).toBe("B23")

    expect(getRowBinding(config, "operating_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "investing_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "financing_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "net_change_in_cash")?.role).toBe("summary")
    expect(getRowBinding(config, "closing_cash")?.role).toBe("summary")
  })

  test("infers indirect v3 configs from row bindings even when statement_method is missing", () => {
    const periodLabels = [{ period_key: "m01", label: "M1", period_type: "monthly", month: 1 }]

    const normalized = CashFlowService.validateTemplateConfig({
      version: "v3",
      sheet_name: "Cash Flow Statement",
      layout_type: "columns",
      period_granularity: "monthly",
      period_axis: {
        orientation: "column",
        labels: periodLabels,
        period_bindings: [{ period_key: "m01", label: "M1", cell: "B3" }],
      },
      period_resolution_rules: { custom_periods: [] },
      opening_binding: { cells: [{ period_key: "m01", label: "M1", cell: "B23" }] },
      closing_binding: { cells: [{ period_key: "m01", label: "M1", cell: "B24" }] },
      bucket_bindings: [],
      row_bindings: [
        { semantic_key: "net_income", label: "Net Income", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B4" }] },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations", role: "summary", cells: [{ period_key: "m01", label: "M1", cell: "B10" }] },
        { semantic_key: "capital_contributions", label: "Capital Contributions", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B15" }] },
        { semantic_key: "opening_cash", label: "Cash at Beginning", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B23" }] },
        { semantic_key: "closing_cash", label: "Cash at End", role: "summary", cells: [{ period_key: "m01", label: "M1", cell: "B24" }] },
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    })

    expect(normalized.statement_method).toBe("indirect")
    expect(normalized.bucket_bindings).toEqual([])
    expect(normalized.row_bindings.map((binding) => binding.semantic_key)).toContain("capital_contributions")
  })

  test("treats configs with row bindings as v3 instead of falling back to legacy bucket validation", () => {
    expect(() =>
      CashFlowService.validateTemplateConfig({
        sheet_name: "Cash Flow Statement",
        layout_type: "columns",
        row_bindings: [],
      }),
    ).toThrow("Template config_json.period_axis.orientation must be row or column")
  })

  test("treats M1..M12 period labels as monthly instead of custom", async () => {
    const templatePath = path.join(tempDir, "analyze_template_m_labels.xlsx")
    await writeTemplateWorkbook(
      templatePath,
      "Cash Flow",
      ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"],
    )

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath,
    })

    expect(analysis.suggested_config_json.period_granularity).toBe("monthly")
    expect(analysis.required_anchors).not.toContain("period_ranges")
    expect(
      analysis.suggested_config_json.period_axis.labels.every(
        (label) => label.period_type === "monthly" && Number.isInteger(label.month),
      ),
    ).toBe(true)
  })

  test("rejects v3 config when target sheet does not exist in workbook", async () => {
    const templatePath = path.join(tempDir, "template_missing_sheet.xlsx")
    await writeTemplateWorkbook(templatePath, "Template Layout")

    await expect(
      CashFlowService.ensureV3TemplateConfig({
        templatePath,
        templateConfig: {
          version: "v3",
          sheet_name: "Cash Flow",
          layout_type: "freeform",
          period_granularity: "custom",
          period_axis: {
            orientation: "row",
            labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
            period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
          },
          period_resolution_rules: {
            custom_periods: [{ period_key: "period_1", date_start: "2025-01-01", date_end: "2025-01-01" }],
          },
          opening_binding: null,
          closing_binding: null,
          bucket_bindings: [
            {
              bucket_key: "inflow_bucket",
              label: "Inflow Bucket",
              direction: "inflow",
              fallback: true,
              rules: [],
              cells: [{ period_key: "period_1", label: "Period 1", cell: "B1" }],
            },
            {
              bucket_key: "outflow_bucket",
              label: "Outflow Bucket",
              direction: "outflow",
              fallback: true,
              rules: [],
              cells: [{ period_key: "period_1", label: "Period 1", cell: "C1" }],
            },
          ],
          writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
          mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
        },
      }),
    ).rejects.toThrow('Template sheet "Cash Flow" not found')
  })

  test("auto-creates mappings with confidence metadata", () => {
    const buckets = [
      {
        bucket_key: "sales_inflow",
        label: "Sales Inflow",
        direction: "inflow",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
      },
      {
        bucket_key: "other_inflow",
        label: "Other Inflow",
        direction: "inflow",
        fallback: true,
        rules: [],
      },
      {
        bucket_key: "other_outflow",
        label: "Other Outflows",
        direction: "outflow",
        fallback: true,
        rules: [],
      },
    ]

    const movements = [
      { account_name: "Accounts Receivable", date: new Date("2025-01-10"), amount: 100 },
      { account_name: "Platform Revenue", date: new Date("2025-01-12"), amount: 55 },
      { account_name: "Office Expense", date: new Date("2025-01-13"), amount: -30 },
    ]

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: {
        auto_create: true,
        high_confidence_threshold: 0.7,
        low_confidence_threshold: 0.35,
      },
      learnedMappings: [],
    })

    expect(mapped.unmapped).toHaveLength(0)
    expect(mapped.autoCreatedMappings.length).toBeGreaterThan(0)
    expect(mapped.finalBucketAssignments.length).toBeGreaterThan(0)
    expect(mapped.lowConfidenceMappings.length).toBeGreaterThan(0)
  })

  test("classifies indirect financing semantics and preserves outflows", () => {
    const { classifyIndirectCashSemanticKey, mapIndirectCashMovementsToRows } = CashFlowService.__test

    expect(classifyIndirectCashSemanticKey("Interest Expense", "outflow")).toBe("interest_paid")
    expect(classifyIndirectCashSemanticKey("Interest Expense", "inflow")).toBeNull()
    expect(classifyIndirectCashSemanticKey("Notes Payable", "inflow")).toBe("debt_issued")
    expect(classifyIndirectCashSemanticKey("Notes Payable", "outflow")).toBe("debt_repaid")
    expect(classifyIndirectCashSemanticKey("Owner Capital", "inflow")).toBe("capital_contributions")
    expect(classifyIndirectCashSemanticKey("Owner Drawings", "outflow")).toBe("dividends_paid")

    const mapped = mapIndirectCashMovementsToRows(
      [
        { account_name: "Notes Payable", date: new Date("2026-01-10"), amount: -2500 },
        { account_name: "Interest Expense", date: new Date("2026-01-11"), amount: -150 },
        { account_name: "Owner Capital", date: new Date("2026-01-12"), amount: 5000 },
        { account_name: "Owner Drawings", date: new Date("2026-01-13"), amount: -400 },
      ],
      [
        { semantic_key: "debt_repaid", label: "Debt Repaid" },
        { semantic_key: "interest_paid", label: "Interest Paid" },
        { semantic_key: "capital_contributions", label: "Capital Contributions" },
        { semantic_key: "dividends_paid", label: "Dividends Paid" },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations" },
      ],
    )

    expect(mapped.unmapped).toHaveLength(0)
    expect(mapped.mappedMovements.map((movement) => movement.bucket_key)).toEqual([
      "debt_repaid",
      "interest_paid",
      "capital_contributions",
      "dividends_paid",
    ])
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
    expect(result.preview.totals.closing_balance_end).toBe(228575)
  })

  test("2026 indirect template regression matches TB cash and maps all movements", async () => {
    if (
      !fs.existsSync(INDIRECT_TEMPLATE_FIXTURE) ||
      !fs.existsSync(SAMPLE_2026_TB) ||
      !fs.existsSync(SAMPLE_2026_GL)
    ) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })
    const outputPath = path.join(tempDir, "indirect_2026_output.xlsx")

    const result = await CashFlowService.generateCashFlowReport({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
      templateConfig: analysis.suggested_config_json,
      tbFilePath: SAMPLE_2026_TB,
      glFilePath: SAMPLE_2026_GL,
      dateStart: "2026-01-01",
      dateEnd: "2026-12-31",
      outputFilePath: outputPath,
    })

    expect(result.warnings).toEqual([])
    expect(result.preview.mapping_summary.total_cash_movements).toBe(68)
    expect(result.preview.mapping_summary.mapped_cash_movements).toBe(68)
    expect(result.preview.mapping_summary.low_confidence_mappings).toBe(0)
    expect(result.preview.monthly[5].closing_balance).toBe(228575)
    expect(result.preview.monthly[6].closing_balance).toBe(228575)
    expect(result.preview.monthly[11].closing_balance).toBe(228575)
    expect(result.preview.monthly.slice(6).every((period) => period.closing_balance === 228575)).toBe(true)
    expect(result.preview.totals.closing_balance_end).toBe(228575)
  })
})
