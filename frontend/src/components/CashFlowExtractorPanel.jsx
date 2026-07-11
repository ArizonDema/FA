import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiDownload, apiMultipartRequest, apiRequest, currency, shortDate } from "../api"

function currentYear() {
  return new Date().getFullYear()
}

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

function buildPresetRange(preset, year) {
  const normalized = String(preset || "").toUpperCase()
  if (normalized === "Q1") return { start: isoDate(year, 0, 1), end: isoDate(year, 2, 31) }
  if (normalized === "Q2") return { start: isoDate(year, 3, 1), end: isoDate(year, 5, 30) }
  if (normalized === "Q3") return { start: isoDate(year, 6, 1), end: isoDate(year, 8, 30) }
  if (normalized === "Q4") return { start: isoDate(year, 9, 1), end: isoDate(year, 11, 31) }
  if (normalized === "YTD") {
    return {
      start: isoDate(year, 0, 1),
      end: new Date().toISOString().slice(0, 10),
    }
  }
  return { start: isoDate(year, 0, 1), end: isoDate(year, 11, 31) }
}

function getCoverageErrorDetails(error) {
  const details = error?.errors || error?.details || error?.payload?.errors || null
  return details?.code === "cash_flow_template_coverage_failed" ? details : null
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

const CASH_FLOW_TARGET_LABELS = {
  customer_receipts: "Customer receipts",
  other_operating_inflows: "Other operating receipts",
  supplier_payments: "Supplier payments",
  payroll: "Payroll and team costs",
  rent_facilities: "Rent and facilities",
  sales_marketing: "Marketing spend",
  general_admin: "General and admin",
  income_taxes: "Taxes paid",
  other_operating_outflows: "Other operating payments",
  capital_expenditures: "Equipment and capex",
  capitalized_software: "Capitalized software",
  asset_sale_proceeds: "Asset sale proceeds",
  debt_drawdown: "Debt proceeds",
  debt_repayment: "Debt repayments",
  interest_paid: "Interest paid",
  equity_injection: "Owner funding",
  dividends_distributions: "Dividends and distributions",
  net_income: "Net income",
  depreciation_amortization: "Depreciation and amortization",
  change_in_receivables: "Change in receivables",
  change_in_inventory: "Change in inventory",
  change_in_payables: "Change in payables",
  other_working_capital_changes: "Other working capital changes",
  operating_cash_flow: "Cash flow from operations",
  asset_sales: "Asset sales",
  investing_cash_flow: "Cash flow from investing",
  capital_contributions: "Capital contributions",
  debt_issued: "Debt issued",
  debt_repaid: "Debt repaid",
  dividends_paid: "Dividends paid",
  financing_cash_flow: "Cash flow from financing",
  net_change_in_cash: "Net change in cash",
  opening_cash: "Opening cash",
  closing_cash: "Closing cash",
}

function humanizeTargetKey(value, fallback = "Cash-flow row") {
  const key = normalizeKey(value)
  if (!key) return fallback
  return CASH_FLOW_TARGET_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildTemplateTargetLabelMap(template) {
  const config = template?.activeVersion?.config_json || template?.config_json || {}
  const entries = []
  if (Array.isArray(config.bucket_bindings)) {
    config.bucket_bindings.forEach((bucket) => {
      const key = normalizeKey(bucket?.bucket_key)
      if (!key) return
      entries.push([
        key,
        bucket?.label || CASH_FLOW_TARGET_LABELS[normalizeKey(bucket?.semantic_key)] || CASH_FLOW_TARGET_LABELS[key],
      ])
    })
  }
  if (Array.isArray(config.row_bindings)) {
    config.row_bindings.forEach((row) => {
      const key = normalizeKey(row?.semantic_key)
      if (!key) return
      entries.push([key, row?.label || CASH_FLOW_TARGET_LABELS[key]])
    })
  }
  return new Map(entries.filter(([, label]) => Boolean(label)))
}

function formatTargetLabel(targetKey, targetLabels) {
  const key = normalizeKey(targetKey)
  return targetLabels.get(key) || humanizeTargetKey(key)
}

function formatConfidence(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return "needs review"
  if (numeric > 1) return `${Math.round(numeric)}%`
  return `${Math.round(numeric * 100)}%`
}

function displayAccountList(accounts = []) {
  const names = accounts
    .map((account) => account?.account_name || account?.normalized_account)
    .filter(Boolean)
    .slice(0, 3)
  return names.length ? names.join(", ") : "No account names available"
}

function CoveragePreflightCard({ coverage, onOpenTemplates }) {
  const missingItems = Array.isArray(coverage?.missing_items) ? coverage.missing_items : []
  const nextActions = Array.isArray(coverage?.next_actions) ? coverage.next_actions : []
  const openTemplates = (action) => {
    if (!onOpenTemplates) return
    onOpenTemplates({ action, coverage })
  }

  return (
    <div className="panel stack">
      <div className="alert warn">
        <strong>{coverage?.title || "Template needs rows before this report can run"}</strong>
        <p>{coverage?.message || "Add or map the missing cash-flow rows before generating this report."}</p>
      </div>

      {missingItems.length > 0 && (
        <div className="cards-grid">
          {missingItems.map((item, index) => (
            <div className="mini-card stack" key={`${item.display_name || "missing"}_${index}`}>
              <p className="kicker">Missing Category</p>
              <h3>{item.display_name || "Cash-flow category"}</h3>
              {item.plain_description && <p className="muted small">{item.plain_description}</p>}
              <p className="muted small">
                Amount found: <strong>{currency(item.total_amount || 0)}</strong>
              </p>
              <p className="muted small">
                Accounts: <strong>{displayAccountList(item.accounts)}</strong>
              </p>
              {Array.isArray(item.sample_gl_descriptions) && item.sample_gl_descriptions[0] && (
                <p className="muted small">Sample GL: {item.sample_gl_descriptions[0]}</p>
              )}
              {item.suggested_template_row_label && (
                <p className="muted small">Suggested row: {item.suggested_template_row_label}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="inline-actions">
        <button type="button" onClick={() => openTemplates("review_missing_rows")} disabled={!onOpenTemplates}>
          Review missing rows
        </button>
        <button type="button" onClick={() => openTemplates("reanalyze_template")} disabled={!onOpenTemplates}>
          Reanalyze after editing workbook
        </button>
        <button type="button" onClick={() => openTemplates("upload_different_template")} disabled={!onOpenTemplates}>
          Upload a different template
        </button>
      </div>

      {nextActions.length > 0 && (
        <ul className="simple-list">
          {nextActions.map((action, index) => (
            <li key={`${action}_${index}`}>{action}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RepositoryKnowledgeCard({ knowledge, title, onOpenRepository, attached = false }) {
  const sources = Array.isArray(knowledge?.sources) ? knowledge.sources : []
  const conflicts = Array.isArray(knowledge?.conflicts) ? knowledge.conflicts : []
  const keyPoints = sources.flatMap((source) =>
    (source.key_points || []).map((keyPoint) => ({
      ...keyPoint,
      sourceTitle: source.item?.title || "Repository source",
    })),
  )
  const selectedCount = Number(knowledge?.counts?.selected_key_points ?? keyPoints.length)
  const failed = knowledge?.status === "unavailable"

  return (
    <div className={`report-knowledge-context ${failed ? "unavailable" : ""}`}>
      <div className="section-heading">
        <div>
          <p className="kicker">{attached ? "Attached Context" : "Repository Context"}</p>
          <h4>{title}</h4>
        </div>
        {!failed && <strong className="knowledge-count">{selectedCount}</strong>}
      </div>
      {!failed && conflicts.length > 0 && (
        <div className="alert warn report-knowledge-conflict">
          <p className="small">
            {conflicts.length} confirmed fact conflict{conflicts.length === 1 ? "" : "s"} detected across current sources. Resolve the disagreement in Fund Repository before relying on this context.
          </p>
        </div>
      )}
      {failed ? (
        <p className="muted small">Confirmed repository facts could not be captured for this report run.</p>
      ) : selectedCount > 0 ? (
        <>
          <p className="muted small">
            {attached
              ? "These confirmed facts were preserved with this run for review and traceability."
              : "These confirmed facts will be preserved with the next run for review and traceability."}
          </p>
          <div className="report-knowledge-points">
            {keyPoints.slice(0, 5).map((keyPoint) => (
              <div className="report-knowledge-point" key={keyPoint.id || `${keyPoint.point_key}_${keyPoint.sourceTitle}`}>
                <span>{keyPoint.label}</span>
                <strong>{keyPoint.value_text || "-"}</strong>
                <small>{keyPoint.sourceTitle}</small>
              </div>
            ))}
          </div>
          {selectedCount > keyPoints.slice(0, 5).length && (
            <p className="muted small">{selectedCount - keyPoints.slice(0, 5).length} additional confirmed fact(s) attached.</p>
          )}
        </>
      ) : (
        <p className="muted small">No confirmed extracted facts are available yet. Review repository readings to attach reliable context.</p>
      )}
      {!attached && <p className="muted small">Cash-flow calculations continue to use only the selected TB, GL and active template.</p>}
      {onOpenRepository && (
        <button type="button" onClick={onOpenRepository}>
          Open Fund Repository
        </button>
      )}
    </div>
  )
}

function repositoryContextLabel(run) {
  const knowledge = run.input_artifacts_json?.repository_knowledge
  if (!knowledge) return "-"
  if (knowledge.status === "unavailable") return "Unavailable"
  const selectedCount = Number(knowledge.counts?.selected_key_points || 0)
  const conflicts = Number(knowledge.counts?.conflicts || 0)
  if (!selectedCount) return "None confirmed"
  const factLabel = `${selectedCount} fact${selectedCount === 1 ? "" : "s"}`
  return conflicts ? `${factLabel} | ${conflicts} conflict${conflicts === 1 ? "" : "s"}` : factLabel
}

export function CashFlowExtractorPanel({
  token,
  selectedFundId,
  onError,
  onNote,
  onOpenTemplates,
  onOpenRepository,
  onReportGenerated,
}) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [templates, setTemplates] = useState([])
  const [history, setHistory] = useState([])
  const [repositoryDatasets, setRepositoryDatasets] = useState([])
  const [confirmedKnowledge, setConfirmedKnowledge] = useState(null)
  const [latestRun, setLatestRun] = useState(null)
  const [latestPreview, setLatestPreview] = useState(null)
  const [latestWarnings, setLatestWarnings] = useState([])
  const [latestAutoMappings, setLatestAutoMappings] = useState([])
  const [latestLowConfidenceMappings, setLatestLowConfidenceMappings] = useState([])
  const [coveragePreflight, setCoveragePreflight] = useState(null)
  const [downloadingRunId, setDownloadingRunId] = useState(null)
  const tbInputRef = useRef(null)
  const glInputRef = useRef(null)
  const [form, setForm] = useState(() => {
    const year = currentYear()
    const fy = buildPresetRange("FY", year)
    return {
      preset: "FY",
      year: String(year),
      date_start: fy.start,
      date_end: fy.end,
      template_id: "",
      tb_repository_version_id: "",
      gl_repository_version_id: "",
      save_uploads_to_repository: true,
    }
  })

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active && template.can_activate !== false) || null,
    [templates],
  )

  const runnableTemplates = useMemo(
    () => templates.filter((template) => template.is_active && template.can_activate !== false),
    [templates],
  )
  const canUseTemplate = Boolean(form.template_id || activeTemplate)

  const previewRows = useMemo(() => latestPreview?.periods || [], [latestPreview])
  const previewBucketKeys = useMemo(() => {
    if (!previewRows.length) return []
    return Object.keys(previewRows[0].buckets || {})
  }, [previewRows])
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.template_id) || activeTemplate || null,
    [activeTemplate, form.template_id, templates],
  )
  const targetLabels = useMemo(() => buildTemplateTargetLabelMap(selectedTemplate), [selectedTemplate])
  const trialBalanceSources = useMemo(
    () => repositoryDatasets.filter((item) => item.category === "trial_balance" && !item.is_archived && item.currentVersion),
    [repositoryDatasets],
  )
  const generalLedgerSources = useMemo(
    () => repositoryDatasets.filter((item) => item.category === "general_ledger" && !item.is_archived && item.currentVersion),
    [repositoryDatasets],
  )
  const latestRepositoryKnowledge = latestRun?.input_artifacts_json?.repository_knowledge || null

  const loadData = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const [templateResponse, historyResponse, repositoryResponse, knowledgeResponse] = await Promise.all([
        apiRequest(`/cash-flow/templates?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/cash-flow/reports/history?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/items?kind=dataset&status=active`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/knowledge?status=confirmed`, { token }),
      ])
      const nextTemplates = templateResponse.data.templates || []
      setTemplates(nextTemplates)
      setHistory(historyResponse.data.runs || [])
      setRepositoryDatasets(repositoryResponse.data.items || [])
      setConfirmedKnowledge(knowledgeResponse.data.knowledge || null)
      const active = nextTemplates.find((item) => item.is_active && item.can_activate !== false)
      if (active) {
        setForm((prev) => {
          const stillRunnable = nextTemplates.some(
            (template) => template.id === prev.template_id && template.is_active && template.can_activate !== false,
          )
          return stillRunnable ? prev : { ...prev, template_id: active.id }
        })
      } else {
        setForm((prev) => ({ ...prev, template_id: "" }))
      }
    } catch (error) {
      onError(error.message)
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    const year = currentYear()
    const fy = buildPresetRange("FY", year)
    setLatestRun(null)
    setLatestPreview(null)
    setLatestWarnings([])
    setLatestAutoMappings([])
    setLatestLowConfidenceMappings([])
    setCoveragePreflight(null)
    setForm({
      preset: "FY",
      year: String(year),
      date_start: fy.start,
      date_end: fy.end,
      template_id: "",
      tb_repository_version_id: "",
      gl_repository_version_id: "",
      save_uploads_to_repository: true,
    })
    if (!selectedFundId) {
      setTemplates([])
      setHistory([])
      setRepositoryDatasets([])
      setConfirmedKnowledge(null)
      return
    }
    loadData()
  }, [loadData, selectedFundId])

  const applyPreset = (preset, yearText) => {
    if (String(preset || "").toUpperCase() === "CUSTOM") {
      setForm((prev) => ({ ...prev, preset: "CUSTOM", year: yearText }))
      return
    }
    const year = Number.parseInt(yearText, 10) || currentYear()
    const range = buildPresetRange(preset, year)
    setForm((prev) => ({
      ...prev,
      preset: String(preset || "").toUpperCase(),
      year: String(year),
      date_start: range.start,
      date_end: range.end,
    }))
  }

  const handleRun = async (event) => {
    event.preventDefault()
    if (generating) return
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    const tbFile = tbInputRef.current?.files?.[0] || null
    const glFile = glInputRef.current?.files?.[0] || null
    if (!tbFile && !form.tb_repository_version_id) {
      onError("Upload or select a stored Trial Balance file.")
      return
    }
    if (!glFile && !form.gl_repository_version_id) {
      onError("Upload or select a stored General Ledger file.")
      return
    }
    if (!form.date_start || !form.date_end) {
      onError("Provide date range for this run.")
      return
    }
    if (!form.template_id && !activeTemplate) {
      onError("No active ready cash flow template is available. Resolve anchors and activate a template first.")
      return
    }

    try {
      setGenerating(true)
      setLatestRun(null)
      setLatestPreview(null)
      setLatestWarnings([])
      setLatestAutoMappings([])
      setLatestLowConfidenceMappings([])
      setCoveragePreflight(null)
      const formData = new FormData()
      formData.append("portfolio_id", selectedFundId)
      formData.append("date_start", form.date_start)
      formData.append("date_end", form.date_end)
      if (form.preset && form.preset !== "CUSTOM") {
        formData.append("preset", form.preset)
      }
      if (form.template_id) {
        formData.append("template_id", form.template_id)
      }
      if (form.tb_repository_version_id) {
        formData.append("tb_repository_version_id", form.tb_repository_version_id)
      } else {
        formData.append("tb_file", tbFile)
      }
      if (form.gl_repository_version_id) {
        formData.append("gl_repository_version_id", form.gl_repository_version_id)
      } else {
        formData.append("gl_file", glFile)
      }
      if (!form.tb_repository_version_id || !form.gl_repository_version_id) {
        formData.append("save_uploads_to_repository", String(form.save_uploads_to_repository))
      }

      const response = await apiMultipartRequest("/cash-flow/reports/run", { token, formData })
      setLatestRun(response.data.run || null)
      setLatestPreview(response.data.preview || null)
      setLatestWarnings(response.data.warnings || [])
      setLatestAutoMappings(response.data.auto_mappings_created || [])
      setLatestLowConfidenceMappings(response.data.low_confidence_mappings || [])
      onNote("Cash flow report generated.")
      if (tbInputRef.current) tbInputRef.current.value = ""
      if (glInputRef.current) glInputRef.current.value = ""
      await loadData()
      onReportGenerated?.()
    } catch (error) {
      const coverageDetails = getCoverageErrorDetails(error)
      if (coverageDetails) {
        setCoveragePreflight(coverageDetails)
        onNote("Report stopped before workbook writing because the template needs rows.")
        await loadData()
      } else {
        onError(error.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const downloadRun = async (runId) => {
    try {
      setDownloadingRunId(runId)
      const { blob, filename } = await apiDownload(`/cash-flow/reports/download/${runId}`, {
        token,
        defaultFileName: `cash_flow_${runId}.xlsx`,
      })

      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)

      onNote(`Downloaded ${filename}`)
    } catch (error) {
      onError(error.message)
    } finally {
      setDownloadingRunId(null)
    }
  }

  if (!selectedFundId) {
    return (
      <section className="panel stack">
        <h2>Run Report</h2>
        <p className="muted">Select a fund to run cash flow extraction.</p>
      </section>
    )
  }

  return (
    <section className="panel stack">
      <div className="section-heading">
        <div>
          <p className="kicker">Report Builder</p>
          <h2>Run Report</h2>
        </div>
        <button type="button" onClick={loadData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="muted small">
        Active template: <strong>{activeTemplate?.name || "None"}</strong>
      </p>

      {!canUseTemplate && (
        <div className="alert warn">
          <strong>No ready cash-flow template is active.</strong>
          <p className="small">Review and activate a template before generating reports for this fund.</p>
          {onOpenTemplates && (
            <button type="button" onClick={() => onOpenTemplates(null)}>
              Edit template mappings
            </button>
          )}
        </div>
      )}

      <form className="panel stack" onSubmit={handleRun}>
        <h3>Run Cash Flow Report</h3>
        <div className="form-grid">
          <label>
            Preset
            <select
              value={form.preset}
              onChange={(event) => applyPreset(event.target.value, form.year)}
            >
              <option value="FY">FY</option>
              <option value="YTD">YTD</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
          <label>
            Preset Year
            <input
              type="number"
              min="1900"
              max="3000"
              value={form.year}
              onChange={(event) => {
                const nextYear = event.target.value
                if (form.preset && form.preset !== "CUSTOM") {
                  applyPreset(form.preset, nextYear)
                } else {
                  setForm((prev) => ({ ...prev, year: nextYear }))
                }
              }}
            />
          </label>
          <label>
            Date Start
            <input
              type="date"
              value={form.date_start}
              onChange={(event) => setForm((prev) => ({ ...prev, preset: "CUSTOM", date_start: event.target.value }))}
              required
            />
          </label>
          <label>
            Date End
            <input
              type="date"
              value={form.date_end}
              onChange={(event) => setForm((prev) => ({ ...prev, preset: "CUSTOM", date_end: event.target.value }))}
              required
            />
          </label>
          <label>
            Template (optional)
            <select
              value={form.template_id}
              onChange={(event) => setForm({ ...form, template_id: event.target.value })}
            >
              <option value="">Use Active Template</option>
              {runnableTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.is_active ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stored Trial Balance
            <select
              value={form.tb_repository_version_id}
              onChange={(event) => setForm((current) => ({ ...current, tb_repository_version_id: event.target.value }))}
            >
              <option value="">Upload a new file</option>
              {trialBalanceSources.map((item) => (
                <option key={item.id} value={item.currentVersion.id}>
                  {item.title}{item.period_start ? ` (${item.period_start} to ${item.period_end})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trial Balance Upload (.xlsx)
            <input
              ref={tbInputRef}
              name="tb_file"
              type="file"
              accept=".xlsx"
              required={!form.tb_repository_version_id}
              disabled={Boolean(form.tb_repository_version_id)}
            />
          </label>
          <label>
            Stored General Ledger
            <select
              value={form.gl_repository_version_id}
              onChange={(event) => setForm((current) => ({ ...current, gl_repository_version_id: event.target.value }))}
            >
              <option value="">Upload a new file</option>
              {generalLedgerSources.map((item) => (
                <option key={item.id} value={item.currentVersion.id}>
                  {item.title}{item.period_start ? ` (${item.period_start} to ${item.period_end})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            General Ledger Upload (.xlsx)
            <input
              ref={glInputRef}
              name="gl_file"
              type="file"
              accept=".xlsx"
              required={!form.gl_repository_version_id}
              disabled={Boolean(form.gl_repository_version_id)}
            />
          </label>
        </div>

        {(!form.tb_repository_version_id || !form.gl_repository_version_id) && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.save_uploads_to_repository}
              onChange={(event) =>
                setForm((current) => ({ ...current, save_uploads_to_repository: event.target.checked }))
              }
            />
            Save uploaded inputs to Fund Repository for future report runs
          </label>
        )}

        <RepositoryKnowledgeCard
          knowledge={confirmedKnowledge}
          title="Confirmed facts included with this run"
          onOpenRepository={onOpenRepository}
        />

        <button className="primary" type="submit" disabled={generating || !canUseTemplate}>
          {generating ? "Generating..." : "Generate XLSX Report"}
        </button>
        {generating && (
          <p className="muted small">
            Building workbook and mapping cash movements. This can take a moment when LLM mapping is enabled.
          </p>
        )}
      </form>

      {coveragePreflight && (
        <CoveragePreflightCard coverage={coveragePreflight} onOpenTemplates={onOpenTemplates} />
      )}

      {latestRun && (
        <div className="panel stack">
          <div className="inline-actions">
            <h3>Latest Run</h3>
            <button
              type="button"
              onClick={() => downloadRun(latestRun.id)}
              disabled={downloadingRunId === latestRun.id}
            >
              {downloadingRunId === latestRun.id ? "Downloading..." : "Download XLSX"}
            </button>
          </div>
          <p className="muted small">
            Run ID: {latestRun.id} | Created: {shortDate(latestRun.created_at)} | Scope: {latestPreview?.period_start || "-"} to {latestPreview?.period_end || "-"}
          </p>

          {latestRepositoryKnowledge && (
            <RepositoryKnowledgeCard
              knowledge={latestRepositoryKnowledge}
              title="Confirmed facts recorded with this report"
              onOpenRepository={onOpenRepository}
              attached
            />
          )}

          {latestWarnings.length > 0 && (
            <div className="alert warn">
              <strong>Warnings</strong>
              <ul className="simple-list">
                {latestWarnings.map((warning, index) => (
                  <li key={`${warning}_${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {latestAutoMappings.length > 0 && (
            <div className="mini-card">
              <p className="kicker">Auto Mappings Created</p>
              <p className="muted small">{latestAutoMappings.length} new learned account mapping(s) saved.</p>
            </div>
          )}

          {latestLowConfidenceMappings.length > 0 && (
            <div className="alert warn">
              <strong>Low Confidence Account Mappings</strong>
              <ul className="simple-list">
                {latestLowConfidenceMappings.slice(0, 10).map((item, index) => (
                  <li key={`${item.normalized_account}_${index}`}>
                    {item.account_name || item.normalized_account}
                    {" -> "}
                    {formatTargetLabel(item.bucket_key || item.semantic_key, targetLabels)} ({formatConfidence(item.confidence)})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Opening</th>
                    {previewBucketKeys.map((bucketKey) => (
                      <th key={bucketKey}>{formatTargetLabel(bucketKey, targetLabels)}</th>
                    ))}
                    <th>Net</th>
                    <th>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.period_key}>
                      <td>{row.label}</td>
                      <td>{currency(row.opening_balance)}</td>
                      {previewBucketKeys.map((bucketKey) => (
                        <td key={`${row.period_key}_${bucketKey}`}>{currency(row.buckets?.[bucketKey] || 0)}</td>
                      ))}
                      <td>{currency(row.net_cash_flow)}</td>
                      <td>{currency(row.closing_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {latestPreview?.totals && (
            <div className="cards-grid">
              <div className="mini-card">
                <p className="kicker">Total Inflows</p>
                <h3>{currency(latestPreview.totals.total_inflows)}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Total Outflows</p>
                <h3>{currency(latestPreview.totals.total_outflows)}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Net Cash Flow</p>
                <h3>{currency(latestPreview.totals.net_cash_flow)}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Closing Balance</p>
                <h3>{currency(latestPreview.totals.closing_balance_end)}</h3>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="panel stack">
        <h3>Report History</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Range</th>
                <th>Template</th>
                <th>Auto Mapped</th>
                <th>Low Confidence</th>
                <th>Repository Context</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id}>
                  <td>{shortDate(run.created_at)}</td>
                  <td>
                    {run.inputs_json?.date_start || run.period_start || "-"} to {run.inputs_json?.date_end || run.period_end || "-"}
                  </td>
                  <td>{run.inputs_json?.template_name || "-"}</td>
                  <td>{run.inputs_json?.auto_mappings_created?.length || 0}</td>
                  <td>{run.inputs_json?.low_confidence_mappings?.length || 0}</td>
                  <td>{repositoryContextLabel(run)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => downloadRun(run.id)}
                      disabled={downloadingRunId === run.id}
                    >
                      {downloadingRunId === run.id ? "Downloading..." : "Download XLSX"}
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={7}>No cash flow report runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
