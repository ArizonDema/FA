const mockRequestFinalExport = jest.fn()

jest.mock("../src/models", () => ({
  Account: {},
  AccountSemanticMapping: {},
  AuditLog: {},
  ReportLineage: {},
  ReportRun: {},
  ReportRunRow: {},
  ReportingProject: {},
  TemplateVersion: {},
}))

jest.mock("../src/modules/reports/services/reportExport.service", () => ({
  requestFinalExport: (...args) => mockRequestFinalExport(...args),
}))

jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => ({}))
jest.mock("../src/modules/repository/services/repositoryAnalysis.service", () => ({}))
jest.mock("../src/modules/reviews/services/reviewTask.service", () => ({}))
jest.mock("../src/modules/reports/services/reportGeneration.service", () => ({
  ReportGenerationService: {},
}))
jest.mock("../src/modules/reports/services/validationEngine.service", () => ({
  ValidationEngineService: {},
}))
jest.mock("../src/modules/templates/services/templateParsing.service", () => ({}))
jest.mock("../src/modules/reporting-projects/services/reportingProject.service", () => ({}))

const AgentReportingToolService = require("../src/modules/reporting-projects/services/agentReportingTool.service")

describe("AgentReportingToolService export_report", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequestFinalExport.mockResolvedValue({
      export: { id: "export-1", status: "approval_requested" },
      reviewTaskId: "task-1",
    })
  })

  test("requests human approval for export without finalizing the report", async () => {
    const result = await AgentReportingToolService.dispatch(
      "export_report",
      { run_id: "run-1", format: "xlsx" },
      { delegatedUserId: "admin-1", agentId: "agent-1" },
    )

    expect(result.export.status).toBe("approval_requested")
    expect(mockRequestFinalExport).toHaveBeenCalledWith({
      runId: "run-1",
      format: "xlsx",
      actorId: "admin-1",
    })
  })

  test("blocks approval-shaped export payloads", async () => {
    await expect(
      AgentReportingToolService.dispatch(
        "export_report",
        { run_id: "run-1", status: "approved" },
        { delegatedUserId: "admin-1" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockRequestFinalExport).not.toHaveBeenCalled()
  })
})
