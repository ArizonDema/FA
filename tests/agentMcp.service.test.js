const mockGetToolCatalog = jest.fn()
const mockExecuteTool = jest.fn()

jest.mock("../src/modules/agent-tools/services/agentToolExecution.service", () => ({
  getToolCatalog: (...args) => mockGetToolCatalog(...args),
  executeTool: (...args) => mockExecuteTool(...args),
}))

const AgentMcpService = require("../src/modules/agent-tools/services/agentMcp.service")

function principal(overrides = {}) {
  return {
    id: "agent-1",
    created_by: "admin-1",
    scopes_json: ["reporting_project:create", "report:request_export"],
    ...overrides,
  }
}

describe("AgentMcpService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToolCatalog.mockReturnValue({
      create_reporting_project: {
        scope: "reporting_project:create",
        mutability: "draft_write",
        description: "Create a draft reporting project shell.",
        required: ["fund_id"],
      },
      get_audit_trail: {
        scope: "audit:read",
        mutability: "read_only",
        description: "Read audit events.",
        required: [],
      },
      export_report: {
        scope: "report:request_export",
        mutability: "approval_request",
        description: "Request human approval for final export.",
        required: ["run_id"],
      },
      start_agent_workflow: {
        scope: "workflow:start",
        mutability: "draft_write",
        description: "Start an agent workflow.",
        required: ["workflow_type"],
      },
      list_external_integrations: {
        scope: "integration:read",
        mutability: "read_only",
        description: "List integrations.",
        required: ["fund_id"],
      },
    })
    mockExecuteTool.mockResolvedValue({
      invocation: { id: "invocation-1", status: "completed" },
      result: { id: "project-1", status: "draft" },
      idempotentReplay: false,
    })
  })

  test("initializes as a tools-capable MCP server", async () => {
    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      { agentPrincipal: principal() },
    )

    expect(result.statusCode).toBe(200)
    expect(result.body.result.capabilities.tools).toEqual({ listChanged: false })
    expect(result.body.result.serverInfo.name).toBe("css-invest-agent-reporting")
  })

  test("lists only tools allowed by the agent principal scopes", async () => {
    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal() },
    )

    expect(result.body.result.tools.map((tool) => tool.name)).toEqual([
      "create_reporting_project",
      "export_report",
    ])
    expect(result.body.result.tools[0].inputSchema.required).toEqual(["fund_id"])
  })

  test("exposes workflow tools to principals with workflow scopes", async () => {
    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal({ scopes_json: ["workflow:start"] }) },
    )

    expect(result.body.result.tools.map((tool) => tool.name)).toEqual(["start_agent_workflow"])
    expect(result.body.result.tools[0].inputSchema.required).toEqual(["workflow_type"])
  })

  test("exposes integration tools to principals with integration scopes", async () => {
    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal({ scopes_json: ["integration:read"] }) },
    )

    expect(result.body.result.tools.map((tool) => tool.name)).toEqual(["list_external_integrations"])
    expect(result.body.result.tools[0].inputSchema.required).toEqual(["fund_id"])
  })

  test("calls tools through the execution service with idempotency and dry-run metadata", async () => {
    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "create_reporting_project",
          arguments: { fund_id: "fund-1", name: "Q1 Cash Flow" },
          _meta: {
            idempotencyKey: "idem-1",
            dryRun: true,
          },
        },
      },
      { agentPrincipal: principal() },
    )

    expect(result.body.result.isError).toBe(false)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPrincipalId: "agent-1",
        toolName: "create_reporting_project",
        input: { fund_id: "fund-1", name: "Q1 Cash Flow" },
        idempotencyKey: "idem-1",
        dryRun: true,
        actorId: "admin-1",
      }),
    )
  })

  test("documents workbook xlsx run_report inputs in the MCP tool schema", async () => {
    mockGetToolCatalog.mockReturnValueOnce({
      run_report: {
        scope: "report:run_draft",
        mutability: "draft_write",
        description: "Run a draft report.",
        required: ["fund_id"],
      },
    })

    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal({ scopes_json: ["report:run_draft"] }) },
    )

    const runReport = result.body.result.tools[0]
    expect(runReport.name).toBe("run_report")
    expect(runReport.inputSchema.properties.output_format.enum).toContain("xlsx")
    expect(runReport.inputSchema.properties.tb_repository_version_id.type).toBe("string")
    expect(runReport.inputSchema.properties.gl_repository_version_id.type).toBe("string")
  })

  test("documents no-context reporting input discovery as a read-only MCP tool", async () => {
    mockGetToolCatalog.mockReturnValueOnce({
      list_reporting_inputs: {
        scope: "reporting_project:read",
        mutability: "read_only",
        description: "List public fund reporting inputs.",
        required: ["fund_id"],
      },
    })

    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal({ scopes_json: ["reporting_project:read"] }) },
    )

    const listInputs = result.body.result.tools[0]
    expect(listInputs.name).toBe("list_reporting_inputs")
    expect(listInputs.inputSchema.additionalProperties).toBe(false)
    expect(listInputs.inputSchema.required).toEqual(["fund_id"])
    expect(listInputs.annotations).toEqual(
      expect.objectContaining({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      }),
    )
  })

  test("documents dedicated draft cash-flow extraction inputs in the MCP tool schema", async () => {
    mockGetToolCatalog.mockReturnValueOnce({
      run_cash_flow_extraction: {
        scope: "report:run_draft",
        mutability: "draft_write",
        description: "Run a draft cash-flow workbook extraction.",
        required: ["fund_id"],
      },
    })

    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "tools",
        method: "tools/list",
      },
      { agentPrincipal: principal({ scopes_json: ["report:run_draft"] }) },
    )

    const extractionTool = result.body.result.tools[0]
    expect(extractionTool.name).toBe("run_cash_flow_extraction")
    expect(extractionTool.inputSchema.required).toEqual(["fund_id", "project_id"])
    expect(extractionTool.inputSchema.properties.project_id.type).toBe("string")
    expect(extractionTool.inputSchema.properties.template_id.type).toBe("string")
    expect(extractionTool.inputSchema.properties.tb_repository_version_id.type).toBe("string")
    expect(extractionTool.inputSchema.properties.gl_repository_version_id.type).toBe("string")
    expect(extractionTool.inputSchema.properties.run_validation.type).toBe("boolean")
  })

  test("returns tool execution failures as MCP tool errors", async () => {
    mockExecuteTool.mockRejectedValueOnce(Object.assign(new Error("Agent principal lacks required scope"), {
      statusCode: 403,
    }))

    const result = await AgentMcpService.handlePayload(
      {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "create_reporting_project",
          arguments: { fund_id: "fund-1" },
        },
      },
      { agentPrincipal: principal() },
    )

    expect(result.body.result.isError).toBe(true)
    expect(result.body.result.content[0].text).toContain("Agent principal lacks required scope")
  })

  test("accepts notifications and response-only payloads with 202", async () => {
    const notification = await AgentMcpService.handlePayload(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { agentPrincipal: principal() },
    )
    const responseOnly = await AgentMcpService.handlePayload(
      { jsonrpc: "2.0", id: "client-response", result: {} },
      { agentPrincipal: principal() },
    )

    expect(notification.statusCode).toBe(202)
    expect(responseOnly.statusCode).toBe(202)
  })
})
