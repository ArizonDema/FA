const MappingSuggestionMergeService = require("../src/modules/mappings/services/mappingSuggestionMerge.service")

describe("MappingSuggestionMergeService", () => {
  test("keeps deterministic scoring primary while incorporating llm reasoning", () => {
    const result = MappingSuggestionMergeService.merge({
      row: { id: "row-1", label: "Net proceeds from investor subscriptions" },
      deterministicSuggestions: [
        {
          semanticConceptId: "concept-1",
          semanticConceptKey: "subscriptions",
          semanticConceptLabel: "Subscriptions",
          confidenceScore: 0.74,
          rank: 1,
          rationale: "deterministic",
        },
      ],
      llmResult: {
        rowId: "row-1",
        recommendedCandidates: [
          {
            semanticConceptKey: "subscriptions",
            rank: 1,
            llmScore: 0.94,
            reasoning: "Label explicitly references investor subscriptions.",
            evidence: ["subscriptions phrasing"],
          },
        ],
        ambiguities: [],
        needsHumanReview: false,
      },
      conceptLookup: new Map([
        [
          "subscriptions",
          {
            id: "concept-1",
            stableKey: "subscriptions",
            label: "Subscriptions",
          },
        ],
      ]),
    })

    expect(result.mergedSuggestions[0].semanticConceptKey).toBe("subscriptions")
    expect(result.mergedSuggestions[0].confidenceScore).toBeGreaterThan(0.75)
    expect(result.assessment.needsHumanReview).toBe(false)
  })

  test("flags disagreement for human review when llm and deterministic strongly diverge", () => {
    const result = MappingSuggestionMergeService.merge({
      row: { id: "row-2", label: "Cash flows from financing activities" },
      deterministicSuggestions: [
        {
          semanticConceptId: "concept-1",
          semanticConceptKey: "operating_cash_flow",
          semanticConceptLabel: "Operating Cash Flow",
          confidenceScore: 0.66,
          rank: 1,
        },
      ],
      llmResult: {
        rowId: "row-2",
        recommendedCandidates: [
          {
            semanticConceptKey: "financing_cash_flow",
            rank: 1,
            llmScore: 0.88,
            reasoning: "Financing section phrasing is explicit.",
            evidence: ["financing activities"],
          },
        ],
        ambiguities: [],
        needsHumanReview: false,
      },
      conceptLookup: new Map([
        ["operating_cash_flow", { id: "concept-1", stableKey: "operating_cash_flow", label: "Operating Cash Flow" }],
        ["financing_cash_flow", { id: "concept-2", stableKey: "financing_cash_flow", label: "Financing Cash Flow" }],
      ]),
    })

    expect(result.assessment.disagreementFlag).toBe(true)
    expect(result.assessment.needsHumanReview).toBe(true)
  })
})
