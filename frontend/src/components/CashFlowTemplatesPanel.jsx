import { useCallback, useEffect, useMemo, useState } from "react"
import { apiMultipartRequest, apiRequest, shortDate } from "../api"

function createDefaultConfig() {
  return {
    sheet_name: "Cash Flow",
    header_row: 1,
    month_column_header: "Month",
    opening_column_header: "Opening Balance",
    closing_column_header: "Closing Balance",
    buckets: [
      {
        bucket_key: "sales_inflow",
        label: "Sales Inflow",
        direction: "inflow",
        column_header: "Sales Inflow",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
      },
      {
        bucket_key: "other_inflow",
        label: "Other Inflow",
        direction: "inflow",
        column_header: "Other Inflow",
        fallback: true,
        rules: [],
      },
      {
        bucket_key: "rent_outflow",
        label: "Rent",
        direction: "outflow",
        column_header: "Rent",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Rent Expense", priority: 1 }],
      },
      {
        bucket_key: "salaries_outflow",
        label: "Salaries",
        direction: "outflow",
        column_header: "Salaries",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Salaries Expense", priority: 1 }],
      },
      {
        bucket_key: "other_outflow",
        label: "Other Outflows",
        direction: "outflow",
        column_header: "Other Outflows",
        fallback: true,
        rules: [],
      },
    ],
  }
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config))
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
}

function emptyUploadForm() {
  return {
    name: "",
    version: "",
    is_active: true,
    template_file: null,
    config_json: createDefaultConfig(),
  }
}

function emptyEditorForm() {
  return {
    id: "",
    name: "",
    version: "",
    is_active: false,
    config_json: createDefaultConfig(),
  }
}

function updateBucketInConfig(config, bucketIndex, updater) {
  const next = cloneConfig(config)
  next.buckets[bucketIndex] = updater(next.buckets[bucketIndex])
  return next
}

function updateRuleInConfig(config, bucketIndex, ruleIndex, updater) {
  const next = cloneConfig(config)
  next.buckets[bucketIndex].rules[ruleIndex] = updater(next.buckets[bucketIndex].rules[ruleIndex])
  return next
}

