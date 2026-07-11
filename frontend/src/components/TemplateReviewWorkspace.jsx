import { useEffect, useMemo, useState } from "react"
import {
  ANCHOR_LABELS,
  buildReviewModel,
  confirmCompletedAnchor,
  confirmEligibleMappings,
  getCategoryAnchor,
  getCategoryChoices,
  getStatementMethod,
  isAnchorStructurallyComplete,
  removeMapping,
  syncReviewWithConfig,
  toReviewKey,
  updateMapping,
} from "./templateReviewModel"

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function confidenceLabel(score) {
  if (score === null || score === undefined) return "Not scored"
  if (score >= 0.9) return `High · ${Math.round(score * 100)}%`
  if (score >= 0.7) return `Good · ${Math.round(score * 100)}%`
  return `Low · ${Math.round(score * 100)}%`
}

function groupCategoryChoices(config) {
  const choices = getCategoryChoices(config)
  const indirect = getStatementMethod(config) === "indirect"
  const groups = new Map()
  choices.forEach((choice) => {
    const group = indirect
      ? choice.role === "summary"
        ? "Summary rows"
        : "Input rows"
      : choice.direction === "inflow"
        ? "Cash in"
        : "Cash out"
    groups.set(group, [...(groups.get(group) || []), choice])
  })
  return Array.from(groups.entries())
}

function updatePeriodCell(config, targetPeriodKey, cellAddress) {
  const labels = toArray(config.period_axis?.labels)
  const periodKey = toReviewKey(targetPeriodKey || labels[0]?.period_key || "period_1")
  const bindings = toArray(config.period_axis?.period_bindings)
  const existing = bindings.find((binding) => toReviewKey(binding.period_key) === periodKey)
  const nextBinding = {
    ...(existing || {}),
    period_key: periodKey,
    label: labels.find((item) => toReviewKey(item.period_key) === periodKey)?.label || periodKey,
    cell: cellAddress,
  }
  return {
    ...config,
    period_axis: {
      ...(config.period_axis || {}),
      labels,
      period_bindings: existing
        ? bindings.map((binding) => (toReviewKey(binding.period_key) === periodKey ? nextBinding : binding))
        : [...bindings, nextBinding],
    },
  }
}

function updateTargetCell(config, anchorKey, targetKey, periodKey, cellAddress) {
  const collectionName = anchorKey === "row_bindings" ? "row_bindings" : "bucket_bindings"
  const identity = anchorKey === "row_bindings" ? "semantic_key" : "bucket_key"
  return {
    ...config,
    [collectionName]: toArray(config[collectionName]).map((item) => {
      if (toReviewKey(item?.[identity]) !== toReviewKey(targetKey)) return item
      const cells = toArray(item.cells)
      const hasCell = cells.some((cell) => toReviewKey(cell.period_key) === toReviewKey(periodKey))
      const nextCell = { period_key: toReviewKey(periodKey), cell: cellAddress }
      return {
        ...item,
        cells: hasCell
          ? cells.map((cell) => (toReviewKey(cell.period_key) === toReviewKey(periodKey) ? { ...cell, ...nextCell } : cell))
          : [...cells, nextCell],
      }
    }),
  }
}

function currentCellAddress(config, anchorKey, periodKey, targetKey) {
  if (anchorKey === "period_axis") {
    return toArray(config.period_axis?.period_bindings).find(
      (binding) => toReviewKey(binding.period_key) === toReviewKey(periodKey),
    )?.cell
  }
  const collection = anchorKey === "row_bindings" ? config.row_bindings : config.bucket_bindings
  const identity = anchorKey === "row_bindings" ? "semantic_key" : "bucket_key"
  const target = toArray(collection).find((item) => toReviewKey(item?.[identity]) === toReviewKey(targetKey))
  return toArray(target?.cells).find((cell) => toReviewKey(cell.period_key) === toReviewKey(periodKey))?.cell
}

