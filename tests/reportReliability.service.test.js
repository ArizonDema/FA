const ReportReliabilityService = require("../src/modules/reports/cash-flow/reportReliability.service")

describe("ReportReliabilityService", () => {
  test("Case C: fallback-only report evidence requires review", () => {
    const result = ReportReliabilityService.assess({
      assignments: [
        { source: "fallback", grounding_status: "fallback", abs_amount: 100 },
        { source: "auto_semantic", grounding_status: "auto_semantic", abs_amount: 50 },
      ],
      totalMovementCount: 2,
      lowConfidenceMappings: [{ account_name: "Suspense" }],
      unmappedMovementCount: 0,
    })

    expect(result.reportReliabilityStatus).toBe("requires_review")
    expect(result.humanReviewRequired).toBe(true)
    expect(result.reviewReasons).toEqual(
      expect.arrayContaining(["fallback_derived_result", "weak_numeric_support"]),
    )
  })

  test("Case D: grounded report evidence can bypass review", () => {
    const result = ReportReliabilityService.assess({
      assignments: [
        { source: "template_rule", grounding_status: "template_rule", abs_amount: 100 },
        { source: "manual_rule", grounding_status: "approved", abs_amount: 80 },
      ],
      totalMovementCount: 2,
      lowConfidenceMappings: [],
      unmappedMovementCount: 0,
    })

    expect(result.reportReliabilityStatus).toBe("grounded")
    expect(result.humanReviewRequired).toBe(false)
    expect(result.accountCoverageScore).toBe(1)
    expect(result.evidenceScore).toBe(1)
  })
})
