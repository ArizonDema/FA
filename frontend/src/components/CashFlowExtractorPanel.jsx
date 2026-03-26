import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiDownload, apiMultipartRequest, apiRequest, currency, shortDate } from "../api"

function currentYear() {
  return new Date().getFullYear()
}

export function CashFlowExtractorPanel({ token, selectedFundId, onError, onNote }) {
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [history, setHistory] = useState([])
  const [latestRun, setLatestRun] = useState(null)
  const [latestPreview, setLatestPreview] = useState(null)
  const [latestWarnings, setLatestWarnings] = useState([])
  const [downloadingRunId, setDownloadingRunId] = useState(null)
  const tbInputRef = useRef(null)
  const glInputRef = useRef(null)
  const [form, setForm] = useState({
    fiscal_year: String(currentYear()),
    template_id: "",
  })

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active) || null,
    [templates],
  )

  const previewBucketKeys = useMemo(() => {
    if (!latestPreview?.monthly?.length) return []
    const firstRow = latestPreview.monthly[0]
    return Object.keys(firstRow.buckets || {})
  }, [latestPreview])

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
    setLatestRun(null)
    setLatestPreview(null)
    setLatestWarnings([])
    setForm({
      fiscal_year: String(currentYear()),
      template_id: "",
    })
    if (!selectedFundId) {
      setTemplates([])
      setHistory([])
      return
    }
    loadData()
  }, [loadData, selectedFundId])

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

    try {
      const formData = new FormData()
      formData.append("portfolio_id", selectedFundId)
      formData.append("fiscal_year", form.fiscal_year)
      if (form.template_id) {
        formData.append("template_id", form.template_id)
      }
      formData.append("tb_file", tbFile)
      formData.append("gl_file", glFile)

      const response = await apiMultipartRequest("/cash-flow/reports/run", { token, formData })
      setLatestRun(response.data.run || null)
      setLatestPreview(response.data.preview || null)
      setLatestWarnings(response.data.warnings || [])
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
            Fiscal Year
            <input
              type="number"
              min="1900"
              max="3000"
              value={form.fiscal_year}
              onChange={(event) => setForm({ ...form, fiscal_year: event.target.value })}
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
            <input
              ref={tbInputRef}
              name="tb_file"
              type="file"
              accept=".xlsx"
              required
            />
          </label>
          <label>
            General Ledger (.xlsx)
            <input
              ref={glInputRef}
              name="gl_file"
              type="file"
              accept=".xlsx"
              required
            />
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
            Run ID: {latestRun.id} | Created: {shortDate(latestRun.created_at)}
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

          {latestPreview?.monthly?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Opening</th>
                    {previewBucketKeys.map((bucketKey) => (
                      <th key={bucketKey}>{bucketKey}</th>
                    ))}
                    <th>Net</th>
                    <th>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPreview.monthly.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{currency(row.opening_balance)}</td>
                      {previewBucketKeys.map((bucketKey) => (
                        <td key={`${row.month}_${bucketKey}`}>
                          {currency(row.buckets?.[bucketKey] || 0)}
                        </td>
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
                <p className="kicker">Dec Closing</p>
                <h3>{currency(latestPreview.totals.closing_balance_december)}</h3>
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
                <th>Fiscal Year</th>
                <th>Template</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id}>
                  <td>{shortDate(run.created_at)}</td>
                  <td>{run.inputs_json?.fiscal_year || "-"}</td>
                  <td>{run.inputs_json?.template_name || "-"}</td>
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
                  <td colSpan={4}>No cash flow report runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
