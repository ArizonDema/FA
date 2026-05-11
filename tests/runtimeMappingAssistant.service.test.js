const mockRequestStructuredJson = jest.fn()

jest.mock("../src/config/app", () => ({
  mappingAssistance: {
    enabled: true,
    runtimeEnabled: true,
    runtimeMaxAccountsPerRun: 10,
    runtimeMinAcceptedScore: 0.7,
    runtimePromptVersion: "runtime.v1",
    timeoutMs: 120000,
    runtimeTimeoutMs: 120000,
    maxAttempts: 1,
    runtimeMaxAttempts: 1,
    model: "qwen3:14b",
  },
}))

jest.mock("../src/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}))

jest.mock("../src/modules/llm/services/llmOrchestrator.service", () => ({
  requestStructuredJson: (...args) => mockRequestStructuredJson(...args),
}))

const RuntimeMappingAssistantService = require("../src/modules/mappings/services/runtimeMappingAssistant.service")

describe("RuntimeMappingAssistantService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("includes movement context in the runtime mapping prompt", () => {
    const prompt = RuntimeMappingAssistantService.__test.buildPrompt({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "member funding:inflow",
          account_name: "Member Funding",
          normalized_account: "member funding",
          direction: "inflow",
          movement_count: 3,
          total_abs_amount: 12500,
          sample_descriptions: ["Capital call receipt", "Paid-in capital"],
          account_profile: {
            tb_account_class: "equity",
            tb_ending_balance: -50000,
            movement_count: 3,
            total_abs_amount: 12500,
            active_months: ["2026-01", "2026-02"],
            sample_descriptions: ["Capital call receipt", "Paid-in capital"],
            sample_je_numbers: ["JE-1"],
            evidence_tokens: ["equity", "capital contribution"],
          },
          best_profile_mapping_key: "capital_contributions",
          best_profile_score: 0.87,
          current_mapping_key: "other_inflow",
          current_mapping_label: "Other Inflow",
          current_mapping_source: "fallback",
          current_mapping_confidence: 0.4,
          allowed_candidates: [
            {
              mapping_key: "capital_contributions",
              label: "Capital Contributions",
              semantic_key: "equity_injection",
              semantic_confidence: 0.94,
              semantic_source: "llm_semantic",
              semantic_evidence: ["Founder funding row"],
              is_fallback: false,
              deterministic_score: 0.91,
              profile_score: 0.87,
              evidence: ["tb_class_equity"],
            },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true, deterministic_score: 0.38 },
          ],
        },
      ],
    })

    expect(prompt.requestPayload.candidates[0]).toEqual(
      expect.objectContaining({
        movementCount: 3,
        totalAbsAmount: 12500,
        sampleDescriptions: ["Capital call receipt", "Paid-in capital"],
        bestProfileMappingKey: "capital_contributions",
        allowedMappings: expect.arrayContaining([
          expect.objectContaining({
            mappingKey: "capital_contributions",
            semanticKey: "equity_injection",
            deterministicScore: 0.91,
            profileScore: 0.87,
            evidence: ["tb_class_equity"],
          }),
        ]),
        accountProfile: expect.objectContaining({
          tbClass: "equity",
          journalExamples: ["JE-1"],
        }),
      }),
    )
  })

  test("auto-accepts strong valid recommendations at the aggressive 0.70 threshold", () => {
    const accepted = RuntimeMappingAssistantService.__test.acceptRecommendations({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "weak name:outflow",
          account_name: "Weak Name",
          normalized_account: "weak name",
          direction: "outflow",
          current_mapping_key: "other_outflow",
          current_mapping_source: "fallback",
          account_profile: {
            tb_account_class: "marketing_expense",
            sample_descriptions: ["Google Ads campaign"],
          },
          allowed_candidates: [
            {
              mapping_key: "sales_marketing",
              label: "Sales and Marketing",
              semantic_key: "sales_marketing",
              is_fallback: false,
              deterministic_score: 0.72,
              profile_score: 0.72,
            },
            { mapping_key: "other_outflow", label: "Other Outflow", is_fallback: true, deterministic_score: 0.38 },
          ],
        },
      ],
      parsedResponse: {
        recommendations: [
          {
            account_key: "weak name:outflow",
            mapping_key: "sales_marketing",
            llm_score: 0.7,
            reasoning: "GL descriptions show marketing spend",
            evidence: ["Google Ads campaign"],
            needs_human_review: false,
          },
        ],
      },
    })

    expect(accepted.acceptedMappings).toHaveLength(1)
    expect(accepted.minimumAcceptedScore).toBe(0.7)
    expect(accepted.acceptedMappings[0]).toEqual(
      expect.objectContaining({
        bucket_key: "sales_marketing",
        semantic_key: "sales_marketing",
        llm_score: 0.7,
        profile_score: 0.72,
        account_profile: expect.objectContaining({ tb_account_class: "marketing_expense" }),
      }),
    )
  })

  test("rejects close LLM/profile disagreements for human review", () => {
    const accepted = RuntimeMappingAssistantService.__test.acceptRecommendations({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "capital call:inflow",
          account_name: "Capital Call",
          normalized_account: "capital call",
          direction: "inflow",
          current_mapping_key: "other_inflow",
          current_mapping_source: "fallback",
          best_profile_mapping_key: "equity_injection",
          best_profile_score: 0.86,
          allowed_candidates: [
            { mapping_key: "equity_injection", label: "Equity Injection", is_fallback: false, deterministic_score: 0.86, profile_score: 0.86 },
            { mapping_key: "debt_drawdown", label: "Debt Drawdown", is_fallback: false, deterministic_score: 0.78, profile_score: 0.2 },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true, deterministic_score: 0.38 },
          ],
        },
      ],
      parsedResponse: {
        recommendations: [
          {
            account_key: "capital call:inflow",
            mapping_key: "debt_drawdown",
            llm_score: 0.9,
            reasoning: "mentions proceeds",
            evidence: ["proceeds"],
            needs_human_review: false,
          },
        ],
      },
    })

    expect(accepted.acceptedMappings).toEqual([])
    expect(accepted.rejectedRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "profile_llm_conflict_requires_review",
          best_profile_mapping_key: "equity_injection",
        }),
      ]),
    )
  })

  test("allows LLM/profile disagreements when the LLM score clears the gap rule", () => {
    const accepted = RuntimeMappingAssistantService.__test.acceptRecommendations({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "proceeds:inflow",
          account_name: "Proceeds",
          normalized_account: "proceeds",
          direction: "inflow",
          current_mapping_key: "other_inflow",
          current_mapping_source: "fallback",
          best_profile_mapping_key: "equity_injection",
          best_profile_score: 0.76,
          allowed_candidates: [
            { mapping_key: "equity_injection", label: "Equity Injection", is_fallback: false, deterministic_score: 0.76, profile_score: 0.76 },
            { mapping_key: "debt_drawdown", label: "Debt Drawdown", is_fallback: false, deterministic_score: 0.88, profile_score: 0.3 },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true, deterministic_score: 0.38 },
          ],
        },
      ],
      parsedResponse: {
        recommendations: [
          {
            account_key: "proceeds:inflow",
            mapping_key: "debt_drawdown",
            llm_score: 0.89,
            reasoning: "loan agreement wording is explicit",
            evidence: ["loan agreement"],
            needs_human_review: false,
          },
        ],
      },
    })

    expect(accepted.acceptedMappings).toHaveLength(1)
    expect(accepted.acceptedMappings[0].bucket_key).toBe("debt_drawdown")
  })

  test("accepts a high-confidence direct remapping when the llm provides a better bucket", async () => {
    mockRequestStructuredJson.mockResolvedValue({
      parsed: {
        recommendations: [
          {
            accountKey: "partner contributions:inflow",
            mappingKey: "capital_contributions",
            llmScore: 0.93,
            reasoning: "capital contribution wording is explicit",
            evidence: ["contains contributions"],
            needsHumanReview: false,
          },
        ],
        notes: ["financing inflow"],
      },
      meta: {
        model: "qwen3:14b",
      },
    })

    const result = await RuntimeMappingAssistantService.assistMappings({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "partner contributions:inflow",
          account_name: "Partner Contributions",
          normalized_account: "partner contributions",
          direction: "inflow",
          current_mapping_key: "other_inflow",
          current_mapping_label: "Other Inflow",
          current_mapping_source: "auto_semantic",
          current_mapping_confidence: 0.41,
          allowed_candidates: [
            { mapping_key: "capital_contributions", label: "Capital Contributions", is_fallback: false },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true },
          ],
        },
      ],
    })

    expect(result.failed).toBe(false)
    expect(result.acceptedMappings).toHaveLength(1)
    expect(result.acceptedMappings[0]).toEqual(
      expect.objectContaining({
        normalized_account: "partner contributions",
        direction: "inflow",
        bucket_key: "capital_contributions",
        source: "llm_assisted",
        changed: true,
      }),
    )
    expect(result.summary.acceptedCount).toBe(1)
    expect(mockRequestStructuredJson).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 120000,
        maxAttempts: 1,
        taskType: "runtime_mapping_assistance",
      }),
    )
  })

  test("accepts same-bucket LLM confirmation for profile-auto mappings", () => {
    const accepted = RuntimeMappingAssistantService.__test.acceptRecommendations({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "bridge 82:inflow",
          account_name: "Bridge 82",
          normalized_account: "bridge 82",
          direction: "inflow",
          current_mapping_key: "founder_money",
          current_mapping_source: "profile_auto",
          account_profile: {
            tb_account_class: "equity",
            sample_descriptions: ["Founder funding contribution received"],
          },
          allowed_candidates: [
            {
              mapping_key: "founder_money",
              label: "Founder Money",
              semantic_key: "equity_injection",
              is_fallback: false,
              deterministic_score: 0.91,
              profile_score: 0.91,
            },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true, deterministic_score: 0.38 },
          ],
        },
      ],
      parsedResponse: {
        recommendations: [
          {
            account_key: "bridge 82:inflow",
            mapping_key: "founder_money",
            llm_score: 0.88,
            reasoning: "founder funding is equity injection",
            evidence: ["Founder funding contribution received"],
            needs_human_review: false,
          },
        ],
      },
    })

    expect(accepted.acceptedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket_key: "founder_money",
          semantic_key: "equity_injection",
          source: "llm_assisted",
          changed: false,
        }),
      ]),
    )
  })

  test("rejects indirect no-op operating recommendations so the llm is not only confirming fallback behavior", async () => {
    mockRequestStructuredJson.mockResolvedValue({
      parsed: {
        recommendations: [
          {
            accountKey: "member contributions:inflow",
            mappingKey: "operating_cash_flow",
            llmScore: 0.96,
            reasoning: "generic cash receipt",
            evidence: ["cash movement"],
            needsHumanReview: false,
          },
        ],
      },
      meta: {
        model: "qwen3:14b",
      },
    })

    const result = await RuntimeMappingAssistantService.assistMappings({
      statementMethod: "indirect",
      candidates: [
        {
          account_key: "member contributions:inflow",
          account_name: "Member Contributions",
          normalized_account: "member contributions",
          direction: "inflow",
          current_mapping_key: "operating_cash_flow",
          current_mapping_label: "Cash Flow from Operations",
          current_mapping_source: "derived_operating",
          current_mapping_confidence: 0.82,
          allowed_candidates: [
            { mapping_key: "capital_contributions", label: "Capital Contributions", is_fallback: false },
            { mapping_key: "operating_cash_flow", label: "Cash Flow from Operations", is_fallback: true },
          ],
        },
      ],
    })

    expect(result.acceptedMappings).toEqual([])
    expect(result.rejectedRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_key: "member contributions:inflow",
          reason: "indirect_operating_noop",
        }),
      ]),
    )
    expect(result.summary.acceptedCount).toBe(0)
    expect(result.summary.rejectedCount).toBe(1)
  })

  test("falls back cleanly when the llm request fails", async () => {
    mockRequestStructuredJson.mockRejectedValue(
      Object.assign(new Error("timed out"), {
        failure_code: "timeout",
        failure_reason: "timed out",
      }),
    )

    const result = await RuntimeMappingAssistantService.assistMappings({
      statementMethod: "direct",
      candidates: [
        {
          account_key: "platform revenue:inflow",
          account_name: "Platform Revenue",
          normalized_account: "platform revenue",
          direction: "inflow",
          current_mapping_key: "other_inflow",
          current_mapping_source: "fallback",
          allowed_candidates: [
            { mapping_key: "revenue", label: "Revenue", is_fallback: false },
            { mapping_key: "other_inflow", label: "Other Inflow", is_fallback: true },
          ],
        },
      ],
    })

    expect(result.failed).toBe(true)
    expect(result.acceptedMappings).toEqual([])
    expect(result.summary.failed).toBe(true)
    expect(result.summary.failureCode).toBe("timeout")
  })
})
