const fs = require("fs")
const os = require("os")
const path = require("path")
const request = require("supertest")
const express = require("express")
const ExcelJS = require("exceljs")
const errorHandler = require("../src/middlewares/errorHandler")

const TEST_UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-api-uploads-"))
process.env.UPLOAD_ROOT_DIR = TEST_UPLOAD_ROOT

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-user-1", role: "admin" }
    next()
  },
  authorize:
    () =>
    (req, res, next) => {
      next()
    },
}))

const mockTemplateModel = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}

const mockTemplateVersionModel = {
  max: jest.fn(),
  create: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
}

const mockTemplateRowModel = {
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
  findAll: jest.fn(),
}

const mockReportRunModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
}

const mockTemplateAnalysisModel = {
  findByPk: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
}

const mockAccountMappingModel = {
  findAll: jest.fn(),
  findOrCreate: jest.fn(),
  findOne: jest.fn(),
}

const mockModels = {
  sequelize: {
    transaction: jest.fn(async (callback) => callback({})),
  },
  Portfolio: {
    findByPk: jest.fn(),
  },
  Fund: {
    findByPk: jest.fn(),
  },
  CashFlowTemplate: mockTemplateModel,
  Template: mockTemplateModel,
  TemplateVersion: mockTemplateVersionModel,
  TemplateRow: mockTemplateRowModel,
  CashFlowTemplateAnalysis: mockTemplateAnalysisModel,
  CashFlowAccountMapping: mockAccountMappingModel,
  ReportRun: mockReportRunModel,
  AuditLog: {
    create: jest.fn(),
  },
  AuditEvent: {
    create: jest.fn(),
  },
}

jest.mock("../src/models", () => mockModels)

class MockCashFlowValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = "CashFlowValidationError"
    this.details = details
  }
}

const mockCashFlowService = {
  CashFlowValidationError: MockCashFlowValidationError,
  validateTemplateConfig: jest.fn((config) => config),
  ensureV3TemplateConfig: jest.fn(async ({ templateConfig }) => templateConfig),
  resolveRunDateRange: jest.fn(({ dateStart, dateEnd, fiscalYear }) => {
    if (dateStart && dateEnd) {
      return { start: new Date(dateStart), end: new Date(dateEnd) }
    }
    const year = Number.isInteger(fiscalYear) ? fiscalYear : 2025
    return {
      start: new Date(`${year}-01-01T00:00:00.000Z`),
      end: new Date(`${year}-12-31T00:00:00.000Z`),
    }
  }),
  analyzeTemplateWorkbook: jest.fn(),
  generateCashFlowReport: jest.fn(),
}

jest.mock("../src/services/cashFlow.service", () => mockCashFlowService)

const TEST_PIPELINE_VERSION = "test-pipeline-v1"
const mockTemplateParsingService = {
  persistVersionStructure: jest.fn(),
  parseTemplateVersion: jest.fn(),
  getParsedStructure: jest.fn(),
  getTemplateRows: jest.fn(),
}

const mockMappingSuggestionService = {
  suggestTemplateVersionMappings: jest.fn(),
  getTemplateVersionSuggestions: jest.fn(),
}

const mockLlmMappingAssistantService = {
  assistTemplateVersionMappings: jest.fn(),
  getTemplateVersionAssistedSuggestions: jest.fn(),
}

const mockReviewTaskService = {
  generateTemplateVersionReviewTasks: jest.fn(),
}

const mockReportGenerationService = {
  generateReport: jest.fn(),
  getReportRun: jest.fn(),
  getReportRunRows: jest.fn(),
}

const mockValidationEngineService = {
  validateReportRun: jest.fn(),
}

const mockValidationResultService = {
  getLatestForRun: jest.fn(),
  getReadiness: jest.fn(),
}

const mockTemplateIngestionService = {
  computeTemplateHash: jest.fn(),
  ingestTemplateSchema: jest.fn(),
  PIPELINE_VERSION: TEST_PIPELINE_VERSION,
}

jest.mock("../src/services/cashFlowTemplateIngestion.service", () => mockTemplateIngestionService)

jest.mock("../src/modules/templates/services/templateParsing.service", () => mockTemplateParsingService)
jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => mockMappingSuggestionService)
jest.mock("../src/modules/mappings/services/llmMappingAssistant.service", () => mockLlmMappingAssistantService)
jest.mock("../src/modules/reviews/services/reviewTask.service", () => mockReviewTaskService)
jest.mock("../src/modules/reports/services/reportGeneration.service", () => ({
  ReportGenerationService: mockReportGenerationService,
}))
jest.mock("../src/modules/reports/services/validationEngine.service", () => ({
  ValidationEngineService: mockValidationEngineService,
}))
jest.mock("../src/modules/reports/services/validationResult.service", () => mockValidationResultService)

const cashFlowRoutes = require("../src/routes/cash-flow.routes")

function createTemplateRecord(overrides = {}) {
  const activeVersion = createTemplateVersionRecord()
  return {
    id: "template-1",
    portfolio_id: "fund-1",
    name: "Template A",
    version: "v1",
    template_kind: "cash_flow",
    status: "active",
    template_file_name: "template.xlsx",
    template_file_path: "C:\\temp\\template.xlsx",
    config_json: { sheet_name: "Cash Flow", buckets: [] },
    is_active: true,
    active_version_id: activeVersion.id,
    activeVersion,
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        portfolio_id: this.portfolio_id,
        name: this.name,
        version: this.version,
        template_file_name: this.template_file_name,
        template_file_path: this.template_file_path,
        config_json: this.config_json,
        is_active: this.is_active,
        active_version_id: this.active_version_id,
      }
    },
    ...overrides,
  }
}