function BucketEditor({ title, config, onChange }) {
  const addBucket = () => {
    onChange({
      ...config,
      buckets: [
        ...config.buckets,
        {
          bucket_key: `bucket_${config.buckets.length + 1}`,
          label: `Bucket ${config.buckets.length + 1}`,
          direction: "inflow",
          column_header: `Bucket ${config.buckets.length + 1}`,
          fallback: false,
          rules: [],
        },
      ],
    })
  }

  const removeBucket = (bucketIndex) => {
    onChange({
      ...config,
      buckets: config.buckets.filter((_, index) => index !== bucketIndex),
    })
  }

  return (
    <div className="stack">
      <div className="inline-actions">
        <h4>{title}</h4>
        <button type="button" onClick={addBucket}>
          Add Bucket
        </button>
      </div>

      {config.buckets.map((bucket, bucketIndex) => (
        <div className="mini-card stack" key={`${bucket.bucket_key}_${bucketIndex}`}>
          <div className="inline-actions">
            <strong>{bucket.label || bucket.bucket_key || `Bucket ${bucketIndex + 1}`}</strong>
            <button type="button" onClick={() => removeBucket(bucketIndex)}>
              Remove
            </button>
          </div>

          <div className="form-grid">
            <label>
              Bucket Key
              <input
                value={bucket.bucket_key}
                onChange={(event) => {
                  const value = normalizeKey(event.target.value)
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      bucket_key: value,
                    })),
                  )
                }}
              />
            </label>

            <label>
              Label
              <input
                value={bucket.label}
                onChange={(event) =>
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      label: event.target.value,
                    })),
                  )
                }
              />
            </label>

            <label>
              Direction
              <select
                value={bucket.direction}
                onChange={(event) =>
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      direction: event.target.value,
                    })),
                  )
                }
              >
                <option value="inflow">Inflow</option>
                <option value="outflow">Outflow</option>
              </select>
            </label>

            <label>
              Column Header
              <input
                value={bucket.column_header}
                onChange={(event) =>
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      column_header: event.target.value,
                    })),
                  )
                }
              />
            </label>

            <label>
              Fallback
              <select
                value={bucket.fallback ? "yes" : "no"}
                onChange={(event) =>
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      fallback: event.target.value === "yes",
                    })),
                  )
                }
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
                onClick={() =>
                  onChange(
                    updateBucketInConfig(config, bucketIndex, (current) => ({
                      ...current,
                      rules: [
                        ...(current.rules || []),
                        { match_type: "contains", pattern: "", priority: 1000 },
                      ],
                    })),
                  )
                }
              >
                Add Rule
              </button>
            </div>

            {(bucket.rules || []).length === 0 && <p className="muted small">No rules (fallback-only bucket).</p>}

            {(bucket.rules || []).map((rule, ruleIndex) => (
              <div className="form-grid compact" key={`${bucket.bucket_key}_rule_${ruleIndex}`}>
                <label>
                  Match Type
                  <select
                    value={rule.match_type}
                    onChange={(event) =>
                      onChange(
                        updateRuleInConfig(config, bucketIndex, ruleIndex, (current) => ({
                          ...current,
                          match_type: event.target.value,
                        })),
                      )
                    }
                  >
                    <option value="exact">Exact</option>
                    <option value="contains">Contains</option>
                  </select>
                </label>

                <label>
                  Pattern
                  <input
                    value={rule.pattern}
                    onChange={(event) =>
                      onChange(
                        updateRuleInConfig(config, bucketIndex, ruleIndex, (current) => ({
                          ...current,
                          pattern: event.target.value,
                        })),
                      )
                    }
                  />
                </label>

                <label>
                  Priority
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(event) =>
                      onChange(
                        updateRuleInConfig(config, bucketIndex, ruleIndex, (current) => ({
                          ...current,
                          priority: Number(event.target.value || 1000),
                        })),
                      )
                    }
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      updateBucketInConfig(config, bucketIndex, (current) => ({
                        ...current,
                        rules: current.rules.filter((_, index) => index !== ruleIndex),
                      })),
                    )
                  }
                >
                  Remove Rule
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CashFlowTemplatesPanel({ token, selectedFundId, onError, onNote }) {
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [uploadForm, setUploadForm] = useState(emptyUploadForm())
  const [editorForm, setEditorForm] = useState(emptyEditorForm())

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_active) || null,
    [templates],
  )

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
    setEditorForm(emptyEditorForm())
    setUploadForm(emptyUploadForm())
    if (!selectedFundId) {
      setTemplates([])
      return
    }
    loadTemplates()
  }, [loadTemplates, selectedFundId])

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!selectedFundId) {
      onError("Select a fund first.")
      return
    }
    if (!uploadForm.template_file) {
      onError("Select an .xlsx template file.")
      return
    }

    try {
      const formData = new FormData()
      formData.append("template_file", uploadForm.template_file)
      formData.append("portfolio_id", selectedFundId)
      formData.append("name", uploadForm.name)
      formData.append("version", uploadForm.version || "")
      formData.append("is_active", uploadForm.is_active ? "true" : "false")
      formData.append("config_json", JSON.stringify(uploadForm.config_json))

      await apiMultipartRequest("/cash-flow/templates", { token, formData })
      onNote("Cash flow template uploaded.")
      setUploadForm(emptyUploadForm())
      await loadTemplates()
    } catch (error) {
      onError(error.message)
    }
  }

  const loadIntoEditor = (template) => {
    setEditorForm({
      id: template.id,
      name: template.name || "",
      version: template.version || "",
      is_active: Boolean(template.is_active),
      config_json: cloneConfig(template.config_json || createDefaultConfig()),
    })
  }

  const handleUpdateTemplate = async (event) => {
    event.preventDefault()
    if (!editorForm.id) {
      onError("Load a template into the editor first.")
      return
    }

    try {
      await apiRequest(`/cash-flow/templates/${editorForm.id}`, {
        method: "PUT",
        token,
        body: {
          name: editorForm.name,
          version: editorForm.version || null,
          is_active: editorForm.is_active,
          config_json: editorForm.config_json,
        },
      })
      onNote("Cash flow template updated.")
      await loadTemplates()
    } catch (error) {
      onError(error.message)
    }
  }

  const handleActivate = async (templateId) => {
    try {
      await apiRequest(`/cash-flow/templates/${templateId}/activate`, {
        method: "PUT",
        token,
      })
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

      <form className="panel stack" onSubmit={handleUpload}>
        <h3>Upload Template</h3>
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
              onChange={(event) =>
                setUploadForm({ ...uploadForm, is_active: event.target.value === "yes" })
              }
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
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  template_file: event.target.files?.[0] || null,
                })
              }
              required
            />
          </label>
          <label>
            Sheet Name
            <input
              value={uploadForm.config_json.sheet_name}
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  config_json: {
                    ...uploadForm.config_json,
                    sheet_name: event.target.value,
                  },
                })
              }
              required
            />
          </label>
          <label>
            Header Row
            <input
              type="number"
              min="1"
              value={uploadForm.config_json.header_row}
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  config_json: {
                    ...uploadForm.config_json,
                    header_row: Number(event.target.value || 1),
                  },
                })
              }
              required
            />
          </label>
          <label>
            Month Header
            <input
              value={uploadForm.config_json.month_column_header}
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  config_json: {
                    ...uploadForm.config_json,
                    month_column_header: event.target.value,
                  },
                })
              }
              required
            />
          </label>
          <label>
            Opening Header
            <input
              value={uploadForm.config_json.opening_column_header}
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  config_json: {
                    ...uploadForm.config_json,
                    opening_column_header: event.target.value,
                  },
                })
              }
              required
            />
          </label>
          <label>
            Closing Header
            <input
              value={uploadForm.config_json.closing_column_header}
              onChange={(event) =>
                setUploadForm({
                  ...uploadForm,
                  config_json: {
                    ...uploadForm.config_json,
                    closing_column_header: event.target.value,
                  },
                })
              }
              required
            />
          </label>
        </div>

        <BucketEditor
          title="Bucket Rules"
          config={uploadForm.config_json}
          onChange={(nextConfig) => setUploadForm({ ...uploadForm, config_json: nextConfig })}
        />

        <button className="primary" type="submit">
          Upload Template
        </button>
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
                    <button type="button" onClick={() => loadIntoEditor(template)}>
                      Edit
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
          </tbody>
        </table>
      </div>

      <form className="panel stack" onSubmit={handleUpdateTemplate}>
        <h3>Template Editor</h3>
        {!editorForm.id && <p className="muted small">Click Edit on a template row to load it here.</p>}
        <div className="form-grid">
          <label>
            Name
            <input
              value={editorForm.name}
              onChange={(event) => setEditorForm({ ...editorForm, name: event.target.value })}
            />
          </label>
          <label>
            Version
            <input
              value={editorForm.version}
              onChange={(event) => setEditorForm({ ...editorForm, version: event.target.value })}
            />
          </label>
          <label>
            Keep Active
            <select
              value={editorForm.is_active ? "yes" : "no"}
              onChange={(event) =>
                setEditorForm({ ...editorForm, is_active: event.target.value === "yes" })
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Sheet Name
            <input
              value={editorForm.config_json.sheet_name}
              onChange={(event) =>
                setEditorForm({
                  ...editorForm,
                  config_json: {
                    ...editorForm.config_json,
                    sheet_name: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Header Row
            <input
              type="number"
              min="1"
              value={editorForm.config_json.header_row}
              onChange={(event) =>
                setEditorForm({
                  ...editorForm,
                  config_json: {
                    ...editorForm.config_json,
                    header_row: Number(event.target.value || 1),
                  },
                })
              }
            />
          </label>
          <label>
            Month Header
            <input
              value={editorForm.config_json.month_column_header}
              onChange={(event) =>
                setEditorForm({
                  ...editorForm,
                  config_json: {
                    ...editorForm.config_json,
                    month_column_header: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Opening Header
            <input
              value={editorForm.config_json.opening_column_header}
              onChange={(event) =>
                setEditorForm({
                  ...editorForm,
                  config_json: {
                    ...editorForm.config_json,
                    opening_column_header: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Closing Header
            <input
              value={editorForm.config_json.closing_column_header}
              onChange={(event) =>
                setEditorForm({
                  ...editorForm,
                  config_json: {
                    ...editorForm.config_json,
                    closing_column_header: event.target.value,
                  },
                })
              }
            />
          </label>
        </div>

        <BucketEditor
          title="Bucket Rules"
          config={editorForm.config_json}
          onChange={(nextConfig) => setEditorForm({ ...editorForm, config_json: nextConfig })}
        />

        <button className="primary" type="submit" disabled={!editorForm.id}>
          Save Template Changes
        </button>
      </form>
    </section>
  )
}
