import { useCallback, useEffect, useMemo, useState } from "react"
import { apiMultipartRequest, apiRequest, shortDate } from "../api"
import {
  ACTIVITY_COLUMN_FIELDS,
  ACTIVITY_REQUIRED_COLUMNS,
  SUMMARY_COLUMN_FIELDS,
  SUMMARY_REQUIRED_COLUMNS,
  SUMMARY_SCALAR_FIELDS,
  SUMMARY_TOTAL_FIELDS,
  STATEMENT_REQUIRED_SCALARS,
  STATEMENT_SCALAR_FIELDS,
  evaluateCasConfig,
  fieldLabel,
  normalizeCasConfig,
} from "./casTemplateModel"

function fileSignature(file) {
  return file ? `${file.name}:${file.size}:${file.lastModified}` : ""
}

function scalarBinding(config, section, field) {
  const source = config?.[section]?.scalar_bindings?.[field]
  if (!source) return { cell: "", mode: "value" }
  return typeof source === "string" ? { cell: source, mode: "value" } : source
}

function MappingStatus({ review }) {
  return (
    <div className="cas-readiness-grid">
      {review.groups.map((group) => (
        <article className={`mini-card ${group.missing.length ? "warn" : "ok"}`} key={group.key}>
          <strong>{group.label}</strong>
          <p className="muted small">
            {group.missing.length ? `Missing: ${group.missing.map(fieldLabel).join(", ")}` : "Ready"}
          </p>
        </article>
      ))}
    </div>
  )
}

