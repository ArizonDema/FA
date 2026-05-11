const {
  normalizeRequiredAnchors,
  stableStringify,
} = require("../utils/templateAnalysis.util")

const ANCHOR_DEFINITIONS = [
  {
    key: "period_axis",
    label: "Period axis",
    message: "Confirm where the workbook lists periods.",
  },
  {
    key: "period_ranges",
    label: "Period date ranges",
    message: "Confirm the start and end dates for custom periods.",
  },
  {
    key: "bucket_targets",
    label: "Cash flow bucket targets",
    message: "Confirm the cells where cash flow bucket values should be written.",
  },
  {
    key: "row_bindings",
    label: "Indirect cash flow rows",
    message: "Confirm row bindings for indirect-method cash flow templates.",
  },
]

const ANCHOR_LOOKUP = new Map(ANCHOR_DEFINITIONS.map((definition) => [definition.key, definition]))

function normalizeAnchorKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

function uniqueAnchors(values) {
  return Array.from(new Set(normalizeRequiredAnchors(values).map(normalizeAnchorKey))).filter(Boolean)
}

function looksLikeV3Config(config = {}) {
  return Boolean(
    String(config?.version || "").toLowerCase() === "v3" ||
      config?.period_axis ||
      Array.isArray(config?.bucket_bindings) ||
      Array.isArray(config?.row_bindings),
  )
}

function normalizeCellAddress(value) {
  const normalized = String(value || "").trim().toUpperCase()
  return /^[A-Z]+\d+$/.test(normalized) ? normalized : ""
}

function toPeriodKey(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || fallback
}

function getPeriodKeys(config = {}) {
  const labels = Array.isArray(config?.period_axis?.labels) ? config.period_axis.labels : []
  return labels.map((label, index) => toPeriodKey(label?.period_key || label?.label, `period_${index + 1}`))
}

function getStatementMethod(config = {}) {
  const explicit = String(config?.statement_method || "").trim().toLowerCase()
  if (explicit === "indirect" || explicit === "direct") return explicit
  return Array.isArray(config?.row_bindings) && config.row_bindings.length > 0 ? "indirect" : "direct"
}

function getConfirmedAnchors(config = {}) {
  const confirmed = config?.review_metadata?.confirmed_anchors
  return new Set(uniqueAnchors(Array.isArray(confirmed) ? confirmed : []))
}

function sectionForAnchor(config = {}, anchorKey) {
  if (anchorKey === "period_axis") return config.period_axis || null
  if (anchorKey === "period_ranges") return config.period_resolution_rules || null
  if (anchorKey === "bucket_targets") return config.bucket_bindings || config.buckets || null
  if (anchorKey === "row_bindings") return config.row_bindings || null
  return null
}

function isSameAnchorSection(config = {}, baseConfig = {}, anchorKey) {
  return stableStringify(sectionForAnchor(config, anchorKey)) === stableStringify(sectionForAnchor(baseConfig, anchorKey))
}

function buildStatus(key, status, message, details = {}) {
  const definition = ANCHOR_LOOKUP.get(key) || {
    key,
    label: key,
    message: "Review this template anchor.",
  }

  return {
    key,
    label: definition.label,
    status,
    message: message || definition.message,
    ...details,
  }
}

function evaluateLegacyConfig(config = {}) {
  const hasSheetName = Boolean(String(config.sheet_name || "").trim())
  const buckets = Array.isArray(config.bucket_bindings)
    ? config.bucket_bindings
    : Array.isArray(config.buckets)
      ? config.buckets
      : []
  const hasBuckets = buckets.length > 0
  const isReady = hasSheetName && hasBuckets

  return {
    review_state: isReady ? "ready" : "needs_review",
    can_activate: isReady,
    activation_block_reason: isReady
      ? null
      : "Template needs a sheet name and at least one cash flow bucket before activation.",
    required_anchors: isReady ? [] : ["bucket_targets"],
    anchor_statuses: [
      buildStatus(
        "bucket_targets",
        isReady ? "ready" : "missing",
        isReady
          ? "Legacy template has cash flow buckets."
          : "Add at least one cash flow bucket before activating this template.",
      ),
    ],
  }
}

