const MappingScoringService = require("../src/modules/mappings/services/mappingScoring.service")
const TemplateRowCandidateGenerator = require("../src/modules/mappings/services/templateRowCandidateGenerator.service")
const AccountCandidateGenerator = require("../src/modules/mappings/services/accountCandidateGenerator.service")
const { normalizePhrase, tokenizePhrase, uniqueValues } = require("../src/modules/mappings/utils/mappingText.util")

function createConceptEntry({
  id,
  stableKey,
  label,
  category,
  subcategory = null,
  aggregationBehavior = "sum",
  statementType = "generic",
  synonyms = [],
  examples = [],
}) {
  const keyPhrase = normalizePhrase(String(stableKey || "").replace(/_/g, " "))
  const labelPhrase = normalizePhrase(label)
  const synonymPhrases = uniqueValues(synonyms.map((item) => normalizePhrase(item)))
  const examplePhrases = uniqueValues(examples.map((item) => normalizePhrase(item)))
  const auxiliaryPhrases = uniqueValues(
    [category, subcategory, statementType].filter(Boolean).map((item) => normalizePhrase(item)),
  )
  const searchablePhrases = uniqueValues([keyPhrase, labelPhrase, ...synonymPhrases, ...examplePhrases])
  const searchableTokens = Array.from(new Set(searchablePhrases.flatMap((phrase) => tokenizePhrase(phrase))))

  return {
    id,
    stableKey,
    label,
    category,
    subcategory,
    aggregationBehavior,
    statementType,
    keyPhrase,
    labelPhrase,
    synonymPhrases,
    examplePhrases,
    auxiliaryPhrases,
    searchablePhrases,
    searchableTokens,
  }
}

const concepts = [
  createConceptEntry({
    id: "concept-1",
    stableKey: "subscriptions",
    label: "Subscriptions",
    category: "capital_activity",
    statementType: "capital_activity",
    synonyms: ["capital contributions", "investor subscriptions"],
    examples: ["Subscriptions"],
  }),
  createConceptEntry({
    id: "concept-2",
    stableKey: "management_fees",
    label: "Management Fees",
    category: "expense",
    statementType: "pnl",
    synonyms: ["management fee", "base management fee"],
    examples: ["Management fees", "Investment manager fees"],
  }),
  createConceptEntry({
    id: "concept-3",
    stableKey: "realized_gain_loss",
    label: "Realized Gain or Loss",
    category: "gains_losses",
    statementType: "pnl",
    synonyms: ["realized gain", "realized loss", "realized pnl"],
    examples: ["Net realized gain or loss", "Realized gain/(loss)"],
  }),
  createConceptEntry({
    id: "concept-4",
    stableKey: "financing_cash_flow",
    label: "Financing Cash Flow",
    category: "financing",
    subcategory: "cash_flow_summary",
    aggregationBehavior: "sum",
    statementType: "cash_flow",
    synonyms: ["net cash from financing activities", "financing activities"],
    examples: ["Net cash provided by financing activities", "Financing cash flow"],
  }),
  createConceptEntry({
    id: "concept-5",
    stableKey: "redemptions",
    label: "Redemptions",
    category: "capital_activity",
    statementType: "capital_activity",
    synonyms: ["capital withdrawals", "withdrawals"],
    examples: ["Redemptions"],
  }),
]

describe("Deterministic mapping scoring", () => {
  test("ranks management fee rows toward management_fees", () => {
    const candidateResult = TemplateRowCandidateGenerator.buildCandidatePool({
      row: {
        id: "row-1",
        label: "Management Fees",
        row_type: "data_row",
        section_name: "Operating Activities",
        is_formula: false,
      },
      concepts,
    })

    const ranked = MappingScoringService.rankTemplateRowCandidates({
      target: candidateResult.target,
      hints: candidateResult.hints,
      concepts: candidateResult.candidates,
    })

    expect(ranked[0].semanticConceptKey).toBe("management_fees")
    expect(ranked[0].confidenceScore).toBeGreaterThan(0.7)
  })

  test("ranks realized gain rows toward realized_gain_loss", () => {
    const candidateResult = TemplateRowCandidateGenerator.buildCandidatePool({
      row: {
        id: "row-2",
        label: "Net realized gain on investments",
        row_type: "data_row",
        section_name: "Operating Activities",
      },
      concepts,
    })

    const ranked = MappingScoringService.rankTemplateRowCandidates({
      target: candidateResult.target,
      hints: candidateResult.hints,
      concepts: candidateResult.candidates,
    })

    expect(ranked[0].semanticConceptKey).toBe("realized_gain_loss")
    expect(ranked[0].signalBreakdown.tokenOverlap).toBeGreaterThan(0.3)
  })

  test("ranks financing section headers toward financing_cash_flow", () => {
    const candidateResult = TemplateRowCandidateGenerator.buildCandidatePool({
      row: {
        id: "row-3",
        label: "Cash flows from financing activities",
        row_type: "section_header",
        is_formula: false,
      },
      concepts,
    })

    const ranked = MappingScoringService.rankTemplateRowCandidates({
      target: candidateResult.target,
      hints: candidateResult.hints,
      concepts: candidateResult.candidates,
    })

    expect(ranked[0].semanticConceptKey).toBe("financing_cash_flow")
    expect(ranked[0].signalBreakdown.categoryHint).toBeGreaterThan(0.7)
  })

  test("ranks management fee accounts toward management_fees", () => {
    const candidateResult = AccountCandidateGenerator.buildCandidatePool({
      account: {
        id: "account-1",
        name: "Management fee expense",
      },
      concepts,
    })

    const ranked = MappingScoringService.rankAccountCandidates({
      target: candidateResult.target,
      concepts: candidateResult.candidates,
    })

    expect(ranked[0].semanticConceptKey).toBe("management_fees")
    expect(ranked[0].confidenceScore).toBeGreaterThan(0.35)
  })
})
