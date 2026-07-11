const mockRuns = []
const mockSteps = []
const mockWorkflowRunCreate = jest.fn()
const mockWorkflowRunFindOne = jest.fn()
const mockWorkflowRunFindAll = jest.fn()
const mockWorkflowStepCreate = jest.fn()
const mockRequireActivePrincipal = jest.fn()
const mockExecuteTool = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: async (callback) => callback({ id: "tx" }),
  },
  AgentWorkflowRun: {
    create: (...args) => mockWorkflowRunCreate(...args),
    findOne: (...args) => mockWorkflowRunFindOne(...args),
    findAll: (...args) => mockWorkflowRunFindAll(...args),
  },
  AgentWorkflowStep: {
    create: (...args) => mockWorkflowStepCreate(...args),
  },
  AgentToolInvocation: {},
  AgentPrincipal: {},
  ReportingProject: {},
}))

jest.mock("../src/modules/agent-tools/services/agentPrincipal.service", () => ({
  requireActivePrincipal: (...args) => mockRequireActivePrincipal(...args),
}))

jest.mock("../src/modules/agent-tools/services/agentToolExecution.service", () => ({
  executeTool: (...args) => mockExecuteTool(...args),
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const AgentWorkflowService = require("../src/modules/agent-tools/services/agentWorkflow.service")

function withUpdate(record) {
  return {
    ...record,
    async update(values) {
      Object.assign(this, values)
      return this
    },
    toJSON() {
      return {
        ...this,
        steps: this.steps || mockSteps.filter((step) => step.workflow_run_id === this.id),
      }
    },
  }
}

function makeRun(values) {
  return withUpdate({
    id: `workflow-${mockRuns.length + 1}`,
    status: "pending",
    trigger_type: "manual",
    workflow_plan_json: [],
    policy_json: {},
    metadata_json: null,
    ...values,
  })
}

function makeStep(values) {
  return withUpdate({
    id: `step-${mockSteps.length + 1}`,
    status: "pending",
    continue_on_error: false,
    dry_run: false,
    ...values,
  })
}

function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, value]) => record[key] === value)
}

describe("AgentWorkflowService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRuns.length = 0
    mockSteps.length = 0

    mockRequireActivePrincipal.mockResolvedValue({ id: "agent-1", status: "active" })
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockWorkflowRunCreate.mockImplementation(async (payload) => {
      const run = makeRun(payload)
      mockRuns.push(run)
      return run
    })
    mockWorkflowStepCreate.mockImplementation(async (payload) => {
      const step = makeStep(payload)
      mockSteps.push(step)
      return step
    })
    mockWorkflowRunFindOne.mockImplementation(async ({ where }) => {
      const run = mockRuns.find((entry) => matchesWhere(entry, where)) || null
      if (run) run.steps = mockSteps.filter((step) => step.workflow_run_id === run.id)
      return run
    })
    mockWorkflowRunFindAll.mockImplementation(async ({ where }) =>
      mockRuns.filter((run) => matchesWhere(run, where)).map((run) => {
        run.steps = mockSteps.filter((step) => step.workflow_run_id === run.id)
        return run
      }),
    )
    mockExecuteTool.mockImplementation(async ({ toolName }) => {
      if (toolName === "get_project_readiness") {
        return {
          invocation: { id: "inv-readiness", status: "completed" },
          result: { can_run_draft_report: true },
        }
      }
      if (toolName === "run_report") {
        return {
          invocation: { id: "inv-run-report", status: "completed" },
          result: { reportRun: { id: "run-1", status: "completed" } },
        }
      }
      if (toolName === "run_validation_checks") {
        return {
          invocation: { id: "inv-validation", status: "completed" },
          result: { validationResult: { id: "validation-1", readinessStatus: "ready" } },
        }
      }
      return {
        invocation: { id: `inv-${toolName}`, status: "completed" },
        result: { total: 0, review_tasks: [] },
      }
    })
  })

  test("creates and runs the default draft reporting workflow with resolved step inputs", async () => {
    const result = await AgentWorkflowService.createWorkflowRun({
      agentPrincipalId: "agent-1",
      actorId: "admin-1",
      workflowType: "reporting_draft_validation",
      fundId: "fund-1",
      projectId: "project-1",
      idempotencyKey: "workflow-idem-1",
      policy: {
        min_confidence: 0.75,
        materiality_threshold: 1000,
      },
    })

    expect(result.workflowRun.status).toBe("completed")
    expect(result.workflowRun.summary.completed_steps).toBe(4)
    expect(mockExecuteTool).toHaveBeenCalledTimes(4)
    expect(mockExecuteTool).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        toolName: "run_validation_checks",
        input: { run_id: "run-1", materiality_threshold: 1000 },
      }),
    )
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent_workflow_completed",
        entityType: "agent_workflow_run",
      }),
    )
  })

  test("injects confidence policy into mapping suggestion steps", async () => {
    mockExecuteTool.mockResolvedValue({
      invocation: { id: "inv-mapping", status: "completed" },
      result: { suggestions: [] },
    })

    const result = await AgentWorkflowService.createWorkflowRun({
      agentPrincipalId: "agent-1",
      actorId: "admin-1",
      workflowType: "custom_tool_sequence",
      fundId: "fund-1",
      steps: [
        {
          step_name: "mapping",
          tool_name: "suggest_tb_mapping",
          input: { fund_id: "$context.fund_id" },
        },
      ],
      policy: { min_confidence: 0.82 },
    })

    expect(result.workflowRun.status).toBe("completed")
    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "suggest_tb_mapping",
        input: { fund_id: "fund-1", min_confidence: 0.82 },
      }),
    )
  })

  test("blocks workflow recursion, finalizing payloads, and invalid policy", async () => {
    await expect(
      AgentWorkflowService.createWorkflowRun({
        agentPrincipalId: "agent-1",
        workflowType: "custom_tool_sequence",
        steps: [{ step_name: "loop", tool_name: "start_agent_workflow", input: {} }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    await expect(
      AgentWorkflowService.createWorkflowRun({
        agentPrincipalId: "agent-1",
        workflowType: "custom_tool_sequence",
        steps: [{ step_name: "bad", tool_name: "upload_source_document", input: { status: "approved" } }],
      }),
    ).rejects.toMatchObject({ statusCode: 403 })

    await expect(
      AgentWorkflowService.createWorkflowRun({
        agentPrincipalId: "agent-1",
        workflowType: "custom_tool_sequence",
        steps: [{ step_name: "mapping", tool_name: "suggest_tb_mapping", input: {} }],
        policy: { min_confidence: 1.5 },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test("persists failed workflows instead of losing monitoring context", async () => {
    mockExecuteTool.mockRejectedValueOnce(Object.assign(new Error("Validation failed"), { statusCode: 400 }))

    const result = await AgentWorkflowService.createWorkflowRun({
      agentPrincipalId: "agent-1",
      actorId: "admin-1",
      workflowType: "custom_tool_sequence",
      steps: [{ step_name: "validate", tool_name: "run_validation_checks", input: { run_id: "run-1" } }],
    })

    expect(result.workflowRun.status).toBe("failed")
    expect(result.workflowRun.summary.failed_steps).toBe(1)
    expect(result.workflowRun.steps[0].error.message).toBe("Validation failed")
  })
})