function markRequiredButUnconfirmed(status, { requiredSet, confirmedSet, baseConfig, config }) {
  if (!requiredSet.has(status.key)) return status
  if (confirmedSet.has(status.key)) return status
  if (baseConfig && !isSameAnchorSection(config, baseConfig, status.key)) return status
  if (status.status !== "ready") return status

  return {
    ...status,
    status: "needs_review",
    message: `Review and confirm ${status.label.toLowerCase()} before activating this template.`,
  }
}

function evaluatePeriodAxis(config = {}) {
  const labels = Array.isArray(config?.period_axis?.labels) ? config.period_axis.labels : []
  const bindings = Array.isArray(config?.period_axis?.period_bindings)
    ? config.period_axis.period_bindings
    : []
  const labelKeys = new Set(labels.map((label, index) => toPeriodKey(label?.period_key || label?.label, `period_${index + 1}`)))
  const bindingKeys = new Set(bindings.map((binding, index) => toPeriodKey(binding?.period_key, `period_${index + 1}`)))
  const bindingCellsValid = bindings.every((binding) => normalizeCellAddress(binding?.cell))
  const keysMatch =
    labelKeys.size > 0 &&
    labelKeys.size === bindingKeys.size &&
    Array.from(labelKeys).every((key) => bindingKeys.has(key))

  if (!labels.length || !bindings.length) {
    return buildStatus("period_axis", "missing", "Add period labels and period cells.")
  }
  if (!keysMatch) {
    return buildStatus("period_axis", "missing", "Period labels and period cells must use the same period keys.")
  }
  if (!bindingCellsValid) {
    return buildStatus("period_axis", "missing", "Every detected period needs a valid workbook cell.")
  }
  return buildStatus("period_axis", "ready", "Period axis is mapped.")
}

function evaluatePeriodRanges(config = {}) {
  const periodKeys = getPeriodKeys(config)
  const labels = Array.isArray(config?.period_axis?.labels) ? config.period_axis.labels : []
  const customKeys = labels
    .map((label, index) => ({
      key: periodKeys[index],
      isCustom: String(label?.period_type || "").toLowerCase() === "custom",
    }))
    .filter((item) => item.isCustom)
    .map((item) => item.key)

  if (!customKeys.length) {
    return buildStatus("period_ranges", "ready", "No custom period date ranges are required.")
  }

  const ranges = Array.isArray(config?.period_resolution_rules?.custom_periods)
    ? config.period_resolution_rules.custom_periods
    : []
  const rangeLookup = new Map(ranges.map((range, index) => [toPeriodKey(range?.period_key, `custom_${index + 1}`), range]))
  const missing = customKeys.filter((key) => {
    const range = rangeLookup.get(key)
    return !range?.date_start || !range?.date_end
  })

  if (missing.length) {
    return buildStatus(
      "period_ranges",
      "missing",
      `Add start and end dates for ${missing.length} custom period(s).`,
      { missing_period_keys: missing },
    )
  }
  return buildStatus("period_ranges", "ready", "Custom period date ranges are mapped.")
}

function cellsCoverPeriods(cells, periodKeys) {
  const cellKeys = new Set(
    (Array.isArray(cells) ? cells : [])
      .filter((cell) => normalizeCellAddress(cell?.cell))
      .map((cell, index) => toPeriodKey(cell?.period_key, periodKeys[index] || `period_${index + 1}`)),
  )
  return periodKeys.every((key) => cellKeys.has(key))
}

function evaluateBucketTargets(config = {}) {
  if (getStatementMethod(config) === "indirect") {
    return buildStatus("bucket_targets", "ready", "Indirect templates do not require direct bucket targets.")
  }

  const periodKeys = getPeriodKeys(config)
  const buckets = Array.isArray(config?.bucket_bindings) ? config.bucket_bindings : []
  if (!buckets.length) {
    return buildStatus("bucket_targets", "missing", "Add at least one cash flow bucket target.")
  }

  const incomplete = buckets
    .map((bucket, index) => ({
      key: bucket?.bucket_key || `bucket_${index + 1}`,
      complete: cellsCoverPeriods(bucket?.cells, periodKeys),
    }))
    .filter((item) => !item.complete)

  if (incomplete.length) {
    return buildStatus(
      "bucket_targets",
      "missing",
      `${incomplete.length} bucket(s) need cells for every period.`,
      { missing_bucket_keys: incomplete.map((item) => item.key) },
    )
  }

  return buildStatus("bucket_targets", "ready", "Cash flow bucket targets are mapped.")
}

