const https = require("https")
const { EventEmitter } = require("events")

const mockConfig = {
  mappingAssistance: {
    provider: "ollama",
    model: "gpt-oss:20b",
    modelCandidates: [],
    baseUrl: "https://ollama.com",
    apiKey: "mapping-cloud-key",
    chatPath: "/api/chat",
    timeoutMs: 1000,
    maxAttempts: 1,
    keepAlive: "10m",
    temperature: 0,
    numPredict: 600,
    think: false,
    forceJsonOutput: true,
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    apiKey: "ollama-cloud-key",
    model: "qwen3:14b",
    modelCandidates: [],
    chatPath: "/api/chat",
    timeoutMs: 1000,
    maxAttempts: 1,
    keepAlive: "10m",
    think: false,
  },
}

jest.mock("../src/config/app", () => mockConfig)
jest.mock("../src/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}))
jest.mock("../src/services/cashFlowTemplateIngestion.service", () => ({
  computeTemplateHash: jest.fn(),
  ingestTemplateSchema: jest.fn(),
  checkOllamaHealth: jest.fn(),
}))

const LlmOrchestratorService = require("../src/modules/llm/services/llmOrchestrator.service")

function mockJsonResponse(payload, { statusCode = 200, capture = null } = {}) {
  return (options, callback) => {
    if (capture) capture.options = options
    const handlers = {}
    const request = {
      setTimeout() {
        return request
      },
      on(event, handler) {
        handlers[event] = handler
        return request
      },
      write: jest.fn((body) => {
        if (capture) capture.body = body
      }),
      end: jest.fn(() => {
        const response = new EventEmitter()
        response.statusCode = statusCode
        response.headers = {}
        if (typeof callback === "function") callback(response)
        response.emit("data", Buffer.from(JSON.stringify(payload)))
        response.emit("end")
      }),
      destroy(error) {
        if (typeof handlers.error === "function") handlers.error(error)
      },
    }
    return request
  }
}

describe("LlmOrchestratorService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.mappingAssistance.baseUrl = "https://ollama.com"
    mockConfig.mappingAssistance.apiKey = "mapping-cloud-key"
    mockConfig.mappingAssistance.model = "gpt-oss:20b"
    mockConfig.mappingAssistance.modelCandidates = []
  })

  test("builds direct Ollama Cloud endpoints and auth headers", () => {
    const endpoint = LlmOrchestratorService.__test.buildOllamaEndpoint("https://ollama.com", "/api/chat")

    expect(endpoint).toBe("https://ollama.com/api/chat")
    expect(LlmOrchestratorService.__test.isOllamaCloudEndpoint(endpoint)).toBe(true)
    expect(
      LlmOrchestratorService.__test.buildOllamaAuthHeaders({
        endpoint,
        apiKey: "cloud-key",
      }),
    ).toEqual({ Authorization: "Bearer cloud-key" })
    expect(
      LlmOrchestratorService.__test.buildOllamaAuthHeaders({
        endpoint: "http://localhost:11434/api/chat",
        apiKey: "cloud-key",
      }),
    ).toEqual({})
  })

  test("passes mapping API key to direct Ollama Cloud requests", async () => {
    const capture = {}
    const requestSpy = jest.spyOn(https, "request").mockImplementation(
      mockJsonResponse(
        {
          model: "gpt-oss:20b",
          message: { content: "{\"accepted\":true}" },
          done: true,
        },
        { capture },
      ),
    )

    try {
      const result = await LlmOrchestratorService.requestStructuredJson({
        messages: [{ role: "user", content: "Return JSON." }],
      })

      expect(result.parsed).toEqual({ accepted: true })
      expect(capture.options.headers.Authorization).toBe("Bearer mapping-cloud-key")
      expect(JSON.parse(capture.body).model).toBe("gpt-oss:20b")
    } finally {
      requestSpy.mockRestore()
    }
  })

  test("classifies Ollama Cloud auth, access, usage, and missing-model errors", () => {
    const endpoint = "https://ollama.com/api/chat"
    const classify = (statusCode, message = "request failed") =>
      LlmOrchestratorService.__test.classifyOllamaError(Object.assign(new Error(message), { statusCode }), {
        timeoutMs: 1000,
        endpoint,
        model: "gpt-oss:120b",
      })

    expect(classify(401).code).toBe("auth_required")
    expect(classify(401).reason).toContain("MAPPING_LLM_API_KEY")
    expect(classify(403).code).toBe("access_denied")
    expect(classify(429).code).toBe("usage_limited")
    expect(classify(404).reason).toContain("Ollama Cloud")
  })
})
