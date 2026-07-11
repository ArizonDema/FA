export const REVIEW_CONFIDENCE_THRESHOLD = 0.7

export const DIRECT_CASH_FLOW_CATEGORIES = [
  { key: "customer_receipts", label: "Customer receipts", direction: "inflow" },
  { key: "other_operating_inflows", label: "Other operating receipts", direction: "inflow" },
  { key: "supplier_payments", label: "Supplier payments", direction: "outflow" },
  { key: "payroll", label: "Payroll and team costs", direction: "outflow" },
  { key: "rent_facilities", label: "Rent and facilities", direction: "outflow" },
  { key: "sales_marketing", label: "Marketing spend", direction: "outflow" },
  { key: "general_admin", label: "General and admin", direction: "outflow" },
  { key: "income_taxes", label: "Taxes paid", direction: "outflow" },
  { key: "other_operating_outflows", label: "Other operating payments", direction: "outflow" },
  { key: "capital_expenditures", label: "Equipment and capex", direction: "outflow" },
  { key: "capitalized_software", label: "Capitalized software", direction: "outflow" },
  { key: "asset_sale_proceeds", label: "Asset sale proceeds", direction: "inflow" },
  { key: "debt_drawdown", label: "Debt proceeds", direction: "inflow" },
  { key: "debt_repayment", label: "Debt repayments", direction: "outflow" },
  { key: "interest_paid", label: "Interest paid", direction: "outflow" },
  { key: "equity_injection", label: "Owner funding", direction: "inflow" },
  { key: "dividends_distributions", label: "Dividends and distributions", direction: "outflow" },
]

export const INDIRECT_CASH_FLOW_CATEGORIES = [
  { key: "net_income", label: "Net income", role: "input", direction: "neutral" },
  { key: "depreciation_amortization", label: "Depreciation and amortization", role: "input", direction: "neutral" },
  { key: "change_in_receivables", label: "Change in receivables", role: "input", direction: "neutral" },
  { key: "change_in_inventory", label: "Change in inventory", role: "input", direction: "neutral" },
  { key: "change_in_payables", label: "Change in payables", role: "input", direction: "neutral" },
  { key: "other_working_capital_changes", label: "Other working capital changes", role: "input", direction: "neutral" },
  { key: "operating_cash_flow", label: "Cash flow from operations", role: "summary", direction: "mixed" },
  { key: "capital_expenditures", label: "Capital expenditures", role: "input", direction: "outflow" },
  { key: "asset_sales", label: "Asset sales", role: "input", direction: "inflow" },
  { key: "investing_cash_flow", label: "Cash flow from investing", role: "summary", direction: "mixed" },
  { key: "capital_contributions", label: "Capital contributions", role: "input", direction: "inflow" },
  { key: "debt_issued", label: "Debt issued", role: "input", direction: "inflow" },
  { key: "debt_repaid", label: "Debt repaid", role: "input", direction: "outflow" },
  { key: "interest_paid", label: "Interest paid", role: "input", direction: "outflow" },
  { key: "dividends_paid", label: "Dividends paid", role: "input", direction: "outflow" },
  { key: "financing_cash_flow", label: "Cash flow from financing", role: "summary", direction: "mixed" },
  { key: "net_change_in_cash", label: "Net change in cash", role: "summary", direction: "mixed" },
  { key: "opening_cash", label: "Opening cash", role: "input", direction: "neutral" },
  { key: "closing_cash", label: "Closing cash", role: "summary", direction: "neutral" },
]

export const ANCHOR_LABELS = {
  period_axis: "Period cells",
  period_ranges: "Custom period dates",
  bucket_targets: "Cash-flow output cells",
  row_bindings: "Indirect statement cells",
}

const CELL_PATTERN = /^[A-Z]{1,3}[1-9][0-9]*$/i

export function configFingerprint(value) {
  return JSON.stringify(value || {})
}