function MappingDetail({ item, config, review, onChange, onSelectNext }) {
  const [categoryKey, setCategoryKey] = useState(item?.categoryKey || "")
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const groups = useMemo(() => groupCategoryChoices(config), [config])

  useEffect(() => {
    setCategoryKey(item?.categoryKey || "")
    setConfirmingRemoval(false)
  }, [item?.id, item?.categoryKey])

  if (!item) return null

  const applyMapping = () => {
    let nextConfig = updateMapping(config, item, categoryKey)
    let nextReview = syncReviewWithConfig(nextConfig, review)
    const after = buildReviewModel(nextConfig, nextReview)
    const anchorKey = getCategoryAnchor(nextConfig)
    if (!after.actionMappings.length && !after.confirmableMappings.length) {
      const confirmed = confirmCompletedAnchor(nextConfig, nextReview, anchorKey)
      nextConfig = confirmed.config
      nextReview = confirmed.review
    }
    onChange(nextConfig, nextReview)
    onSelectNext(item.id)
  }

  const confirmRemoval = () => {
    const nextConfig = removeMapping(config, item)
    onChange(nextConfig, syncReviewWithConfig(nextConfig, review))
    onSelectNext(item.id)
  }

  const primaryLabel =
    categoryKey && categoryKey === item.categoryKey
      ? item.kind === "resolved"
        ? "Save mapping"
        : "Accept suggestion & next"
      : "Assign category & next"

  return (
    <div className="review-detail stack">
      <div>
        <p className="kicker">Template row</p>
        <h3>{item.rowLabel}</h3>
        <p className="muted">{item.reason}</p>
      </div>

      <div className="review-facts">
        <div>
          <span>Analyzer confidence</span>
          <strong>{confidenceLabel(item.confidence)}</strong>
        </div>
        <div>
          <span>Workbook cells</span>
          <strong>{item.cells.map((cell) => cell.cell).filter(Boolean).join(", ") || "Not assigned"}</strong>
        </div>
      </div>

      <label className="review-category-picker">
        Cash-flow category
        <select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>
          <option value="">Choose a category</option>
          {groups.map(([label, choices]) => (
            <optgroup label={label} key={label}>
              {choices.map((choice) => (
                <option value={choice.key} key={choice.key}>
                  {choice.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="review-detail-actions">
        <button className="primary" type="button" onClick={applyMapping} disabled={!categoryKey}>
          {primaryLabel}
        </button>
        <button type="button" onClick={() => onSelectNext(item.id)}>
          Skip for now
        </button>
        <button className="danger-link" type="button" onClick={() => setConfirmingRemoval(true)}>
          Not a cash-flow row
        </button>
      </div>

      {confirmingRemoval && (
        <div className="inline-confirmation">
          <p>
            Remove <strong>{item.rowLabel}</strong> from the writable cash-flow rows? This change is not saved until you
            choose Save draft or Activate.
          </p>
          <div className="inline-actions">
            <button type="button" onClick={confirmRemoval}>Remove row</button>
            <button type="button" onClick={() => setConfirmingRemoval(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkbookDetail({ task, config, review, workbook, onChange }) {
  const sheets = toArray(workbook?.worksheets)
  const periods = toArray(config.period_axis?.labels)
  const anchorKey = task?.key || "period_axis"
  const targets = anchorKey === "row_bindings"
    ? toArray(config.row_bindings)
    : toArray(config.bucket_bindings).filter((item) => !item?.fallback)
  const identity = anchorKey === "row_bindings" ? "semantic_key" : "bucket_key"
  const [selectedSheet, setSelectedSheet] = useState(sheets[0]?.name || "")
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.period_key || "")
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.[identity] || "")

  useEffect(() => {
    setSelectedPeriod(periods[0]?.period_key || "")
    setSelectedTarget(targets[0]?.[identity] || "")
  }, [task?.id])

  useEffect(() => {
    if (!sheets.some((sheet) => sheet.name === selectedSheet)) setSelectedSheet(sheets[0]?.name || "")
  }, [selectedSheet, sheets])

  if (!task) return null
  const activeSheet = sheets.find((sheet) => sheet.name === selectedSheet) || sheets[0]
  const selectedCell = currentCellAddress(config, anchorKey, selectedPeriod, selectedTarget)

  const commit = (nextConfig) => {
    const result = isAnchorStructurallyComplete(nextConfig, anchorKey)
      ? confirmCompletedAnchor(nextConfig, review, anchorKey)
      : { config: nextConfig, review: syncReviewWithConfig(nextConfig, review) }
    onChange(result.config, result.review)
  }

  const assignCell = (address) => {
    if (!address) return
    if (anchorKey === "period_axis") commit(updatePeriodCell(config, selectedPeriod, address))
    else commit(updateTargetCell(config, anchorKey, selectedTarget, selectedPeriod, address))
  }

  const updateRange = (periodKey, updates) => {
    const ranges = toArray(config.period_resolution_rules?.custom_periods)
    const key = toReviewKey(periodKey)
    const exists = ranges.some((range) => toReviewKey(range.period_key) === key)
    const nextRanges = exists
      ? ranges.map((range) => toReviewKey(range.period_key) === key ? { ...range, ...updates, period_key: key } : range)
      : [...ranges, { period_key: key, ...updates }]
    commit({
      ...config,
      period_resolution_rules: { ...(config.period_resolution_rules || {}), custom_periods: nextRanges },
    })
  }

  const confirmExisting = () => {
    const result = confirmCompletedAnchor(config, review, anchorKey)
    onChange(result.config, result.review)
  }

  const customPeriods = periods.filter((period) => String(period.period_type || "").toLowerCase() === "custom")
  const ranges = new Map(toArray(config.period_resolution_rules?.custom_periods).map((range) => [toReviewKey(range.period_key), range]))

  return (
    <div className="review-detail stack">
      <div>
        <p className="kicker">Workbook setup</p>
        <h3>{task.label}</h3>
        <p className="muted">{task.message}</p>
      </div>

      {anchorKey === "period_ranges" ? (
        <div className="stack">
          {customPeriods.map((period) => {
            const range = ranges.get(toReviewKey(period.period_key)) || {}
            return (
              <div className="form-grid compact" key={period.period_key}>
                <label>
                  {period.label} start
                  <input type="date" value={range.date_start || ""} onChange={(event) => updateRange(period.period_key, { date_start: event.target.value })} />
                </label>
                <label>
                  {period.label} end
                  <input type="date" value={range.date_end || ""} onChange={(event) => updateRange(period.period_key, { date_end: event.target.value })} />
                </label>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="review-assignment-controls">
            <label>
              Period
              <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
                {periods.map((period) => <option value={period.period_key} key={period.period_key}>{period.label || period.period_key}</option>)}
              </select>
            </label>
            {anchorKey !== "period_axis" && (
              <label>
                Template row
                <select value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)}>
                  {targets.map((target) => <option value={target[identity]} key={target[identity]}>{target.label || target[identity]}</option>)}
                </select>
              </label>
            )}
            <label>
              Sheet
              <select value={activeSheet?.name || ""} onChange={(event) => setSelectedSheet(event.target.value)}>
                {sheets.map((sheet) => <option value={sheet.name} key={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small">
            Selected cell: <strong>{selectedCell || "None"}</strong>. Click a workbook cell to assign it.
          </p>
          <div className="workbook-preview review-workbook-preview">
            {toArray(activeSheet?.rows).slice(0, 80).map((row, rowIndex) => (
              <div className="workbook-row" key={row.row_index || rowIndex}>
                <span className="workbook-row-index">{row.row_index || rowIndex + 1}</span>
                {toArray(row.cells).slice(0, 40).map((cell) => (
                  <button
                    type="button"
                    className={`workbook-cell ${String(cell.address).toUpperCase() === String(selectedCell || "").toUpperCase() ? "selected" : ""}`}
                    key={cell.address}
                    title={`${cell.address}: ${cell.display_value || cell.value || ""}`}
                    onClick={() => assignCell(cell.address)}
                  >
                    <strong>{cell.address}</strong>
                    <span>{cell.display_value ?? cell.value ?? "\u00a0"}</span>
                  </button>
                ))}
              </div>
            ))}
            {!activeSheet && <p className="muted small">No workbook preview is available.</p>}
          </div>
        </>
      )}

      {task.structurallyComplete && (
        <button className="primary" type="button" onClick={confirmExisting}>Confirm this setup</button>
      )}
    </div>
  )
}

export function TemplateReviewWorkspace({
  config,
  review,
  workbook,
  dirty,
  isNew,
  saving,
  blockingMessage,
  analysisDetails,
  onChange,
  onSaveDraft,
  onActivate,
  onClose,
}) {
  const model = useMemo(() => buildReviewModel(config, review), [config, review])
  const [selectedId, setSelectedId] = useState("")
  const selectable = [...model.actionMappings, ...model.confirmableMappings, ...model.workbookTasks]
  const selectedMapping = [...model.mappings].find((item) => item.id === selectedId)
  const selectedTask = model.workbookTasks.find((item) => item.id === selectedId)

  useEffect(() => {
    const currentStillExists = [...model.mappings, ...model.workbookTasks].some((item) => item.id === selectedId)
    if (!currentStillExists) setSelectedId(selectable[0]?.id || "")
  }, [model, selectable, selectedId])

  const selectNext = (currentId) => {
    const currentIndex = selectable.findIndex((item) => item.id === currentId)
    const next = selectable[currentIndex + 1] || selectable[0]
    if (next && next.id !== currentId) setSelectedId(next.id)
  }

  const bulkConfirm = () => {
    const result = confirmEligibleMappings(config, review)
    onChange(result.config, result.review)
  }

  return (
    <section className="template-review-workspace stack">
      <header className="review-status-header">
        <div>
          <p className="kicker">Template review</p>
          <h2>{model.canActivate ? "Ready to activate" : "Review required"}</h2>
          <p className="muted">
            {model.completedCount} of {model.totalMappings} mappings complete
            {model.workbookTasks.length ? ` · ${model.workbookTasks.length} workbook ${model.workbookTasks.length === 1 ? "task" : "tasks"}` : ""}
          </p>
        </div>
        <div className="review-progress" aria-label={`${model.completedCount} of ${model.totalMappings} mappings complete`}>
          <span style={{ width: `${model.totalMappings ? (model.completedCount / model.totalMappings) * 100 : 100}%` }} />
        </div>
      </header>

      {blockingMessage && <div className="alert warn review-blocker">{blockingMessage}</div>}

      <div className="review-action-bar">
        <span className={`review-save-state ${dirty || isNew ? "dirty" : "clean"}`}>
          {isNew ? "Not saved yet" : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="inline-actions">
          <button type="button" onClick={onClose} disabled={saving}>Close review</button>
          <button type="button" onClick={onSaveDraft} disabled={saving || (!isNew && !dirty)}>
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button className="primary" type="button" onClick={onActivate} disabled={saving || !model.canActivate || Boolean(blockingMessage)}>
            {saving ? "Saving..." : "Activate"}
          </button>
        </div>
      </div>

      {model.confirmableMappings.length > 0 && (
        <div className="review-bulk-card">
          <div>
            <strong>{model.confirmableMappings.length} analyzer {model.confirmableMappings.length === 1 ? "suggestion" : "suggestions"} ready to confirm</strong>
            <p className="muted small">Missing and low-confidence mappings are excluded from this action.</p>
            <p className="review-bulk-preview">
              {model.confirmableMappings.slice(0, 5).map((item) => item.rowLabel).join(", ")}
              {model.confirmableMappings.length > 5 ? ` and ${model.confirmableMappings.length - 5} more` : ""}
            </p>
          </div>
          <button type="button" onClick={bulkConfirm}>Confirm valid suggestions</button>
        </div>
      )}

      <div className="review-focus-layout">
        <aside className="review-queue stack">
          <div>
            <p className="kicker">Needs attention</p>
            <h3>{model.actionMappings.length + model.workbookTasks.length} remaining</h3>
          </div>

          <div className="review-queue-group">
            {model.actionMappings.map((item) => (
              <button type="button" className={`review-queue-item ${selectedId === item.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                <span>{item.rowLabel}</span>
                <small>{item.kind === "unassigned" ? "Category missing" : "Low confidence"}</small>
              </button>
            ))}
          </div>

          {model.workbookTasks.length > 0 && (
            <div className="review-queue-group">
              <p className="kicker">Workbook setup</p>
              {model.workbookTasks.map((task) => (
                <button type="button" className={`review-queue-item ${selectedId === task.id ? "active" : ""}`} key={task.id} onClick={() => setSelectedId(task.id)}>
                  <span>{task.label}</span>
                  <small>{task.structurallyComplete ? "Confirm setup" : "Assignment required"}</small>
                </button>
              ))}
            </div>
          )}

          {!model.actionMappings.length && !model.workbookTasks.length && (
            <div className="review-queue-empty">No individual items need attention.</div>
          )}
        </aside>

        <main className="review-detail-panel">
          {selectedMapping && (
            <MappingDetail item={selectedMapping} config={config} review={review} onChange={onChange} onSelectNext={selectNext} />
          )}
          {selectedTask && <WorkbookDetail task={selectedTask} config={config} review={review} workbook={workbook} onChange={onChange} />}
          {!selectedMapping && !selectedTask && (
            <div className="review-complete-state">
              <strong>{model.canActivate ? "Review complete" : "Confirm the valid suggestions above to continue."}</strong>
              <p className="muted small">{model.canActivate ? "The template can now be activated." : "No individual assignment is selected."}</p>
            </div>
          )}
        </main>
      </div>

      <details className="review-completed-details">
        <summary>Mapped rows ({model.resolvedMappings.length})</summary>
        <div className="review-completed-list">
          {model.resolvedMappings.map((item) => (
            <button type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
              <span>{item.rowLabel}</span>
              <small>{item.category?.label || "Mapped"}</small>
            </button>
          ))}
          {!model.resolvedMappings.length && <p className="muted small">No mappings have been confirmed yet.</p>}
        </div>
      </details>

      <details className="review-analysis-details">
        <summary>Analysis details</summary>
        <div className="stack">
          {analysisDetails?.detectedLayout && <p><strong>Detected layout:</strong> {analysisDetails.detectedLayout}</p>}
          {analysisDetails?.coverageMessage && <p>{analysisDetails.coverageMessage}</p>}
          {toArray(analysisDetails?.categories).length > 0 && (
            <ul className="chip-list">{analysisDetails.categories.map((category, index) => <li key={`${category}_${index}`}>{category}</li>)}</ul>
          )}
          {toArray(analysisDetails?.issues).length > 0 && (
            <div><strong>Technical notes</strong><ul className="simple-list">{analysisDetails.issues.map((issue, index) => <li key={`${issue}_${index}`}>{issue}</li>)}</ul></div>
          )}
          {analysisDetails?.source && <p className="muted small">Analysis source: {analysisDetails.source}</p>}
        </div>
      </details>
    </section>
  )
}
