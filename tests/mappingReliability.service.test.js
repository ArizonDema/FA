const mockAccountSemanticMappingFindAll = jest.fn()

jest.mock("../src/models", () => ({
  AccountSemanticMapping: {
    findAll: (...args) => mockAccountSemanticMappingFindAll(...args),
  },
  Account: {},
}))

const MappingReliabilityService = require("../src/modules/mappings/services/mappingReliability.service")

describe("MappingReliabilityService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccountSemanticMappingFindAll.mockResolvedValue([])
  })

  test("Case A: high semantic confidence with zero account coverage stays ungrounded and requires review", async () => {
    const grouped = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: "fund-1",
      suggestions: [
        {
          id: "suggestion-1",
          fundId: "fund-1",
          templateRowId: "row-1",
          semanticConceptId: "concept-1",
          semanticConceptKey: "management_fees",
          semanticConceptLabel: "Management Fees",
          confidenceScore: 0.99,
          rank: 1,
          source: "deterministic_engine",
          templateRow: { id: "row-1", label: "Management Fees", rowOrder: 1 },
          metadata: {},
        },
      ],
    })

    expect(grouped[0].assessment.semanticConfidence).toBe(0.99)
    expect(grouped[0].assessment.accountCoverageScore).toBe(0)
    expect(grouped[0].assessment.reportReliabilityStatus).toBe("semantically_matched_ungrounded")
    expect(grouped[0].assessment.humanReviewRequired).toBe(true)
    expect(grouped[0].assessment.reviewReasons).toContain("no_account_grounding")
  })

  test("Case B: medium semantic confidence with strong approved account grounding can be grounded", async () => {
    mockAccountSemanticMappingFindAll.mockResolvedValue([
      { status: "approved", semantic_concept_id: "concept-1", account: { id: "a1", code: "4000", name: "Mgmt Fee" } },
      { status: "approved", semantic_concept_id: "concept-1", account: { id: "a2", code: "4001", name: "Mgmt Fee 2" } },
      { status: "approved", semantic_concept_id: "concept-1", account: { id: "a3", code: "4002", name: "Mgmt Fee 3" } },
    ])

    const grouped = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: "fund-1",
      suggestions: [
        {
          id: "suggestion-1",
          fundId: "fund-1",
          templateRowId: "row-1",
          semanticConceptId: "concept-1",
          semanticConceptKey: "management_fees",
          semanticConceptLabel: "Management Fees",
          confidenceScore: 0.61,
          rank: 1,
          source: "deterministic_engine",
          templateRow: { id: "row-1", label: "Management Fees", rowOrder: 1 },
          metadata: {},
        },
      ],
    })

    expect(grouped[0].assessment.accountCoverageScore).toBeGreaterThan(0.9)
    expect(grouped[0].assessment.evidenceScore).toBeGreaterThan(0.85)
    expect(["grounded", "partially_grounded"]).toContain(grouped[0].assessment.reportReliabilityStatus)
    expect(grouped[0].assessment.humanReviewRequired).toBe(false)
  })

  test("Case C: fallback-derived result forces review even with strong semantic confidence", () => {
    const enriched = MappingReliabilityService.enrichSuggestion({
      suggestion: {
        semanticConceptId: "concept-1",
        semanticConceptKey: "subscriptions",
        confidenceScore: 0.96,
        rank: 1,
      },
      explicitAssessment: {
        fallbackUsed: true,
        weakNumericSupport: true,
      },
    })

    expect(enriched.reportReliabilityStatus).toBe("requires_review")
    expect(enriched.humanReviewRequired).toBe(true)
    expect(enriched.reviewReasons).toEqual(
      expect.arrayContaining(["fallback_derived_result", "weak_numeric_support"]),
    )
  })

  test("Case E: conflicting signals are surfaced honestly", async () => {
    mockAccountSemanticMappingFindAll.mockResolvedValue([
      { status: "approved", semantic_concept_id: "concept-1", account: { id: "a1", code: "5000", name: "Ops" } },
    ])

    const grouped = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: "fund-1",
      suggestions: [
        {
          id: "suggestion-1",
          fundId: "fund-1",
          templateRowId: "row-1",
          semanticConceptId: "concept-1",
          semanticConceptKey: "operating_cash_flow",
          confidenceScore: 0.88,
          rank: 1,
          source: "llm_assisted",
          templateRow: { id: "row-1", label: "Cash flows from financing activities", rowOrder: 1 },
          metadata: {
            rowAssessment: {
              disagreementFlag: true,
            },
          },
        },
      ],
    })

    expect(grouped[0].assessment.reportReliabilityStatus).toBe("conflicting")
    expect(grouped[0].assessment.humanReviewRequired).toBe(true)
    expect(grouped[0].assessment.reviewReasons).toContain("conflicting_signals")
  })
})