function ScalarBindings({ title, fields, requiredFields, config, section, onChange }) {
  const required = new Set(requiredFields)
  return (
    <section className="mini-card stack">
      <h4>{title}</h4>
      <div className="cas-mapping-grid">
        {fields.map((field) => {
          const binding = scalarBinding(config, section, field)
          return (
            <div className="cas-mapping-row" key={field}>
              <label>
                {fieldLabel(field)}{required.has(field) ? " *" : ""}
                <input
                  value={binding.cell || ""}
                  placeholder="B6"
                  onChange={(event) => onChange(field, { ...binding, cell: event.target.value.toUpperCase() })}
                />
              </label>
              <select
                aria-label={`${fieldLabel(field)} write mode`}
                value={binding.mode || "value"}
                onChange={(event) => onChange(field, { ...binding, mode: event.target.value })}
              >
                <option value="value">Write value</option>
                <option value="preserve_formula">Keep formula</option>
              </select>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ColumnBindings({ title, fields, requiredFields, table, onTableChange }) {
  const required = new Set(requiredFields)
  return (
    <section className="mini-card stack">
      <h4>{title}</h4>
      <div className="form-grid">
        <label>
          First data row *
          <input
            type="number"
            min="1"
            value={table.data_start_row || ""}
            onChange={(event) => onTableChange({ ...table, data_start_row: event.target.value })}
          />
        </label>
        <label>
          Style source row
          <input
            type="number"
            min="1"
            value={table.style_source_row || ""}
            onChange={(event) => onTableChange({ ...table, style_source_row: event.target.value })}
          />
        </label>
      </div>
      <div className="cas-column-grid">
        {fields.map((field) => (
          <label key={field}>
            {fieldLabel(field)}{required.has(field) ? " *" : ""}
            <input
              value={table.columns?.[field] || ""}
              placeholder="A"
              onChange={(event) => onTableChange({
                ...table,
                columns: { ...table.columns, [field]: event.target.value.toUpperCase() },
              })}
            />
          </label>
        ))}
      </div>
    </section>
  )
}

function WorkbookPreview({ workbook }) {
  const [sheetName, setSheetName] = useState("")
  const sheets = workbook?.worksheets || []
  const selected = sheets.find((sheet) => sheet.name === sheetName) || sheets[0]
  useEffect(() => {
    setSheetName(sheets[0]?.name || "")
  }, [workbook])
  if (!sheets.length) return null
  return (
    <section className="mini-card stack">
      <div className="section-heading">
        <h4>Workbook preview</h4>
        <select value={selected?.name || ""} onChange={(event) => setSheetName(event.target.value)}>
          {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
        </select>
      </div>
      <div className="cas-workbook-preview">
        {(selected?.rows || []).slice(0, 35).map((row, index) => (
          <div className="cas-preview-row" key={row.row_index || index}>
            <span className="muted">{row.row_index || index + 1}</span>
            <span>{(row.cells || []).map((cell) => `${cell.address}: ${cell.display_value || ""}`).join(" · ")}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CapitalAccountTemplatesPanel({ token, selectedFundId, onError, onNote, onTemplatesChanged }) {
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({ name: "", version: "", template_file: null })
  const [analysis, setAnalysis] = useState(null)
  const [config, setConfig] = useState(() => normalizeCasConfig())
  const [workbook, setWorkbook] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [busy, setBusy] = useState("")

  const review = useMemo(() => evaluateCasConfig(config), [config])
  const activeTemplate = useMemo(() => templates.find((template) => template.is_active) || null, [templates])

  const loadTemplates = useCallback(async () => {
    if (!selectedFundId) return
    const response = await apiRequest(`/capital-account-statements/templates?portfolio_id=${selectedFundId}`, { token })
    setTemplates(response.data.templates || [])
  }, [selectedFundId, token])

  useEffect(() => {
    setTemplates([])
    setAnalysis(null)
    setWorkbook(null)
    setEditingTemplate(null)
    setConfig(normalizeCasConfig())
    if (selectedFundId) loadTemplates().catch((error) => onError(error.message))
  }, [loadTemplates, onError, selectedFundId])

  const refresh = async () => {
    await loadTemplates()
    onTemplatesChanged?.()
  }

  const updateScalar = (section, field, binding) => {
    setConfig((current) => ({
      ...current,
      [section]: {
        ...current[section],
        scalar_bindings: { ...current[section].scalar_bindings, [field]: binding },
      },
    }))
  }

  const analyze = async (event) => {
    event.preventDefault()
    if (!form.template_file) return onError("Select an .xlsx CAS template first.")
    setBusy("analyze")
    try {
      const data = new FormData()
      data.append("portfolio_id", selectedFundId)
      data.append("template_file", form.template_file)
      const response = await apiMultipartRequest("/capital-account-statements/templates/analyze", { token, formData: data })
      setAnalysis({
        id: response.data.analysis.id,
        fileSignature: fileSignature(form.template_file),
      })
      setConfig(normalizeCasConfig(response.data.suggested_config_json))
      setWorkbook(response.data.workbook || null)
      setEditingTemplate(null)
      onNote("CAS template analyzed. Review the suggested mappings.")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  const saveUpload = async (activate) => {
    if (!form.template_file || !analysis || analysis.fileSignature !== fileSignature(form.template_file)) {
      return onError("Analyze the selected CAS template before saving it.")
    }
    if (activate && !review.canActivate) return onError("Complete the required CAS mappings before activation.")
    setBusy(activate ? "activate-upload" : "draft-upload")
    try {
      const data = new FormData()
      data.append("portfolio_id", selectedFundId)
      data.append("template_file", form.template_file)
      data.append("name", form.name || form.template_file.name)
      data.append("version", form.version)
      data.append("analysis_id", analysis.id)
      data.append("config_json", JSON.stringify(review.config))
      data.append("activation_mode", activate ? "activate_if_ready" : "draft")
      data.append("is_active", activate ? "true" : "false")
      await apiMultipartRequest("/capital-account-statements/templates", { token, formData: data })
      onNote(activate ? "CAS template uploaded and activated." : "CAS template saved as a draft.")
      setForm({ name: "", version: "", template_file: null })
      setAnalysis(null)
      setWorkbook(null)
      setConfig(normalizeCasConfig())
      await refresh()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  const openTemplate = async (template) => {
    setBusy(`edit-${template.id}`)
    try {
      const response = await apiRequest(`/capital-account-statements/templates/${template.id}/editor-context`, { token })
      setEditingTemplate(response.data.template || template)
      setConfig(normalizeCasConfig(response.data.editor_context?.config || template.config_json))
      setWorkbook(response.data.editor_context?.workbook || null)
      setAnalysis(null)
      setForm({ name: template.name || "", version: template.version || "", template_file: null })
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  const saveEdit = async (activate) => {
    if (!editingTemplate) return
    if (activate && !review.canActivate) return onError("Complete the required CAS mappings before activation.")
    setBusy(activate ? "activate-edit" : "draft-edit")
    try {
      await apiRequest(`/capital-account-statements/templates/${editingTemplate.id}`, {
        method: "PUT",
        token,
        body: {
          name: form.name || editingTemplate.name,
          version: form.version || editingTemplate.version,
          config_json: review.config,
          activation_mode: activate ? "activate_if_ready" : "draft",
          is_active: activate,
        },
      })
      onNote(activate ? "CAS template mappings saved and activated." : "CAS template changes saved as a draft.")
      setEditingTemplate(null)
      setWorkbook(null)
      setConfig(normalizeCasConfig())
      await refresh()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  const activateTemplate = async (template) => {
    setBusy(`activate-${template.id}`)
    try {
      await apiRequest(`/capital-account-statements/templates/${template.id}/activate`, { method: "PUT", token })
      onNote("CAS template activated.")
      await refresh()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  const reanalyzeTemplate = async (template) => {
    setBusy(`reanalyze-${template.id}`)
    try {
      const response = await apiRequest(`/capital-account-statements/templates/${template.id}/reanalyze`, {
        method: "POST",
        token,
        body: { apply: false },
      })
      setEditingTemplate(template)
      setConfig(normalizeCasConfig(response.data.suggested_config_json))
      setWorkbook(response.data.editor_context?.workbook || null)
      setForm({ name: template.name || "", version: template.version || "", template_file: null })
      onNote("CAS template reanalyzed. Review the refreshed suggestions.")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy("")
    }
  }

  if (!selectedFundId) {
    return <p className="muted">Select a fund to manage capital account statement templates.</p>
  }

  const sheets = workbook?.worksheets || []
  const showEditor = Boolean(analysis || editingTemplate)

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <p className="kicker">Template Control</p>
          <h2>Capital Account Statement Templates & Mapping</h2>
        </div>
      </div>
      <div className="alert info">
        Active CAS template: <strong>{activeTemplate?.name || "None"}</strong>
      </div>

      <form className="panel stack new-template-panel" onSubmit={analyze}>
        <h3>Upload, Analyze, Review</h3>
        <div className="form-grid">
          <label>
            Template name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Version
            <input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} />
          </label>
          <label>
            XLSX template
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setForm({ ...form, template_file: event.target.files?.[0] || null })
                setAnalysis(null)
              }}
            />
          </label>
        </div>
        <button type="submit" disabled={Boolean(busy)}>{busy === "analyze" ? "Analyzing..." : "Analyze Template"}</button>
      </form>

      {showEditor && (
        <section className="panel stack cas-template-editor">
          <div className="section-heading">
            <div>
              <p className="kicker">CAS Mapping Review</p>
              <h3>{editingTemplate ? editingTemplate.name : form.name || form.template_file?.name}</h3>
            </div>
            <span className={`status-pill ${review.canActivate ? "ready" : "warn"}`}>
              {review.canActivate ? "Ready to activate" : "Needs mapping"}
            </span>
          </div>

          <MappingStatus review={review} />

          <section className="mini-card stack">
            <h4>Worksheet roles</h4>
            <div className="form-grid">
              <label>
                Consolidated summary sheet *
                <select
                  value={config.summary.sheet_name}
                  onChange={(event) => setConfig({ ...config, summary: { ...config.summary, sheet_name: event.target.value } })}
                >
                  <option value="">Choose sheet</option>
                  {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </label>
              <label>
                Investor statement prototype *
                <select
                  value={config.statement.prototype_sheet_name}
                  onChange={(event) => setConfig({
                    ...config,
                    statement: { ...config.statement, prototype_sheet_name: event.target.value },
                  })}
                >
                  <option value="">Choose sheet</option>
                  {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <ScalarBindings
            title="Summary identity and period cells"
            fields={SUMMARY_SCALAR_FIELDS}
            requiredFields={SUMMARY_SCALAR_FIELDS}
            config={config}
            section="summary"
            onChange={(field, binding) => updateScalar("summary", field, binding)}
          />
          <ColumnBindings
            title="Consolidated statement table"
            fields={SUMMARY_COLUMN_FIELDS}
            requiredFields={SUMMARY_REQUIRED_COLUMNS}
            table={config.summary.table}
            onTableChange={(table) => setConfig({ ...config, summary: { ...config.summary, table } })}
          />
          <ScalarBindings
            title="Investor statement cells"
            fields={STATEMENT_SCALAR_FIELDS}
            requiredFields={STATEMENT_REQUIRED_SCALARS}
            config={config}
            section="statement"
            onChange={(field, binding) => updateScalar("statement", field, binding)}
          />
          <ColumnBindings
            title="Investor activity table"
            fields={ACTIVITY_COLUMN_FIELDS}
            requiredFields={ACTIVITY_REQUIRED_COLUMNS}
            table={config.statement.activity_table}
            onTableChange={(activity_table) => setConfig({
              ...config,
              statement: { ...config.statement, activity_table },
            })}
          />

          <details className="mini-card">
            <summary>Optional consolidated total cells</summary>
            <div className="cas-column-grid">
              {SUMMARY_TOTAL_FIELDS.map((field) => {
                const binding = config.summary.totals_bindings?.[field] || { cell: "", mode: "value" }
                return (
                  <label key={field}>
                    {fieldLabel(field)}
                    <input
                      value={binding.cell || ""}
                      placeholder="F30"
                      onChange={(event) => setConfig({
                        ...config,
                        summary: {
                          ...config.summary,
                          totals_bindings: {
                            ...config.summary.totals_bindings,
                            [field]: { ...binding, cell: event.target.value.toUpperCase() },
                          },
                        },
                      })}
                    />
                  </label>
                )
              })}
            </div>
          </details>

          <WorkbookPreview workbook={workbook} />

          <div className="inline-actions">
            <button type="button" onClick={() => editingTemplate ? saveEdit(false) : saveUpload(false)} disabled={Boolean(busy)}>
              Save Draft
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => editingTemplate ? saveEdit(true) : saveUpload(true)}
              disabled={Boolean(busy) || !review.canActivate}
            >
              Save & Activate
            </button>
          </div>
        </section>
      )}

      <section className="panel stack">
        <div className="section-heading">
          <h3>CAS Templates</h3>
          <button type="button" onClick={() => refresh().catch((error) => onError(error.message))}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Version</th><th>Status</th><th>Readiness</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}</td>
                  <td>{template.version || "-"}</td>
                  <td>{template.is_active ? "Active" : template.status || "Draft"}</td>
                  <td>{template.can_activate ? "Ready" : "Needs mapping"}</td>
                  <td>{shortDate(template.created_at)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => openTemplate(template)} disabled={Boolean(busy)}>Edit</button>
                      <button type="button" onClick={() => reanalyzeTemplate(template)} disabled={Boolean(busy)}>Reanalyze</button>
                      {!template.is_active && (
                        <button
                          type="button"
                          onClick={() => activateTemplate(template)}
                          disabled={Boolean(busy) || !template.can_activate}
                        >Activate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!templates.length && <tr><td colSpan={6}>No CAS templates uploaded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