export function createReviewSession({
  mode,
  isNew = false,
  templateId = null,
  config,
  baselineConfig = config,
  name = "",
  version = "",
  review = null,
  workbook = null,
  analysisDetails = null,
}) {
  return {
    mode,
    isNew,
    templateId,
    review,
    workbook,
    analysisDetails,
    baselineConfig: isNew ? "" : configFingerprint(baselineConfig),
    baselineName: name || "",
    baselineVersion: version || "",
  }
}

export function markReviewSessionSaved(session, { templateId, config, name = "", version = "", review }) {
  return {
    ...(session || {}),
    mode: "saved_template",
    isNew: false,
    templateId,
    review: review || session?.review || null,
    baselineConfig: configFingerprint(config),
    baselineName: name || "",
    baselineVersion: version || "",
  }
}

export function isReviewSessionDirty(session, { config, rawConfigText, name = "", version = "" }) {
  if (!session) return false
  return Boolean(
    session.isNew ||
      configFingerprint(config) !== session.baselineConfig ||
      rawConfigText !== JSON.stringify(config || {}, null, 2) ||
      (name || "") !== (session.baselineName || "") ||
      (version || "") !== (session.baselineVersion || ""),
  )
}

export function toReviewKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function getStatementMethod(config = {}) {
  const explicit = String(config.statement_method || "").trim().toLowerCase()
  if (explicit === "direct" || explicit === "indirect") return explicit
  return Array.isArray(config.row_bindings) && config.row_bindings.length ? "indirect" : "direct"
}

export function getCategoryChoices(config = {}) {
  return getStatementMethod(config) === "indirect" ? INDIRECT_CASH_FLOW_CATEGORIES : DIRECT_CASH_FLOW_CATEGORIES
}

export function getCategoryAnchor(config = {}) {
  return getStatementMethod(config) === "indirect" ? "row_bindings" : "bucket_targets"
}

export function confidenceFromBinding(binding = {}) {
  const raw =
    binding.semantic_confidence ??
    binding.semanticConfidence ??
    binding.confidence ??
    binding.confidence_score ??
    null
  if (raw === null || raw === "") return null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null
}

function categoryLookup(config) {
  return new Map(getCategoryChoices(config).map((category) => [category.key, category]))
}

function bindingCollection(config) {
  return getStatementMethod(config) === "indirect"
    ? { type: "row", name: "row_bindings", values: config.row_bindings || [] }
    : { type: "bucket", name: "bucket_bindings", values: (config.bucket_bindings || []).filter((item) => !item?.fallback) }
}

function bindingReason(kind, category) {
  if (kind === "unassigned") return "Choose the cash-flow category represented by this row."
  if (kind === "low_confidence") return `The analyzer suggested ${category?.label || "this category"}, but confidence is low.`
  if (kind === "confirmable") return "Confirm this analyzer suggestion before activation."
  return "Mapping confirmed."
}

export function buildMappingItems(config = {}, review = null) {
  const lookup = categoryLookup(config)
  const collection = bindingCollection(config)
  const categoryAnchor = getCategoryAnchor(config)
  const anchorOpen = (review?.anchor_statuses || []).some(
    (status) => status?.key === categoryAnchor && status?.status !== "ready",
  )

  return collection.values.map((binding, visibleIndex) => {
    const sourceCollection = config[collection.name] || []
    const index = sourceCollection.indexOf(binding)
    const semanticKey = toReviewKey(binding?.semantic_key)
    const category = lookup.get(semanticKey) || null
    const confidence = confidenceFromBinding(binding)
    const confirmed = ["user_confirmed", "user_override"].includes(String(binding?.semantic_source || ""))
    let kind = "resolved"
    if (!category) kind = "unassigned"
    else if (confidence !== null && confidence < REVIEW_CONFIDENCE_THRESHOLD) kind = "low_confidence"
    else if (anchorOpen && !confirmed) kind = "confirmable"

    return {
      id: `mapping:${collection.type}:${binding?.bucket_key || binding?.semantic_key || visibleIndex}:${index}`,
      type: collection.type,
      collectionName: collection.name,
      index,
      binding,
      rowLabel: String(binding?.label || binding?.bucket_key || binding?.semantic_key || `Row ${index + 1}`),
      categoryKey: semanticKey,
      category,
      confidence,
      kind,
      reason: bindingReason(kind, category),
      cells: Array.isArray(binding?.cells) ? binding.cells : [],
    }
  })
}

