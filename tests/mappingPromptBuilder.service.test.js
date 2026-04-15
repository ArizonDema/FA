const MappingPromptBuilder = require("../src/modules/mappings/services/mappingPromptBuilder.service")

describe("MappingPromptBuilder", () => {
  test("builds a compact structured prompt for one row", () => {
    const result = MappingPromptBuilder.buildRowAssistancePrompt({
      row: {
        id: "row-1",
        label: "Management fee accrual",
        row_type: "data_row",
        section_name: "Operating Activities",
        is_formula: false,
      },
      deterministicSuggestions: [
        {
          semanticConceptKey: "management_fees",
          semanticConceptLabel: "Management Fees",
          confidenceScore: 0.72,
          rank: 1,
        },
      ],
      candidateConcepts: [
        {
          stableKey: "management_fees",
          label: "Management Fees",
          description: "Management fee expense.",
          category: "expense",
          statementType: "pnl",
          synonyms: ["management fee"],
          examples: ["Management fees"],
        },
      ],
      additionalConcepts: [
        {
          stableKey: "accrued_expenses",
          label: "Accrued Expenses",
          description: "Accrued operating expenses.",
          category: "payable_receivable",
          statementType: "balance_sheet",
          synonyms: ["expense accruals"],
          examples: ["Accrued expenses"],
        },
      ],
      neighboringLabels: {
        previous: "Operating Activities",
        next: "Administration fees",
      },
    })

    expect(result.promptVersion).toBeDefined()
    expect(result.requestPayload.row.rowId).toBeUndefined()
    expect(result.requestPayload.row.label).toBe("Management fee accrual")
    expect(result.requestPayload.deterministicCandidates[0].semanticConceptKey).toBe("management_fees")
    expect(result.requestPayload.additionalEligibleConcepts[0].semanticConceptKey).toBe("accrued_expenses")
    expect(result.messages[0].content).toContain("Return ONLY strict JSON")
    expect(result.messages[1].content).toContain('"rowId":"row-1"')
  })
})
