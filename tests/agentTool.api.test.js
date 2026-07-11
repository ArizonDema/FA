const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockListPrincipals = jest.fn()
const mockCreatePrincipal = jest.fn()
const mockGetPrincipal = jest.fn()
const mockGetToolCatalog = jest.fn()
const mockExecuteTool = jest.fn()
const mockListWorkflowRuns = jest.fn()
const mockCreateWorkflowRun = jest.fn()
const mockGetWorkflowRun = jest.fn()
const mockStartWorkflowRun = jest.fn()
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
  listPrincipals: (...args) => mockListPrincipals(...args),
  createPrincipal: (...args) => mockCreatePrincipal(...args),
  getPrincipal: (...args) => mockGetPrincipal(...args),
}))

jest.mock("../src/modules/agent-tools/services/agentToolExecution.service", () => ({
  getToolCatalog: (...args) => mockGetToolCatalog(...args),
  executeTool: (...args) => mockExecuteTool(...args),
}))

jest.mock("../src/modules/agent-tools/services/agentWorkflow.service", () => ({
  listWorkflowRuns: (...args) => mockListWorkflowRuns(...args),
  createWorkflowRun: (...args) => mockCreateWorkflowRun(...args),
  getWorkflowRun: (...args) => mockGetWorkflowRun(...args),
  startWorkflowRun: (...args) => mockStartWorkflowRun(...args),
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

describe("Agent reporting tool API", () => {
  const app = express()
  app.use(express.json())
  app.use("/agent-reporting", agentToolRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToolCatalog.mockReturnValue({
      create_reporting_project: {
        scope: "reporting_project:create",
        mutability: "draft_write",
      },
    })
    mockListPrincipals.mockResolvedValue([{ id: "agent-1", name: "Reporting Agent" }])
    mockCreatePrincipal.mockResolvedValue({
      principal: { id: "agent-1", name: "Reporting Agent" },
      apiKey: null,
    })
    mockGetPrincipal.mockResolvedValue({ id: "agent-1", name: "Reporting Agent" })
    mockExecuteTool.mockResolvedValue({
      invocation: { id: "invocation-1", status: "completed" },
      result: { id: "project-1", status: "draft" },
      idempotentReplay: false,
    })
  })

  test("lists tools, manages principals, and invokes a tool through the safe facade", async () => {
    const toolsResponse = await request(app).get("/agent-reporting/tools")
    const listResponse = await request(app).get("/agent-reporting/principals?status=active")
    const createResponse = await request(app)
      .post("/agent-reporting/principals")
      .send({ name: "Reporting Agent", scopes: ["reporting_project:create"] })
    const readResponse = await request(app).get("/agent-reporting/principals/agent-1")
    const invokeResponse = await request(app)
      .post("/agent-reporting/tools/create_reporting_project/invoke")
      .set("idempotency-key", "idem-1")
      .send({
        agent_principal_id: "agent-1",
        arguments: { fund_id: "fund-1", name: "Q1 Cash Flow" },
      })

    expect(toolsResponse.status).toBe(200)
    expect(toolsResponse.body.data.tools.create_reporting_project.scope).toBe("reporting_project:create")
    expect(listResponse.body.data.principals).toHaveLength(1)
    expect(createResponse.status).toBe(201)
    expect(readResponse.body.data.principal.id).toBe("agent-1")
    expect(invokeResponse.status).toBe(200)
    expect(invokeResponse.body.data.result.status).toBe("draft")
    expect(mockListPrincipals).toHaveBeenCalledWith({ status: "active" })
    expect(mockCreatePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        fields: expect.objectContaining({ name: "Reporting Agent" }),
      }),
    )
    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPrincipalId: "agent-1",
        toolName: "create_reporting_project",
        input: { fund_id: "fund-1", name: "Q1 Cash Flow" },
        idempotencyKey: "idem-1",
        dryRun: false,
        actorId: "admin-1",
      }),
    )
  })

  test("passes dry-run invocations without finalizing work", async () => {
    await request(app)
      .post("/agent-reporting/tools/create_reporting_project/invoke")
      .send({
        agentPrincipalId: "agent-1",
        input: { fund_id: "fund-1" },
        dry_run: "true",
      })

    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
      }),
    )
  })
})
