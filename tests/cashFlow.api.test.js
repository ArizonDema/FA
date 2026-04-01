const fs = require("fs")
const os = require("os")
const path = require("path")
const request = require("supertest")
const express = require("express")
const ExcelJS = require("exceljs")
const errorHandler = require("../src/middlewares/errorHandler")

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

const mockReportRunModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
}

const mockTemplateAnalysisModel = {
  findByPk: jest.fn(),
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
  CashFlowTemplate: mockTemplateModel,
  CashFlowTemplateAnalysis: mockTemplateAnalysisModel,
  CashFlowAccountMapping: mockAccountMappingModel,
  ReportRun: mockReportRunModel,
  AuditLog: {
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

const cashFlowRoutes = require("../src/routes/cash-flow.routes")

function createTemplateRecord(overrides = {}) {
  return {
    id: "template-1",
    portfolio_id: "fund-1",
    name: "Template A",
    version: "v1",
    template_file_name: "template.xlsx",
    template_file_path: "C:\\temp\\template.xlsx",
    config_json: { sheet_name: "Cash Flow", buckets: [] },
    is_active: true,
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
  const repoCashFlowUploadDir = path.join(process.cwd(), "uploads", "cash-flow")

  app.use(express.json())
  app.use("/api/v1/cash-flow", cashFlowRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockModels.Portfolio.findByPk.mockResolvedValue({ id: "fund-1", name: "Fund One" })
    mockTemplateModel.findOne.mockResolvedValue(createTemplateRecord())
    mockTemplateModel.findByPk.mockResolvedValue(createTemplateRecord())
    mockTemplateModel.findAll.mockResolvedValue([createTemplateRecord()])
    mockTemplateModel.update.mockResolvedValue([1])
    mockTemplateModel.create.mockResolvedValue(createTemplateRecord())
    mockTemplateAnalysisModel.findByPk.mockResolvedValue(null)
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
    mockCashFlowService.generateCashFlowReport.mockResolvedValue({
      outputFilePath: path.join(tempDir, "output.xlsx"),
      warnings: [],
      preview: {
        monthly: [],
        totals: {
          closing_balance_december: 100,
        },
      },
    })
    mockCashFlowService.analyzeTemplateWorkbook.mockResolvedValue({
      detected_layout_type: "rows",
      confidence: 0.82,
      issues: [],
      required_anchors: [],
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
    fs.rmSync(path.join(repoCashFlowUploadDir, "runs"), { recursive: true, force: true })
    fs.rmSync(path.join(repoCashFlowUploadDir, "templates"), { recursive: true, force: true })
    fs.rmSync(path.join(repoCashFlowUploadDir, "tmp"), { recursive: true, force: true })
    fs.mkdirSync(path.join(repoCashFlowUploadDir, "tmp"), { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
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
    expect(mockCashFlowService.analyzeTemplateWorkbook).toHaveBeenCalled()
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
    expect(mockCashFlowService.analyzeTemplateWorkbook).toHaveBeenCalled()
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
    expect(mockCashFlowService.generateCashFlowReport).toHaveBeenCalled()
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
})
