const { evaluateTemplateReadiness } = require("../src/modules/templates/services/templateReadiness.service")

function baseDirectConfig(bucketOverrides = {}) {
  return {
    version: "v3",
    sheet_name: "Cash Flow",
    layout_type: "freeform",
    period_granularity: "monthly",
    period_axis: {
      orientation: "column",
      labels: [{ period_key: "m01", label: "Jan", period_type: "monthly" }],
      period_bindings: [{ period_key: "m01", label: "Jan", cell: "B2" }],
    },
    period_resolution_rules: { custom_periods: [] },
    bucket_bindings: [
      {
        bucket_key: "growth_spend",
        label: "Growth spend",
        direction: "outflow",
        fallback: false,
        semantic_key: "sales_marketing",
        semantic_confidence: 0.92,
        cells: [{ period_key: "m01", label: "Jan", cell: "B8" }],
        ...bucketOverrides,
      },
    ],
  }
}

describe("template readiness semantic review gate", () => {
  test("allows direct templates when writable rows have valid cash-flow categories", () => {
    const readiness = evaluateTemplateReadiness({ config: baseDirectConfig() })

    expect(readiness.can_activate).toBe(true)
    expect(readiness.required_anchors).toEqual([])
  })

  test("blocks direct templates when writable rows are missing semantic categories", () => {
    const readiness = evaluateTemplateReadiness({
      config: baseDirectConfig({ semantic_key: "", semantic_confidence: 0 }),
    })

    expect(readiness.can_activate).toBe(false)
    expect(readiness.required_anchors).toContain("bucket_targets")
    expect(readiness.activation_block_reason).toContain("Confirm what 1 cash-flow row")
  })

  test("blocks low-confidence semantic categories until a user confirms them", () => {
    const lowConfidence = evaluateTemplateReadiness({
      config: baseDirectConfig({ semantic_confidence: 0.42, semantic_source: "llm_semantic" }),
    })
    const confirmed = evaluateTemplateReadiness({
      config: baseDirectConfig({ semantic_confidence: 0.42, semantic_source: "user_confirmed" }),
    })

    expect(lowConfidence.can_activate).toBe(false)
    expect(lowConfidence.anchor_statuses.find((status) => status.key === "bucket_targets")?.low_confidence_bucket_keys).toEqual([
      "growth_spend",
    ])
    expect(confirmed.can_activate).toBe(true)
  })

  test("blocks indirect templates with invalid row concepts", () => {
    const readiness = evaluateTemplateReadiness({
      config: {
        version: "v3",
        sheet_name: "Cash Flow",
        layout_type: "freeform",
        statement_method: "indirect",
        period_granularity: "monthly",
        period_axis: {
          orientation: "column",
          labels: [{ period_key: "m01", label: "Jan", period_type: "monthly" }],
          period_bindings: [{ period_key: "m01", label: "Jan", cell: "B2" }],
        },
        period_resolution_rules: { custom_periods: [] },
        bucket_bindings: [],
        row_bindings: [
          {
            semantic_key: "mystery_row",
            label: "Mystery row",
            role: "input",
            cells: [{ period_key: "m01", label: "Jan", cell: "B5" }],
          },
        ],
      },
    })

    expect(readiness.can_activate).toBe(false)
    expect(readiness.required_anchors).toContain("row_bindings")
    expect(readiness.activation_block_reason).toContain("Confirm what 1 indirect cash-flow row")
  })
})
