const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockGetSystemHealth = jest.fn()
const mockGetStats = jest.fn()
const mockGetLlmHealth = jest.fn()

jest.mock("../src/modules/health/services/health.service", () => ({
  getSystemHealth: (...args) => mockGetSystemHealth(...args),
  getStats: (...args) => mockGetStats(...args),
}))

jest.mock("../src/modules/llm/services/llmOrchestrator.service", () => ({
  getHealth: (...args) => mockGetLlmHealth(...args),
}))

const systemRoutes = require("../src/routes/system.routes")

describe("system routes", () => {
  const app = express()
  app.use("/api/v1/system", systemRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSystemHealth.mockResolvedValue({
      status: "healthy",
      timestamp: new Date().toISOString(),
    })
    mockGetStats.mockResolvedValue({
      totalUsers: 1,
      totalInvestments: 1,
      totalFunds: 1,
      activeRounds: 1,
    })
  })

  test("returns 200 when llm health is ok", async () => {
    mockGetLlmHealth.mockResolvedValue({
      provider: "ollama",
      status: "ok",
      reachable: true,
      model_available: true,
      model: "qwen3:14b",
    })

    const response = await request(app).get("/api/v1/system/llm/health")

    expect(response.status).toBe(200)
    expect(response.body.status).toBe("success")
    expect(response.body.data.status).toBe("ok")
    expect(mockGetLlmHealth).toHaveBeenCalled()
  })

  test("returns 503 when llm health is degraded", async () => {
    mockGetLlmHealth.mockResolvedValue({
      provider: "ollama",
      status: "degraded",
      reachable: true,
      model_available: false,
      model: "qwen3:14b",
      failure_reason: 'Configured model "qwen3:14b" was not found in local Ollama',
    })

    const response = await request(app).get("/api/v1/system/llm/health")

    expect(response.status).toBe(503)
    expect(response.body.status).toBe("error")
    expect(response.body.data.status).toBe("degraded")
    expect(String(response.body.data.failure_reason || "").toLowerCase()).toContain("not found")
  })
})
