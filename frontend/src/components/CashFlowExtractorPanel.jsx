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

export function CashFlowExtractorPanel({ token, selectedFundId, onError, onNote }) {
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [history, setHistory] = useState([])
  const [latestRun, setLatestRun] = useState(null)
  const [latestPreview, setLatestPreview] = useState(null)
  const [latestWarnings, setLatestWarnings] = useState([])
  const [latestAutoMappings, setLatestAutoMappings] = useState([])
  const [latestLowConfidenceMappings, setLatestLowConfidenceMappings] = useState([])
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
    }
  })

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active) || null,
    [templates],
  )

  const previewRows = useMemo(() => latestPreview?.periods || [], [latestPreview])
  const previewBucketKeys = useMemo(() => {
    if (!previewRows.length) return []
    return Object.keys(previewRows[0].buckets || {})
  }, [previewRows])

  const loadData = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const [templateResponse, historyResponse] = await Promise.all([
        apiRequest(`/cash-flow/templates?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/cash-flow/reports/history?portfolio_id=${selectedFundId}`, { token }),
      ])
      const nextTemplates = templateResponse.data.templates || []
      setTemplates(nextTemplates)
      setHistory(historyResponse.data.runs || [])
      const active = nextTemplates.find((item) => item.is_active)
      if (active) {
        setForm((prev) => (prev.template_id ? prev : { ...prev, template_id: active.id }))
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
    setForm({
      preset: "FY",
      year: String(year),
      date_start: fy.start,
      date_end: fy.end,
      template_id: "",
    })
    if (!selectedFundId) {
      setTemplates([])
      setHistory([])
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
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    const tbFile = tbInputRef.current?.files?.[0] || null
    const glFile = glInputRef.current?.files?.[0] || null
    if (!tbFile || !glFile) {
      onError("Upload both Trial Balance and General Ledger files.")
      return
    }
    if (!form.date_start || !form.date_end) {
      onError("Provide date range for this run.")
      return
    }

    try {
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
      formData.append("tb_file", tbFile)
      formData.append("gl_file", glFile)

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
    } catch (error) {
      onError(error.message)
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
        <h2>Cash Flow Extractor</h2>
        <p className="muted">Select a fund to run cash flow extraction.</p>
      </section>
    )
  }

  return (
    <section className="panel stack">
      <div className="inline-actions">
        <h2>Cash Flow Extractor</h2>
        <button type="button" onClick={loadData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="muted small">
        Active template: <strong>{activeTemplate?.name || "None"}</strong>
      </p>

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
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.is_active ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trial Balance (.xlsx)
            <input ref={tbInputRef} name="tb_file" type="file" accept=".xlsx" required />
          </label>
          <label>
            General Ledger (.xlsx)
            <input ref={glInputRef} name="gl_file" type="file" accept=".xlsx" required />
          </label>
        </div>

        <button className="primary" type="submit">
          Generate XLSX Report
        </button>
      </form>

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
                    {item.bucket_key} ({item.confidence})
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
                      <th key={bucketKey}>{bucketKey}</th>
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
                  <td colSpan={6}>No cash flow report runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
