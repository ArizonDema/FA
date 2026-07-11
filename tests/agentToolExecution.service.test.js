const mockInvocationFindOne = jest.fn()
const mockInvocationCreate = jest.fn()
const mockRequireActivePrincipal = jest.fn()
const mockTouchPrincipal = jest.fn()
const mockGetToolCatalog = jest.fn()
const mockDispatch = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  AgentToolInvocation: {
    findOne: (...args) => mockInvocationFindOne(...args),
    create: (...args) => mockInvocationCreate(...args),
  },
}))

jest.mock("../src/modules/agent-tools/services/agentPrincipal.service", () => ({
  requireActivePrincipal: (...args) => mockRequireActivePrincipal(...args),
  touchPrincipal: (...args) => mockTouchPrincipal(...args),
}))

jest.mock("../src/modules/reporting-projects/services/agentReportingTool.service", () => ({
  getToolCatalog: (...args) => mockGetToolCatalog(...args),
  dispatch: (...args) => mockDispatch(...args),
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const AgentToolExecutionService = require("../src/modules/agent-tools/services/agentToolExecution.service")

function principal(overrides = {}) {
  return {
    id: "agent-1",
    status: "active",
    scopes_json: ["reporting_project:create"],
    allowed_portfolio_ids_json: ["fund-1"],
    allowed_reporting_project_ids_json: [],
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    ...overrides,
  }
}

function invocationRecord(values) {
  return {
    id: "invocation-1",
    status: "pending",
    output_json: null,
    error_json: null,
    completed_at: null,
    ...values,
    update: jest.fn(async function update(payload) {
      Object.assign(this, payload)
      return this
    }),
    toJSON() {
      return { ...this }
    },
  }
}

describe("AgentToolExecutionService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireActivePrincipal.mockResolvedValue(principal())
    mockGetToolCatalog.mockReturnValue({
      create_reporting_project: {
        scope: "reporting_project:create",
        mutability: "draft_write",
      },
    })
    mockInvocationFindOne.mockResolvedValue(null)
    mockInvocationCreate.mockImplementation(async (payload) => invocationRecord({ ...payload, id: "invocation-1" }))
    mockDispatch.mockResolvedValue({ id: "project-1", status: "draft" })
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockTouchPrincipal.mockResolvedValue(null)
  })

  test("executes a scoped draft tool and records invocation/audit attribution", async () => {
    const result = await AgentToolExecutionService.executeTool({
      agentPrincipalId: "agent-1",
      toolName: "create_reporting_project",
      input: { fund_id: "fund-1", name: "Q1 Cash Flow" },
      idempotencyKey: "idem-1",
      actorId: "admin-1",
    })

    expect(result.result).toEqual({ id: "project-1", status: "draft" })
    expect(result.invocation.status).toBe("completed")
    expect(mockInvocationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_principal_id: "agent-1",
        idempotency_key: "idem-1",
        tool_name: "create_reporting_project",
        portfolio_id: "fund-1",
        delegated_by: "admin-1",
        metadata_json: {
          required_scope: "reporting_project:create",
          mutability: "draft_write",
        },
      }),
    )
    expect(mockDispatch).toHaveBeenCalledWith(
      "create_reporting_project",
      { fund_id: "fund-1", name: "Q1 Cash Flow" },
      expect.objectContaining({
        agentId: "agent-1",
        delegatedUserId: "admin-1",
        invocationId: "invocation-1",
      }),
    )
    expect(mockTouchPrincipal).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent_tool_invoked",
        entityType: "agent_tool_invocation",
      }),
    )
  })

  test("dry run records intent without dispatching the reporting tool", async () => {
    const result = await AgentToolExecutionService.executeTool({
      agentPrincipalId: "agent-1",
      toolName: "create_reporting_project",
      input: { fund_id: "fund-1" },
      dryRun: true,
      actorId: "admin-1",
    })

    expect(result.invocation.status).toBe("dry_run")
    expect(result.result).toEqual(
      expect.objectContaining({
        dry_run: true,
        finalizing_actions_allowed: false,
      }),
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockTouchPrincipal).not.toHaveBeenCalled()
  })

  test("rejects missing scopes and disallowed funds before creating an invocation", async () => {
    mockRequireActivePrincipal.mockResolvedValueOnce(principal({ scopes_json: ["report:read"] }))

    await expect(
      AgentToolExecutionService.executeTool({
        agentPrincipalId: "agent-1",
        toolName: "create_reporting_project",
        input: { fund_id: "fund-1" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 })

    mockRequireActivePrincipal.mockResolvedValueOnce(principal({ allowed_portfolio_ids_json: ["fund-2"] }))

    await expect(
      AgentToolExecutionService.executeTool({
        agentPrincipalId: "agent-1",
        toolName: "create_reporting_project",
        input: { fund_id: "fund-1" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 })

    expect(mockInvocationCreate).not.toHaveBeenCalled()
  })

  test("replays completed idempotent invocations and rejects changed payloads", async () => {
    let firstInvocation
    mockInvocationCreate.mockImplementationOnce(async (payload) => {
      firstInvocation = invocationRecord({ ...payload, id: "invocation-1" })
      return firstInvocation
    })

    await AgentToolExecutionService.executeTool({
      agentPrincipalId: "agent-1",
      toolName: "create_reporting_project",
      input: { fund_id: "fund-1", name: "Q1 Cash Flow" },
      idempotencyKey: "idem-1",
      actorId: "admin-1",
    })

    mockInvocationFindOne.mockResolvedValueOnce(firstInvocation)
    const replay = await AgentToolExecutionService.executeTool({
      agentPrincipalId: "agent-1",
      toolName: "create_reporting_project",
      input: { name: "Q1 Cash Flow", fund_id: "fund-1" },
      idempotencyKey: "idem-1",
      actorId: "admin-1",
    })

    expect(replay.idempotentReplay).toBe(true)
    expect(replay.result).toEqual({ id: "project-1", status: "draft" })

    mockInvocationFindOne.mockResolvedValueOnce(firstInvocation)
    await expect(
      AgentToolExecutionService.executeTool({
        agentPrincipalId: "agent-1",
        toolName: "create_reporting_project",
        input: { fund_id: "fund-1", name: "Changed Name" },
        idempotencyKey: "idem-1",
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
