const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const { EventEmitter } = require("events")
const ExcelJS = require("exceljs")

const mockCashFlowService = {
  analyzeTemplateWorkbook: jest.fn(),
  validateTemplateConfig: jest.fn((config) => config),
  ensureV3TemplateConfig: jest.fn(async ({ templateConfig }) => templateConfig),
  CashFlowValidationError: class CashFlowValidationError extends Error {},
}

jest.mock("../src/services/cashFlow.service", () => mockCashFlowService)
jest.mock("../src/config/app", () => ({
  logging: {
    level: "info",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    chatPath: "/api/chat",
    model: "qwen3:14b",
    modelCandidates: [],
    timeoutMs: 1000,
    templateAnalysisTimeoutMs: 120000,
    maxAttempts: 2,
    keepAlive: "10m",
    temperature: 0.1,
    numPredict: 1200,
    templateTemperature: 0,
    templateNumPredict: 600,
    templateNumCtx: 8192,
    maxConcurrency: 1,
    compactPromptFirst: true,
    compactPromptThresholdChars: 22000,
    deterministicBypassConfidence: 0.9,
  },
  openaiLlm: {
    enabled: false,
    apiKey: "",
  },
  mappingAssistance: {
    templateSemanticEnabled: true,
  },
}))
jest.mock("../src/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}))

const Ingestion = require("../src/services/cashFlowTemplateIngestion.service")

async function writeWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow Statement")
  sheet.addRow(["Header"])
  sheet.addRow(["Jan"])
  await workbook.xlsx.writeFile(filePath)
}

async function writeColumnWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow")
  sheet.addRow(["Report"])
  sheet.addRow(["Section", "Line Item", "Jan", "Feb", "Total"])
  sheet.addRow(["Operating", "Cash receipts from customers", 100, 120, { formula: "SUM(C3:D3)", result: 220 }])
  sheet.addRow(["Summary", "Opening cash balance", 10, 110, { formula: "SUM(C4:D4)", result: 120 }])
  sheet.addRow(["Summary", "Ending cash balance", 110, 230, { formula: "SUM(C5:D5)", result: 340 }])
  await workbook.xlsx.writeFile(filePath)
}

async function writeDirectSemanticRepairWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Cash Flow")
  sheet.addRow(["Report"])
  sheet.addRow(["Section", "Line Item", "Jan", "Feb"])
  sheet.addRow(["Operating", "Cash receipts from customers", 100, 120])
  sheet.addRow(["Operating", "Payroll and benefits", 0, 0])
  sheet.addRow(["Operating", "Rent and facilities", 0, 0])
  sheet.addRow(["Financing", "Debt drawdown", 50, 0])
  sheet.addRow(["Summary", "Opening cash balance", 10, 160])
  sheet.addRow(["Summary", "Ending cash balance", 160, 280])
  await workbook.xlsx.writeFile(filePath)
}

async function writeIndirectRepairWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Indirect Cash Flow")
  sheet.addRow(["Indirect method cash flow"])
  sheet.addRow([])
  sheet.addRow(["Line Item", "M1", "M2"])
  sheet.addRow(["Net Income", 100, 120])
  sheet.addRow(["Depreciation & Amortization", 10, 12])
  sheet.addRow(["Change in Receivables", -5, -6])
  sheet.addRow(["Change in Payables", 8, 9])
  sheet.addRow(["Other Working Capital Changes", 1, 1])
  sheet.addRow(["Cash Flow from Operations", { formula: "SUM(B4:B8)", result: 114 }, { formula: "SUM(C4:C8)", result: 136 }])
  sheet.addRow(["Capital Expenditures", -20, -30])
  sheet.addRow(["Cash Flow from Investing", { formula: "SUM(B10:B10)", result: -20 }, { formula: "SUM(C10:C10)", result: -30 }])
  sheet.addRow(["Member funding / paid-in capital", 50, 60])
  sheet.addRow(["Cash Flow from Financing", { formula: "SUM(B12:B12)", result: 50 }, { formula: "SUM(C12:C12)", result: 60 }])
  sheet.addRow(["Net Change in Cash", { formula: "SUM(B9,B11,B13)", result: 144 }, { formula: "SUM(C9,C11,C13)", result: 166 }])
  sheet.addRow(["Cash at Beginning", 1000, 1144])
  sheet.addRow(["Cash at End", 1144, 1310])
  await workbook.xlsx.writeFile(filePath)
}

