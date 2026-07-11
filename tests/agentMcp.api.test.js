const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")
const config = require("../src/config/app")

const mockAuthenticateApiKey = jest.fn()
const mockHandlePayload = jest.fn()

jest.mock("../src/modules/agent-tools/services/agentPrincipal.service", () => ({
  authenticateApiKey: (...args) => mockAuthenticateApiKey(...args),
}))

jest.mock("../src/modules/agent-tools/services/agentMcp.service", () => ({
  handlePayload: (...args) => mockHandlePayload(...args),
}))

const agentMcpRoutes = require("../src/modules/agent-tools/routes/agentMcp.routes")

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use("/mcp", agentMcpRoutes)
  app.use(errorHandler)
  return app
}

describe("Agent MCP API", () => {
  let app
  const originalAllowedOrigins = config.agentMcp.allowedOrigins
  const originalRateLimitMax = config.agentMcp.rateLimitMaxRequests
  const originalRateLimitWindow = config.agentMcp.rateLimitWindowMs

  beforeEach(() => {
    jest.clearAllMocks()
    app = buildApp()
    config.agentMcp.allowedOrigins = ["https://agents.example.com"]
    config.agentMcp.rateLimitMaxRequests = 120
    config.agentMcp.rateLimitWindowMs = 60000
    mockAuthenticateApiKey.mockResolvedValue({
      id: `agent-${Date.now()}-${Math.random()}`,
      created_by: "admin-1",
      scopes_json: ["reporting_project:create"],
    })
    mockHandlePayload.mockResolvedValue({
      statusCode: 200,
      body: {
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: { tools: { listChanged: false } } },
      },
    })
  })

  afterAll(() => {
    config.agentMcp.allowedOrigins = originalAllowedOrigins
    config.agentMcp.rateLimitMaxRequests = originalRateLimitMax
    config.agentMcp.rateLimitWindowMs = originalRateLimitWindow
  })

  test("accepts authenticated MCP POST requests and forwards idempotency metadata", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .set("Origin", "https://agents.example.com")
      .set("idempotency-key", "idem-1")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" })

    expect(response.status).toBe(200)
    expect(response.headers["mcp-protocol-version"]).toBe(config.agentMcp.protocolVersion)
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith({ apiKey: "arp_test_secret" })
    expect(mockHandlePayload).toHaveBeenCalledWith(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      expect.objectContaining({
        agentPrincipal: expect.objectContaining({ created_by: "admin-1" }),
        idempotencyKey: "idem-1",
      }),
    )
  })

  test("full app mounts MCP before admin JWT-protected catch-all API routes", async () => {
    const fullApp = require("../src/app")

    const response = await request(fullApp)
      .post("/api/v1/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" })

    expect(response.status).toBe(200)
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith({ apiKey: "arp_test_secret" })
  })

  test("rejects disallowed browser origins before authentication", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .set("Origin", "https://evil.example.com")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" })

    expect(response.status).toBe(403)
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled()
  })

  test("requires an agent API key", async () => {
    mockAuthenticateApiKey.mockRejectedValueOnce(Object.assign(new Error("Agent API key is required"), {
      statusCode: 401,
      status: "fail",
    }))

    const response = await request(app)
      .post("/mcp")
      .set("Origin", "https://agents.example.com")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" })

    expect(response.status).toBe(401)
  })

  test("rate limits by authenticated agent principal", async () => {
    config.agentMcp.rateLimitMaxRequests = 1
    config.agentMcp.rateLimitWindowMs = 60000
    mockAuthenticateApiKey.mockResolvedValue({
      id: "rate-limited-agent",
      created_by: "admin-1",
      scopes_json: ["reporting_project:create"],
    })

    const first = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .set("Origin", "https://agents.example.com")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize" })
    const second = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .set("Origin", "https://agents.example.com")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" })

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })

  test("does not provide a server-initiated SSE stream", async () => {
    const response = await request(app)
      .get("/mcp")
      .set("Authorization", "Bearer arp_test_secret")
      .set("Origin", "https://agents.example.com")

    expect(response.status).toBe(405)
    expect(response.headers.allow).toBe("POST")
  })
})