function evaluateRowBindings(config = {}) {
  if (getStatementMethod(config) !== "indirect") {
    return buildStatus("row_bindings", "ready", "Direct templates do not require indirect row bindings.")
  }

  const periodKeys = getPeriodKeys(config)
  const rows = Array.isArray(config?.row_bindings) ? config.row_bindings : []
  if (!rows.length) {
    return buildStatus("row_bindings", "missing", "Add indirect-method row bindings.")
  }

  const requiredRows = rows.filter((row) => row?.required !== false)
  const incomplete = requiredRows
    .map((row, index) => ({
      key: row?.semantic_key || `row_${index + 1}`,
      complete: cellsCoverPeriods(row?.cells, periodKeys),
    }))
    .filter((item) => !item.complete)

  if (incomplete.length) {
    return buildStatus(
      "row_bindings",
      "missing",
      `${incomplete.length} indirect row(s) need cells for every period.`,
      { missing_row_keys: incomplete.map((item) => item.key) },
    )
  }

  return buildStatus("row_bindings", "ready", "Indirect row bindings are mapped.")
}

function evaluateTemplateReadiness({
  config,
  requiredAnchors = [],
  analysisNeedsReview = false,
  baseConfig = null,
} = {}) {
  if (!config || typeof config !== "object") {
    return {
      review_state: "needs_review",
      can_activate: false,
      activation_block_reason: "Template config is missing.",
      required_anchors: ["period_axis", "bucket_targets"],
      anchor_statuses: [
        buildStatus("period_axis", "missing", "Template config is missing period anchors."),
        buildStatus("bucket_targets", "missing", "Template config is missing bucket targets."),
      ],
    }
  }

  if (!looksLikeV3Config(config)) {
    return evaluateLegacyConfig(config)
  }

  const metadataRequiredAnchors = Array.isArray(config?.review_metadata?.required_anchors)
    ? config.review_metadata.required_anchors
    : []
  const requiredSet = new Set(uniqueAnchors([...requiredAnchors, ...metadataRequiredAnchors]))
  const confirmedSet = getConfirmedAnchors(config)
  const requiresReview = analysisNeedsReview || Boolean(config?.review_metadata?.needs_human_review)
  const statuses = [
    evaluatePeriodAxis(config),
    evaluatePeriodRanges(config),
    evaluateBucketTargets(config),
    evaluateRowBindings(config),
  ].map((status) =>
    requiresReview
      ? markRequiredButUnconfirmed(status, {
          requiredSet,
          confirmedSet,
          baseConfig,
          config,
        })
      : status,
  )

  const unresolved = statuses.filter((status) => status.status !== "ready")
  const effectiveRequiredAnchors = Array.from(
    new Set([...requiredSet, ...unresolved.map((status) => status.key)]),
  )
  const canActivate = unresolved.length === 0

  return {
    review_state: canActivate ? "ready" : "needs_review",
    can_activate: canActivate,
    activation_block_reason: canActivate
      ? null
      : unresolved[0]?.message || "Resolve required anchors before activating this template.",
    required_anchors: canActivate ? [] : effectiveRequiredAnchors,
    anchor_statuses: statuses,
  }
}

function assertTemplateReady(config, options = {}) {
  const readiness = evaluateTemplateReadiness({ config, ...options })
  if (!readiness.can_activate) {
    const error = new Error(readiness.activation_block_reason || "Resolve required anchors before continuing.")
    error.details = readiness
    throw error
  }
  return readiness
}

module.exports = {
  ANCHOR_DEFINITIONS,
  evaluateTemplateReadiness,
  assertTemplateReady,
  uniqueAnchors,
}
