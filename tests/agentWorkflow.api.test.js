const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockListWorkflowRuns = jest.fn()
const mockCreateWorkflowRun = jest.fn()
const mockGetWorkflowRun = jest.fn()
const mockStartWorkflowRun = jest.fn()

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
  listWorkflowRuns: (...args) => mockListWorkflowRuns(...args),
  createWorkflowRun: (...args) => mockCreateWorkflowRun(...args),
  getWorkflowRun: (...args) => mockGetWorkflowRun(...args),
  startWorkflowRun: (...args) => mockStartWorkflowRun(...args),
}))

const agentToolRoutes = require("../src/modules/agent-tools/routes/agentTool.routes")

describe("Agent workflow API", () => {
  const app = express()
  app.use(express.json())
  app.use("/agent-reporting", agentToolRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockListWorkflowRuns.mockResolvedValue([{ id: "workflow-1", status: "completed" }])
    mockCreateWorkflowRun.mockResolvedValue({
      workflowRun: { id: "workflow-1", status: "completed" },
      idempotentReplay: false,
    })
    mockGetWorkflowRun.mockResolvedValue({ id: "workflow-1", status: "completed" })
    mockStartWorkflowRun.mockResolvedValue({ id: "workflow-1", status: "completed" })
  })

  test("lists, creates, reads, and starts agent workflow runs", async () => {
    const listResponse = await request(app).get("/agent-reporting/workflows/runs?fund_id=fund-1")
    const createResponse = await request(app)
      .post("/agent-reporting/workflows/runs")
      .set("idempotency-key", "workflow-idem-1")
      .send({
        agent_principal_id: "agent-1",
        workflow_type: "reporting_draft_validation",
        fund_id: "fund-1",
        project_id: "project-1",
      })
    const readResponse = await request(app).get("/agent-reporting/workflows/runs/workflow-1")
    const startResponse = await request(app).post("/agent-reporting/workflows/runs/workflow-1/start")

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(201)
    expect(readResponse.body.data.workflowRun.id).toBe("workflow-1")
    expect(startResponse.body.data.workflowRun.status).toBe("completed")
    expect(mockListWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ fundId: "fund-1" }))
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPrincipalId: "agent-1",
        actorId: "admin-1",
        workflowType: "reporting_draft_validation",
        fundId: "fund-1",
        projectId: "project-1",
        idempotencyKey: "workflow-idem-1",
      }),
    )
    expect(mockStartWorkflowRun).toHaveBeenCalledWith({
      workflowRunId: "workflow-1",
      actorId: "admin-1",
    })
  })
})
