const mockListIntegrations = jest.fn()
const mockStartSyncRun = jest.fn()
const mockGetSyncRun = jest.fn()

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

jest.mock("../src/modules/agent-tools/services/externalIntegration.service", () => ({
  listIntegrations: (...args) => mockListIntegrations(...args),
  startSyncRun: (...args) => mockStartSyncRun(...args),
  getSyncRun: (...args) => mockGetSyncRun(...args),
}))

jest.mock("../src/modules/reports/services/reportExport.service", () => ({}))
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

describe("AgentReportingToolService integration tools", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListIntegrations.mockResolvedValue([{ id: "integration-1", name: "ERP" }])
    mockStartSyncRun.mockResolvedValue({
      syncRun: { id: "sync-1", status: "completed" },
      idempotentReplay: false,
    })
    mockGetSyncRun.mockResolvedValue({ id: "sync-1", status: "completed" })
  })

  test("lists integrations and starts sync runs without importing artifacts", async () => {
    const integrations = await AgentReportingToolService.dispatch(
      "list_external_integrations",
      { fund_id: "fund-1" },
      { agentId: "agent-1" },
    )
    const sync = await AgentReportingToolService.dispatch(
      "start_external_sync",
      {
        fund_id: "fund-1",
        integration_id: "integration-1",
        discovered_artifacts: [{ external_id: "tb-1", title: "TB" }],
      },
      { agentId: "agent-1", delegatedUserId: "admin-1", invocationId: "invocation-1" },
    )
    const read = await AgentReportingToolService.dispatch(
      "get_external_sync",
      { sync_run_id: "sync-1" },
      { agentId: "agent-1" },
    )

    expect(integrations[0].id).toBe("integration-1")
    expect(sync.syncRun.status).toBe("completed")
    expect(read.id).toBe("sync-1")
    expect(mockStartSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        agentPrincipalId: "agent-1",
        actorId: "admin-1",
        triggerType: "agent_tool",
      }),
    )
  })

  test("blocks finalizing-shaped sync payloads", async () => {
    await expect(
      AgentReportingToolService.dispatch(
        "start_external_sync",
        { integration_id: "integration-1", status: "approved" },
        { agentId: "agent-1" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockStartSyncRun).not.toHaveBeenCalled()
  })
})