function createDeterministicBaseline(overrides = {}) {
  return {
    detected_layout_type: "freeform",
    confidence: 0.42,
    issues: ["layout needs llm"],
    required_anchors: ["period_axis"],
    suggested_config_json: {
      version: "v3",
      sheet_name: "Cash Flow",
      layout_type: "freeform",
      statement_method: "direct",
      period_granularity: "custom",
      period_axis: {
        orientation: "row",
        labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
        period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
      },
      period_resolution_rules: { custom_periods: [] },
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
    ...overrides,
  }
}

function buildIndirectBaselineConfig({ includeCapitalContributions = false } = {}) {
  const periods = [
    { period_key: "m01", label: "M1", period_type: "monthly", month: 1 },
    { period_key: "m02", label: "M2", period_type: "monthly", month: 2 },
  ]
  const cellsFor = (rowIndex) =>
    periods.map((period, index) => ({
      period_key: period.period_key,
      label: period.label,
      cell: `${index === 0 ? "B" : "C"}${rowIndex}`,
    }))
  const rowBindings = [
    ["net_income", "Net Income", "input", true, 4],
    ["depreciation_amortization", "Depreciation & Amortization", "input", true, 5],
    ["change_in_receivables", "Change in Receivables", "input", true, 6],
    ["change_in_payables", "Change in Payables", "input", true, 7],
    ["other_working_capital_changes", "Other Working Capital Changes", "input", true, 8],
    ["operating_cash_flow", "Cash Flow from Operations", "summary", true, 9],
    ["capital_expenditures", "Capital Expenditures", "input", true, 10],
    ["investing_cash_flow", "Cash Flow from Investing", "summary", true, 11],
    ...(includeCapitalContributions ? [["capital_contributions", "Capital Contributions", "input", true, 12]] : []),
    ["financing_cash_flow", "Cash Flow from Financing", "summary", true, 13],
    ["net_change_in_cash", "Net Change in Cash", "summary", true, 14],
    ["opening_cash", "Cash at Beginning", "input", true, 15],
    ["closing_cash", "Cash at End", "summary", true, 16],
  ].map(([semantic_key, label, role, required, rowIndex]) => ({
    semantic_key,
    label,
    role,
    required,
    cells: cellsFor(rowIndex),
  }))

  return {
    version: "v3",
    sheet_name: "Indirect Cash Flow",
    layout_type: "columns",
    statement_method: "indirect",
    period_granularity: "monthly",
    period_axis: {
      orientation: "column",
      labels: periods,
      period_bindings: [
        { period_key: "m01", label: "M1", cell: "B3" },
        { period_key: "m02", label: "M2", cell: "C3" },
      ],
    },
    period_resolution_rules: { custom_periods: [] },
    opening_binding: { cells: cellsFor(15) },
    closing_binding: { cells: cellsFor(16) },
    bucket_bindings: [],
    row_bindings: rowBindings,
    writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
    mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
  }
}

function mockOllamaJsonResponse(payload, { statusCode = 200 } = {}) {
  return (options, callback) => {
    const handlers = {}
    const request = {
      setTimeout() {
        return request
      },
      on(event, handler) {
        handlers[event] = handler
        return request
      },
      write: jest.fn(),
      end: jest.fn(() => {
        const response = new EventEmitter()
        response.statusCode = statusCode
        response.headers = {}
        if (typeof callback === "function") callback(response)
        response.emit("data", Buffer.from(JSON.stringify(payload)))
        response.emit("end")
      }),
      destroy(error) {
        if (typeof handlers.error === "function") handlers.error(error)
      },
    }
    return request
  }
}

describe("cashFlowTemplateIngestion.service", () => {
  let tempDir
  let httpRequestSpy

  beforeEach(() => {
    jest.clearAllMocks()
    const appConfig = require("../src/config/app")
    appConfig.ollama.model = "qwen3:14b"
    appConfig.ollama.modelCandidates = []
    appConfig.ollama.maxAttempts = 2
    appConfig.ollama.deterministicBypassConfidence = 0.9
    appConfig.ollama.templateAnalysisTimeoutMs = 120000
    appConfig.ollama.templateTemperature = 0
    appConfig.ollama.templateNumPredict = 600
    appConfig.ollama.templateNumCtx = 8192
    appConfig.ollama.maxConcurrency = 1
    appConfig.ollama.compactPromptFirst = true
    appConfig.ollama.compactPromptThresholdChars = 22000
    appConfig.openaiLlm.enabled = false
    appConfig.openaiLlm.apiKey = ""
    appConfig.mappingAssistance.templateSemanticEnabled = true
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-ingestion-test-"))
    httpRequestSpy = jest.spyOn(http, "request").mockImplementation((options, callback) => {
      const handlers = {}
      let timeoutHandler = null
      const request = {
        setTimeout(ms, handler) {
          timeoutHandler = handler
          return request
        },
        on(event, handler) {
          handlers[event] = handler
          return request
        },
        write: jest.fn(),
        end: jest.fn(() => {
          if (typeof callback === "function") {
            void callback
          }
          if (typeof timeoutHandler === "function") {
            timeoutHandler()
          }
        }),
        destroy(error) {
          if (typeof handlers.error === "function") {
            handlers.error(error)
          }
        },
      }
      return request
    })
  })

  afterEach(() => {
    httpRequestSpy?.mockRestore()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("auto-approves deterministic fallback when llm times out and anchors are complete", async () => {
    const templatePath = path.join(tempDir, "template.xlsx")
    await writeWorkbook(templatePath)

    const deterministicConfig = {
      version: "v3",
      sheet_name: "Cash Flow Statement",
      layout_type: "rows",
      period_granularity: "monthly",
      period_axis: {
        orientation: "row",
        labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
        period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
      },
      period_resolution_rules: { custom_periods: [] },
      opening_binding: null,
      closing_binding: null,
      bucket_bindings: [
        {
          bucket_key: "inflow_bucket",
          label: "Inflow Bucket",
          direction: "inflow",
          fallback: true,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "B2" }],
        },
        {
          bucket_key: "outflow_bucket",
          label: "Outflow Bucket",
          direction: "outflow",
          fallback: true,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "C2" }],
        },
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    }

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue({
      detected_layout_type: "rows",
      confidence: 0.81,
      issues: [],
      required_anchors: [],
      suggested_config_json: deterministicConfig,
    })

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template.xlsx",
    })

    expect(result.analysis_source).toBe("deterministic_fallback")
    expect(result.needs_human_review).toBe(false)
    expect(result.required_anchors).toEqual([])
    expect(Array.isArray(result.llm_meta_json?.attempts)).toBe(true)
    expect(result.llm_meta_json.attempts).toHaveLength(2)
  })

  test("skips llm when deterministic analysis is already high confidence", async () => {
    const appConfig = require("../src/config/app")
    appConfig.mappingAssistance.templateSemanticEnabled = false
    const templatePath = path.join(tempDir, "template_bypass.xlsx")
    await writeWorkbook(templatePath)

    const deterministicConfig = {
      version: "v3",
      sheet_name: "Cash Flow Statement",
      layout_type: "rows",
      period_granularity: "monthly",
      period_axis: {
        orientation: "row",
        labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
        period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
      },
      period_resolution_rules: { custom_periods: [] },
      opening_binding: null,
      closing_binding: null,
      bucket_bindings: [
        {
          bucket_key: "inflow_bucket",
          label: "Inflow Bucket",
          direction: "inflow",
          fallback: true,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "B2" }],
        },
        {
          bucket_key: "outflow_bucket",
          label: "Outflow Bucket",
          direction: "outflow",
          fallback: true,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "C2" }],
        },
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    }

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue({
      detected_layout_type: "rows",
      confidence: 0.95,
      issues: [],
      required_anchors: [],
      suggested_config_json: deterministicConfig,
    })

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_bypass.xlsx",
    })

    expect(result.analysis_source).toBe("deterministic_bypass")
    expect(result.needs_human_review).toBe(false)
    expect(result.llm_meta_json?.skipped).toBe(true)
    expect(httpRequestSpy).not.toHaveBeenCalled()
  })

  test("forceLlm bypasses high-confidence deterministic skip for explicit reanalysis", async () => {
    const templatePath = path.join(tempDir, "template_force_reanalysis.xlsx")
    await writeColumnWorkbook(templatePath)

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(
      createDeterministicBaseline({
        detected_layout_type: "columns",
        confidence: 0.99,
        issues: [],
        required_anchors: [],
      }),
    )
    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.91,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_force_reanalysis.xlsx",
      forceLlm: true,
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.llm_meta_json?.skipped).not.toBe(true)
    expect(httpRequestSpy).toHaveBeenCalled()
  })

  test("allows high bypass thresholds to force schema-constrained llm evaluation", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.deterministicBypassConfidence = 0.995
    const templatePath = path.join(tempDir, "template_forced_llm.xlsx")
    await writeColumnWorkbook(templatePath)

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(
      createDeterministicBaseline({
        detected_layout_type: "columns",
        confidence: 0.99,
        issues: [],
        required_anchors: [],
      }),
    )
    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.91,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_forced_llm.xlsx",
    })

    expect(Ingestion.__test.resolveDeterministicBypassThreshold()).toBe(0.995)
    expect(Ingestion.__test.resolveTemplateAnalysisTimeoutMs()).toBe(120000)
    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.llm_meta_json?.schema_constrained).toBe(true)
    expect(result.llm_meta_json?.skipped).not.toBe(true)
    expect(httpRequestSpy).toHaveBeenCalled()
  })

  test("accepts a schema-constrained layout decision and deterministically builds v3 config", async () => {
    const templatePath = path.join(tempDir, "template_layout_decision.xlsx")
    await writeColumnWorkbook(templatePath)

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.91,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_layout_decision.xlsx",
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.statement_method).toBe("direct")
    expect(result.suggested_config_json.period_axis.orientation).toBe("column")
    expect(result.suggested_config_json.period_axis.labels).toHaveLength(2)
    expect(result.suggested_config_json.period_axis.period_bindings.map((item) => item.cell)).toEqual(["C2", "D2"])
    expect(result.suggested_config_json.opening_binding.cells[0].cell).toBe("C4")
    expect(result.suggested_config_json.closing_binding.cells[0].cell).toBe("C5")
    expect(result.llm_meta_json).toEqual(
      expect.objectContaining({
        skill_version: "cash-flow-template-reading.v1",
        schema_constrained: true,
      }),
    )
    const requestBody = JSON.parse(httpRequestSpy.mock.results[0].value.write.mock.calls[0][0])
    expect(requestBody.format).toEqual(expect.objectContaining({ type: "object" }))
    expect(requestBody.options).toEqual(expect.objectContaining({ num_predict: 600, num_ctx: 8192, temperature: 0 }))
    expect(requestBody.messages.find((message) => message.role === "user").content).toContain("Compact workbook summary:")
    expect(result.llm_meta_json.prompt_mode).toBe("compact")
    expect(result.llm_meta_json.ollama_options).toEqual(
      expect.objectContaining({ num_predict: 600, num_ctx: 8192, temperature: 0 }),
    )
  })

  test("runs semantic repair for complex direct templates and applies safe bucket direction fixes", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_direct_semantic_repair.xlsx")
    await writeDirectSemanticRepairWorkbook(templatePath)

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(
      createDeterministicBaseline({
        confidence: 0.64,
        required_anchors: [],
        issues: [],
      }),
    )

    let requestIndex = 0
    httpRequestSpy.mockImplementation((options, callback) => {
      requestIndex += 1
      const responsePayload =
        requestIndex === 1
          ? {
              model: "gpt-oss:20b",
              message: {
                content: JSON.stringify({
                  detected_layout_type: "columns",
                  statement_method: "direct",
                  confidence: 0.86,
                  sheet_name: "Cash Flow",
                  period_orientation: "column",
                  period_header_row: 2,
                  period_label_column: 2,
                  first_period_column: 3,
                  last_period_column: 4,
                  opening_row: 7,
                  closing_row: 8,
                  issues: [],
                  required_anchors: [],
                }),
              },
            }
          : {
              model: "gpt-oss:20b",
              message: {
                content: JSON.stringify({
                  bucketDecisions: [
                    {
                      bucketKey: "payroll_and_benefits",
                      semanticKey: "payroll",
                      direction: "outflow",
                      fallback: false,
                      llmScore: 0.9,
                      reasoning: "payroll is a cash outflow row",
                      evidence: ["Payroll and benefits"],
                      needsHumanReview: false,
                    },
                    {
                      bucketKey: "rent_and_facilities",
                      semanticKey: "rent_facilities",
                      direction: "outflow",
                      fallback: false,
                      llmScore: 0.9,
                      reasoning: "rent is a cash outflow row",
                      evidence: ["Rent and facilities"],
                      needsHumanReview: false,
                    },
                  ],
                  rowBindingDecisions: [],
                  issues: [],
                  requiredAnchors: [],
                  needsHumanReview: false,
                }),
              },
            }

      return mockOllamaJsonResponse(responsePayload)(options, callback)
    })

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_direct_semantic_repair.xlsx",
    })
    const buckets = new Map(result.suggested_config_json.bucket_bindings.map((bucket) => [bucket.bucket_key, bucket]))

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(buckets.get("payroll_and_benefits")?.direction).toBe("outflow")
    expect(buckets.get("rent_and_facilities")?.direction).toBe("outflow")
    expect(result.llm_meta_json.semantic_repair).toEqual(
      expect.objectContaining({
        attempted: true,
        applied_count: 4,
      }),
    )
    expect(buckets.get("payroll_and_benefits")?.semantic_key).toBe("payroll")
    expect(buckets.get("rent_and_facilities")?.semantic_key).toBe("rent_facilities")
    expect(httpRequestSpy).toHaveBeenCalledTimes(2)
    appConfig.ollama.maxAttempts = 2
  })

  test("keeps indirect llm layout decisions on the llm path and repairs missing row bindings", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_indirect_repair.xlsx")
    await writeIndirectRepairWorkbook(templatePath)

    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue({
      detected_layout_type: "columns",
      confidence: 0.58,
      issues: [
        "Missing required indirect row bindings: capital_contributions",
        "Missing required financing row bindings: capital_contributions",
      ],
      required_anchors: ["row_bindings"],
      needs_human_review: true,
      suggested_config_json: buildIndirectBaselineConfig({ includeCapitalContributions: false }),
    })

    let requestIndex = 0
    httpRequestSpy.mockImplementation((options, callback) => {
      requestIndex += 1
      const responsePayload =
        requestIndex === 1
          ? {
              model: "gpt-oss:20b",
              message: {
                content: JSON.stringify({
                  detected_layout_type: "columns",
                  statement_method: "indirect",
                  confidence: 0.88,
                  sheet_name: "Indirect Cash Flow",
                  period_orientation: "column",
                  period_header_row: 3,
                  period_label_column: 1,
                  first_period_column: 2,
                  last_period_column: 3,
                  opening_row: 15,
                  closing_row: 16,
                  issues: [],
                  required_anchors: [],
                }),
              },
            }
          : {
              model: "gpt-oss:20b",
              message: {
                content: JSON.stringify({
                  bucketDecisions: [],
                  rowBindingDecisions: [
                    {
                      semanticKey: "capital_contributions",
                      rowIndex: 12,
                      role: "input",
                      llmScore: 0.93,
                      reasoning: "paid-in capital is financing inflow",
                      evidence: ["Member funding / paid-in capital"],
                      needsHumanReview: false,
                    },
                  ],
                  issues: [],
                  requiredAnchors: [],
                  needsHumanReview: false,
                }),
              },
            }

      return mockOllamaJsonResponse(responsePayload)(options, callback)
    })

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_indirect_repair.xlsx",
    })

    const semanticKeys = result.suggested_config_json.row_bindings.map((binding) => binding.semantic_key)
    const capitalBinding = result.suggested_config_json.row_bindings.find(
      (binding) => binding.semantic_key === "capital_contributions",
    )

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.statement_method).toBe("indirect")
    expect(semanticKeys).toContain("capital_contributions")
    expect(capitalBinding.cells.map((cell) => cell.cell)).toEqual(["B12", "C12"])
    expect(result.required_anchors).toEqual([])
    expect(result.llm_meta_json.semantic_repair).toEqual(
      expect.objectContaining({
        attempted: true,
        applied_count: 1,
      }),
    )
    expect(httpRequestSpy).toHaveBeenCalledTimes(2)
    appConfig.ollama.maxAttempts = 2
  })

  test("uses low thinking mode for gpt-oss because it does not accept think=false", () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.think = false

    expect(Ingestion.__test.resolveOllamaThinkForModel("gpt-oss:20b")).toBe("low")
    expect(Ingestion.__test.resolveOllamaThinkForModel("qwen3:14b")).toBe(false)
  })

  test("falls back when a layout decision includes a total column in the period range", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_total_period.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 5,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_total_period.xlsx",
    })

    expect(result.analysis_source).toBe("fallback")
    expect(result.needs_human_review).toBe(true)
    expect(result.llm_meta_json.attempts[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        error_reason: expect.stringContaining("summary period column"),
      }),
    )
  })

  test("trims label columns when a layout decision starts before the first period", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_label_column_trim.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "gpt-oss:20b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 1,
            last_period_column: 4,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_label_column_trim.xlsx",
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.period_axis.period_bindings.map((item) => item.cell)).toEqual(["C2", "D2"])
    expect(result.suggested_config_json.opening_binding.cells.map((item) => item.cell)).toEqual(["C4", "D4"])
  })

  test("uses the nearest pre-period line-item column when the llm selects a section column", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_section_label_column.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "gpt-oss:20b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 1,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_section_label_column.xlsx",
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.opening_binding.cells.map((item) => item.cell)).toEqual(["C4", "D4"])
    expect(result.suggested_config_json.bucket_bindings[0].label).toBe("Cash receipts from customers")
  })

  test("does not allow llm decisions to shrink a high-confidence deterministic period range", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    appConfig.ollama.deterministicBypassConfidence = 1.01
    const templatePath = path.join(tempDir, "template_period_shrink_guard.xlsx")
    await writeColumnWorkbook(templatePath)

    const deterministicConfig = {
      ...createDeterministicBaseline().suggested_config_json,
      sheet_name: "Cash Flow",
      layout_type: "columns",
      period_axis: {
        orientation: "column",
        labels: [
          { period_key: "m01", label: "Jan", period_type: "monthly", month: 1 },
          { period_key: "m02", label: "Feb", period_type: "monthly", month: 2 },
        ],
        period_bindings: [
          { period_key: "m01", label: "Jan", cell: "C2" },
          { period_key: "m02", label: "Feb", cell: "D2" },
        ],
      },
      opening_binding: {
        cells: [
          { period_key: "m01", label: "Jan", cell: "C4" },
          { period_key: "m02", label: "Feb", cell: "D4" },
        ],
      },
      closing_binding: {
        cells: [
          { period_key: "m01", label: "Jan", cell: "C5" },
          { period_key: "m02", label: "Feb", cell: "D5" },
        ],
      },
    }
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(
      createDeterministicBaseline({
        detected_layout_type: "columns",
        confidence: 0.99,
        issues: [],
        required_anchors: [],
        suggested_config_json: deterministicConfig,
      }),
    )

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "gpt-oss:20b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 3,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_period_shrink_guard.xlsx",
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.period_axis.period_bindings.map((item) => item.cell)).toEqual(["C2", "D2"])
    expect(result.suggested_config_json.opening_binding.cells.map((item) => item.cell)).toEqual(["C4", "D4"])
  })

  test("does not let semantic-review confidence shrink a deterministic period range", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    appConfig.ollama.deterministicBypassConfidence = 1.01
    const templatePath = path.join(tempDir, "template_period_semantic_review_guard.xlsx")
    await writeColumnWorkbook(templatePath)

    const deterministicConfig = {
      ...createDeterministicBaseline().suggested_config_json,
      sheet_name: "Cash Flow",
      layout_type: "columns",
      period_axis: {
        orientation: "column",
        labels: [
          { period_key: "m01", label: "Jan", period_type: "monthly", month: 1 },
          { period_key: "m02", label: "Feb", period_type: "monthly", month: 2 },
        ],
        period_bindings: [
          { period_key: "m01", label: "Jan", cell: "C2" },
          { period_key: "m02", label: "Feb", cell: "D2" },
        ],
      },
      opening_binding: {
        cells: [
          { period_key: "m01", label: "Jan", cell: "C4" },
          { period_key: "m02", label: "Feb", cell: "D4" },
        ],
      },
      closing_binding: {
        cells: [
          { period_key: "m01", label: "Jan", cell: "C5" },
          { period_key: "m02", label: "Feb", cell: "D5" },
        ],
      },
    }
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(
      createDeterministicBaseline({
        detected_layout_type: "columns",
        confidence: 0.64,
        issues: ["Several direct bucket labels need semantic review."],
        required_anchors: ["bucket_targets"],
        suggested_config_json: deterministicConfig,
      }),
    )

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "gpt-oss:20b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 3,
            opening_row: 4,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_period_semantic_review_guard.xlsx",
    })

    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.suggested_config_json.period_axis.period_bindings.map((item) => item.cell)).toEqual(["C2", "D2"])
    expect(result.suggested_config_json.opening_binding.cells.map((item) => item.cell)).toEqual(["C4", "D4"])
  })

  test("falls back when an explicit opening row label is not opening cash", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_bad_opening_row.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())

    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.86,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 2,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: 3,
            closing_row: 5,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_bad_opening_row.xlsx",
    })

    expect(result.analysis_source).toBe("fallback")
    expect(result.needs_human_review).toBe(true)
    expect(result.llm_meta_json.attempts[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        error_reason: expect.stringContaining("opening_row 3 label"),
      }),
    )
  })

  test("falls back to deterministic config when schema-constrained layout JSON is malformed", async () => {
    const templatePath = path.join(tempDir, "template_bad_json.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())
    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: { content: "{ not json" },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_bad_json.xlsx",
    })

    expect(result.analysis_source).toBe("fallback")
    expect(result.needs_human_review).toBe(true)
    expect(result.llm_meta_json.attempts).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "failed", error_code: "bad_response_json" })]),
    )
  })

  test("falls back when a schema-shaped layout decision cannot build a valid config", async () => {
    const templatePath = path.join(tempDir, "template_bad_decision.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())
    httpRequestSpy.mockImplementation(
      mockOllamaJsonResponse({
        model: "qwen3:14b",
        message: {
          content: JSON.stringify({
            detected_layout_type: "columns",
            statement_method: "direct",
            confidence: 0.8,
            sheet_name: "Cash Flow",
            period_orientation: "column",
            period_header_row: 99,
            period_label_column: 2,
            first_period_column: 3,
            last_period_column: 4,
            opening_row: null,
            closing_row: null,
            issues: [],
            required_anchors: [],
          }),
        },
      }),
    )

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_bad_decision.xlsx",
    })

    expect(result.analysis_source).toBe("fallback")
    expect(result.llm_meta_json.attempts[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        schema_constrained: true,
      }),
    )
  })

  test("tries configured ollama model candidates after the baseline model fails", async () => {
    const appConfig = require("../src/config/app")
    appConfig.ollama.modelCandidates = ["gpt-oss:20b"]
    appConfig.ollama.maxAttempts = 1
    const templatePath = path.join(tempDir, "template_model_chain.xlsx")
    await writeColumnWorkbook(templatePath)
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue(createDeterministicBaseline())
    const requestedModels = []

    httpRequestSpy.mockImplementation((options, callback) => {
      const handlers = {}
      let body = ""
      const request = {
        setTimeout() {
          return request
        },
        on(event, handler) {
          handlers[event] = handler
          return request
        },
        write(chunk) {
          body += chunk
          return true
        },
        end() {
          const parsed = JSON.parse(body)
          requestedModels.push(parsed.model)
          const response = new EventEmitter()
          response.headers = {}
          if (typeof callback === "function") callback(response)
          if (parsed.model === "qwen3:14b") {
            response.statusCode = 404
            response.emit("data", Buffer.from(JSON.stringify({ error: "model missing" })))
            response.emit("end")
            return
          }
          response.statusCode = 200
          response.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                model: "gpt-oss:20b",
                message: {
                  content: JSON.stringify({
                    detected_layout_type: "columns",
                    statement_method: "direct",
                    confidence: 0.9,
                    sheet_name: "Cash Flow",
                    period_orientation: "column",
                    period_header_row: 2,
                    period_label_column: 2,
                    first_period_column: 3,
                    last_period_column: 4,
                    opening_row: 4,
                    closing_row: 5,
                    issues: [],
                    required_anchors: [],
                  }),
                },
              }),
            ),
          )
          response.emit("end")
        },
        destroy(error) {
          if (typeof handlers.error === "function") handlers.error(error)
        },
      }
      return request
    })

    const result = await Ingestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: "template_model_chain.xlsx",
    })

    expect(requestedModels).toEqual(["qwen3:14b", "gpt-oss:20b", "gpt-oss:20b"])
    expect(result.analysis_source).toBe("llm_layout_decision")
    expect(result.llm_meta_json.model).toBe("gpt-oss:20b")
    appConfig.ollama.modelCandidates = []
    appConfig.ollama.maxAttempts = 2
  })
})
