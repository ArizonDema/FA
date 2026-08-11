const mockReportRunCreate = jest.fn()
const mockBuildReportData = jest.fn()
const mockGetTemplate = jest.fn()
const mockGeneratePdfReport = jest.fn()
const mockGenerateXlsxReport = jest.fn()
const mockGenerateCapitalAccountTemplateReport = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockGetActiveTemplateForFund = jest.fn()

jest.mock("../src/models", () => ({
  ReportRun: { create: (...args) => mockReportRunCreate(...args) },
}))

jest.mock("../src/services/report.service", () => ({
  buildReportData: (...args) => mockBuildReportData(...args),
  getTemplate: (...args) => mockGetTemplate(...args),
  generatePdfReport: (...args) => mockGeneratePdfReport(...args),
  generateXlsxReport: (...args) => mockGenerateXlsxReport(...args),
  generateCapitalAccountTemplateReport: (...args) => mockGenerateCapitalAccountTemplateReport(...args),
}))

jest.mock("../src/modules/templates/services/template.service", () => ({
  getActiveTemplateForFund: (...args) => mockGetActiveTemplateForFund(...args),
  evaluateReadinessForTemplate: jest.fn(() => ({ can_activate: true })),
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const ReportRunService = require("../src/modules/reports/services/reportRun.service")

function createRun() {
  return {
    id: "run-1",
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return { ...this }
    },
  }
}

describe("capital account statement report run", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReportRunCreate.mockResolvedValue(createRun())
    mockBuildReportData.mockResolvedValue({
      fund: { id: "fund-1", name: "Example Fund" },
      capitalAccountStatements: {
        statements: [{ investor_profile_id: "investor-1" }],
        totals: { statements: 1, ending_capital: 100 },
        warnings: [{ code: "capital_account_allocations_not_available", message: "Review allocations" }],
      },
    })
    mockGetTemplate.mockResolvedValue(null)
    mockGenerateXlsxReport.mockResolvedValue("capital-accounts.xlsx")
    mockGenerateCapitalAccountTemplateReport.mockResolvedValue("capital-accounts.xlsx")
    mockGetActiveTemplateForFund.mockResolvedValue({
      id: "cas-template-1",
      portfolio_id: "fund-1",
      template_kind: "capital_account_statement",
      is_active: true,
      status: "active",
      template_file_path: "C:\\templates\\cas.xlsx",
      config_json: { version: "cas_v1" },
      activeVersion: {
        id: "cas-version-1",
        source_file_path: "C:\\templates\\cas.xlsx",
        config_json: { version: "cas_v1" },
      },
    })
    mockAuditLogEvent.mockResolvedValue(null)
  })

  test("passes statement filters through and generates only the specialized workbook", async () => {
    const result = await ReportRunService.runGenericReport({
      actorId: "admin-1",
      payload: {
        type: "capital_account_statement",
        portfolio_id: "fund-1",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        investor_profile_id: "investor-1",
        share_class_id: "class-1",
        format: "xlsx",
      },
    })

    expect(mockBuildReportData).toHaveBeenCalledWith(expect.objectContaining({
      investorProfileId: "investor-1",
      shareClassId: "class-1",
    }))
    expect(mockGeneratePdfReport).not.toHaveBeenCalled()
    expect(mockGenerateCapitalAccountTemplateReport).toHaveBeenCalledWith(
      "run-1",
      expect.any(Object),
      expect.objectContaining({ templatePath: "C:\\templates\\cas.xlsx" }),
    )
    expect(result.outputs.xlsx).toBe("capital-accounts.xlsx")
    expect(result.run).toMatchObject({
      status: "completed",
      readiness_status: "ready_with_warnings",
      summary_json: { statements: 1, ending_capital: 100 },
    })
  })

  test("records a failed report run when workbook generation fails", async () => {
    mockGenerateCapitalAccountTemplateReport.mockRejectedValueOnce(new Error("write failed"))

    await expect(
      ReportRunService.runGenericReport({
        payload: {
          type: "capital_account_statement",
          portfolio_id: "fund-1",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          format: "xlsx",
        },
      }),
    ).rejects.toThrow("write failed")

    const run = await mockReportRunCreate.mock.results[0].value
    expect(run).toMatchObject({
      status: "failed",
      error_json: expect.objectContaining({ message: "write failed" }),
    })
  })

  test("requires an active CAS template before creating a report run", async () => {
    mockGetActiveTemplateForFund.mockResolvedValueOnce(null)

    await expect(
      ReportRunService.runGenericReport({
        payload: {
          type: "capital_account_statement",
          portfolio_id: "fund-1",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          format: "xlsx",
        },
      }),
    ).rejects.toThrow("No active capital account statement template")

    expect(mockReportRunCreate).not.toHaveBeenCalled()
  })
})
