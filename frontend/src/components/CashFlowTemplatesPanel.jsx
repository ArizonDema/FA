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

function getFileSignature(file) {
  if (!file) return null
  return `${file.name || ""}::${file.size || 0}::${file.lastModified || 0}`
}

function BucketGrid({ config, onChange }) {
  const buckets = config.bucket_bindings || []

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
    next.bucket_bindings = next.bucket_bindings.filter((_, index) => index !== bucketIndex)
    onChange(next)
  }

  const addBucket = () => {
    const next = clone(config)
    const index = (next.bucket_bindings || []).length + 1
    const firstPeriodKey = next.period_axis?.labels?.[0]?.period_key || "period_1"
    next.bucket_bindings = [
      ...(next.bucket_bindings || []),
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
            {(bucket.rules || []).map((rule, ruleIndex) => (
              <div className="form-grid compact" key={`${bucket.bucket_key}_rule_${ruleIndex}`}>
                <label>
                  Match Type
                  <select
                    value={rule.match_type}
                    onChange={(event) => {
                      const nextRules = [...(bucket.rules || [])]
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
                      const nextRules = [...(bucket.rules || [])]
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
                      const nextRules = [...(bucket.rules || [])]
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
                    const nextRules = (bucket.rules || []).filter((_, index) => index !== ruleIndex)
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
      onError(error.message)
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    setAnalysis(null)
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
    setConfigDraft(nextConfig)
    setRawConfigText(JSON.stringify(nextConfig, null, 2))
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
        issues: response.data.issues || [],
        required_anchors: response.data.required_anchors || [],
        needs_human_review: Boolean(response.data.needs_human_review),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
      })
      applyDraftConfig(suggestedConfig)
      if (response.data.needs_human_review) {
        onNote("Template analyzed but flagged for human review. Fix required anchors before saving.")
      } else {
        const sourceLabel = response.data.schema_cache_hit
          ? "cache hit"
          : response.data.analysis_source === "llm"
            ? "LLM analyzed"
            : `analysis source: ${response.data.analysis_source || "unknown"}`
        onNote(`Template analyzed (${sourceLabel}). Review bindings and save.`)
      }
    } catch (error) {
      onError(error.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleUploadTemplate = async (event) => {
    event.preventDefault()
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
      formData.append("config_json", JSON.stringify(parsedConfig))
      if (analysis?.id) {
        formData.append("analysis_id", analysis.id)
      }

      await apiMultipartRequest("/cash-flow/templates", { token, formData })
      onNote("Cash flow template uploaded and configured.")
      setAnalysis(null)
      setEditingTemplate(null)
      setUploadForm({ name: "", version: "", is_active: true, template_file: null })
      setConfigDraft(createEmptyV3Config())
      setRawConfigText(JSON.stringify(createEmptyV3Config(), null, 2))
      await loadTemplates()
    } catch (error) {
      onError(error.message)
    } finally {
      setSavingUpload(false)
    }
  }

  const handleReanalyzeTemplate = async (templateId) => {
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
        issues: response.data.issues || [],
        required_anchors: response.data.required_anchors || [],
        needs_human_review: Boolean(response.data.needs_human_review),
        schema_cache_hit: Boolean(response.data.schema_cache_hit),
        analysis_source: response.data.analysis_source || "llm",
      })
      applyDraftConfig(suggestedConfig)
      onNote("Template reanalyzed. Review updated bindings.")
    } catch (error) {
      onError(error.message)
    } finally {
      setReanalyzingTemplateId(null)
    }
  }

  const loadTemplateIntoEditor = (template) => {
    const nextConfig = clone(template.config_json || createEmptyV3Config())
    setEditingTemplate(template)
    applyDraftConfig(nextConfig)
    onNote("Template loaded into editor.")
  }

  const handleSaveEditor = async (event) => {
    event.preventDefault()
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
          is_active: Boolean(editingTemplate.is_active),
          config_json: parsedConfig,
        },
      })
      onNote("Template configuration updated.")
      await loadTemplates()
    } catch (error) {
      onError(error.message)
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
      onError(error.message)
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
              }}
              required
            />
          </label>
        </div>

        <div className="inline-actions">
          <button type="button" onClick={handleAnalyzeTemplate} disabled={analyzing || savingUpload}>
            {analyzing ? "Analyzing..." : "Analyze Template"}
          </button>
          <button className="primary" type="submit" disabled={savingUpload || analyzing || !hasMatchingUploadAnalysis}>
            {savingUpload ? "Saving..." : "Save Template"}
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
            {analysis.analysis_scope === "upload" && analysis.file_signature !== currentUploadSignature && (
              <div className="alert warn">
                Analyzed file no longer matches the selected upload. Re-run Analyze Template before saving.
              </div>
            )}
            {(analysis.issues || []).length > 0 && (
              <div className="alert warn">
                <strong>Analysis Notes</strong>
                <ul className="simple-list">
                  {(analysis.issues || []).map((issue, index) => (
                    <li key={`${issue}_${index}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {(analysis.required_anchors || []).length > 0 && (
              <p className="muted small">Required anchors: {analysis.required_anchors.join(", ")}</p>
            )}
          </div>
        )}

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
              {(configDraft.period_axis?.labels || []).map((label) => (
                <tr key={label.period_key}>
                  <td>{label.label}</td>
                  <td>{label.period_type || "custom"}</td>
                  <td>{label.period_key}</td>
                </tr>
              ))}
              {(configDraft.period_axis?.labels || []).length === 0 && (
                <tr>
                  <td colSpan={3}>No periods detected yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <BucketGrid config={configDraft} onChange={applyDraftConfig} />

        <label>
          Advanced Config JSON
          <textarea
            rows={12}
            value={rawConfigText}
            onChange={(event) => setRawConfigText(event.target.value)}
          />
        </label>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Active</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>{template.name}</td>
                <td>{template.version || "-"}</td>
                <td>{template.is_active ? "Yes" : "No"}</td>
                <td>{shortDate(template.created_at)}</td>
                <td>
                  <div className="inline-actions">
                    <button type="button" onClick={() => loadTemplateIntoEditor(template)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReanalyzeTemplate(template.id)}
                      disabled={Boolean(reanalyzingTemplateId)}
                    >
                      {reanalyzingTemplateId === template.id ? "Reanalyzing..." : "Reanalyze"}
                    </button>
                    {!template.is_active && (
                      <button type="button" onClick={() => handleActivate(template.id)}>
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5}>No templates uploaded yet.</td>
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
            <button className="primary" type="submit" disabled={savingEditor}>
              {savingEditor ? "Saving..." : "Save Template Changes"}
            </button>
          </>
        )}
      </form>
    </section>
  )
}
