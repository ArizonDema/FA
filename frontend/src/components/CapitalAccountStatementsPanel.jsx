import { useCallback, useEffect, useMemo, useState } from "react"
import { apiDownload, apiRequest, shortDate } from "../api"

function defaultPeriod() {
  const now = new Date()
  const year = now.getFullYear()
  return {
    period_start: `${year}-01-01`,
    period_end: now.toISOString().slice(0, 10),
  }
}

function formatAmount(value, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function uniqueBy(items, keySelector) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keySelector(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function CapitalAccountStatementsPanel({
  token,
  selectedFundId,
  selectedFund,
  onError,
  onNote,
  onOpenTemplates,
}) {
  const [form, setForm] = useState(() => ({
    ...defaultPeriod(),
    investor_profile_id: "",
    share_class_id: "",
  }))
  const [commitments, setCommitments] = useState([])
  const [history, setHistory] = useState([])
  const [templates, setTemplates] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloadingRunId, setDownloadingRunId] = useState("")

  const currencyCode = selectedFund?.base_currency || "USD"
  const investors = useMemo(
    () => uniqueBy(commitments.map((item) => item.investor).filter(Boolean), (item) => item.id),
    [commitments],
  )
  const shareClasses = useMemo(
    () => uniqueBy(commitments.map((item) => item.shareClass).filter(Boolean), (item) => item.id),
    [commitments],
  )
  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active && template.can_activate !== false) || null,
    [templates],
  )

  const loadData = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const [commitmentResponse, historyResponse, templateResponse] = await Promise.all([
        apiRequest(`/commitments?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/capital-account-statements/reports/history?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/capital-account-statements/templates?portfolio_id=${selectedFundId}`, { token }),
      ])
      setCommitments(commitmentResponse.data.commitments || [])
      setHistory(historyResponse.data.runs || [])
      setTemplates(templateResponse.data.templates || [])
    } catch (error) {
      onError(error.message)
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    setForm({ ...defaultPeriod(), investor_profile_id: "", share_class_id: "" })
    setPreview(null)
    setCommitments([])
    setHistory([])
    setTemplates([])
    if (selectedFundId) loadData()
  }, [loadData, selectedFundId])

  const runStatements = async (event) => {
    event.preventDefault()
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    if (!form.period_start || !form.period_end || form.period_start > form.period_end) {
      onError("Choose a valid statement period.")
      return
    }

    setGenerating(true)
    try {
      const response = await apiRequest("/capital-account-statements/reports/run", {
        method: "POST",
        token,
        body: {
          portfolio_id: selectedFundId,
          period_start: form.period_start,
          period_end: form.period_end,
          investor_profile_id: form.investor_profile_id || null,
          share_class_id: form.share_class_id || null,
        },
      })
      setPreview(response.data.preview?.capitalAccountStatements || null)
      onNote("Capital account statements generated.")
      await loadData()
    } catch (error) {
      onError(error.message)
    } finally {
      setGenerating(false)
    }
  }

  const downloadRun = async (runId) => {
    setDownloadingRunId(runId)
    try {
      const { blob, filename } = await apiDownload(
        `/capital-account-statements/reports/download/${runId}`,
        {
          token,
          defaultFileName: `capital_account_statements_${runId}.xlsx`,
        },
      )
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
      setDownloadingRunId("")
    }
  }

  if (!selectedFundId) {
    return (
      <section className="panel stack">
        <h2>Capital Account Statements</h2>
        <p className="muted">Select a fund to generate investor capital account rollforwards.</p>
      </section>
    )
  }

  const totals = preview?.totals || null
  const statements = preview?.statements || []

  return (
    <section className="panel stack">
      <div className="section-heading">
        <div>
          <p className="kicker">Investor Reporting</p>
          <h2>Capital Account Statements</h2>
        </div>
        <button type="button" onClick={loadData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="muted small">
        Generate one transaction-grounded rollforward per investor and share class from recorded commitments,
        capital-call payments, and distributions. The workbook includes a consolidated summary and an individual tab
        for each statement.
      </p>

      <div className={`alert ${activeTemplate ? "info" : "warn"}`}>
        <strong>Active CAS template: {activeTemplate?.name || "None"}</strong>
        {!activeTemplate && (
          <div className="inline-actions">
            <span className="small">Upload, map, and activate a CAS template before generating statements.</span>
            <button type="button" onClick={onOpenTemplates}>Open Templates & Mapping</button>
          </div>
        )}
      </div>

      <form className="panel stack" onSubmit={runStatements}>
        <div className="form-grid">
          <label>
            Period Start
            <input
              type="date"
              value={form.period_start}
              onChange={(event) => setForm({ ...form, period_start: event.target.value })}
              required
            />
          </label>
          <label>
            Period End
            <input
              type="date"
              value={form.period_end}
              onChange={(event) => setForm({ ...form, period_end: event.target.value })}
              required
            />
          </label>
          <label>
            Investor
            <select
              value={form.investor_profile_id}
              onChange={(event) => setForm({ ...form, investor_profile_id: event.target.value })}
            >
              <option value="">All investors</option>
              {investors.map((investor) => (
                <option key={investor.id} value={investor.id}>{investor.legal_name}</option>
              ))}
            </select>
          </label>
          <label>
            Share Class
            <select
              value={form.share_class_id}
              onChange={(event) => setForm({ ...form, share_class_id: event.target.value })}
            >
              <option value="">All share classes</option>
              {shareClasses.map((shareClass) => (
                <option key={shareClass.id} value={shareClass.id}>{shareClass.class_name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="inline-actions">
          <button className="primary" type="submit" disabled={generating || commitments.length === 0 || !activeTemplate}>
            {generating ? "Generating..." : "Generate Statements"}
          </button>
          {commitments.length === 0 && (
            <span className="muted small">Add at least one fund commitment before generating statements.</span>
          )}
        </div>
      </form>

      {preview && (
        <div className="stack">
          {preview.warnings?.map((warning) => (
            <div className="alert warn" key={warning.code}>
              <strong>{warning.code === "capital_account_allocations_not_available" ? "Allocation boundary" : "Review item"}</strong>
              <p className="small">{warning.message}</p>
            </div>
          ))}

          <div className="cards-grid reporting-grid">
            <article className="metric-card">
              <p className="kicker">Statements</p>
              <h3>{totals?.statements || 0}</h3>
              <p className="muted small">Across {totals?.investors || 0} investor(s)</p>
            </article>
            <article className="metric-card">
              <p className="kicker">Ending Capital</p>
              <h3>{formatAmount(totals?.ending_capital, currencyCode)}</h3>
              <p className="muted small">Transaction-based rollforward</p>
            </article>
            <article className="metric-card">
              <p className="kicker">Unfunded Commitment</p>
              <h3>{formatAmount(totals?.unfunded_commitment, currencyCode)}</h3>
              <p className="muted small">Commitment less called capital</p>
            </article>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Class</th>
                  <th>Beginning</th>
                  <th>Contributions</th>
                  <th>Distributions</th>
                  <th>Ending</th>
                  <th>Unfunded</th>
                  <th>Ownership</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((statement) => (
                  <tr key={`${statement.investor_profile_id}_${statement.share_class_id}`}>
                    <td>{statement.investor_name}</td>
                    <td>{statement.share_class}</td>
                    <td>{formatAmount(statement.beginning_capital, statement.currency)}</td>
                    <td>{formatAmount(statement.contributions, statement.currency)}</td>
                    <td>{formatAmount(statement.distributions, statement.currency)}</td>
                    <td>{formatAmount(statement.ending_capital, statement.currency)}</td>
                    <td>{formatAmount(statement.unfunded_commitment, statement.currency)}</td>
                    <td>{percent(statement.ownership_percentage)}</td>
                  </tr>
                ))}
                {statements.length === 0 && (
                  <tr><td colSpan={8}>No statements matched the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section-heading">
        <div>
          <p className="kicker">Generated Outputs</p>
          <h3>Statement History</h3>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Period</th>
              <th>Investor Filter</th>
              <th>Share Class Filter</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.id}>
                <td>{shortDate(run.created_at)}</td>
                <td>{run.period_start || "-"} to {run.period_end || "-"}</td>
                <td>{run.inputs_json?.investor_profile_id ? "Selected investor" : "All investors"}</td>
                <td>{run.inputs_json?.share_class_id ? "Selected class" : "All classes"}</td>
                <td>{String(run.status || "completed").replace(/_/g, " ")}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => downloadRun(run.id)}
                    disabled={downloadingRunId === run.id || run.status === "failed"}
                  >
                    {downloadingRunId === run.id ? "Downloading..." : "Download XLSX"}
                  </button>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={6}>No capital account statement runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
