const MappingResponseParserService = require("../src/modules/mappings/services/mappingResponseParser.service")

describe("MappingResponseParserService", () => {
  test("parses a valid structured mapping response", () => {
    const parsed = MappingResponseParserService.parse({
      rowId: "row-1",
      allowedConceptKeys: ["management_fees", "accrued_expenses"],
      responseObject: {
        rowId: "row-1",
        recommendedCandidates: [
          {
            semanticConceptKey: "management_fees",
            rank: 1,
            llmScore: 0.91,
            reasoning: "Explicit management fee phrasing.",
            evidence: ["label match: management fee", "expense wording"],
          },
        ],
        ambiguities: ["Could also refer to accrued_expenses if the row is balance-sheet oriented."],
        needsHumanReview: true,
      },
    })

    expect(parsed.recommendedCandidates[0].semanticConceptKey).toBe("management_fees")
    expect(parsed.recommendedCandidates[0].llmScore).toBe(0.91)
    expect(parsed.ambiguities).toHaveLength(1)
    expect(parsed.needsHumanReview).toBe(true)
  })

  test("rejects malformed or disallowed candidate payloads", () => {
    expect(() =>
      MappingResponseParserService.parse({
        rowId: "row-1",
        allowedConceptKeys: ["management_fees"],
        responseObject: {
          rowId: "row-1",
          recommendedCandidates: [
            {
              semanticConceptKey: "not_allowed",
              llmScore: 0.9,
            },
          ],
        },
      }),
    ).toThrow("did not contain any valid candidate recommendations")
  })
})
