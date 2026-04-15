const mockFindTemplateByPk = jest.fn()
const mockFindTemplateVersion = jest.fn()
const mockFindRows = jest.fn()
const mockFindRowByPk = jest.fn()

jest.mock("../src/models", () => ({
  Template: {
    findByPk: (...args) => mockFindTemplateByPk(...args),
  },
  CashFlowTemplate: {
    findByPk: (...args) => mockFindTemplateByPk(...args),
  },
  TemplateVersion: {
    findOne: (...args) => mockFindTemplateVersion(...args),
  },
  TemplateRow: {
    findAll: (...args) => mockFindRows(...args),
    findByPk: (...args) => mockFindRowByPk(...args),
  },
}))

const mockDeterministicSuggestionService = {
  suggestTemplateVersionMappings: jest.fn(),
}
const mockConceptIndexService = {
  loadActiveConcepts: jest.fn(),
}
const mockPersistenceService = {
  replaceTemplateRowSuggestions: jest.fn(),
  getTemplateVersionSuggestions: jest.fn(),
  getTemplateRowSuggestions: jest.fn(),
}
const mockLlmOrchestratorService = {
  requestStructuredJson: jest.fn(),
}
const mockTraceService = {
  createPendingTrace: jest.fn(),
  markSuccess: jest.fn(),
  markFailure: jest.fn(),
}
const mockReliabilityService = {
  groupTemplateRowSuggestions: jest.fn(),
}

jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => mockDeterministicSuggestionService)
jest.mock("../src/modules/mappings/services/semanticConceptSearchIndex.service", () => mockConceptIndexService)
jest.mock("../src/modules/mappings/services/mappingSuggestionPersistence.service", () => mockPersistenceService)
jest.mock("../src/modules/llm/services/llmOrchestrator.service", () => mockLlmOrchestratorService)
jest.mock("../src/modules/mappings/services/llmTrace.service", () => mockTraceService)
jest.mock("../src/modules/mappings/services/mappingReliability.service", () => mockReliabilityService)

const LlmMappingAssistantService = require("../src/modules/mappings/services/llmMappingAssistant.service")

describe("LlmMappingAssistantService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindTemplateByPk.mockResolvedValue({ id: "template-1", portfolio_id: "fund-1" })
    mockFindTemplateVersion.mockResolvedValue({ id: "version-1", template_id: "template-1", portfolio_id: "fund-1" })
    mockFindRows.mockResolvedValue([
      {
        id: "row-1",
        label: "Management fee accrual",
        row_type: "data_row",
        section_name: "Operating Activities",
      },
    ])
    mockDeterministicSuggestionService.suggestTemplateVersionMappings.mockResolvedValue({
      summary: { rowsProcessed: 1 },
      suggestions: [
        {
          templateRow: { id: "row-1", label: "Management fee accrual", rowType: "data_row" },
          suggestions: [
            {
              semanticConceptId: "concept-1",
              semanticConceptKey: "management_fees",
              semanticConceptLabel: "Management Fees",
              confidenceScore: 0.71,
              rank: 1,
              rationale: "deterministic",
            },
          ],
        },
      ],
    })
    mockConceptIndexService.loadActiveConcepts.mockResolvedValue([
      {
        id: "concept-1",
        stableKey: "management_fees",
        label: "Management Fees",
        description: "Management fee expense.",
        category: "expense",
        statementType: "pnl",
        subcategory: "fees",
        synonyms: ["management fee"],
        examples: ["Management fees"],
        keyPhrase: "management fees",
        labelPhrase: "management fees",
        synonymPhrases: ["management fee"],
        examplePhrases: ["management fees"],
        auxiliaryPhrases: ["expense", "pnl"],
        searchablePhrases: ["management fees", "management fee"],
        searchableTokens: ["management", "fee"],
      },
    ])
    mockPersistenceService.replaceTemplateRowSuggestions.mockResolvedValue([])
    mockReliabilityService.groupTemplateRowSuggestions.mockResolvedValue([])
    mockTraceService.createPendingTrace.mockResolvedValue({ id: "trace-1" })
    mockTraceService.markSuccess.mockResolvedValue(undefined)
    mockTraceService.markFailure.mockResolvedValue(undefined)
  })

  test("falls back safely when the llm request fails", async () => {
    mockLlmOrchestratorService.requestStructuredJson.mockRejectedValue(
      Object.assign(new Error("timed out"), {
        failure_code: "timeout",
        failure_reason: "timed out",
      }),
    )

    const result = await LlmMappingAssistantService.assistTemplateVersionMappings({
      templateId: "template-1",
      versionId: "version-1",
      actorId: "admin-1",
    })

    expect(result.summary.rowsFailed).toBe(1)
    expect(result.summary.fallbackUsed).toBe(true)
    expect(result.suggestions).toEqual([])
    expect(mockTraceService.markFailure).toHaveBeenCalled()
    expect(mockPersistenceService.replaceTemplateRowSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "llm_assisted",
      }),
    )
  })
})
