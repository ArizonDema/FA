const fs = require("fs")
const os = require("os")
const path = require("path")
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
    timeoutMs: 1000,
    maxAttempts: 2,
    keepAlive: "10m",
    temperature: 0.1,
    numPredict: 1200,
    deterministicBypassConfidence: 0.9,
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

describe("cashFlowTemplateIngestion.service", () => {
  let tempDir

  beforeEach(() => {
    jest.clearAllMocks()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-ingestion-test-"))
    global.fetch = jest.fn().mockRejectedValue(new Error("This operation was aborted"))
  })

  afterEach(() => {
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
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
