import test from "node:test"
import assert from "node:assert/strict"
import {
  buildReviewModel,
  confirmCompletedAnchor,
  confirmEligibleMappings,
  createReviewSession,
  isAnchorStructurallyComplete,
  isReviewSessionDirty,
  markReviewSessionSaved,
  removeMapping,
  syncReviewWithConfig,
  updateMapping,
} from "./templateReviewModel.js"

function directConfig(overrides = {}) {
  return {
    version: "v3",
    statement_method: "direct",
    period_axis: {
      labels: [
        { period_key: "jan", label: "January", period_type: "monthly" },
        { period_key: "feb", label: "February", period_type: "monthly" },
      ],
      period_bindings: [
        { period_key: "jan", cell: "B2" },
        { period_key: "feb", cell: "C2" },
      ],
    },
    period_resolution_rules: { custom_periods: [] },
    bucket_bindings: [
      {
        bucket_key: "receipts",
        label: "Customer cash",
        semantic_key: "customer_receipts",
        semantic_confidence: 0.95,
        semantic_source: "label_inferred",
        cells: [
          { period_key: "jan", cell: "B5" },
          { period_key: "feb", cell: "C5" },
        ],
      },
      {
        bucket_key: "mystery",
        label: "Mystery row",
        cells: [
          { period_key: "jan", cell: "B6" },
          { period_key: "feb", cell: "C6" },
        ],
      },
      {
        bucket_key: "payroll",
        label: "People runway",
        semantic_key: "payroll",
        semantic_confidence: 0.51,
        semantic_source: "label_inferred",
        cells: [
          { period_key: "jan", cell: "B7" },
          { period_key: "feb", cell: "C7" },
        ],
      },
    ],
    ...overrides,
  }
}

function review() {
  return {
    can_activate: false,
    anchor_statuses: [
      { key: "period_axis", label: "Period axis", status: "ready", message: "Mapped" },
      { key: "period_ranges", label: "Period ranges", status: "ready", message: "Mapped" },
      { key: "bucket_targets", label: "Bucket targets", status: "needs_review", message: "Confirm buckets" },
      { key: "row_bindings", label: "Row bindings", status: "ready", message: "Not required" },
    ],
  }
}

test("classifies only actionable, bulk-confirmable, and resolved mappings", () => {
  const model = buildReviewModel(directConfig(), review())
  assert.deepEqual(model.actionMappings.map((item) => item.kind), ["unassigned", "low_confidence"])
  assert.equal(model.confirmableMappings.length, 1)
  assert.equal(model.resolvedMappings.length, 0)
  assert.equal(model.workbookTasks.length, 0)
  assert.equal(model.canActivate, false)
})

test("bulk confirmation never includes missing or low-confidence mappings", () => {
  const result = confirmEligibleMappings(directConfig(), review())
  assert.equal(result.count, 1)
  assert.equal(result.config.bucket_bindings[0].semantic_source, "user_confirmed")
  assert.equal(result.config.bucket_bindings[1].semantic_source, undefined)
  assert.equal(result.config.bucket_bindings[2].semantic_source, "label_inferred")
})

test("activation becomes available only after every semantic blocker is resolved", () => {
  let config = directConfig()
  let currentReview = review()
  const bulk = confirmEligibleMappings(config, currentReview)
  config = bulk.config
  currentReview = bulk.review

  for (const item of buildReviewModel(config, currentReview).actionMappings) {
    config = updateMapping(config, item, item.categoryKey || "general_admin")
    currentReview = syncReviewWithConfig(config, currentReview)
  }
  const confirmed = confirmCompletedAnchor(config, currentReview, "bucket_targets")
  assert.equal(buildReviewModel(confirmed.config, confirmed.review).canActivate, true)
})

test("category override records user intent and removal updates the collection", () => {
  const config = directConfig()
  const item = buildReviewModel(config, review()).actionMappings[0]
  const updated = updateMapping(config, item, "supplier_payments")
  assert.equal(updated.bucket_bindings[1].semantic_key, "supplier_payments")
  assert.equal(updated.bucket_bindings[1].semantic_source, "user_override")
  assert.equal(updated.bucket_bindings[1].direction, "outflow")
  assert.equal(removeMapping(updated, item).bucket_bindings.length, 2)
})

test("multi-period anchors stay incomplete until every period has a valid cell", () => {
  const config = directConfig({
    period_axis: {
      labels: [
        { period_key: "jan", label: "January", period_type: "monthly" },
        { period_key: "feb", label: "February", period_type: "monthly" },
      ],
      period_bindings: [{ period_key: "jan", cell: "B2" }],
    },
  })
  assert.equal(isAnchorStructurallyComplete(config, "period_axis"), false)
  const attempted = confirmCompletedAnchor(config, review(), "period_axis")
  assert.equal(attempted.config.review_metadata, undefined)
})

test("custom period ranges reject reversed dates", () => {
  const config = directConfig({
    period_axis: {
      labels: [{ period_key: "custom", label: "Custom", period_type: "custom" }],
      period_bindings: [{ period_key: "custom", cell: "B2" }],
    },
    period_resolution_rules: {
      custom_periods: [{ period_key: "custom", date_start: "2026-02-01", date_end: "2026-01-01" }],
    },
  })
  assert.equal(isAnchorStructurallyComplete(config, "period_ranges"), false)
})

test("a backend-ready structural anchor stays ready without redundant confirmation metadata", () => {
  const synced = syncReviewWithConfig(directConfig(), review())
  assert.equal(synced.anchor_statuses.find((status) => status.key === "period_axis").status, "ready")
})

test("saving a new analysis keeps its session open as a clean saved-template review", () => {
  const config = directConfig()
  const session = createReviewSession({ mode: "new_upload", isNew: true, config, review: review() })
  assert.equal(isReviewSessionDirty(session, { config, rawConfigText: JSON.stringify(config, null, 2) }), true)

  const saved = markReviewSessionSaved(session, {
    templateId: "template-1",
    config,
    name: "Cash flow",
    version: "v1",
    review: review(),
  })
  assert.equal(saved.mode, "saved_template")
  assert.equal(saved.templateId, "template-1")
  assert.equal(
    isReviewSessionDirty(saved, {
      config,
      rawConfigText: JSON.stringify(config, null, 2),
      name: "Cash flow",
      version: "v1",
    }),
    false,
  )
})

test("reanalyzed config is dirty against the saved-template baseline", () => {
  const baseline = directConfig()
  const reanalyzed = directConfig({ layout_type: "freeform" })
  const session = createReviewSession({
    mode: "reanalysis",
    templateId: "template-1",
    config: reanalyzed,
    baselineConfig: baseline,
    review: review(),
  })
  assert.equal(
    isReviewSessionDirty(session, {
      config: reanalyzed,
      rawConfigText: JSON.stringify(reanalyzed, null, 2),
    }),
    true,
  )
})
