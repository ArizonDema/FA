const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockMappingService = {
  listAccountMappings: jest.fn(),
  createAccountMapping: jest.fn(),
  updateAccountMappingStatus: jest.fn(),
  listTemplateRowMappings: jest.fn(),
  createTemplateRowMapping: jest.fn(),
  updateTemplateRowMappingStatus: jest.fn(),
}

const mockMappingSuggestionService = {
  getTemplateRowSuggestions: jest.fn(),
  suggestAccountMappings: jest.fn(),
  getAccountSuggestions: jest.fn(),
}

const mockLlmMappingAssistantService = {
  getTemplateRowAssistedSuggestions: jest.fn(),
}

const mockLlmTraceService = {
  getTraceBySuggestionId: jest.fn(),
}

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-1", role: "admin" }
    next()
  },
  authorize:
    () =>
    (req, res, next) => {
      next()
    },
}))

jest.mock("../src/modules/mappings/services/mapping.service", () => mockMappingService)
jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => mockMappingSuggestionService)
jest.mock("../src/modules/mappings/services/llmMappingAssistant.service", () => mockLlmMappingAssistantService)
jest.mock("../src/modules/mappings/services/llmTrace.service", () => mockLlmTraceService)

const mappingRoutes = require("../src/modules/mappings/routes/mappings.routes")

describe("Mapping suggestion API", () => {
  const app = express()
  app.use(express.json())
  app.use("/mappings", mappingRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockMappingSuggestionService.getTemplateRowSuggestions.mockResolvedValue({
      row: { id: "row-1", label: "Management Fees", row_type: "data_row" },
      assessment: {
        semanticConfidence: 0.94,
        accountCoverageScore: 0,
        evidenceScore: 0,
        reportReliabilityStatus: "semantically_matched_ungrounded",
        humanReviewRequired: true,
        reviewReasons: ["no_account_grounding"],
      },
      suggestions: [
        {
          semanticConceptKey: "management_fees",
          confidenceScore: 0.94,
          semanticConfidence: 0.94,
          accountCoverageScore: 0,
          evidenceScore: 0,
          reportReliabilityStatus: "semantically_matched_ungrounded",
          humanReviewRequired: true,
          rank: 1,
        },
      ],
    })
    mockMappingSuggestionService.suggestAccountMappings.mockResolvedValue({
      summary: {
        accountsProcessed: 2,
        accountsSkipped: 0,
        suggestionsGenerated: 4,
      },
      suggestions: [
        {
          accountId: "account-1",
          semanticConceptKey: "management_fees",
          confidenceScore: 0.88,
          rank: 1,
        },
      ],
    })
    mockMappingSuggestionService.getAccountSuggestions.mockResolvedValue({
      account: { id: "account-1", name: "Management fee expense" },
      suggestions: [
        {
          semanticConceptKey: "management_fees",
          confidenceScore: 0.88,
          rank: 1,
        },
      ],
    })
    mockLlmMappingAssistantService.getTemplateRowAssistedSuggestions.mockResolvedValue({
      row: { id: "row-1", label: "Management fee accrual", row_type: "data_row" },
      assessment: {
        semanticConfidence: 0.79,
        accountCoverageScore: 0,
        evidenceScore: 0,
        reportReliabilityStatus: "semantically_matched_ungrounded",
        humanReviewRequired: true,
        needsHumanReview: true,
        disagreementFlag: false,
        reviewReasons: ["no_account_grounding"],
      },
      suggestions: [
        {
          semanticConceptKey: "management_fees",
          confidenceScore: 0.79,
          llmScore: 0.91,
          semanticConfidence: 0.79,
          accountCoverageScore: 0,
          evidenceScore: 0,
          reportReliabilityStatus: "semantically_matched_ungrounded",
          humanReviewRequired: true,
          rank: 1,
        },
      ],
    })
    mockLlmTraceService.getTraceBySuggestionId.mockResolvedValue({
      suggestionId: "suggestion-1",
      traceId: "trace-1",
      model: "qwen3:14b",
      status: "success",
      parsedResponse: {
        rowId: "row-1",
      },
    })
  })

  test("retrieves template row suggestions", async () => {
    const response = await request(app).get("/mappings/template-rows/row-1/suggestions")

    expect(response.status).toBe(200)
    expect(response.body.data.template_row.label).toBe("Management Fees")
    expect(response.body.data.suggestions[0].semanticConceptKey).toBe("management_fees")
    expect(response.body.data.assessment.humanReviewRequired).toBe(true)
    expect(response.body.data.suggestions[0].reportReliabilityStatus).toBe("semantically_matched_ungrounded")
  })

  test("generates account suggestions", async () => {
    const response = await request(app).post("/mappings/accounts/suggest").send({
      portfolio_id: "fund-1",
      account_ids: ["account-1", "account-2"],
    })

    expect(response.status).toBe(200)
    expect(response.body.data.summary.accountsProcessed).toBe(2)
    expect(response.body.data.suggestions[0].semanticConceptKey).toBe("management_fees")
  })

  test("retrieves account suggestions", async () => {
    const response = await request(app).get("/mappings/accounts/account-1/suggestions")

    expect(response.status).toBe(200)
    expect(response.body.data.account.name).toBe("Management fee expense")
    expect(response.body.data.suggestions[0].rank).toBe(1)
  })

  test("retrieves llm-assisted template row suggestions", async () => {
    const response = await request(app).get("/mappings/template-rows/row-1/llm-mapping-suggestions")

    expect(response.status).toBe(200)
    expect(response.body.data.template_row.label).toBe("Management fee accrual")
    expect(response.body.data.assessment.humanReviewRequired).toBe(true)
    expect(response.body.data.suggestions[0].llmScore).toBe(0.91)
  })

  test("retrieves suggestion trace", async () => {
    const response = await request(app).get("/mappings/suggestions/suggestion-1/trace")

    expect(response.status).toBe(200)
    expect(response.body.data.trace.traceId).toBe("trace-1")
    expect(response.body.data.trace.model).toBe("qwen3:14b")
  })
})