function createTemplateVersionRecord(overrides = {}) {
  return {
    id: "template-version-1",
    template_id: "template-1",
    portfolio_id: "fund-1",
    version_number: 1,
    version_label: "v1",
    source_file_name: "template.xlsx",
    source_file_path: "C:\\temp\\template.xlsx",
    source_file_sha256: "sha256-template",
    config_json: { sheet_name: "Cash Flow", buckets: [] },
    raw_structure_json: { worksheet_count: 1 },
    llm_meta_json: { provider: "ollama" },
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        template_id: this.template_id,
        portfolio_id: this.portfolio_id,
        version_number: this.version_number,
        version_label: this.version_label,
      }
    },
    ...overrides,
  }
}

function createRunRecord(overrides = {}) {
  return {
    id: "run-1",
    type: "cash_flow",
    created_at: new Date().toISOString(),
    inputs_json: {},
    output_paths: {},
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        type: this.type,
        created_at: this.created_at,
        inputs_json: this.inputs_json,
        output_paths: this.output_paths,
      }
    },
    ...overrides,
  }
}

async function writeTinyWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Sheet1")
  sheet.addRow(["A", "B"])
  sheet.addRow([1, 2])
  await workbook.xlsx.writeFile(filePath)
}

describe("cash-flow API", () => {
  const app = express()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-api-test-"))
  const testCashFlowUploadDir = path.join(TEST_UPLOAD_ROOT, "cash-flow")

  app.use(express.json())
  app.use("/api/v1/cash-flow", cashFlowRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockModels.Portfolio.findByPk.mockResolvedValue({ id: "fund-1", name: "Fund One" })
    mockModels.Fund.findByPk.mockResolvedValue({ id: "fund-1", name: "Fund One" })
    mockTemplateModel.findOne.mockResolvedValue(createTemplateRecord())
    mockTemplateModel.findByPk.mockResolvedValue(createTemplateRecord())
    mockTemplateModel.findAll.mockResolvedValue([createTemplateRecord()])
    mockTemplateModel.update.mockResolvedValue([1])
    mockTemplateModel.create.mockResolvedValue(createTemplateRecord())
    mockTemplateVersionModel.max.mockResolvedValue(0)
    mockTemplateVersionModel.create.mockResolvedValue(createTemplateVersionRecord())
    mockTemplateVersionModel.findByPk.mockResolvedValue(createTemplateVersionRecord())
    mockTemplateVersionModel.findOne.mockResolvedValue(createTemplateVersionRecord())
    mockTemplateVersionModel.update.mockResolvedValue([1])
    mockTemplateRowModel.destroy.mockResolvedValue(0)
    mockTemplateRowModel.bulkCreate.mockResolvedValue([])
    mockTemplateRowModel.findAll.mockResolvedValue([])
    mockTemplateAnalysisModel.findByPk.mockResolvedValue(null)
    mockTemplateAnalysisModel.findAll.mockResolvedValue([])
    mockTemplateAnalysisModel.create.mockResolvedValue({
      id: "analysis-1",
      portfolio_id: "fund-1",
      toJSON() {
        return { id: "analysis-1" }
      },
      update: jest.fn(async function update(values) {
        Object.assign(this, values)
        return this
      }),
    })
    mockTemplateAnalysisModel.update.mockResolvedValue([1])
    mockAccountMappingModel.findAll.mockResolvedValue([])
    mockAccountMappingModel.findOrCreate.mockResolvedValue([
      {
        usage_count: 0,
        source: "auto_semantic",
        update: jest.fn(async function update(values) {
          Object.assign(this, values)
          return this
        }),
      },
      true,
    ])
    mockAccountMappingModel.findOne.mockResolvedValue(null)
    mockReportRunModel.findAll.mockResolvedValue([createRunRecord()])
    mockReportRunModel.findByPk.mockResolvedValue(createRunRecord())
    mockReportRunModel.create.mockResolvedValue(createRunRecord())
    mockModels.AuditLog.create.mockResolvedValue({ id: "audit-1" })
    mockModels.AuditEvent.create.mockResolvedValue({ id: "audit-1" })
    mockTemplateParsingService.persistVersionStructure.mockResolvedValue({
      normalizedStructure: { templateVersionId: "template-version-1", sheets: [] },
      parseMetadata: { parser_version: "test-parser" },
      persistedRowCount: 0,
    })
    mockTemplateParsingService.parseTemplateVersion.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      normalizedStructure: {
        templateVersionId: "template-version-1",
        sheets: [{ name: "Cash Flow", rows: [] }],
      },
      parseMetadata: { parser_version: "test-parser" },
      persistedRowCount: 0,
    })
    mockTemplateParsingService.getParsedStructure.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord({
        parsed_structure_json: {
          templateVersionId: "template-version-1",
          sheets: [{ name: "Cash Flow", rows: [] }],
        },
        parse_metadata_json: { parser_version: "test-parser" },
      }),
      structure: {
        templateVersionId: "template-version-1",
        sheets: [{ name: "Cash Flow", rows: [] }],
      },
      parseMetadata: { parser_version: "test-parser" },
    })
    mockTemplateParsingService.getTemplateRows.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      rows: [
        {
          id: "row-1",
          rowLabel: "Subscriptions",
          rowType: "data_row",
        },
      ],
    })
    mockMappingSuggestionService.suggestTemplateVersionMappings.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      summary: {
        rowsProcessed: 3,
        rowsSkipped: 1,
        suggestionsGenerated: 6,
        averageCandidateCount: 8.33,
        durationMs: 12,
      },
      suggestions: [
        {
          templateRow: {
            id: "row-1",
            label: "Subscriptions",
            rowType: "data_row",
          },
          suggestions: [
            {
              semanticConceptKey: "subscriptions",
              confidenceScore: 0.92,
              rank: 1,
            },
          ],
        },
      ],
    })
    mockMappingSuggestionService.getTemplateVersionSuggestions.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      suggestions: [
        {
          templateRow: {
            id: "row-1",
            label: "Subscriptions",
            rowType: "data_row",
          },
          suggestions: [
            {
              semanticConceptKey: "subscriptions",
              confidenceScore: 0.92,
              rank: 1,
            },
          ],
        },
      ],
    })
    mockLlmMappingAssistantService.assistTemplateVersionMappings.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      summary: {
        rowsProcessed: 2,
        rowsSkipped: 1,
        rowsSucceeded: 2,
        rowsFailed: 0,
        disagreementRate: 0.5,
        llmEnabled: true,
        fallbackUsed: false,
      },
      deterministicSummary: {
        rowsProcessed: 3,
      },
      suggestions: [
        {
          templateRow: {
            id: "row-1",
            label: "Subscriptions",
            rowType: "data_row",
          },
          assessment: {
            needsHumanReview: true,
            disagreementFlag: true,
          },
          suggestions: [
            {
              semanticConceptKey: "subscriptions",
              confidenceScore: 0.84,
              llmScore: 0.9,
              rank: 1,
            },
          ],
        },
      ],
    })
    mockLlmMappingAssistantService.getTemplateVersionAssistedSuggestions.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      suggestions: [
        {
          templateRow: {
            id: "row-1",
            label: "Subscriptions",
            rowType: "data_row",
          },
          assessment: {
            needsHumanReview: false,
            disagreementFlag: false,
          },
          suggestions: [
            {
              semanticConceptKey: "subscriptions",
              confidenceScore: 0.84,
              llmScore: 0.9,
              rank: 1,
            },
          ],
        },
      ],
    })
    mockReviewTaskService.generateTemplateVersionReviewTasks.mockResolvedValue({
      template: createTemplateRecord(),
      version: createTemplateVersionRecord(),
      summary: {
        rowsConsidered: 3,
        tasksCreated: 2,
        rowsSkippedApproved: 1,
      },
      reviewTasks: [
        {
          id: "task-1",
          status: "open",
          reviewReason: "llm_disagreement",
          target: {
            id: "row-1",
            label: "Subscriptions",
          },
        },
      ],
    })
    mockReportGenerationService.generateReport.mockResolvedValue({
      reportRun: {
        id: "generated-run-1",
        templateVersionId: "template-version-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        status: "completed_with_unresolved_rows",
        readinessStatus: "not_ready",
      },
      templateVersion: {
        id: "template-version-1",
        templateId: "template-1",
        fundId: "fund-1",
        versionLabel: "v1",
      },
      rows: [
        {
          templateRowId: "row-1",
          rowLabel: "Management Fees",
          rowType: "data_row",
          sectionName: "Operating Activities",
          semanticConceptKey: "management_fees",
          value: 12345.67,
          currency: "USD",
          resolutionStatus: "resolved",
          valueSource: "approved_mapping",
          metadata: {
            reviewRequired: false,
          },
        },
        {
          templateRowId: "row-2",
          rowLabel: "Other Expenses",
          rowType: "data_row",
          sectionName: "Operating Activities",
          semanticConceptKey: null,
          value: null,
          currency: null,
          resolutionStatus: "unresolved_no_approved_mapping",
          valueSource: "none",
          metadata: {
            reviewRequired: true,
          },
        },
      ],
      summary: {
        totalRows: 2,
        resolvedRows: 1,
        unresolvedRows: 1,
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
      },
      validationChecks: [
        {
          checkType: "missing_approved_mappings",
          severity: "error",
          status: "fail",
        },
      ],
      validationError: null,
    })
    mockReportGenerationService.getReportRun.mockResolvedValue({
      reportRun: {
        id: "generated-run-1",
        templateVersionId: "template-version-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        status: "completed_with_unresolved_rows",
        readinessStatus: "not_ready",
        summary: {
          totalRows: 2,
          resolvedRows: 1,
          unresolvedRows: 1,
        },
      },
      templateVersion: {
        id: "template-version-1",
        versionLabel: "v1",
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
      },
    })
    mockReportGenerationService.getReportRunRows.mockResolvedValue({
      reportRun: {
        id: "generated-run-1",
        templateVersionId: "template-version-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        status: "completed_with_unresolved_rows",
        readinessStatus: "not_ready",
      },
      rows: [
        {
          templateRowId: "row-1",
          rowLabel: "Management Fees",
          rowOrder: 1,
          resolutionStatus: "resolved",
          value: 12345.67,
        },
        {
          templateRowId: "row-2",
          rowLabel: "Other Expenses",
          rowOrder: 2,
          resolutionStatus: "unresolved_no_approved_mapping",
          value: null,
        },
      ],
      summary: {
        totalRows: 2,
        resolvedRows: 1,
        unresolvedRows: 1,
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
      },
    })
    mockValidationEngineService.validateReportRun.mockResolvedValue({
      reportRun: {
        id: "generated-run-1",
        status: "completed_with_unresolved_rows",
        readinessStatus: "not_ready",
        lastValidatedAt: "2026-04-18T10:00:00.000Z",
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
        summary: {
          passedChecks: 4,
          warningChecks: 1,
          failedChecks: 2,
        },
      },
      checks: [
        {
          checkType: "missing_approved_mappings",
          severity: "error",
          status: "fail",
          message: "1 mapping-eligible row(s) have no approved mapping.",
        },
      ],
    })
    mockValidationResultService.getLatestForRun.mockResolvedValue({
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
        summary: {
          passedChecks: 4,
          warningChecks: 1,
          failedChecks: 2,
        },
      },
      checks: [
        {
          checkType: "missing_approved_mappings",
          severity: "error",
          status: "fail",
          message: "1 mapping-eligible row(s) have no approved mapping.",
        },
      ],
    })
    mockValidationResultService.getReadiness.mockResolvedValue({
      reportRun: {
        id: "generated-run-1",
        status: "completed_with_unresolved_rows",
        readinessStatus: "not_ready",
        lastValidatedAt: "2026-04-18T10:00:00.000Z",
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
      },
    })
    mockCashFlowService.generateCashFlowReport.mockResolvedValue({
      outputFilePath: path.join(tempDir, "output.xlsx"),
      warnings: [],
      preview: {
        monthly: [],
        totals: {
          closing_balance_december: 100,
        },
        mapping_summary: {
          total_cash_movements: 2,
          mapped_cash_movements: 2,
        },
      },
      mapping: {
        auto_mappings_created: [],
        low_confidence_mappings: [],
        final_bucket_assignments: [
          {
            normalized_account: "management_fee_expense",
            bucket_key: "ops_outflow",
            confidence: 0.92,
            source: "template_rule",
            grounding_status: "template_rule",
            abs_amount: 100,
          },
          {
            normalized_account: "custody_fee_expense",
            bucket_key: "ops_outflow",
            confidence: 0.88,
            source: "manual_rule",
            grounding_status: "approved",
            abs_amount: 50,
          },
        ],
      },
    })
    mockTemplateIngestionService.computeTemplateHash.mockReturnValue("sha256-template")
    mockTemplateIngestionService.ingestTemplateSchema.mockResolvedValue({
      source_file_sha256: "sha256-template",
      detected_layout_type: "rows",
      confidence: 0.82,
      issues: ["Looks good"],
      required_anchors: [],
      needs_human_review: false,
      analysis_source: "llm",
      llm_failure_reason: null,
      llm_meta_json: { provider: "ollama", model: "qwen3:14b" },
      raw_structure_json: { worksheet_count: 1 },
      suggested_config_json: {
        version: "v3",
        sheet_name: "Cash Flow",
        layout_type: "rows",
        period_granularity: "monthly",
        period_axis: {
          orientation: "row",
          labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
          period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
        },
        opening_binding: null,
        closing_binding: null,
        period_resolution_rules: { custom_periods: [] },
        bucket_bindings: [],
      },
    })
  })

  afterEach(() => {
    fs.rmSync(path.join(testCashFlowUploadDir, "runs"), { recursive: true, force: true })
    fs.rmSync(path.join(testCashFlowUploadDir, "templates"), { recursive: true, force: true })
    fs.rmSync(path.join(testCashFlowUploadDir, "tmp"), { recursive: true, force: true })
    fs.mkdirSync(path.join(testCashFlowUploadDir, "tmp"), { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    fs.rmSync(TEST_UPLOAD_ROOT, { recursive: true, force: true })
    delete process.env.UPLOAD_ROOT_DIR
  })

  test("lists templates by fund", async () => {
    const response = await request(app).get("/api/v1/cash-flow/templates?portfolio_id=fund-1")
    expect(response.status).toBe(200)
    expect(response.body.data.templates).toHaveLength(1)
    expect(mockTemplateModel.findAll).toHaveBeenCalled()
  })

  test("creates and activates template", async () => {
    const templateFile = path.join(tempDir, "template_upload.xlsx")
    await writeTinyWorkbook(templateFile)

    const createResponse = await request(app)
      .post("/api/v1/cash-flow/templates")
      .field("portfolio_id", "fund-1")
      .field("name", "Q1 Template")
      .field("version", "v2")
      .field("is_active", "true")
      .field(
        "config_json",
        JSON.stringify({
          sheet_name: "Cash Flow",
          header_row: 1,
          month_column_header: "Month",
          opening_column_header: "Opening Balance",
          closing_column_header: "Closing Balance",
          buckets: [
            {
              bucket_key: "sales_inflow",
              label: "Sales",
              direction: "inflow",
              column_header: "Sales Inflow",
              fallback: true,
              rules: [],
            },
          ],
        }),
      )
      .attach("template_file", templateFile)

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data.template.id).toBeDefined()

    const activateResponse = await request(app).put("/api/v1/cash-flow/templates/template-1/activate")
    expect(activateResponse.status).toBe(200)
    expect(mockTemplateModel.update).toHaveBeenCalled()
  })

  test("analyzes uploaded template and returns suggested bindings", async () => {
    const templateFile = path.join(tempDir, "template_analyze.xlsx")
    await writeTinyWorkbook(templateFile)

    const response = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(response.status).toBe(200)
    expect(response.body.data.analysis.id).toBeDefined()
    expect(response.body.data.detected_layout).toBe("rows")
    expect(response.body.data.needs_human_review).toBe(false)
    expect(response.body.data.llm_fallback_reason).toBeNull()
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalled()
  })

  test("reanalyzes identical template hash instead of reusing cached schema", async () => {
    const templateFile = path.join(tempDir, "template_cached.xlsx")
    await writeTinyWorkbook(templateFile)

    mockTemplateAnalysisModel.findAll.mockResolvedValue([
      {
        id: "analysis-cached",
        portfolio_id: "fund-1",
        source_file_sha256: "sha256-template",
        detected_layout_type: "rows",
        confidence: 0.91,
        suggested_config_json: {
          version: "v3",
          sheet_name: "Cash Flow",
          layout_type: "rows",
          period_granularity: "monthly",
          period_axis: {
            orientation: "row",
            labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
            period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
          },
          opening_binding: null,
          closing_binding: null,
          period_resolution_rules: { custom_periods: [] },
          bucket_bindings: [],
        },
        issues_json: { issues: ["from-cache"], required_anchors: [] },
        llm_meta_json: { pipeline_version: TEST_PIPELINE_VERSION },
        needs_human_review: false,
      },
    ])

    const response = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(response.status).toBe(200)
    expect(response.body.data.schema_cache_hit).toBe(false)
    expect(response.body.data.analysis_source).toBe("llm")
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalledTimes(1)
  })

  test("returns review flag when llm output is malformed after retries", async () => {
    const templateFile = path.join(tempDir, "template_review.xlsx")
    await writeTinyWorkbook(templateFile)

    mockTemplateIngestionService.ingestTemplateSchema.mockResolvedValueOnce({
      source_file_sha256: "sha256-template",
      detected_layout_type: "freeform",
      confidence: 0.2,
      issues: ["LLM output malformed"],
      required_anchors: ["period_axis", "bucket_targets"],
      needs_human_review: true,
      analysis_source: "fallback",
      llm_failure_reason: "Ollama timed out after 2 attempt(s) at 90000ms timeout. Human review is required.",
      llm_meta_json: { attempts: [{ attempt: 1, status: "failed" }, { attempt: 2, status: "failed" }] },
      raw_structure_json: { worksheet_count: 1 },
      suggested_config_json: {
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
    })

    const response = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(response.status).toBe(200)
    expect(response.body.data.needs_human_review).toBe(true)
    expect(response.body.data.analysis_source).toBe("fallback")
    expect(String(response.body.data.llm_fallback_reason || "")).toContain("timed out")
  })

  test("reanalyzes flagged template on repeated uploads instead of reusing cached analysis", async () => {
    const templateFile = path.join(tempDir, "template_review_cached.xlsx")
    await writeTinyWorkbook(templateFile)

    mockTemplateIngestionService.ingestTemplateSchema.mockResolvedValue({
      source_file_sha256: "sha256-template",
      detected_layout_type: "freeform",
      confidence: 0.2,
      issues: ["LLM malformed"],
      required_anchors: ["period_axis"],
      needs_human_review: true,
      analysis_source: "fallback",
      llm_meta_json: { attempts: [{ attempt: 1, status: "failed" }, { attempt: 2, status: "failed" }] },
      raw_structure_json: { worksheet_count: 1 },
      suggested_config_json: {
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
    })

    const first = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(first.status).toBe(200)
    expect(first.body.data.schema_cache_hit).toBe(false)
    expect(first.body.data.needs_human_review).toBe(true)

    const second = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(second.status).toBe(200)
    expect(second.body.data.schema_cache_hit).toBe(false)
    expect(second.body.data.analysis_source).toBe("fallback")
    expect(second.body.data.needs_human_review).toBe(true)
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalledTimes(2)
  })

  test("ignores stored cache candidates and always performs fresh ingestion", async () => {
    const templateFile = path.join(tempDir, "template_stale_cache.xlsx")
    await writeTinyWorkbook(templateFile)

    mockTemplateAnalysisModel.findAll.mockResolvedValueOnce([
      {
        id: "analysis-stale-cache",
        portfolio_id: "fund-1",
        source_file_sha256: "sha256-template",
        detected_layout_type: "rows",
        confidence: 0.8,
        suggested_config_json: {
          version: "v3",
          sheet_name: "Cash Flow",
          layout_type: "rows",
          period_granularity: "monthly",
          period_axis: {
            orientation: "row",
            labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
            period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
          },
          opening_binding: null,
          closing_binding: null,
          period_resolution_rules: { custom_periods: [] },
          bucket_bindings: [],
        },
        issues_json: { issues: [], required_anchors: [] },
        llm_meta_json: { pipeline_version: "stale-version" },
      },
    ])

    const response = await request(app)
      .post("/api/v1/cash-flow/templates/analyze")
      .field("portfolio_id", "fund-1")
      .attach("template_file", templateFile)

    expect(response.status).toBe(200)
    expect(response.body.data.schema_cache_hit).toBe(false)
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalled()
  })

  test("reanalyzes existing template", async () => {
    const existingTemplatePath = path.join(tempDir, "template_existing.xlsx")
    await writeTinyWorkbook(existingTemplatePath)

    mockTemplateModel.findByPk.mockResolvedValue(
      createTemplateRecord({
        id: "template-existing",
        template_file_path: existingTemplatePath,
      }),
    )

    const response = await request(app).post("/api/v1/cash-flow/templates/template-existing/reanalyze")

    expect(response.status).toBe(200)
    expect(response.body.data.analysis.id).toBeDefined()
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalled()
  })

  test("reanalyzes template using active version source path when primary file path is missing", async () => {
    const activeVersionPath = path.join(tempDir, "template_existing_active_version.xlsx")
    await writeTinyWorkbook(activeVersionPath)

    mockTemplateModel.findByPk.mockResolvedValue(
      createTemplateRecord({
        id: "template-existing-fallback",
        template_file_path: path.join(tempDir, "missing_template.xlsx"),
        activeVersion: createTemplateVersionRecord({
          source_file_path: activeVersionPath,
          source_file_name: "template_existing_active_version.xlsx",
        }),
      }),
    )

    const response = await request(app).post("/api/v1/cash-flow/templates/template-existing-fallback/reanalyze")

    expect(response.status).toBe(200)
    expect(response.body.data.analysis.id).toBeDefined()
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalled()
  })

  test("returns a clear message when template source file is missing for reanalysis", async () => {
    mockTemplateModel.findByPk.mockResolvedValue(
      createTemplateRecord({
        id: "template-missing-source",
        template_file_path: path.join(tempDir, "missing_template.xlsx"),
        activeVersion: createTemplateVersionRecord({
          source_file_path: path.join(tempDir, "missing_active_source.xlsx"),
        }),
      }),
    )

    const response = await request(app).post("/api/v1/cash-flow/templates/template-missing-source/reanalyze")

    expect(response.status).toBe(400)
    expect(String(response.body.message || "").toLowerCase()).toContain("re-upload")
  })

  test("recovers missing template source from template-analyses archive before reanalysis", async () => {
    const recoveryDir = path.join(TEST_UPLOAD_ROOT, "cash-flow", "template-analyses")
    const recoveryFile = path.join(recoveryDir, `${Date.now()}_PLC_Cash_Flow_Template_v2.xlsx`)
    fs.mkdirSync(recoveryDir, { recursive: true })
    await writeTinyWorkbook(recoveryFile)

    mockTemplateModel.findByPk.mockResolvedValue(
      createTemplateRecord({
        id: "template-archive-recover",
        template_file_name: "PLC_Cash_Flow_Template_v2.xlsx",
        template_file_path: path.join(tempDir, "missing_template.xlsx"),
        activeVersion: createTemplateVersionRecord({
          source_file_name: "PLC_Cash_Flow_Template_v2.xlsx",
          source_file_path: path.join(tempDir, "missing_active_source.xlsx"),
        }),
      }),
    )

    const response = await request(app).post("/api/v1/cash-flow/templates/template-archive-recover/reanalyze")

    const expectedRestoredPath = path.join(
      TEST_UPLOAD_ROOT,
      "cash-flow",
      "templates",
      "template-archive-recover_PLC_Cash_Flow_Template_v2.xlsx",
    )
    expect(response.status).toBe(200)
    expect(fs.existsSync(expectedRestoredPath)).toBe(true)
    expect(mockTemplateIngestionService.ingestTemplateSchema).toHaveBeenCalled()
  })

  test("blocks template creation when ingestion result requires human review", async () => {
    const templateFile = path.join(tempDir, "template_create_review.xlsx")
    await writeTinyWorkbook(templateFile)

    mockTemplateIngestionService.ingestTemplateSchema.mockResolvedValueOnce({
      source_file_sha256: "sha256-template",
      detected_layout_type: "freeform",
      confidence: 0.1,
      issues: ["Invalid json from llm"],
      required_anchors: ["period_axis"],
      needs_human_review: true,
      analysis_source: "fallback",
      llm_meta_json: {},
      raw_structure_json: { worksheet_count: 1 },
      suggested_config_json: {
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
    })

    const response = await request(app)
      .post("/api/v1/cash-flow/templates")
      .field("portfolio_id", "fund-1")
      .field("name", "Review Required Template")
      .attach("template_file", templateFile)

    expect(response.status).toBe(400)
    expect(String(response.body.message || "").toLowerCase()).toContain("needs human review")
  })

  test("blocks template creation when flagged analysis is submitted without meaningful config changes", async () => {
    const templateFile = path.join(tempDir, "template_flagged_analysis.xlsx")
    await writeTinyWorkbook(templateFile)

    const flaggedSuggestedConfig = {
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
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    }

    mockTemplateAnalysisModel.findByPk.mockResolvedValueOnce({
      id: "analysis-flagged",
      portfolio_id: "fund-1",
      expires_at: null,
      needs_human_review: true,
      suggested_config_json: flaggedSuggestedConfig,
      issues_json: {
        issues: ["LLM output malformed"],
        required_anchors: ["period_axis", "bucket_targets"],
      },
    })

    const response = await request(app)
      .post("/api/v1/cash-flow/templates")
      .field("portfolio_id", "fund-1")
      .field("name", "Flagged Analysis Template")
      .field("analysis_id", "analysis-flagged")
      .field("config_json", JSON.stringify(flaggedSuggestedConfig))
      .attach("template_file", templateFile)

    expect(response.status).toBe(400)
    expect(String(response.body.message || "").toLowerCase()).toContain("resolve required anchors")
  })

  test("runs cash flow report from TB + GL uploads", async () => {
    const tbFile = path.join(tempDir, "tb_upload.xlsx")
    const glFile = path.join(tempDir, "gl_upload.xlsx")
    const outputFile = path.join(tempDir, "report_output.xlsx")
    await writeTinyWorkbook(tbFile)
    await writeTinyWorkbook(glFile)
    await writeTinyWorkbook(outputFile)

    mockCashFlowService.generateCashFlowReport.mockResolvedValue({
      outputFilePath: outputFile,
      warnings: ["Sample warning"],
      preview: {
        monthly: [{ month: "Jan", opening_balance: 0, net_cash_flow: 50, closing_balance: 50, buckets: {} }],
        totals: { closing_balance_december: 50 },
        mapping_summary: {
          total_cash_movements: 2,
          mapped_cash_movements: 2,
        },
      },
      mapping: {
        auto_mappings_created: [],
        low_confidence_mappings: [],
        final_bucket_assignments: [
          {
            normalized_account: "subscriptions",
            bucket_key: "financing_inflow",
            confidence: 0.95,
            source: "template_rule",
            grounding_status: "template_rule",
            abs_amount: 100,
          },
          {
            normalized_account: "management_fees",
            bucket_key: "ops_outflow",
            confidence: 0.9,
            source: "manual_rule",
            grounding_status: "approved",
            abs_amount: 50,
          },
        ],
      },
    })

    const response = await request(app)
      .post("/api/v1/cash-flow/reports/run")
      .field("portfolio_id", "fund-1")
      .field("date_start", "2025-01-01")
      .field("date_end", "2025-12-31")
      .attach("tb_file", tbFile)
      .attach("gl_file", glFile)

    expect(response.status).toBe(200)
    expect(response.body.data.outputs.xlsx).toBe(true)
    expect(response.body.data.preview.monthly).toHaveLength(1)
    expect(response.body.data.report_reliability.reportReliabilityStatus).toBe("grounded")
    expect(response.body.data.report_reliability.humanReviewRequired).toBe(false)
    expect(mockCashFlowService.generateCashFlowReport).toHaveBeenCalled()
  })

  test("generates a deterministic approved-mapping report", async () => {
    const response = await request(app).post("/api/v1/cash-flow/reports/generate").send({
      portfolio_id: "fund-1",
      template_version_id: "template-version-1",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
    })

    expect(response.status).toBe(200)
    expect(response.body.data.reportRun.id).toBe("generated-run-1")
    expect(response.body.data.reportRun.readinessStatus).toBe("not_ready")
    expect(response.body.data.rows[0].resolutionStatus).toBe("resolved")
    expect(response.body.data.rows[1].resolutionStatus).toBe("unresolved_no_approved_mapping")
    expect(response.body.data.validationResult.overallStatus).toBe("fail")
    expect(mockReportGenerationService.generateReport).toHaveBeenCalledWith({
      templateVersionId: "template-version-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      actorId: "admin-user-1",
    })
  })

  test("retrieves a persisted generated report and its rows", async () => {
    const runResponse = await request(app).get("/api/v1/cash-flow/reports/generated-run-1")
    expect(runResponse.status).toBe(200)
    expect(runResponse.body.data.reportRun.status).toBe("completed_with_unresolved_rows")
    expect(runResponse.body.data.validationResult.readinessStatus).toBe("not_ready")

    const rowsResponse = await request(app).get("/api/v1/cash-flow/reports/generated-run-1/rows")
    expect(rowsResponse.status).toBe(200)
    expect(rowsResponse.body.data.rows).toHaveLength(2)
    expect(rowsResponse.body.data.rows[0].rowOrder).toBe(1)
    expect(mockReportGenerationService.getReportRun).toHaveBeenCalledWith({ runId: "generated-run-1" })
    expect(mockReportGenerationService.getReportRunRows).toHaveBeenCalledWith({ runId: "generated-run-1" })
  })

  test("validates a generated report and exposes readiness", async () => {
    const validateResponse = await request(app).post("/api/v1/cash-flow/reports/generated-run-1/validate")
    expect(validateResponse.status).toBe(200)
    expect(validateResponse.body.data.validationResult.overallStatus).toBe("fail")
    expect(validateResponse.body.data.reportRun.readinessStatus).toBe("not_ready")

    const validationResponse = await request(app).get("/api/v1/cash-flow/reports/generated-run-1/validation")
    expect(validationResponse.status).toBe(200)
    expect(validationResponse.body.data.checks[0].checkType).toBe("missing_approved_mappings")

    const readinessResponse = await request(app).get("/api/v1/cash-flow/reports/generated-run-1/readiness")
    expect(readinessResponse.status).toBe(200)
    expect(readinessResponse.body.data.reportRun.readinessStatus).toBe("not_ready")
    expect(mockValidationEngineService.validateReportRun).toHaveBeenCalledWith({
      runId: "generated-run-1",
      actorId: "admin-user-1",
    })
    expect(mockValidationResultService.getLatestForRun).toHaveBeenCalledWith({ runId: "generated-run-1" })
    expect(mockValidationResultService.getReadiness).toHaveBeenCalledWith({ runId: "generated-run-1" })
  })

  test("auto-corrects template sheet mapping on report run when workbook sheet differs", async () => {
    const tbFile = path.join(tempDir, "tb_autocorrect.xlsx")
    const glFile = path.join(tempDir, "gl_autocorrect.xlsx")
    const outputFile = path.join(tempDir, "report_autocorrect.xlsx")
    await writeTinyWorkbook(tbFile)
    await writeTinyWorkbook(glFile)
    await writeTinyWorkbook(outputFile)

    const correctedConfig = {
      version: "v3",
      sheet_name: "Template Layout",
      layout_type: "rows",
      period_granularity: "monthly",
      period_axis: {
        orientation: "row",
        labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
        period_bindings: [{ period_key: "m01", label: "Jan", cell: "A2" }],
      },
      opening_binding: null,
      closing_binding: null,
      period_resolution_rules: { custom_periods: [] },
      bucket_bindings: [],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    }

    mockCashFlowService.generateCashFlowReport
      .mockRejectedValueOnce(
        new MockCashFlowValidationError('Template sheet "Cash Flow" not found', {
          available_sheets: ["Template Layout"],
        }),
      )
      .mockResolvedValueOnce({
        outputFilePath: outputFile,
        normalizedConfig: correctedConfig,
        warnings: [],
        preview: {
          monthly: [{ month: "Jan", opening_balance: 0, net_cash_flow: 50, closing_balance: 50, buckets: {} }],
          totals: { closing_balance_december: 50 },
        },
        mapping: {
          auto_mappings_created: [],
          low_confidence_mappings: [],
          final_bucket_assignments: [],
        },
      })

    mockCashFlowService.ensureV3TemplateConfig.mockResolvedValueOnce(correctedConfig)

    const response = await request(app)
      .post("/api/v1/cash-flow/reports/run")
      .field("portfolio_id", "fund-1")
      .field("date_start", "2025-01-01")
      .field("date_end", "2025-12-31")
      .attach("tb_file", tbFile)
      .attach("gl_file", glFile)

    expect(response.status).toBe(200)
    expect(mockCashFlowService.generateCashFlowReport).toHaveBeenCalledTimes(2)
    expect(mockCashFlowService.ensureV3TemplateConfig).toHaveBeenCalledTimes(1)
    expect((response.body.data.warnings || []).some((warning) => String(warning).includes("auto-corrected"))).toBe(true)
  })

  test("blocks report run when no active template exists", async () => {
    const tbFile = path.join(tempDir, "tb_missing_template.xlsx")
    const glFile = path.join(tempDir, "gl_missing_template.xlsx")
    await writeTinyWorkbook(tbFile)
    await writeTinyWorkbook(glFile)

    mockTemplateModel.findOne.mockResolvedValue(null)

    const response = await request(app)
      .post("/api/v1/cash-flow/reports/run")
      .field("portfolio_id", "fund-1")
      .field("date_start", "2025-01-01")
      .field("date_end", "2025-12-31")
      .attach("tb_file", tbFile)
      .attach("gl_file", glFile)

    expect(response.status).toBe(400)
    expect(String(response.body.message || "").toLowerCase()).toContain("no active cash flow template")
  })

  test("downloads generated cash flow workbook", async () => {
    const reportPath = path.join(tempDir, "download_report.xlsx")
    await writeTinyWorkbook(reportPath)

    mockReportRunModel.findByPk.mockResolvedValue(
      createRunRecord({
        id: "run-download",
        type: "cash_flow",
        output_paths: { xlsx: reportPath },
      }),
    )

    const response = await request(app)
      .get("/api/v1/cash-flow/reports/download/run-download")
      .buffer(true)
      .parse((res, callback) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => callback(null, Buffer.concat(chunks)))
      })

    expect(response.status).toBe(200)
    expect(String(response.headers["content-disposition"] || "").toLowerCase()).toContain("attachment")
    expect(response.body.slice(0, 2).toString()).toBe("PK")
  })

  test("parses and inspects a template version structure", async () => {
    const parseResponse = await request(app).post(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/parse",
    )

    expect(parseResponse.status).toBe(200)
    expect(parseResponse.body.data.template_version.id).toBe("template-version-1")
    expect(parseResponse.body.data.structure.templateVersionId).toBe("template-version-1")

    const structureResponse = await request(app).get(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/structure",
    )
    expect(structureResponse.status).toBe(200)
    expect(structureResponse.body.data.structure.sheets).toHaveLength(1)

    const rowsResponse = await request(app).get(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/rows",
    )
    expect(rowsResponse.status).toBe(200)
    expect(rowsResponse.body.data.rows[0].rowLabel).toBe("Subscriptions")
  })

  test("generates and retrieves deterministic mapping suggestions for a template version", async () => {
    const generateResponse = await request(app).post(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/suggest-mappings",
    )

    expect(generateResponse.status).toBe(200)
    expect(generateResponse.body.data.summary.rowsProcessed).toBe(3)
    expect(generateResponse.body.data.suggestions[0].suggestions[0].semanticConceptKey).toBe("subscriptions")

    const listResponse = await request(app).get(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/mapping-suggestions",
    )

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.suggestions[0].templateRow.label).toBe("Subscriptions")
    expect(mockMappingSuggestionService.suggestTemplateVersionMappings).toHaveBeenCalled()
    expect(mockMappingSuggestionService.getTemplateVersionSuggestions).toHaveBeenCalled()
  })

  test("generates and retrieves llm-assisted mapping suggestions for a template version", async () => {
    const assistResponse = await request(app).post(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/assist-mappings",
    )

    expect(assistResponse.status).toBe(200)
    expect(assistResponse.body.data.summary.rowsSucceeded).toBe(2)
    expect(assistResponse.body.data.suggestions[0].suggestions[0].llmScore).toBe(0.9)

    const listResponse = await request(app).get(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/llm-mapping-suggestions",
    )

    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data.suggestions[0].templateRow.label).toBe("Subscriptions")
    expect(mockLlmMappingAssistantService.assistTemplateVersionMappings).toHaveBeenCalled()
    expect(mockLlmMappingAssistantService.getTemplateVersionAssistedSuggestions).toHaveBeenCalled()
  })

  test("generates review tasks for a template version", async () => {
    const response = await request(app).post(
      "/api/v1/cash-flow/templates/template-1/versions/template-version-1/review-tasks",
    )

    expect(response.status).toBe(200)
    expect(response.body.data.summary.tasksCreated).toBe(2)
    expect(response.body.data.review_tasks[0].reviewReason).toBe("llm_disagreement")
    expect(mockReviewTaskService.generateTemplateVersionReviewTasks).toHaveBeenCalledWith({
      templateId: "template-1",
      versionId: "template-version-1",
      actorId: "admin-user-1",
      force: false,
      allowDuplicateActive: false,
    })
  })
})