function periodKeys(config) {
  return (config?.period_axis?.labels || []).map((item, index) =>
    toReviewKey(item?.period_key || item?.label || `period_${index + 1}`),
  )
}

function cellsCoverPeriods(cells, keys) {
  if (!keys.length) return false
  const valid = new Set(
    (Array.isArray(cells) ? cells : [])
      .filter((item) => CELL_PATTERN.test(String(item?.cell || item?.address || "").trim()))
      .map((item) => toReviewKey(item?.period_key)),
  )
  return keys.every((key) => valid.has(key))
}

export function isAnchorStructurallyComplete(config = {}, anchorKey) {
  const key = toReviewKey(anchorKey)
  const keys = periodKeys(config)
  if (key === "period_axis") return cellsCoverPeriods(config?.period_axis?.period_bindings, keys)
  if (key === "period_ranges") {
    const customKeys = (config?.period_axis?.labels || [])
      .filter((item) => String(item?.period_type || "").toLowerCase() === "custom")
      .map((item) => toReviewKey(item?.period_key || item?.label))
    if (!customKeys.length) return true
    const ranges = new Map(
      (config?.period_resolution_rules?.custom_periods || []).map((item) => [toReviewKey(item?.period_key), item]),
    )
    return customKeys.every((periodKey) => {
      const range = ranges.get(periodKey)
      return Boolean(range?.date_start && range?.date_end && range.date_start <= range.date_end)
    })
  }
  if (key === "bucket_targets") {
    if (getStatementMethod(config) === "indirect") return true
    const buckets = (config.bucket_bindings || []).filter((item) => !item?.fallback)
    return Boolean(buckets.length) && buckets.every((item) => cellsCoverPeriods(item?.cells, keys))
  }
  if (key === "row_bindings") {
    if (getStatementMethod(config) !== "indirect") return true
    const rows = config.row_bindings || []
    return Boolean(rows.length) && rows.every((item) => cellsCoverPeriods(item?.cells, keys))
  }
  return false
}

export function withConfirmedAnchor(config, anchorKey) {
  const key = toReviewKey(anchorKey)
  const existing = Array.isArray(config?.review_metadata?.confirmed_anchors)
    ? config.review_metadata.confirmed_anchors
    : []
  return {
    ...config,
    review_metadata: {
      ...(config.review_metadata || {}),
      confirmed_anchors: Array.from(new Set([...existing.map(toReviewKey), key].filter(Boolean))),
    },
  }
}

export function syncReviewWithConfig(config, review) {
  if (!review) return review
  const mappingItems = buildMappingItems(config, review)
  const categoryAnchor = getCategoryAnchor(config)
  const confirmed = new Set((config?.review_metadata?.confirmed_anchors || []).map(toReviewKey))
  const statuses = (review.anchor_statuses || []).map((status) => {
    const key = toReviewKey(status?.key)
    const semanticComplete = key !== categoryAnchor || mappingItems.every((item) => item.kind === "resolved")
    const wasReady = status.status === "ready"
    const complete = isAnchorStructurallyComplete(config, key) && semanticComplete && (wasReady || confirmed.has(key))
    return complete
      ? { ...status, key, status: "ready", message: `${status.label || ANCHOR_LABELS[key] || "Setup"} confirmed.` }
      : { ...status, key, status: status.status === "ready" && !complete ? "needs_review" : status.status }
  })
  const unresolved = statuses.filter((status) => status.status !== "ready")
  return {
    ...review,
    anchor_statuses: statuses,
    required_anchors: unresolved.map((status) => status.key),
    can_activate: unresolved.length === 0,
    review_state: unresolved.length === 0 ? "ready" : "needs_review",
    activation_block_reason: unresolved[0]?.message || null,
  }
}

