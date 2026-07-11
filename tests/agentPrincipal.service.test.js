const mockAgentPrincipalCreate = jest.fn()
const mockAgentPrincipalFindAll = jest.fn()
const mockAgentPrincipalFindByPk = jest.fn()
const mockAgentPrincipalFindOne = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  AgentPrincipal: {
    create: (...args) => mockAgentPrincipalCreate(...args),
    findAll: (...args) => mockAgentPrincipalFindAll(...args),
    findByPk: (...args) => mockAgentPrincipalFindByPk(...args),
    findOne: (...args) => mockAgentPrincipalFindOne(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const AgentPrincipalService = require("../src/modules/agent-tools/services/agentPrincipal.service")

function principalRecord(values) {
  return {
    id: "agent-1",
    name: "Reporting Agent",
    status: "active",
    scopes_json: ["reporting_project:read"],
    allowed_portfolio_ids_json: [],
    allowed_reporting_project_ids_json: [],
    api_key_prefix: null,
    api_key_hash: null,
    created_by: "admin-1",
    ...values,
    toJSON() {
      return { ...this }
    },
  }
}

describe("AgentPrincipalService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockAgentPrincipalFindOne.mockResolvedValue(null)
  })

  test("creates a scoped active agent principal and never exposes the API key hash", async () => {
    mockAgentPrincipalCreate.mockImplementation(async (payload) =>
      principalRecord({
        ...payload,
        id: "agent-1",
        api_key_prefix: payload.api_key_prefix,
        api_key_hash: payload.api_key_hash,
      }),
    )

    const result = await AgentPrincipalService.createPrincipal({
      actorId: "admin-1",
      fields: {
        name: "Reporting Agent",
        scopes: "reporting_project:create,report:read",
        allowed_portfolio_ids: ["fund-1"],
        issue_api_key: true,
      },
    })

    expect(result.principal.name).toBe("Reporting Agent")
    expect(result.principal.api_key_hash).toBeUndefined()
    expect(result.principal.scopes_json).toEqual(["reporting_project:create", "report:read"])
    expect(result.principal.allowed_portfolio_ids_json).toEqual(["fund-1"])
    expect(result.apiKey).toMatch(/^arp_[a-f0-9]{10}_[A-Za-z0-9_-]+$/)
    expect(mockAgentPrincipalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: "admin-1",
        api_key_hash: expect.any(String),
      }),
    )
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent_principal_created",
        entityType: "agent_principal",
      }),
    )
  })

  test("defaults new principals to read-only reporting scopes", async () => {
    mockAgentPrincipalCreate.mockImplementation(async (payload) => principalRecord(payload))

    const result = await AgentPrincipalService.createPrincipal({
      actorId: "admin-1",
      fields: { name: "Read Only Agent" },
    })

    expect(result.apiKey).toBeNull()
    expect(result.principal.scopes_json).toEqual([
      "reporting_project:read",
      "mapping:read",
      "report:read",
      "audit:read",
    ])
  })

  test("provisions regular-use no-context reporting principals with only draft/reporting scopes", async () => {
    mockAgentPrincipalCreate.mockImplementation(async (payload) => principalRecord(payload))

    const result = await AgentPrincipalService.createPrincipal({
      actorId: "admin-1",
      fields: {
        name: "No Context Cash Flow Eval Agent",
        scope_profile: "no_context_cash_flow_eval",
        allowed_portfolio_ids: ["fund-1"],
        issue_api_key: true,
      },
    })

    expect(result.principal.scopes_json).toEqual(AgentPrincipalService.regularUseReportingScopes())
    expect(result.principal.scopes_json).not.toContain("report:request_export")
    expect(result.principal.scopes_json).not.toContain("workflow:start")
    expect(result.principal.allowed_portfolio_ids_json).toEqual(["fund-1"])
    expect(mockAgentPrincipalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes_json: [
          "reporting_project:create",
          "reporting_project:read",
          "source:attach",
          "source:analyze",
          "template:analyze",
          "mapping:read",
          "mapping:suggest",
          "report:run_draft",
          "report:validate",
          "report:read",
          "audit:read",
        ],
      }),
    )
  })

  test("lists and reads principals without exposing key hashes", async () => {
    mockAgentPrincipalFindAll.mockResolvedValue([
      principalRecord({ id: "agent-1", api_key_hash: "secret-hash" }),
      principalRecord({ id: "agent-2", name: "Second Agent" }),
    ])
    mockAgentPrincipalFindByPk.mockResolvedValue(principalRecord({ api_key_hash: "secret-hash" }))

    const list = await AgentPrincipalService.listPrincipals({ status: "active" })
    const read = await AgentPrincipalService.getPrincipal({ principalId: "agent-1" })

    expect(mockAgentPrincipalFindAll).toHaveBeenCalledWith({
      where: { status: "active" },
      order: [["created_at", "DESC"]],
    })
    expect(list).toHaveLength(2)
    expect(list[0].api_key_hash).toBeUndefined()
    expect(read.api_key_hash).toBeUndefined()
  })

  test("rejects missing names and inactive principals", async () => {
    await expect(
      AgentPrincipalService.createPrincipal({
        fields: { name: " " },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    mockAgentPrincipalFindByPk.mockResolvedValue(principalRecord({ status: "disabled" }))
    await expect(
      AgentPrincipalService.requireActivePrincipal({ principalId: "agent-1" }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  test("authenticates issued API keys by prefix and hash", async () => {
    let storedPrincipal = null
    mockAgentPrincipalCreate.mockImplementation(async (payload) => {
      storedPrincipal = principalRecord({
        ...payload,
        id: "agent-1",
      })
      return storedPrincipal
    })

    const result = await AgentPrincipalService.createPrincipal({
      actorId: "admin-1",
      fields: {
        name: "External Agent",
        issue_api_key: true,
      },
    })

    mockAgentPrincipalFindOne.mockResolvedValue(storedPrincipal)
    const principal = await AgentPrincipalService.authenticateApiKey({
      apiKey: result.apiKey,
    })

    expect(principal.id).toBe("agent-1")
    expect(mockAgentPrincipalFindOne).toHaveBeenCalledWith({
      where: { api_key_prefix: storedPrincipal.api_key_prefix },
    })
  })

  test("rejects invalid and inactive API keys", async () => {
    await expect(AgentPrincipalService.authenticateApiKey({ apiKey: "" })).rejects.toMatchObject({
      statusCode: 401,
    })

    mockAgentPrincipalFindOne.mockResolvedValue(
      principalRecord({
        status: "disabled",
        api_key_prefix: "arp_abc123",
        api_key_hash: require("crypto").createHash("sha256").update("arp_abc123_secret").digest("hex"),
      }),
    )

    await expect(
      AgentPrincipalService.authenticateApiKey({ apiKey: "arp_abc123_secret" }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
