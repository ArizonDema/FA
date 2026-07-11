const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockListIntegrations = jest.fn()
const mockCreateIntegration = jest.fn()
const mockGetIntegration = jest.fn()
const mockUpdateIntegration = jest.fn()
const mockStartSyncRun = jest.fn()
const mockListSyncRuns = jest.fn()
const mockGetSyncRun = jest.fn()

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-1", role: "admin" }
    next()
  },
  authorize: () => (req, res, next) => next(),
}))

jest.mock("../src/modules/agent-tools/services/agentPrincipal.service", () => ({
  listPrincipals: jest.fn(async () => []),
  createPrincipal: jest.fn(async () => ({ principal: { id: "agent-1" } })),
  getPrincipal: jest.fn(async () => ({ id: "agent-1" })),
}))

jest.mock("../src/modules/agent-tools/services/agentToolExecution.service", () => ({
  getToolCatalog: jest.fn(() => ({})),
  executeTool: jest.fn(),
}))

jest.mock("../src/modules/agent-tools/services/agentWorkflow.service", () => ({
  listWorkflowRuns: jest.fn(async () => []),
  createWorkflowRun: jest.fn(),
  getWorkflowRun: jest.fn(),
  startWorkflowRun: jest.fn(),
}))

jest.mock("../src/modules/agent-tools/services/externalIntegration.service", () => ({
  listIntegrations: (...args) => mockListIntegrations(...args),
  createIntegration: (...args) => mockCreateIntegration(...args),
  getIntegration: (...args) => mockGetIntegration(...args),
  updateIntegration: (...args) => mockUpdateIntegration(...args),
  startSyncRun: (...args) => mockStartSyncRun(...args),
  listSyncRuns: (...args) => mockListSyncRuns(...args),
  getSyncRun: (...args) => mockGetSyncRun(...args),
}))

const agentToolRoutes = require("../src/modules/agent-tools/routes/agentTool.routes")

describe("External integration API", () => {
  const app = express()
  app.use(express.json())
  app.use("/agent-reporting", agentToolRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockListIntegrations.mockResolvedValue([{ id: "integration-1", name: "SharePoint" }])
    mockCreateIntegration.mockResolvedValue({ id: "integration-1", name: "SharePoint" })
    mockGetIntegration.mockResolvedValue({ id: "integration-1", name: "SharePoint" })
    mockUpdateIntegration.mockResolvedValue({ id: "integration-1", status: "disabled" })
    mockStartSyncRun.mockResolvedValue({
      syncRun: { id: "sync-1", status: "completed" },
      idempotentReplay: false,
    })
    mockListSyncRuns.mockResolvedValue([{ id: "sync-1", status: "completed" }])
    mockGetSyncRun.mockResolvedValue({ id: "sync-1", status: "completed" })
  })

  test("manages integrations and sync runs through admin routes", async () => {
    const listResponse = await request(app).get("/agent-reporting/integrations?fund_id=fund-1")
    const createResponse = await request(app)
      .post("/agent-reporting/integrations")
      .send({
        fund_id: "fund-1",
        name: "SharePoint",
        provider_type: "document_store",
        provider_key: "sharepoint",
        auth_mode: "secret_reference",
        secret_reference: "vault://sharepoint/reporting",
      })
    const readResponse = await request(app).get("/agent-reporting/integrations/integration-1?fund_id=fund-1")
    const updateResponse = await request(app)
      .put("/agent-reporting/integrations/integration-1?fund_id=fund-1")
      .send({ status: "disabled" })
    const syncResponse = await request(app)
      .post("/agent-reporting/integrations/integration-1/sync-runs")
      .set("idempotency-key", "sync-idem-1")
      .send({
        fund_id: "fund-1",
        discovered_artifacts: [{ external_id: "tb-1", title: "TB" }],
      })
    const syncListResponse = await request(app).get("/agent-reporting/external-sync-runs?fund_id=fund-1")
    const syncReadResponse = await request(app).get("/agent-reporting/external-sync-runs/sync-1?fund_id=fund-1")

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(201)
    expect(readResponse.body.data.integration.id).toBe("integration-1")
    expect(updateResponse.body.data.integration.status).toBe("disabled")
    expect(syncResponse.status).toBe(201)
    expect(syncListResponse.body.data.syncRuns).toHaveLength(1)
    expect(syncReadResponse.body.data.syncRun.id).toBe("sync-1")
    expect(mockCreateIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        actorId: "admin-1",
      }),
    )
    expect(mockStartSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        actorId: "admin-1",
        idempotencyKey: "sync-idem-1",
      }),
    )
  })
})
