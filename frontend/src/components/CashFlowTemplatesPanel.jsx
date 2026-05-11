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

function normalizeMessageList(values) {
  const list = Array.isArray(values) ? values : values ? [values] : []
  return list.map((value) => toDisplayText(value).trim()).filter(Boolean)
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
      message: toDisplayText(status.message, ""),
    }
  })
}

function parseTemplateConfig(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText || "{}")
  } catch {
    throw new Error("Config JSON is invalid. Please fix JSON formatting first.")
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
  if (anchorMessage) return toDisplayText(anchorMessage, "Request failed.")
  if (Array.isArray(details?.anchor_statuses)) {
    const firstOpen = details.anchor_statuses.find((status) => status.status !== "ready")
    if (firstOpen?.message) return toDisplayText(firstOpen.message, "Request failed.")
  }
  return toDisplayText(error?.message, "Request failed.")
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
    activation_block_reason: toDisplayText(payload.activation_block_reason, ""),
    anchor_statuses: normalizeAnchorStatuses(payload.anchor_statuses || target.anchor_statuses),
  }
}

function getFileSignature(file) {
  if (!file) return null
  return `${file.name || ""}::${file.size || 0}::${file.lastModified || 0}`
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
    is_active: true,
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
    setUploadForm({ name: "", version: "", is_active: true, template_file: null })
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
        activation_block_reason: toDisplayText(response.data.activation_block_reason, ""),
        anchor_statuses: normalizeAnchorStatuses(response.data.anchor_statuses),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
      })
      setEditorContext(response.data.editor_context || null)
      applyDraftConfig(suggestedConfig)
      if (response.data.needs_human_review) {
        onNote("Template analyzed. Save it as a draft now, or use the review workspace to confirm anchors.")
      } else {
        const sourceLabel = response.data.schema_cache_hit
          ? "cache hit"
          : response.data.analysis_source === "llm"
            ? "LLM analyzed"
            : `analysis source: ${response.data.analysis_source || "unknown"}`
        onNote(`Template analyzed (${sourceLabel}). Review bindings and save.`)
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

    try {
      setSavingUpload(true)
      const formData = new FormData()
      formData.append("template_file", uploadForm.template_file)
      formData.append("portfolio_id", selectedFundId)
      formData.append("name", uploadForm.name || uploadForm.template_file.name)
      formData.append("version", uploadForm.version || "")
      formData.append("is_active", uploadForm.is_active ? "true" : "false")
      formData.append("activation_mode", activationMode)
      formData.append("config_json", JSON.stringify(parsedConfig))
      if (analysis?.id) {
        formData.append("analysis_id", analysis.id)
      }

      const response = await apiMultipartRequest("/cash-flow/templates", { token, formData })
      onNote(
        response.data.saved_as_draft
          ? "Template saved as a draft. It will not be used for extraction until anchors are ready and activated."
          : "Cash flow template uploaded and activated.",
      )
      setAnalysis(null)
      setEditorContext(null)
      setEditingTemplate(null)
      setUploadForm({ name: "", version: "", is_active: true, template_file: null })
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
        activation_block_reason: toDisplayText(response.data.activation_block_reason, ""),
        anchor_statuses: normalizeAnchorStatuses(response.data.anchor_statuses),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
      })
      setEditorContext(response.data.editor_context || null)
      applyDraftConfig(suggestedConfig)
      onNote("Template reanalyzed. Review updated bindings.")
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

    try {
      setSavingEditor(true)
      await apiRequest(`/cash-flow/templates/${editingTemplate.id}`, {
        method: "PUT",
        token,
        body: {
          name: editingTemplate.name,
          version: editingTemplate.version || null,
          is_active: activationMode !== "draft" && Boolean(editingTemplate.is_active),
          activation_mode: activationMode,
          config_json: parsedConfig,
        },
      })
      onNote(
        activationMode === "draft"
          ? "Template changes saved as a draft. Active templates remain untouched."
          : "Template configuration updated.",
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

  const bindingSummary = {
    periods: Array.isArray(configDraft.period_axis?.labels) ? configDraft.period_axis.labels.length : 0,
    opening: Array.isArray(configDraft.opening_binding?.cells) ? configDraft.opening_binding.cells.length : 0,
    closing: Array.isArray(configDraft.closing_binding?.cells) ? configDraft.closing_binding.cells.length : 0,
    buckets: Array.isArray(configDraft.bucket_bindings) ? configDraft.bucket_bindings.length : 0,
  }

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
      </p>

      <form className="panel stack" onSubmit={handleUploadTemplate}>
        <h3>Upload {"->"} Analyze {"->"} Confirm</h3>
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
          <label>
            Activate Immediately
            <select
              value={uploadForm.is_active ? "yes" : "no"}
              onChange={(event) => setUploadForm({ ...uploadForm, is_active: event.target.value === "yes" })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
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
            {savingUpload ? "Saving..." : "Save Draft"}
          </button>
          <button className="primary" type="submit" disabled={savingUpload || analyzing || !hasMatchingUploadAnalysis}>
            {savingUpload ? "Saving..." : "Activate When Ready"}
          </button>
        </div>
        <p className="muted small">
          Analysis status:{" "}
          {hasMatchingUploadAnalysis
            ? "Ready for save"
            : uploadForm.template_file
              ? "Run Analyze Template for this file before saving"
              : "Select a template file to begin"}
        </p>

        {analysis && (
          <div className="mini-card stack">
            <p className="muted small">
              Layout: <strong>{analysis.detected_layout || "unknown"}</strong> | Confidence: <strong>{analysis.confidence}</strong>
            </p>
            <p className="muted small">
              Source: <strong>{analysis.analysis_source || "llm"}</strong> | Cache hit:{" "}
              <strong>{analysis.schema_cache_hit ? "yes" : "no"}</strong> | Needs human review:{" "}
              <strong>{analysis.needs_human_review ? "yes" : "no"}</strong>
            </p>
            {analysis.activation_block_reason && (
              <div className={analysis.can_activate ? "alert ok" : "alert warn"}>
                {analysis.activation_block_reason}
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
                    <li key={`${toDisplayText(issue)}_${index}`}>{toDisplayText(issue)}</li>
                  ))}
                </ul>
              </div>
            )}
            {toArray(analysis.required_anchors).length > 0 && (
              <p className="muted small">Required anchors: {toArray(analysis.required_anchors).map(toDisplayText).join(", ")}</p>
            )}
          </div>
        )}

        <AnchorReviewWorkspace
          config={configDraft}
          review={editorContext?.review || analysis || null}
          editorContext={editorContext}
          onConfigChange={applyDraftConfig}
          onReviewChange={applyReviewChange}
        />

        <div className="form-grid">
          <label>
            Sheet Name
            <input
              value={configDraft.sheet_name || ""}
              onChange={(event) => applyDraftConfig({ ...configDraft, sheet_name: event.target.value })}
            />
          </label>
          <label>
            Layout Type
            <select
              value={configDraft.layout_type || "freeform"}
              onChange={(event) => applyDraftConfig({ ...configDraft, layout_type: event.target.value })}
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
              value={configDraft.period_granularity || "custom"}
              onChange={(event) => applyDraftConfig({ ...configDraft, period_granularity: event.target.value })}
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
              value={configDraft.period_axis?.orientation || "row"}
              onChange={(event) =>
                applyDraftConfig({
                  ...configDraft,
                  period_axis: {
                    ...(configDraft.period_axis || {}),
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
          Binding coverage: Periods {bindingSummary.periods}, Opening {bindingSummary.opening}, Closing {bindingSummary.closing}, Buckets {bindingSummary.buckets}
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
              {toArray(configDraft.period_axis?.labels).map((label, index) => {
                const period = normalizePeriodLabel(label, index)
                return (
                <tr key={period.period_key}>
                  <td>{period.label}</td>
                  <td>{period.period_type || "custom"}</td>
                  <td>{period.period_key}</td>
                </tr>
              )})}
              {toArray(configDraft.period_axis?.labels).length === 0 && (
                <tr>
                  <td colSpan={3}>No periods detected yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <BucketGrid config={configDraft} onChange={applyDraftConfig} />

        <details className="mini-card">
          <summary>Advanced Config JSON</summary>
          <label>
            Expert fallback
            <textarea
              rows={12}
              value={rawConfigText}
              onChange={(event) => setRawConfigText(event.target.value)}
            />
          </label>
        </details>
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
            {toArray(templates).map((template) => (
              <tr key={template.id}>
                <td>{toDisplayText(template.name, "-")}</td>
                <td>{toDisplayText(template.version, "-")}</td>
                <td>{template.is_active ? "Active" : template.status || "Draft"}</td>
                <td>{template.can_activate ? "Ready" : toDisplayText(template.activation_block_reason, "Needs review")}</td>
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
                        disabled={template.can_activate === false}
                        title={template.activation_block_reason || ""}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {toArray(templates).length === 0 && (
              <tr>
                <td colSpan={6}>No templates uploaded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form className="panel stack" onSubmit={handleSaveEditor}>
        <h3>Template Editor</h3>
        {!editingTemplate && <p className="muted small">Choose Edit on a template row to update config.</p>}
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
              <label>
                Keep Active
                <select
                  value={editingTemplate.is_active ? "yes" : "no"}
                  onChange={(event) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      is_active: event.target.value === "yes",
                    })
                  }
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                onClick={(event) => handleSaveEditor(event, "draft")}
                disabled={savingEditor}
              >
                {savingEditor ? "Saving..." : "Save Draft"}
              </button>
              <button className="primary" type="submit" disabled={savingEditor}>
                {savingEditor ? "Saving..." : "Activate When Ready"}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  )
}