export function confirmCompletedAnchor(config, review, anchorKey) {
  const key = toReviewKey(anchorKey)
  if (!isAnchorStructurallyComplete(config, key)) return { config, review: syncReviewWithConfig(config, review) }
  const nextConfig = withConfirmedAnchor(config, key)
  return { config: nextConfig, review: syncReviewWithConfig(nextConfig, review) }
}

export function updateMapping(config, item, categoryKey = item?.categoryKey) {
  const choices = getCategoryChoices(config)
  const category = choices.find((choice) => choice.key === categoryKey)
  if (!category || !item) return config
  const next = structuredClone(config)
  const binding = next[item.collectionName]?.[item.index]
  if (!binding) return config
  next[item.collectionName][item.index] = {
    ...binding,
    semantic_key: category.key,
    semantic_confidence: 1,
    semantic_source: category.key === item.categoryKey ? "user_confirmed" : "user_override",
    ...(item.type === "bucket"
      ? { direction: category.direction === "inflow" ? "inflow" : "outflow", fallback: false }
      : { role: category.role || binding.role || "input", cash_direction: category.direction }),
  }
  return next
}

export function removeMapping(config, item) {
  if (!item) return config
  const next = structuredClone(config)
  next[item.collectionName] = (next[item.collectionName] || []).filter((_, index) => index !== item.index)
  return next
}

export function confirmEligibleMappings(config, review) {
  let next = config
  const eligible = buildMappingItems(config, review).filter((item) => item.kind === "confirmable")
  eligible.forEach((item) => {
    next = updateMapping(next, item, item.categoryKey)
  })
  const anchorKey = getCategoryAnchor(next)
  const modelAfterUpdate = buildMappingItems(next, review)
  if (modelAfterUpdate.every((item) => item.kind === "resolved") && isAnchorStructurallyComplete(next, anchorKey)) {
    next = withConfirmedAnchor(next, anchorKey)
  }
  return { config: next, review: syncReviewWithConfig(next, review), count: eligible.length }
}

export function buildReviewModel(config = {}, review = null) {
  const mappings = buildMappingItems(config, review)
  const actionMappings = mappings.filter((item) => ["unassigned", "low_confidence"].includes(item.kind))
  const confirmableMappings = mappings.filter((item) => item.kind === "confirmable")
  const resolvedMappings = mappings.filter((item) => item.kind === "resolved")
  const categoryAnchor = getCategoryAnchor(config)
  const confirmed = new Set((config?.review_metadata?.confirmed_anchors || []).map(toReviewKey))
  const workbookTasks = (review?.anchor_statuses || [])
    .filter((status) => status?.status !== "ready")
    .filter((status) => {
      const key = toReviewKey(status.key)
      if (key !== categoryAnchor) return true
      const semanticOpen = actionMappings.length || confirmableMappings.length
      return !semanticOpen && (!isAnchorStructurallyComplete(config, key) || !confirmed.has(key))
    })
    .map((status) => {
      const key = toReviewKey(status.key)
      const structurallyComplete = isAnchorStructurallyComplete(config, key)
      return {
        id: `anchor:${key}`,
        key,
        label: ANCHOR_LABELS[key] || status.label || key,
        message: structurallyComplete ? "Review the detected setup, then confirm it." : status.message,
        structurallyComplete,
      }
    })

  const completedCount = resolvedMappings.length
  const totalMappings = mappings.length
  return {
    mappings,
    actionMappings,
    confirmableMappings,
    resolvedMappings,
    workbookTasks,
    completedCount,
    totalMappings,
    blockerCount: actionMappings.length + confirmableMappings.length + workbookTasks.length,
    canActivate: actionMappings.length === 0 && confirmableMappings.length === 0 && workbookTasks.length === 0,
  }
}
