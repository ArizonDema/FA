import { useCallback, useEffect, useMemo, useState } from "react"
import { apiMultipartRequest, apiRequest, shortDate } from "../api"

function createEmptyV3Config() {
  const today = new Date().toISOString().slice(0, 10)
  return {
    version: "v3",
    sheet_name: "Cash Flow",
    layout_type: "freeform",
    period_granularity: "custom",
    period_axis: {
      orientation: "row",
      labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
      period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
    },
    period_resolution_rules: {
      custom_periods: [{ period_key: "period_1", date_start: today, date_end: today }],
    },
    opening_binding: null,
    closing_binding: null,
    bucket_bindings: [
      {
        bucket_key: "inflow_bucket",
        label: "Inflow Bucket",
        direction: "inflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "B1" }],
      },
      {
        bucket_key: "outflow_bucket",
        label: "Outflow Bucket",
        direction: "outflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "C1" }],
      },
    ],
    writer_policy: {
      preserve_formulas: true,
      full_recalc_on_open: true,
    },
    mapping_policy: {
      auto_create: true,
      high_confidence_threshold: 0.7,
      low_confidence_threshold: 0.35,
    },
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeRules(rules) {
  if (!Array.isArray(rules)) return []
  return rules
    .map((rule) => ({
      match_type: rule?.match_type || "contains",
      pattern: String(rule?.pattern || "").trim(),
      priority: Number(rule?.priority || 1000),
    }))
    .filter((rule) => rule.pattern)
}

function toDisplayText(value, fallback = "") {
  if (value === undefined || value === null) return fallback
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value.message) return toDisplayText(value.message, fallback)
  if (value.label) return toDisplayText(value.label, fallback)
  try {
    return JSON.stringify(value)
  } catch {
    return fallback || "Unknown"
  }
}

function humanizeTemplateMessage(value, fallback = "") {
  return toDisplayText(value, fallback)
    .replace(/bucket_targets/gi, "cash-flow categories")
    .replace(/row_bindings/gi, "indirect cash-flow rows")
    .replace(/semantic_key/gi, "category")
    .replace(/bucket values/gi, "category values")
    .replace(/cash flow buckets/gi, "cash-flow categories")
    .replace(/cash-flow buckets/gi, "cash-flow categories")
    .replace(/cash flow bucket/gi, "cash-flow category")
    .replace(/\bbuckets\b/gi, "categories")
    .replace(/\bbucket\b/gi, "category")
}

function normalizeMessageList(values) {
  const list = Array.isArray(values) ? values : values ? [values] : []
  return list.map((value) => humanizeTemplateMessage(value).trim()).filter(Boolean)
}

const DIRECT_CASH_FLOW_CATEGORIES = [
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

const INDIRECT_CASH_FLOW_CATEGORIES = [
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

const DIRECT_COVERAGE_LABELS = Object.fromEntries(DIRECT_CASH_FLOW_CATEGORIES.map((category) => [category.key, category.label]))
const INDIRECT_COVERAGE_LABELS = Object.fromEntries(INDIRECT_CASH_FLOW_CATEGORIES.map((category) => [category.key, category.label]))
const DIRECT_CATEGORY_LOOKUP = new Map(DIRECT_CASH_FLOW_CATEGORIES.map((category) => [category.key, category]))
const INDIRECT_CATEGORY_LOOKUP = new Map(INDIRECT_CASH_FLOW_CATEGORIES.map((category) => [category.key, category]))

const REVIEW_ANCHOR_LABELS = {
  period_axis: "Confirm where the workbook lists periods.",
  period_ranges: "Confirm the date range for each custom period.",
  bucket_targets: "Confirm where cash-flow category values should be written.",
  row_bindings: "Confirm the indirect cash-flow rows.",
}

function getCoverageLabel(value, fallback = "") {
  const key = normalizeKey(value)
  if (DIRECT_COVERAGE_LABELS[key] || INDIRECT_COVERAGE_LABELS[key]) {
    return DIRECT_COVERAGE_LABELS[key] || INDIRECT_COVERAGE_LABELS[key]
  }
  const display = toDisplayText(value, "").replace(/_/g, " ").trim()
  return display || fallback
}

function getReviewTaskLabel(value) {
  const key = normalizeKey(value)
  return REVIEW_ANCHOR_LABELS[key] || toDisplayText(value, "Review this template item.").replace(/_/g, " ")
}

function deriveSemanticCoverageFromConfig(config = {}) {
  const buckets = toArray(config.bucket_bindings)
  const rows = toArray(config.row_bindings)
  const labels = []

  buckets.forEach((bucket) => {
    if (bucket?.fallback) return
    if (bucket?.semantic_key) labels.push(getCoverageLabel(bucket.semantic_key, bucket.label))
    else if (bucket?.label) labels.push(toDisplayText(bucket.label))
  })
  rows.forEach((row) => {
    if (row?.label) labels.push(toDisplayText(row.label))
    else if (row?.semantic_key) labels.push(getCoverageLabel(row.semantic_key))
  })

  const categories = Array.from(new Set(labels.filter(Boolean))).map((display_name) => ({ display_name }))
  const unlabeledTargets =
    buckets.filter((bucket) => !bucket?.fallback && !bucket?.semantic_key).length +
    rows.filter((row) => !row?.semantic_key).length

  return {
    writable_categories: categories.length,
    unlabeled_targets: unlabeledTargets,
    message:
      categories.length > 0
        ? `This template can write to ${categories.length} cash-flow ${categories.length === 1 ? "category" : "categories"}.`
        : "This template needs cash-flow category labels before it can be checked against company activity.",
    categories,
    review_tasks: unlabeledTargets
      ? [{ title: "Confirm what this row represents", message: `${unlabeledTargets} writable row(s) need readable category labels.` }]
      : [],
  }
}

function normalizeSemanticCoverage(rawCoverage, config = {}) {
  const coverage = rawCoverage && typeof rawCoverage === "object" ? rawCoverage : deriveSemanticCoverageFromConfig(config)
  return {
    ...coverage,
    categories: toArray(coverage.categories).map((item) => ({
      ...item,
      display_name: item.display_name || getCoverageLabel(item.concept_key || item.semantic_key, "Cash-flow category"),
    })),
    review_tasks: toArray(coverage.review_tasks),
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizePeriodLabel(label, index = 0) {
  if (!label || typeof label !== "object") {
    const text = toDisplayText(label, `Period ${index + 1}`)
    return {
      period_key: periodKey(text, `period_${index + 1}`),
      label: text,
      period_type: "custom",
    }
  }
  return {
    ...label,
    period_key: periodKey(label.period_key || label.label, `period_${index + 1}`),
    label: toDisplayText(label.label || label.period_key, `Period ${index + 1}`),
    period_type: toDisplayText(label.period_type, "custom"),
  }
}

function normalizeCellBinding(cell, index = 0) {
  if (!cell || typeof cell !== "object") {
    return {
      period_key: `period_${index + 1}`,
      cell: toDisplayText(cell, ""),
      label: `Period ${index + 1}`,
    }
  }
  return {
    ...cell,
    period_key: periodKey(cell.period_key, `period_${index + 1}`),
    cell: toDisplayText(cell.cell || cell.address, ""),
    label: toDisplayText(cell.label || cell.period_key, `Period ${index + 1}`),
  }
}

function normalizeBindingGroup(group) {
  if (!group || typeof group !== "object") return null
  const cells = toArray(group.cells).map(normalizeCellBinding).filter((cell) => cell.cell)
  return cells.length ? { ...group, cells } : null
}

function normalizeTemplateConfigForUi(config) {
  const source = config && typeof config === "object" ? config : createEmptyV3Config()
  const periodLabels = toArray(source.period_axis?.labels).map(normalizePeriodLabel)
  const periodBindings = toArray(source.period_axis?.period_bindings).map(normalizeCellBinding)
  const bucketBindings = toArray(source.bucket_bindings).map((bucket, index) => {
    const safeBucket = bucket && typeof bucket === "object" ? bucket : {}
    return {
      ...safeBucket,
      bucket_key: normalizeKey(safeBucket.bucket_key || safeBucket.label || `bucket_${index + 1}`),
      label: toDisplayText(safeBucket.label || safeBucket.bucket_key, `Bucket ${index + 1}`),
      direction: safeBucket.direction === "outflow" ? "outflow" : "inflow",
      fallback: Boolean(safeBucket.fallback),
      rules: normalizeRules(safeBucket.rules),
      cells: toArray(safeBucket.cells).map(normalizeCellBinding),
    }
  })
  const rowBindings = toArray(source.row_bindings).map((row, index) => {
    const safeRow = row && typeof row === "object" ? row : {}
    return {
      ...safeRow,
      semantic_key: normalizeKey(safeRow.semantic_key || safeRow.label || `row_${index + 1}`),
      label: toDisplayText(safeRow.label || safeRow.semantic_key, `Row ${index + 1}`),
      cells: toArray(safeRow.cells).map(normalizeCellBinding),
    }
  })
  const openingBinding = normalizeBindingGroup(source.opening_binding)
  const closingBinding = normalizeBindingGroup(source.closing_binding)

  return {
    ...source,
    version: "v3",
    sheet_name: toDisplayText(source.sheet_name, "Cash Flow"),
    layout_type: toDisplayText(source.layout_type, "freeform"),
    period_granularity: toDisplayText(source.period_granularity, "custom"),
    period_axis: {
      ...(source.period_axis || {}),
      orientation: source.period_axis?.orientation === "column" ? "column" : "row",
      labels: periodLabels,
      period_bindings: periodBindings,
    },
    period_resolution_rules: {
      ...(source.period_resolution_rules || {}),
      custom_periods: toArray(source.period_resolution_rules?.custom_periods).map((period, index) => ({
        ...(period && typeof period === "object" ? period : {}),
        period_key: periodKey(period?.period_key, `period_${index + 1}`),
        date_start: toDisplayText(period?.date_start, ""),
        date_end: toDisplayText(period?.date_end, ""),
      })),
    },
    opening_binding: openingBinding,
    closing_binding: closingBinding,
    bucket_bindings: bucketBindings,
    row_bindings: rowBindings,
  }
}

function normalizeAnchorStatuses(statuses) {
  if (!Array.isArray(statuses)) return []
  return statuses.map((status, index) => {
    if (!status || typeof status !== "object") {
      const label = toDisplayText(status, `Anchor ${index + 1}`)
      return {
        key: normalizeKey(label) || `anchor_${index + 1}`,
        label,
        status: "needs_review",
        message: label,
      }
    }
    return {
      ...status,
      key: toDisplayText(status.key, `anchor_${index + 1}`),
      label: toDisplayText(status.label, status.key || `Anchor ${index + 1}`),
      status: toDisplayText(status.status, "needs_review"),
      message: humanizeTemplateMessage(status.message, ""),
    }
  })
}

function parseTemplateConfig(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText || "{}")
  } catch {
    throw new Error("Template settings are invalid. Open Advanced workbook setup and check the developer JSON.")
  }

  const isV3 = String(parsed?.version || "").toLowerCase() === "v3" || parsed?.period_axis
  if (!isV3) {
    return parsed
  }

  return {
    ...parsed,
    version: "v3",
    bucket_bindings: (parsed.bucket_bindings || []).map((bucket, index) => ({
      ...bucket,
      bucket_key: normalizeKey(bucket.bucket_key || `bucket_${index + 1}`),
      label: String(bucket.label || `Bucket ${index + 1}`).trim(),
      direction: bucket.direction === "outflow" ? "outflow" : "inflow",
      fallback: Boolean(bucket.fallback),
      rules: normalizeRules(bucket.rules),
      cells: Array.isArray(bucket.cells) ? bucket.cells : [],
    })),
  }
}

function formatApiError(error) {
  const details = error?.errors || error?.payload?.errors || null
  const anchorMessage = details?.activation_block_reason || details?.review?.activation_block_reason
  if (anchorMessage) return humanizeTemplateMessage(anchorMessage, "Request failed.")
  if (Array.isArray(details?.anchor_statuses)) {
    const firstOpen = details.anchor_statuses.find((status) => status.status !== "ready")
    if (firstOpen?.message) return humanizeTemplateMessage(firstOpen.message, "Request failed.")
  }
  return humanizeTemplateMessage(error?.message, "Request failed.")
}

function periodKey(value, fallback = "period_1") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback
}

function withConfirmedAnchor(config, anchorKey) {
  const key = periodKey(anchorKey, "")
  if (!key) return config
  const existing = Array.isArray(config.review_metadata?.confirmed_anchors)
    ? config.review_metadata.confirmed_anchors
    : []
  return {
    ...config,
    review_metadata: {
      ...(config.review_metadata || {}),
      confirmed_anchors: Array.from(new Set([...existing, key])),
    },
  }
}

function confirmAnchorInReview(review, anchorKey) {
  if (!review) return review
  const key = periodKey(anchorKey, "")
  const anchorStatuses = (review.anchor_statuses || []).map((status) =>
    status.key === key
      ? { ...status, status: "ready", message: `${status.label || "Anchor"} confirmed.` }
      : status,
  )
  const unresolved = anchorStatuses.filter((status) => status.status !== "ready")
  return {
    ...review,
    anchor_statuses: anchorStatuses,
    required_anchors: unresolved.map((status) => status.key),
    can_activate: unresolved.length === 0,
    review_state: unresolved.length === 0 ? "ready" : "needs_review",
    activation_block_reason: unresolved[0]?.message || null,
  }
}

function updatePeriodCell(config, targetPeriodKey, cellAddress) {
  const labels = Array.isArray(config.period_axis?.labels) ? config.period_axis.labels : []
  const fallbackPeriodKey = periodKey(labels[0]?.period_key || "period_1")
  const nextPeriodKey = periodKey(targetPeriodKey || fallbackPeriodKey)
  const existingBindings = Array.isArray(config.period_axis?.period_bindings)
    ? config.period_axis.period_bindings
    : []
  const byKey = new Map(existingBindings.map((binding) => [periodKey(binding.period_key), binding]))
  const label = labels.find((item) => periodKey(item.period_key) === nextPeriodKey)
  byKey.set(nextPeriodKey, {
    ...(byKey.get(nextPeriodKey) || {}),
    period_key: nextPeriodKey,
    label: label?.label || nextPeriodKey,
    cell: cellAddress,
  })
  return {
    ...config,
    period_axis: {
      ...(config.period_axis || {}),
      labels,
      period_bindings: Array.from(byKey.values()),
    },
  }
}

function updateBindingCell(collection, targetKeyName, targetKeyValue, targetPeriodKey, cellAddress) {
  return (Array.isArray(collection) ? collection : []).map((item) => {
    if (periodKey(item?.[targetKeyName]) !== periodKey(targetKeyValue)) return item
    const cells = Array.isArray(item.cells) ? item.cells : []
    const period = periodKey(targetPeriodKey)
    const nextCells = cells.some((cell) => periodKey(cell.period_key) === period)
      ? cells.map((cell) =>
          periodKey(cell.period_key) === period
            ? { ...cell, period_key: period, cell: cellAddress }
            : cell,
        )
      : [...cells, { period_key: period, cell: cellAddress }]
    return { ...item, cells: nextCells }
  })
}

function mergeReviewPayload(target, payload) {
  if (!target || !payload) return target
  return {
    ...target,
    required_anchors: normalizeMessageList(payload.required_anchors || target.required_anchors),
    review_state: payload.review_state || target.review_state,
    can_activate: payload.can_activate,
    activation_block_reason: humanizeTemplateMessage(payload.activation_block_reason, ""),
    anchor_statuses: normalizeAnchorStatuses(payload.anchor_statuses || target.anchor_statuses),
  }
}

function getFileSignature(file) {
  if (!file) return null
  return `${file.name || ""}::${file.size || 0}::${file.lastModified || 0}`
}

function getStatementMethodForUi(config = {}) {
  const explicit = String(config?.statement_method || "").trim().toLowerCase()
  if (explicit === "indirect" || explicit === "direct") return explicit
  return toArray(config?.row_bindings).length > 0 ? "indirect" : "direct"
}

function getCategoryChoices(config = {}) {
  return getStatementMethodForUi(config) === "indirect" ? INDIRECT_CASH_FLOW_CATEGORIES : DIRECT_CASH_FLOW_CATEGORIES
}

function getCategoryLookup(config = {}) {
  return getStatementMethodForUi(config) === "indirect" ? INDIRECT_CATEGORY_LOOKUP : DIRECT_CATEGORY_LOOKUP
}

function formatDirection(value) {
  const normalized = String(value || "").toLowerCase()
  if (normalized === "inflow") return "Cash in"
  if (normalized === "outflow") return "Cash out"
  if (normalized === "mixed") return "Summary"
  return "Reference row"
}

function confidenceFromBinding(binding = {}) {
  const raw =
    binding.semantic_confidence ??
    binding.semanticConfidence ??
    binding.confidence ??
    binding.confidence_score ??
    null
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null
}

function confidenceLabel(score) {
  if (score === null || score === undefined) return "Not scored"
  if (score >= 0.9) return "High"
  if (score >= 0.7) return "Good"
  if (score >= 0.45) return "Needs a quick check"
  return "Needs review"
}

function confidencePercent(score) {
  if (score === null || score === undefined) return ""
  return `${Math.round(score * 100)}%`
}

function isKnownReviewCategory(config, semanticKey) {
  if (!semanticKey) return false
  return getCategoryLookup(config).has(normalizeKey(semanticKey))
}

function reviewReasonForBinding({ binding, category, confidence, knownCategory }) {
  if (!knownCategory) return "The analyzer could not match this row to a cash-flow category."
  if (confidence !== null && confidence < 0.7) {
    return `The analyzer suggested ${category?.label || "this category"}, but confidence is low.`
  }
  if (binding?.semantic_source === "user_override") return "You changed this category."
  if (binding?.semantic_source === "user_confirmed") return "You confirmed this category."
  if (binding?.semantic_source === "llm_semantic_repair") return "The local LLM matched this row by meaning."
  if (binding?.semantic_source === "label_inferred") return "Matched from the template row label."
  return "Matched from the template row meaning."
}

function buildTemplateReviewItems(config = {}) {
  const method = getStatementMethodForUi(config)
  if (method === "indirect") {
    return toArray(config.row_bindings).map((row, index) => {
      const semanticKey = normalizeKey(row?.semantic_key || "")
      const category = INDIRECT_CATEGORY_LOOKUP.get(semanticKey) || null
      const confidence = confidenceFromBinding(row)
      const knownCategory = Boolean(category)
      const userConfirmed = ["user_confirmed", "user_override"].includes(String(row?.semantic_source || ""))
      return {
        type: "row",
        anchorKey: "row_bindings",
        index,
        rowLabel: toDisplayText(row?.label || row?.semantic_key, `Row ${index + 1}`),
        categoryKey: semanticKey,
        categoryLabel: category?.label || getCoverageLabel(semanticKey, "Choose category"),
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        directionLabel: formatDirection(row?.cash_direction || category?.direction),
        userConfirmed,
        needsReview: !knownCategory || (confidence !== null && confidence < 0.7),
        reason: reviewReasonForBinding({ binding: row, category, confidence, knownCategory }),
      }
    })
  }

  return toArray(config.bucket_bindings)
    .map((bucket, index) => {
      const semanticKey = normalizeKey(bucket?.semantic_key || "")
      const category = DIRECT_CATEGORY_LOOKUP.get(semanticKey) || null
      const confidence = confidenceFromBinding(bucket)
      const knownCategory = Boolean(category)
      const userConfirmed = ["user_confirmed", "user_override"].includes(String(bucket?.semantic_source || ""))
      return {
        type: "bucket",
        anchorKey: "bucket_targets",
        index,
        rowLabel: toDisplayText(bucket?.label || bucket?.bucket_key, `Template row ${index + 1}`),
        categoryKey: semanticKey,
        categoryLabel: category?.label || getCoverageLabel(semanticKey, "Choose category"),
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        directionLabel: formatDirection(bucket?.direction || category?.direction),
        isFallback: Boolean(bucket?.fallback),
        userConfirmed,
        needsReview: !bucket?.fallback && (!knownCategory || (confidence !== null && confidence < 0.7)),
        reason: bucket?.fallback
          ? "Used only if an account cannot be mapped to a specific row."
          : reviewReasonForBinding({ binding: bucket, category, confidence, knownCategory }),
      }
    })
    .filter((item) => !item.isFallback)
}

function buildPlainReviewSummary(config = {}, review = null) {
  const baseItems = buildTemplateReviewItems(config)
  const anchorStatuses = normalizeAnchorStatuses(review?.anchor_statuses)
  const categoryAnchorKeys = new Set(baseItems.map((item) => item.anchorKey))
  const unresolvedAnchors = anchorStatuses.filter((status) => status.status !== "ready")
  const categoryAnchorsNeedingConfirmation = new Set(
    unresolvedAnchors.filter((status) => categoryAnchorKeys.has(status.key)).map((status) => status.key),
  )
  const items = baseItems.map((item) => {
    if (!categoryAnchorsNeedingConfirmation.has(item.anchorKey) || item.userConfirmed || item.needsReview) {
      return item
    }
    return {
      ...item,
      needsReview: true,
      reason: "Please confirm this suggested category before activation.",
    }
  })
  const reviewItems = items.filter((item) => item.needsReview)
  const workbookAnchors = unresolvedAnchors.filter((status) => !categoryAnchorKeys.has(status.key))
  const needsCategoryConfirmation = categoryAnchorsNeedingConfirmation.size > 0
  const blockerCount = reviewItems.length + workbookAnchors.length
  return {
    items,
    readyItems: items.filter((item) => !item.needsReview),
    reviewItems,
    unresolvedAnchors: workbookAnchors,
    needsCategoryConfirmation,
    blockerCount,
    canActivate: Boolean(review?.can_activate) && blockerCount === 0,
  }
}

function getTemplateConfig(template = {}) {
  return template?.activeVersion?.config_json || template?.config_json || {}
}

function getTemplateListReview(template = {}) {
  const summary = buildPlainReviewSummary(getTemplateConfig(template), template)
  const backendBlocked = template?.can_activate === false
  const backendMessage = humanizeTemplateMessage(template?.activation_block_reason, "")
  if (summary.blockerCount > 0) {
    return {
      canActivate: false,
      label: `Review ${summary.blockerCount} ${summary.blockerCount === 1 ? "item" : "items"}`,
    }
  }
  if (backendBlocked) {
    return {
      canActivate: false,
      label: backendMessage || "Needs review",
    }
  }
  return {
    canActivate: true,
    label: "Ready",
  }
}

function updateReviewBinding(config, item, updater) {
  const next = clone(config)
  const collectionName = item.type === "row" ? "row_bindings" : "bucket_bindings"
  const collection = toArray(next[collectionName])
  next[collectionName] = collection.map((binding, index) => (index === item.index ? updater(binding || {}) : binding))
  return next
}

function removeReviewBinding(config, item) {
  const next = clone(config)
  const collectionName = item.type === "row" ? "row_bindings" : "bucket_bindings"
  next[collectionName] = toArray(next[collectionName]).filter((_, index) => index !== item.index)
  return next
}

function canConfirmReviewAnchor(config, review, anchorKey) {
  const items = buildTemplateReviewItems(config).filter((item) => item.anchorKey === anchorKey)
  if (!items.length) return false
  const anchorStillOpen = normalizeAnchorStatuses(review?.anchor_statuses).some(
    (status) => status.key === anchorKey && status.status !== "ready",
  )
  if (anchorStillOpen) {
    return items.every((item) => item.userConfirmed && !item.needsReview)
  }
  return items.every((item) => !item.needsReview)
}

function BucketGrid({ config, onChange }) {
  const buckets = toArray(config.bucket_bindings)

  const updateBucket = (bucketIndex, updates) => {
    const next = clone(config)
    next.bucket_bindings[bucketIndex] = {
      ...next.bucket_bindings[bucketIndex],
      ...updates,
    }
    onChange(next)
  }

  const removeBucket = (bucketIndex) => {
    const next = clone(config)
    next.bucket_bindings = toArray(next.bucket_bindings).filter((_, index) => index !== bucketIndex)
    onChange(next)
  }

  const addBucket = () => {
    const next = clone(config)
    const index = toArray(next.bucket_bindings).length + 1
    const firstPeriodKey = next.period_axis?.labels?.[0]?.period_key || "period_1"
    next.bucket_bindings = [
      ...toArray(next.bucket_bindings),
      {
        bucket_key: `bucket_${index}`,
        label: `Bucket ${index}`,
        direction: "inflow",
        fallback: false,
        rules: [],
        cells: [{ period_key: firstPeriodKey, cell: "A1", label: "Period" }],
      },
    ]
    onChange(next)
  }

  return (
    <div className="stack">
      <div className="inline-actions">
        <h4>Bucket Rules</h4>
        <button type="button" onClick={addBucket}>
          Add Bucket
        </button>
      </div>
      {buckets.map((bucket, bucketIndex) => (
        <div className="mini-card stack" key={`${bucket.bucket_key}_${bucketIndex}`}>
          <div className="inline-actions">
            <strong>{bucket.label || bucket.bucket_key}</strong>
            <button type="button" onClick={() => removeBucket(bucketIndex)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label>
              Bucket Key
              <input
                value={bucket.bucket_key || ""}
                onChange={(event) => updateBucket(bucketIndex, { bucket_key: normalizeKey(event.target.value) })}
              />
            </label>
            <label>
              Label
              <input
                value={bucket.label || ""}
                onChange={(event) => updateBucket(bucketIndex, { label: event.target.value })}
              />
            </label>
            <label>
              Direction
              <select
                value={bucket.direction || "inflow"}
                onChange={(event) => updateBucket(bucketIndex, { direction: event.target.value })}
              >
                <option value="inflow">Inflow</option>
                <option value="outflow">Outflow</option>
              </select>
            </label>
            <label>
              Fallback
              <select
                value={bucket.fallback ? "yes" : "no"}
                onChange={(event) => updateBucket(bucketIndex, { fallback: event.target.value === "yes" })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>

          <div className="stack">
            <div className="inline-actions">
              <h4>Rules</h4>
              <button
                type="button"
                onClick={() => {
                  const nextRules = [...(bucket.rules || []), { match_type: "contains", pattern: "", priority: 1000 }]
                  updateBucket(bucketIndex, { rules: nextRules })
                }}
              >
                Add Rule
              </button>
            </div>
            {toArray(bucket.rules).map((rule, ruleIndex) => (
              <div className="form-grid compact" key={`${bucket.bucket_key}_rule_${ruleIndex}`}>
                <label>
                  Match Type
                  <select
                    value={rule.match_type}
                    onChange={(event) => {
                      const nextRules = [...toArray(bucket.rules)]
                      nextRules[ruleIndex] = { ...nextRules[ruleIndex], match_type: event.target.value }
                      updateBucket(bucketIndex, { rules: nextRules })
                    }}
                  >
                    <option value="exact">Exact</option>
                    <option value="contains">Contains</option>
                  </select>
                </label>
                <label>
                  Pattern
                  <input
                    value={rule.pattern}
                    onChange={(event) => {
                      const nextRules = [...toArray(bucket.rules)]
                      nextRules[ruleIndex] = { ...nextRules[ruleIndex], pattern: event.target.value }
                      updateBucket(bucketIndex, { rules: nextRules })
                    }}
                  />
                </label>
                <label>
                  Priority
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(event) => {
                      const nextRules = [...toArray(bucket.rules)]
                      nextRules[ruleIndex] = {
                        ...nextRules[ruleIndex],
                        priority: Number(event.target.value || 1000),
                      }
                      updateBucket(bucketIndex, { rules: nextRules })
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextRules = toArray(bucket.rules).filter((_, index) => index !== ruleIndex)
                    updateBucket(bucketIndex, { rules: nextRules })
                  }}
                >
                  Remove Rule
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {buckets.length === 0 && <p className="muted small">No buckets detected yet. Add buckets manually.</p>}
    </div>
  )
}

function AnchorReviewWorkspace({ config, review, editorContext, onConfigChange, onReviewChange }) {
  const workbook = editorContext?.workbook || null
  const sheets = toArray(workbook?.worksheets).map((sheet, index) => ({
    ...(sheet && typeof sheet === "object" ? sheet : {}),
    name: toDisplayText(sheet?.name, `Sheet ${index + 1}`),
    rows: toArray(sheet?.rows).map((row, rowIndex) => ({
      ...(row && typeof row === "object" ? row : {}),
      row_index: row?.row_index || rowIndex + 1,
      cells: toArray(row?.cells).map((cell, cellIndex) => ({
        ...(cell && typeof cell === "object" ? cell : {}),
        address: toDisplayText(cell?.address, `R${rowIndex + 1}C${cellIndex + 1}`),
        display_value: toDisplayText(cell?.display_value ?? cell?.value ?? cell?.formula, ""),
      })),
    })),
  }))
  const [selectedAnchor, setSelectedAnchor] = useState("period_axis")
  const [selectedSheet, setSelectedSheet] = useState("")
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [selectedBucket, setSelectedBucket] = useState("")
  const [selectedRow, setSelectedRow] = useState("")

  const anchorStatuses = normalizeAnchorStatuses(review?.anchor_statuses)
  const periods = toArray(config.period_axis?.labels).map(normalizePeriodLabel)
  const buckets = toArray(config.bucket_bindings)
  const rowBindings = toArray(config.row_bindings)
  const activeSheet = sheets.find((sheet) => sheet.name === selectedSheet) || sheets[0] || null

  useEffect(() => {
    if (!selectedSheet && sheets[0]?.name) setSelectedSheet(sheets[0].name)
  }, [selectedSheet, sheets])

  useEffect(() => {
    if (!selectedPeriod && periods[0]?.period_key) setSelectedPeriod(periods[0].period_key)
  }, [periods, selectedPeriod])

  useEffect(() => {
    if (!selectedBucket && buckets[0]?.bucket_key) setSelectedBucket(buckets[0].bucket_key)
  }, [buckets, selectedBucket])

  useEffect(() => {
    if (!selectedRow && rowBindings[0]?.semantic_key) setSelectedRow(rowBindings[0].semantic_key)
  }, [rowBindings, selectedRow])

  const confirmAnchor = (anchorKey, nextConfig) => {
    onConfigChange(withConfirmedAnchor(nextConfig, anchorKey))
    onReviewChange(confirmAnchorInReview(review, anchorKey))
  }

  const assignCell = (cellAddress) => {
    if (!cellAddress) return
    if (selectedAnchor === "period_axis") {
      confirmAnchor("period_axis", updatePeriodCell(config, selectedPeriod, cellAddress))
      return
    }
    if (selectedAnchor === "bucket_targets") {
      confirmAnchor("bucket_targets", {
        ...config,
        bucket_bindings: updateBindingCell(
          config.bucket_bindings,
          "bucket_key",
          selectedBucket || buckets[0]?.bucket_key,
          selectedPeriod,
          cellAddress,
        ),
      })
      return
    }
    if (selectedAnchor === "row_bindings") {
      confirmAnchor("row_bindings", {
        ...config,
        row_bindings: updateBindingCell(
          config.row_bindings,
          "semantic_key",
          selectedRow || rowBindings[0]?.semantic_key,
          selectedPeriod,
          cellAddress,
        ),
      })
    }
  }

  const updateCustomPeriod = (targetPeriodKey, updates) => {
    const existing = Array.isArray(config.period_resolution_rules?.custom_periods)
      ? config.period_resolution_rules.custom_periods
      : []
    const key = periodKey(targetPeriodKey)
    const nextPeriods = existing.some((item) => periodKey(item.period_key) === key)
      ? existing.map((item) => (periodKey(item.period_key) === key ? { ...item, ...updates, period_key: key } : item))
      : [...existing, { period_key: key, ...updates }]
    confirmAnchor("period_ranges", {
      ...config,
      period_resolution_rules: {
        ...(config.period_resolution_rules || {}),
        custom_periods: nextPeriods,
      },
    })
  }

  const customPeriods = periods.filter((item) => String(item.period_type || "").toLowerCase() === "custom")
  const customPeriodLookup = new Map(
    toArray(config.period_resolution_rules?.custom_periods).map((item) => [periodKey(item?.period_key), item || {}]),
  )

  return (
    <div className="review-workspace">
      <div className="mini-card stack">
        <div>
          <p className="kicker">Review Checklist</p>
          <h3>{review?.can_activate ? "Ready to Activate" : "Needs Review"}</h3>
          {review?.activation_block_reason && <p className="muted small">{review.activation_block_reason}</p>}
        </div>
        <div className="anchor-list">
          {anchorStatuses.map((status) => (
            <button
              type="button"
              key={status.key}
              className={`anchor-pill ${selectedAnchor === status.key ? "active" : ""} ${status.status}`}
              onClick={() => setSelectedAnchor(status.key)}
            >
              <span>{status.label}</span>
              <strong>{status.status === "ready" ? "Ready" : "Review"}</strong>
            </button>
          ))}
          {anchorStatuses.length === 0 && <p className="muted small">Run analysis to see required anchors.</p>}
        </div>
      </div>

      <div className="mini-card stack">
        <div className="inline-actions">
          <label>
            Anchor
            <select value={selectedAnchor} onChange={(event) => setSelectedAnchor(event.target.value)}>
              <option value="period_axis">Period axis</option>
              <option value="period_ranges">Period ranges</option>
              <option value="bucket_targets">Bucket targets</option>
              <option value="row_bindings">Indirect row bindings</option>
            </select>
          </label>
          <label>
            Period
            <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
              {periods.map((period) => (
                <option key={period.period_key} value={period.period_key}>
                  {period.label || period.period_key}
                </option>
              ))}
            </select>
          </label>
          {selectedAnchor === "bucket_targets" && (
            <label>
              Bucket
              <select value={selectedBucket} onChange={(event) => setSelectedBucket(event.target.value)}>
                {buckets.map((bucket) => (
                  <option key={bucket.bucket_key} value={bucket.bucket_key}>
                    {bucket.label || bucket.bucket_key}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedAnchor === "row_bindings" && (
            <label>
              Row
              <select value={selectedRow} onChange={(event) => setSelectedRow(event.target.value)}>
                {rowBindings.map((row) => (
                  <option key={row.semantic_key} value={row.semantic_key}>
                    {row.label || row.semantic_key}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {selectedAnchor === "period_ranges" && (
          <div className="stack">
            {customPeriods.map((period) => {
              const range = customPeriodLookup.get(periodKey(period.period_key)) || {}
              return (
                <div className="form-grid compact" key={period.period_key}>
                  <label>
                    {period.label || period.period_key} Start
                    <input
                      type="date"
                      value={range.date_start || ""}
                      onChange={(event) => updateCustomPeriod(period.period_key, { date_start: event.target.value })}
                    />
                  </label>
                  <label>
                    {period.label || period.period_key} End
                    <input
                      type="date"
                      value={range.date_end || ""}
                      onChange={(event) => updateCustomPeriod(period.period_key, { date_end: event.target.value })}
                    />
                  </label>
                </div>
              )
            })}
            {customPeriods.length === 0 && <p className="muted small">No custom periods need date ranges.</p>}
          </div>
        )}

        {selectedAnchor !== "period_ranges" && (
          <>
            <div className="inline-actions">
              <label>
                Sheet Preview
                <select value={activeSheet?.name || ""} onChange={(event) => setSelectedSheet(event.target.value)}>
                  {sheets.map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">
                Click a cell below to assign it to the selected anchor. No JSON spelunking required.
              </p>
            </div>
            <div className="workbook-preview">
              {(activeSheet?.rows || []).slice(0, 80).map((row, rowIndex) => (
                <div className="workbook-row" key={row.row_index || `row_${rowIndex}`}>
                  <span className="workbook-row-index">{row.row_index}</span>
                  {(row.cells || []).slice(0, 40).map((cell) => (
                    <button
                      type="button"
                      className="workbook-cell"
                      key={cell.address}
                      title={`${cell.address}: ${cell.display_value || ""}`}
                      onClick={() => assignCell(cell.address)}
                    >
                      <strong>{cell.address}</strong>
                      <span>{cell.display_value || "\u00a0"}</span>
                    </button>
                  ))}
                </div>
              ))}
              {!activeSheet && <p className="muted small">No workbook preview is available for this template yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TemplateReviewPanel({ config, review, onConfigChange, onReviewChange }) {
  const summary = useMemo(() => buildPlainReviewSummary(config, review), [config, review])
  const choices = useMemo(() => getCategoryChoices(config), [config])

  const applyReviewedConfig = (nextConfig, anchorKey) => {
    let finalConfig = nextConfig
    let finalReview = review
    if (canConfirmReviewAnchor(nextConfig, review, anchorKey)) {
      finalConfig = withConfirmedAnchor(nextConfig, anchorKey)
      finalReview = confirmAnchorInReview(review, anchorKey)
    }
    onConfigChange(finalConfig)
    if (finalReview && finalReview !== review) onReviewChange(finalReview)
  }

  const acceptItem = (item) => {
    if (!isKnownReviewCategory(config, item.categoryKey)) return
    const nextConfig = updateReviewBinding(config, item, (binding) => ({
      ...binding,
      semantic_confidence: 1,
      semantic_source: "user_confirmed",
    }))
    applyReviewedConfig(nextConfig, item.anchorKey)
  }

  const changeItemCategory = (item, categoryKey) => {
    const category = choices.find((choice) => choice.key === categoryKey)
    if (!category) return
    const nextConfig = updateReviewBinding(config, item, (binding) => ({
      ...binding,
      semantic_key: category.key,
      semantic_confidence: 1,
      semantic_source: "user_override",
      ...(item.type === "bucket"
        ? { direction: category.direction === "inflow" ? "inflow" : "outflow", fallback: false }
        : { role: category.role || binding.role || "input", cash_direction: category.direction }),
    }))
    applyReviewedConfig(nextConfig, item.anchorKey)
  }

  const removeItem = (item) => {
    const nextConfig = removeReviewBinding(config, item)
    applyReviewedConfig(nextConfig, item.anchorKey)
  }

  const renderItem = (item) => (
    <article className={`template-review-row ${item.needsReview ? "needs-review" : "ready"}`} key={`${item.type}_${item.index}_${item.rowLabel}`}>
      <div>
        <p className="kicker">Template row</p>
        <h4>{item.rowLabel}</h4>
        <p className="muted small">{item.reason}</p>
      </div>
      <div>
        <p className="kicker">Cash-flow category</p>
        <strong>{item.categoryLabel}</strong>
        <p className="muted small">{item.directionLabel}</p>
      </div>
      <div>
        <p className="kicker">Confidence</p>
        <strong>{item.confidenceLabel}</strong>
        {confidencePercent(item.confidence) && <p className="muted small">{confidencePercent(item.confidence)}</p>}
      </div>
      <div className="template-review-actions">
        <label>
          Change category
          <select
            value={item.categoryKey || ""}
            onChange={(event) => changeItemCategory(item, event.target.value)}
          >
            <option value="">Choose category</option>
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label} ({formatDirection(choice.direction)})
              </option>
            ))}
          </select>
        </label>
        <div className="inline-actions">
          <button type="button" onClick={() => acceptItem(item)} disabled={!isKnownReviewCategory(config, item.categoryKey)}>
            Accept
          </button>
          <button type="button" onClick={() => removeItem(item)}>
            Not a cash-flow row
          </button>
        </div>
      </div>
    </article>
  )

  return (
    <div className="template-review-panel stack">
      <div className={summary.blockerCount ? "alert warn" : "alert ok"}>
        <strong>
          {summary.blockerCount
            ? `Review ${summary.blockerCount} ${summary.blockerCount === 1 ? "item" : "items"} before activation.`
            : "This template is ready to activate."}
        </strong>
        <p className="small">
          You can save this template as a draft at any time. Reports will only use it after the review items are resolved
          and the template is activated.
        </p>
      </div>

      {summary.reviewItems.length > 0 && (
        <section className="template-review-section stack">
          <div>
            <p className="kicker">Needs your review</p>
            <h3>Confirm what these rows mean</h3>
          </div>
          <div className="template-review-list">{summary.reviewItems.map(renderItem)}</div>
        </section>
      )}

      {summary.readyItems.length > 0 && (
        <section className="template-review-section stack">
          <div>
            <p className="kicker">What we understood</p>
            <h3>{summary.readyItems.length} cash-flow {summary.readyItems.length === 1 ? "row" : "rows"} mapped</h3>
            {summary.needsCategoryConfirmation && (
              <p className="muted small">Press Accept on the rows you agree with, or change any category that looks wrong.</p>
            )}
          </div>
          <div className="template-review-list compact">{summary.readyItems.map(renderItem)}</div>
        </section>
      )}

      {summary.items.length === 0 && (
        <div className="alert warn">
          <strong>No writable cash-flow rows were detected.</strong>
          <p className="small">Save this as a draft only if you plan to finish the template setup in Advanced workbook setup.</p>
        </div>
      )}

      {summary.unresolvedAnchors.length > 0 && (
        <section className="template-review-section stack">
          <div>
            <p className="kicker">Workbook setup still needed</p>
            <h3>Fix these before activation</h3>
          </div>
          <ul className="simple-list">
            {summary.unresolvedAnchors.map((status) => (
              <li key={status.key}>{status.message || getReviewTaskLabel(status.key)}</li>
            ))}
          </ul>
          <p className="muted small">Open Advanced workbook setup below to adjust cells or custom date ranges.</p>
        </section>
      )}
    </div>
  )
}

function AdvancedTemplateTools({
  config,
  review,
  editorContext,
  onConfigChange,
  onReviewChange,
  rawConfigText,
  onRawConfigTextChange,
}) {
  const bindingSummary = {
    periods: Array.isArray(config.period_axis?.labels) ? config.period_axis.labels.length : 0,
    opening: Array.isArray(config.opening_binding?.cells) ? config.opening_binding.cells.length : 0,
    closing: Array.isArray(config.closing_binding?.cells) ? config.closing_binding.cells.length : 0,
    categories:
      getStatementMethodForUi(config) === "indirect"
        ? toArray(config.row_bindings).length
        : toArray(config.bucket_bindings).filter((bucket) => !bucket?.fallback).length,
  }

  return (
    <details className="mini-card advanced-template-tools">
      <summary>Advanced workbook setup</summary>
      <div className="stack">
        <p className="muted small">
          Use this only when the analyzer picked the wrong workbook cells, periods, or low-level rules.
        </p>

        <AnchorReviewWorkspace
          config={config}
          review={review}
          editorContext={editorContext}
          onConfigChange={onConfigChange}
          onReviewChange={onReviewChange}
        />

        <div className="form-grid">
          <label>
            Sheet Name
            <input
              value={config.sheet_name || ""}
              onChange={(event) => onConfigChange({ ...config, sheet_name: event.target.value })}
            />
          </label>
          <label>
            Layout Type
            <select
              value={config.layout_type || "freeform"}
              onChange={(event) => onConfigChange({ ...config, layout_type: event.target.value })}
            >
              <option value="rows">Rows</option>
              <option value="columns">Columns</option>
              <option value="sectioned">Sectioned</option>
              <option value="freeform">Freeform</option>
            </select>
          </label>
          <label>
            Period Granularity
            <select
              value={config.period_granularity || "custom"}
              onChange={(event) => onConfigChange({ ...config, period_granularity: event.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Axis Orientation
            <select
              value={config.period_axis?.orientation || "row"}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  period_axis: {
                    ...(config.period_axis || {}),
                    orientation: event.target.value,
                  },
                })
              }
            >
              <option value="row">Row</option>
              <option value="column">Column</option>
            </select>
          </label>
        </div>

        <p className="muted small">
          Technical coverage: Periods {bindingSummary.periods}, Opening {bindingSummary.opening}, Closing{" "}
          {bindingSummary.closing}, Categories {bindingSummary.categories}
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Type</th>
                <th>Key</th>
              </tr>
            </thead>
            <tbody>
              {toArray(config.period_axis?.labels).map((label, index) => {
                const period = normalizePeriodLabel(label, index)
                return (
                  <tr key={period.period_key}>
                    <td>{period.label}</td>
                    <td>{period.period_type || "custom"}</td>
                    <td>{period.period_key}</td>
                  </tr>
                )
              })}
              {toArray(config.period_axis?.labels).length === 0 && (
                <tr>
                  <td colSpan={3}>No periods detected yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {getStatementMethodForUi(config) === "direct" && <BucketGrid config={config} onChange={onConfigChange} />}

        <details className="advanced-config-json">
          <summary>Developer config JSON</summary>
          <label>
            Expert fallback
            <textarea
              rows={12}
              value={rawConfigText}
              onChange={(event) => onRawConfigTextChange(event.target.value)}
            />
          </label>
        </details>
      </div>
    </details>
  )
}

export function CashFlowTemplatesPanel({ token, selectedFundId, onError, onNote }) {
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingUpload, setSavingUpload] = useState(false)
  const [savingEditor, setSavingEditor] = useState(false)
  const [reanalyzingTemplateId, setReanalyzingTemplateId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [uploadForm, setUploadForm] = useState({
    name: "",
    version: "",
    template_file: null,
  })
  const [analysis, setAnalysis] = useState(null)
  const [editorContext, setEditorContext] = useState(null)
  const [configDraft, setConfigDraft] = useState(createEmptyV3Config())
  const [rawConfigText, setRawConfigText] = useState(JSON.stringify(createEmptyV3Config(), null, 2))
  const [editingTemplate, setEditingTemplate] = useState(null)

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active) || null,
    [templates],
  )
  const currentUploadSignature = useMemo(() => getFileSignature(uploadForm.template_file), [uploadForm.template_file])
  const hasMatchingUploadAnalysis =
    analysis?.analysis_scope === "upload" &&
    Boolean(analysis?.id) &&
    Boolean(currentUploadSignature) &&
    analysis.file_signature === currentUploadSignature

  const loadTemplates = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const response = await apiRequest(`/cash-flow/templates?portfolio_id=${selectedFundId}`, { token })
      setTemplates(response.data.templates || [])
    } catch (error) {
      onError(formatApiError(error))
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    setAnalysis(null)
    setEditorContext(null)
    setEditingTemplate(null)
    setConfigDraft(createEmptyV3Config())
    setRawConfigText(JSON.stringify(createEmptyV3Config(), null, 2))
    setUploadForm({ name: "", version: "", template_file: null })
    if (!selectedFundId) {
      setTemplates([])
      return
    }
    loadTemplates()
  }, [loadTemplates, selectedFundId])

  const applyDraftConfig = (nextConfig) => {
    const normalizedConfig = normalizeTemplateConfigForUi(nextConfig)
    setConfigDraft(normalizedConfig)
    setRawConfigText(JSON.stringify(normalizedConfig, null, 2))
  }

  const applyReviewChange = (nextReview) => {
    setEditorContext((prev) => (prev ? { ...prev, review: nextReview } : prev))
    setAnalysis((prev) => mergeReviewPayload(prev, nextReview))
  }

  const handleAnalyzeTemplate = async () => {
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    if (!uploadForm.template_file) {
      onError("Choose a template file before running analysis.")
      return
    }

    try {
      setAnalyzing(true)
      const formData = new FormData()
      formData.append("portfolio_id", selectedFundId)
      formData.append("template_file", uploadForm.template_file)
      const response = await apiMultipartRequest("/cash-flow/templates/analyze", {
        token,
        formData,
      })
      const nextAnalysis = response.data.analysis
      const suggestedConfig = response.data.suggested_config_json || createEmptyV3Config()
      setAnalysis({
        ...nextAnalysis,
        analysis_scope: "upload",
        file_signature: getFileSignature(uploadForm.template_file),
        detected_layout: response.data.detected_layout,
        confidence: response.data.confidence,
        issues: normalizeMessageList(response.data.issues),
        required_anchors: normalizeMessageList(response.data.required_anchors),
        needs_human_review: Boolean(response.data.needs_human_review),
        review_state: response.data.review_state,
        can_activate: response.data.can_activate,
        activation_block_reason: humanizeTemplateMessage(response.data.activation_block_reason, ""),
        anchor_statuses: normalizeAnchorStatuses(response.data.anchor_statuses),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
        semantic_coverage: response.data.semantic_coverage || response.data.coverage_summary || null,
      })
      setEditorContext(response.data.editor_context || null)
      applyDraftConfig(suggestedConfig)
      if (response.data.needs_human_review) {
        onNote("Template analyzed. Save it as a draft now, or review the highlighted rows before activation.")
      } else {
        onNote(
          response.data.schema_cache_hit
            ? "Template analyzed from a previous review. Check the suggested categories and save."
            : "Template analyzed. Check the suggested categories and save.",
        )
      }
    } catch (error) {
      onError(formatApiError(error))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleUploadTemplate = async (event, activationMode = "activate_if_ready") => {
    event?.preventDefault()
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    if (!uploadForm.template_file) {
      onError("Select an .xlsx template file.")
      return
    }
    if (!hasMatchingUploadAnalysis) {
      if (!analysis?.id) {
        onError("Run Analyze Template before saving so schema extraction and validation are confirmed.")
      } else {
        onError("Template file changed after analysis. Run Analyze Template again before saving.")
      }
      return
    }

    let parsedConfig
    try {
      parsedConfig = parseTemplateConfig(rawConfigText)
    } catch (error) {
      onError(error.message)
      return
    }

    if (activationMode !== "draft" && !buildPlainReviewSummary(parsedConfig, analysis).canActivate) {
      onError("Save this template as a draft first, then finish the review items before activation.")
      return
    }

    try {
      setSavingUpload(true)
      const formData = new FormData()
      formData.append("template_file", uploadForm.template_file)
      formData.append("portfolio_id", selectedFundId)
      formData.append("name", uploadForm.name || uploadForm.template_file.name)
      formData.append("version", uploadForm.version || "")
      formData.append("is_active", activationMode === "draft" ? "false" : "true")
      formData.append("activation_mode", activationMode)
      formData.append("config_json", JSON.stringify(parsedConfig))
      if (analysis?.id) {
        formData.append("analysis_id", analysis.id)
      }

      const response = await apiMultipartRequest("/cash-flow/templates", { token, formData })
      onNote(
        response.data.saved_as_draft
          ? "Template saved as a draft. It will not be used for reports until the review items are finished and it is activated."
          : "Cash flow template uploaded and activated.",
      )
      setAnalysis(null)
      setEditorContext(null)
      setEditingTemplate(null)
      setUploadForm({ name: "", version: "", template_file: null })
      setConfigDraft(createEmptyV3Config())
      setRawConfigText(JSON.stringify(createEmptyV3Config(), null, 2))
      await loadTemplates()
    } catch (error) {
      onError(formatApiError(error))
    } finally {
      setSavingUpload(false)
    }
  }

  const handleReanalyzeTemplate = async (template) => {
    if (!template?.reanalyze_available) {
      onError(template?.reanalyze_block_reason || "Template source file is missing. Re-upload template first.")
      return
    }

    const templateId = template.id
    try {
      setReanalyzingTemplateId(templateId)
      const response = await apiRequest(`/cash-flow/templates/${templateId}/reanalyze`, {
        method: "POST",
        token,
      })
      const suggestedConfig = response.data.suggested_config_json || createEmptyV3Config()
      setAnalysis({
        ...response.data.analysis,
        analysis_scope: "template",
        file_signature: null,
        detected_layout: response.data.detected_layout,
        confidence: response.data.confidence,
        issues: normalizeMessageList(response.data.issues),
        required_anchors: normalizeMessageList(response.data.required_anchors),
        needs_human_review: Boolean(response.data.needs_human_review),
        review_state: response.data.review_state,
        can_activate: response.data.can_activate,
        activation_block_reason: humanizeTemplateMessage(response.data.activation_block_reason, ""),
        anchor_statuses: normalizeAnchorStatuses(response.data.anchor_statuses),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
        semantic_coverage: response.data.semantic_coverage || response.data.coverage_summary || null,
      })
      setEditorContext(response.data.editor_context || null)
      applyDraftConfig(suggestedConfig)
      onNote("Template reanalyzed. Review the updated cash-flow categories.")
    } catch (error) {
      onError(formatApiError(error))
    } finally {
      setReanalyzingTemplateId(null)
    }
  }

  const loadTemplateIntoEditor = async (template) => {
    try {
      const response = await apiRequest(`/cash-flow/templates/${template.id}/editor-context`, { token })
      const nextTemplate = response.data.template || template
      const context = response.data.editor_context || null
      const nextConfig = clone(context?.config || nextTemplate.config_json || createEmptyV3Config())
      setEditingTemplate(nextTemplate)
      setAnalysis(null)
      setEditorContext(context)
      applyDraftConfig(nextConfig)
      onNote("Template loaded into the review workspace.")
    } catch (error) {
      onError(formatApiError(error))
    }
  }

  const handleSaveEditor = async (event, activationMode = "activate_if_ready") => {
    event?.preventDefault()
    if (!editingTemplate?.id) {
      onError("Select a template to edit.")
      return
    }

    let parsedConfig
    try {
      parsedConfig = parseTemplateConfig(rawConfigText)
    } catch (error) {
      onError(error.message)
      return
    }

    if (activationMode !== "draft" && !buildPlainReviewSummary(parsedConfig, editorReview).canActivate) {
      onError("Save this template as a draft first, then finish the review items before activation.")
      return
    }

    try {
      setSavingEditor(true)
      await apiRequest(`/cash-flow/templates/${editingTemplate.id}`, {
        method: "PUT",
        token,
        body: {
          name: editingTemplate.name,
          version: editingTemplate.version || null,
          is_active: activationMode !== "draft",
          activation_mode: activationMode,
          config_json: parsedConfig,
        },
      })
      onNote(
        activationMode === "draft"
          ? "Template changes saved as a draft. Active templates remain untouched."
          : "Template saved and activated.",
      )
      await loadTemplates()
    } catch (error) {
      onError(formatApiError(error))
    } finally {
      setSavingEditor(false)
    }
  }

  const handleActivate = async (templateId) => {
    try {
      await apiRequest(`/cash-flow/templates/${templateId}/activate`, { method: "PUT", token })
      onNote("Template activated.")
      await loadTemplates()
    } catch (error) {
      onError(formatApiError(error))
    }
  }

  if (!selectedFundId) {
    return (
      <section className="panel stack">
        <h2>Cash Flow Templates</h2>
        <p className="muted">Select a fund to manage cash flow templates.</p>
      </section>
    )
  }

  const semanticCoverage = normalizeSemanticCoverage(
    analysis?.semantic_coverage || analysis?.coverage_summary || editingTemplate?.semantic_coverage,
    configDraft,
  )
  const uploadReview = analysis || null
  const editorReview = editorContext?.review || editingTemplate || null
  const uploadPlainReview = buildPlainReviewSummary(configDraft, uploadReview)
  const editorPlainReview = buildPlainReviewSummary(configDraft, editorReview)
  const canActivateUpload = Boolean(hasMatchingUploadAnalysis && uploadPlainReview.canActivate)
  const canActivateEditor = Boolean(editingTemplate && editorPlainReview.canActivate)
  const activeTemplateReview = activeTemplate ? getTemplateListReview(activeTemplate) : null

  return (
    <section className="panel stack">
      <div className="inline-actions">
        <h2>Cash Flow Templates</h2>
        <button type="button" onClick={loadTemplates} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="muted small">
        Active template: <strong>{activeTemplate?.name || "None"}</strong>
        {activeTemplateReview && !activeTemplateReview.canActivate ? (
          <> ({activeTemplateReview.label.toLowerCase()} before reports can use it)</>
        ) : null}
      </p>

      <form className="panel stack" onSubmit={handleUploadTemplate}>
        <h3>Upload, Analyze, Review</h3>
        <div className="form-grid">
          <label>
            Name
            <input
              value={uploadForm.name}
              onChange={(event) => setUploadForm({ ...uploadForm, name: event.target.value })}
              required
            />
          </label>
          <label>
            Version
            <input
              value={uploadForm.version}
              onChange={(event) => setUploadForm({ ...uploadForm, version: event.target.value })}
            />
          </label>
          <label className="full">
            Template File (.xlsx)
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null
                setUploadForm({
                  ...uploadForm,
                  template_file: nextFile,
                })
                setAnalysis(null)
                setEditorContext(null)
              }}
              required
            />
          </label>
        </div>

        <div className="inline-actions">
          <button type="button" onClick={handleAnalyzeTemplate} disabled={analyzing || savingUpload}>
            {analyzing ? "Analyzing..." : "Analyze Template"}
          </button>
          <button
            type="button"
            onClick={(event) => handleUploadTemplate(event, "draft")}
            disabled={savingUpload || analyzing || !hasMatchingUploadAnalysis}
          >
            {savingUpload ? "Saving..." : "Save Draft for Review"}
          </button>
          <button className="primary" type="submit" disabled={savingUpload || analyzing || !canActivateUpload}>
            {savingUpload ? "Saving..." : "Activate Template"}
          </button>
        </div>
        <p className="muted small">
          Next step:{" "}
          {hasMatchingUploadAnalysis
            ? canActivateUpload
              ? "This can be activated now, or saved as a draft."
              : "Save as draft now, then finish the review items before activation."
            : uploadForm.template_file
              ? "Run Analyze Template for this file before saving"
              : "Select a template file to begin"}
        </p>

        {analysis && (
          <div className="template-analysis-review stack">
            <div className="alert ok">
              <strong>Analysis finished.</strong>
              <p className="small">
                The template can be saved as a draft. Activation waits until every review item below is resolved.
              </p>
            </div>
            {analysis.activation_block_reason && (
              <div className={analysis.can_activate ? "alert ok" : "alert warn"}>
                {analysis.activation_block_reason}
              </div>
            )}
            {semanticCoverage && (
              <div className={semanticCoverage.unlabeled_targets ? "alert warn" : "alert ok"}>
                <strong>{semanticCoverage.message}</strong>
                {toArray(semanticCoverage.categories).length > 0 && (
                  <ul className="chip-list">
                    {toArray(semanticCoverage.categories)
                      .slice(0, 12)
                      .map((category, index) => (
                        <li key={`${category.display_name || "category"}_${index}`}>
                          {category.display_name || "Cash-flow category"}
                        </li>
                      ))}
                  </ul>
                )}
                {toArray(semanticCoverage.review_tasks).length > 0 && (
                  <ul className="simple-list">
                    {toArray(semanticCoverage.review_tasks).slice(0, 5).map((task, index) => (
                      <li key={`${task.title || task.message || "task"}_${index}`}>
                        {humanizeTemplateMessage(task.message || task.title, "Confirm what this row represents.")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {analysis.analysis_scope === "upload" && analysis.file_signature !== currentUploadSignature && (
              <div className="alert warn">
                Analyzed file no longer matches the selected upload. Re-run Analyze Template before saving.
              </div>
            )}
            {toArray(analysis.issues).length > 0 && (
              <div className="alert warn">
                <strong>Analysis Notes</strong>
                <ul className="simple-list">
                  {toArray(analysis.issues).map((issue, index) => (
                    <li key={`${humanizeTemplateMessage(issue)}_${index}`}>{humanizeTemplateMessage(issue)}</li>
                  ))}
                </ul>
              </div>
            )}
            {toArray(analysis.required_anchors).length > 0 && (
              (() => {
                const reviewMessages = toArray(analysis.anchor_statuses)
                  .filter((status) => status.status !== "ready")
                  .map((status) => status.message || status.label)
                  .map(humanizeTemplateMessage)
                  .filter(Boolean)
                return (
                  <p className="muted small">
                    Review tasks:{" "}
                    {reviewMessages.length
                      ? reviewMessages.join(" ")
                      : toArray(analysis.required_anchors).map(getReviewTaskLabel).join(" ")}
                  </p>
                )
              })()
            )}

            <TemplateReviewPanel
              config={configDraft}
              review={uploadReview}
              onConfigChange={applyDraftConfig}
              onReviewChange={applyReviewChange}
            />

            <AdvancedTemplateTools
              config={configDraft}
              review={uploadReview}
              editorContext={editorContext}
              onConfigChange={applyDraftConfig}
              onReviewChange={applyReviewChange}
              rawConfigText={rawConfigText}
              onRawConfigTextChange={setRawConfigText}
            />
          </div>
        )}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Status</th>
              <th>Review</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {toArray(templates).map((template) => {
              const listReview = getTemplateListReview(template)
              return (
                <tr key={template.id}>
                  <td>{toDisplayText(template.name, "-")}</td>
                  <td>{toDisplayText(template.version, "-")}</td>
                  <td>{template.is_active ? "Active" : template.status || "Draft"}</td>
                  <td>{listReview.label}</td>
                  <td>{shortDate(template.created_at)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => loadTemplateIntoEditor(template)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReanalyzeTemplate(template)}
                        disabled={Boolean(reanalyzingTemplateId) || template.reanalyze_available === false}
                        title={template.reanalyze_block_reason || ""}
                      >
                        {reanalyzingTemplateId === template.id ? "Reanalyzing..." : "Reanalyze"}
                      </button>
                      {template.reanalyze_available === false && (
                        <span className="muted small" title={template.reanalyze_block_reason || ""}>
                          Source missing
                        </span>
                      )}
                      {!template.is_active && (
                        <button
                          type="button"
                          onClick={() => handleActivate(template.id)}
                          disabled={!listReview.canActivate}
                          title={listReview.canActivate ? "" : listReview.label}
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {toArray(templates).length === 0 && (
              <tr>
                <td colSpan={6}>No templates uploaded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form className="panel stack" onSubmit={handleSaveEditor}>
        <h3>Review Saved Template</h3>
        {!editingTemplate && <p className="muted small">Choose Edit on a template row to review or change it.</p>}
        {editingTemplate && (
          <>
            <div className="form-grid">
              <label>
                Name
                <input
                  value={editingTemplate.name || ""}
                  onChange={(event) => setEditingTemplate({ ...editingTemplate, name: event.target.value })}
                />
              </label>
              <label>
                Version
                <input
                  value={editingTemplate.version || ""}
                  onChange={(event) => setEditingTemplate({ ...editingTemplate, version: event.target.value })}
                />
              </label>
            </div>
            <TemplateReviewPanel
              config={configDraft}
              review={editorReview}
              onConfigChange={applyDraftConfig}
              onReviewChange={applyReviewChange}
            />
            <AdvancedTemplateTools
              config={configDraft}
              review={editorReview}
              editorContext={editorContext}
              onConfigChange={applyDraftConfig}
              onReviewChange={applyReviewChange}
              rawConfigText={rawConfigText}
              onRawConfigTextChange={setRawConfigText}
            />
            <div className="inline-actions">
              <button
                type="button"
                onClick={(event) => handleSaveEditor(event, "draft")}
                disabled={savingEditor}
              >
                {savingEditor ? "Saving..." : "Save Draft"}
              </button>
              <button className="primary" type="submit" disabled={savingEditor || !canActivateEditor}>
                {savingEditor ? "Saving..." : "Activate Template"}
              </button>
            </div>
            {!canActivateEditor && (
              <p className="muted small">Save the draft now, then finish the review items above before activation.</p>
            )}
          </>
        )}
      </form>
    </section>
  )
}
