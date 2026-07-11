import { useCallback, useEffect, useMemo, useState } from "react"
import { apiDownload, apiRequest, currency, shortDate } from "../api"

const ACTIVE_REVIEW_STATUSES = new Set(["open", "in_review", "deferred"])
const REPORT_TYPES = [
  "cash_flow",
  "financial_statements",
  "management_report",
  "investor_report",
  "lender_report",
  "fund_report",
  "shareholder_register",
  "custom",
]
const PROJECT_STATUSES = [
  "draft",
  "inputs_ready",
  "mapping_review",
  "validation_ready",
  "approved",
  "exported",
  "archived",
]
const SOURCE_ROLES = [
  "template",
  "trial_balance",
  "general_ledger",
  "lpa",
  "legal_document",
  "supporting_document",
  "validation_source",
  "draft_report",
  "other",
]

function words(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function compactDate(value) {
  if (!value) return "Not set"
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`),
  )
}

function dueState(value) {
  if (!value) return { label: "No due date", tone: "neutral" }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: "bad" }
  if (days === 0) return { label: "Due today", tone: "warn" }
  if (days <= 7) return { label: `${days}d remaining`, tone: "warn" }
  return { label: `${days}d remaining`, tone: "ok" }
}

function saveDownload({ blob, filename }) {
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}

function Pill({ tone = "neutral", children }) {
  return <span className={`workbench-pill ${tone}`}>{children}</span>
}

function CheckIcon({ status }) {
  const label = status === "pass" ? "Passed" : status === "warning" ? "Warning" : "Failed"
  return (
    <span className={`workbench-check-icon ${status}`} title={label} aria-label={label}>
      {status === "pass" ? "✓" : status === "warning" ? "!" : "×"}
    </span>
  )
}

function EmptyState({ title, detail, action }) {
  return (
    <div className="workbench-empty">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  )
}

function sourceDisplayName(source) {
  return (
    source.repositoryItem?.title ||
    source.repositoryVersion?.original_file_name ||
    source.template?.name ||
    source.templateVersion?.source_file_name ||
    source.reportRun?.inputs_json?.template_name ||
    source.original_file_name ||
    words(source.source_role)
  )
}

function sourceDetail(source) {
  if (source.repositoryVersion) {
    return `Version ${source.repositoryVersion.version_number || "current"} · ${source.repositoryVersion.original_file_name || "Repository source"}`
  }
  if (source.templateVersion) {
    return `Template version ${source.templateVersion.version_label || source.templateVersion.version_number || "active"}`
  }
  if (source.reportRun) return `Report run · ${shortDate(source.reportRun.created_at || source.reportRun.createdAt)}`
  return words(source.source_type)
}

function getCoverageErrorDetails(error) {
  const details = error?.errors || error?.details || error?.payload?.errors || null
  return details?.code === "cash_flow_template_coverage_failed" ? details : null
}

function initialDates() {
  const today = new Date()
  const year = today.getFullYear()
  const due = new Date(today)
  due.setDate(due.getDate() + 14)
  const dueDate = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  return { period_start: `${year}-01-01`, period_end: `${year}-12-31`, due_date: dueDate }
}

export function ReportingWorkbenchPanel({
  token,
  user,
  selectedFundId,
  selectedFund,
  coverageIssue,
  onCoverageIssue,
  onError,
  onNote,
  onOpenRepository,
  onOpenTemplates,
}) {
  const defaults = initialDates()
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [project, setProject] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [repositoryItems, setRepositoryItems] = useState([])
  const [templates, setTemplates] = useState([])
  const [reportRuns, setReportRuns] = useState([])
  const [reviewTasks, setReviewTasks] = useState([])
  const [exports, setExports] = useState([])
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyAction, setBusyAction] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")
  const [createForm, setCreateForm] = useState({
    name: "",
    report_type: "cash_flow",
    period_start: defaults.period_start,
    period_end: defaults.period_end,
    owner_name: user?.full_name || "",
    due_date: defaults.due_date,
    template_id: "",
  })
  const [editForm, setEditForm] = useState({})
  const [sourceForm, setSourceForm] = useState({ selection: "", source_role: "other", required: true })

  const loadProject = useCallback(
    async (projectId, { quiet = false } = {}) => {
      if (!selectedFundId || !projectId) return
      if (!quiet) setDetailLoading(true)
      try {
        const [projectResponse, readinessResponse] = await Promise.all([
          apiRequest(`/funds/${selectedFundId}/reporting-projects/${projectId}`, { token }),
          apiRequest(`/funds/${selectedFundId}/reporting-projects/${projectId}/readiness`, { token }),
        ])
        const nextProject = projectResponse.data.project
        const nextReadiness = readinessResponse.data.readiness
        let nextExports = []
        if (nextProject?.current_report_run_id) {
          const endpoint =
            nextProject.report_type === "cash_flow"
              ? `/cash-flow/reports/${nextProject.current_report_run_id}/exports`
              : `/reports/${nextProject.current_report_run_id}/exports`
          const exportResponse = await apiRequest(endpoint, { token })
          nextExports = exportResponse.data.exports || []
        }
        setProject(nextProject)
        setReadiness(nextReadiness)
        setExports(nextExports)
        setProjects((current) => current.map((item) => (item.id === nextProject.id ? nextProject : item)))
      } catch (error) {
        onError(error.message)
      } finally {
        if (!quiet) setDetailLoading(false)
      }
    },
    [onError, selectedFundId, token],
  )

  const loadWorkbench = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const [projectResponse, itemResponse, templateResponse, runResponse, taskResponse] = await Promise.all([
        apiRequest(`/funds/${selectedFundId}/reporting-projects`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/items?status=active`, { token }),
        apiRequest(`/cash-flow/templates?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/cash-flow/reports/history?portfolio_id=${selectedFundId}`, { token }),
        apiRequest(`/review-tasks?fund_id=${selectedFundId}`, { token }),
      ])
      const nextProjects = projectResponse.data.projects || []
      setProjects(nextProjects)
      setRepositoryItems(itemResponse.data.items || [])
      setTemplates(templateResponse.data.templates || [])
      setReportRuns(runResponse.data.runs || [])
      setReviewTasks(taskResponse.data.review_tasks || [])
      setSelectedProjectId((current) => {
        if (current && nextProjects.some((item) => item.id === current)) return current
        return nextProjects.find((item) => !["exported", "archived"].includes(item.status))?.id || ""
      })
    } catch (error) {
      onError(error.message)
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    setProjects([])
    setProject(null)
    setReadiness(null)
    setSelectedProjectId("")
    setExports([])
    setActiveTab("overview")
    setShowCreate(false)
    setShowSourcePicker(false)
    if (selectedFundId) loadWorkbench()
  }, [loadWorkbench, selectedFundId])

  useEffect(() => {
    if (selectedProjectId) loadProject(selectedProjectId)
    else {
      setProject(null)
      setReadiness(null)
      setExports([])
    }
  }, [loadProject, selectedProjectId])

  useEffect(() => {
    if (!project) return
    setEditForm({
      name: project.name || "",
      status: project.status || "draft",
      period_start: project.period_start || "",
      period_end: project.period_end || "",
      owner_name: project.metadata_json?.owner_name || project.metadata_json?.owner || user?.full_name || "",
      due_date: project.metadata_json?.due_date || "",
    })
  }, [project, user])

  const sourceOptions = useMemo(() => {
    const options = []
    repositoryItems.forEach((item) => {
      if (!item.currentVersion || item.is_archived) return
      options.push({
        key: `repository:${item.currentVersion.id}`,
        kind: "repository",
        id: item.currentVersion.id,
        role: SOURCE_ROLES.includes(item.category) ? item.category : item.kind === "document" ? "supporting_document" : "other",
        label: `${item.title} · v${item.currentVersion.version_number || 1}`,
        group: item.kind === "dataset" ? "Repository datasets" : "Repository documents",
      })
    })
    templates.forEach((template) => {
      const versionId = template.active_version_id || template.activeVersion?.id
      if (!versionId) return
      options.push({
        key: `template:${versionId}`,
        kind: "template",
        id: versionId,
        role: "template",
        label: `${template.name} · ${template.activeVersion?.version_label || template.version || "active"}`,
        group: "Templates",
      })
    })
    reportRuns.forEach((run) => {
      options.push({
        key: `run:${run.id}`,
        kind: "run",
        id: run.id,
        role: "draft_report",
        label: `${words(run.type)} · ${compactDate(run.period_end || run.inputs_json?.date_end)} · ${shortDate(run.created_at || run.createdAt)}`,
        group: "Generated report runs",
      })
    })
    return options
  }, [reportRuns, repositoryItems, templates])

  const currentRun = useMemo(
    () => project?.currentReportRun || reportRuns.find((run) => run.id === project?.current_report_run_id) || null,
    [project, reportRuns],
  )

  const activeCoverageIssue = useMemo(() => {
    const issueProjectId = coverageIssue?.projectId || coverageIssue?.project_id || null
    if (issueProjectId && issueProjectId === project?.id) {
      return coverageIssue?.coverage || coverageIssue
    }
    return project?.metadata_json?.coverage_exception || null
  }, [coverageIssue, project?.id, project?.metadata_json?.coverage_exception])

  const relatedTasks = useMemo(() => {
    if (!project) return []
    const runIds = new Set(
      [project.current_report_run_id, ...(project.sources || []).map((source) => source.report_run_id)].filter(Boolean),
    )
    const exportIds = new Set(exports.map((item) => item.id))
    return reviewTasks.filter((task) => {
      const metadata = task.metadata || {}
      return (
        metadata.reporting_project_id === project.id ||
        runIds.has(metadata.report_run_id) ||
        task.templateVersionId === project.template_version_id ||
        exportIds.has(task.targetId)
      )
    })
  }, [exports, project, reviewTasks])

  const exceptionTasks = relatedTasks.filter(
    (task) => task.targetType !== "report_export" && ACTIVE_REVIEW_STATUSES.has(task.status),
  )
  const approvalTasks = relatedTasks.filter((task) => task.targetType === "report_export")
  const openApprovalTasks = approvalTasks.filter((task) => ACTIVE_REVIEW_STATUSES.has(task.status))
  const readinessChecks = readiness?.checks || []
  const readinessIssues = readinessChecks.filter((check) => check.status !== "pass")
  const missingCoverageItems = Array.isArray(activeCoverageIssue?.missing_items)
    ? activeCoverageIssue.missing_items
    : []
  const coverageExceptionCount = activeCoverageIssue ? Math.max(1, missingCoverageItems.length) : 0
  const totalExceptionCount = readinessIssues.length + exceptionTasks.length + coverageExceptionCount
  const passedCheckCount = readinessChecks.filter((check) => check.status === "pass").length
  const warningCheckCount = readinessChecks.filter((check) => check.status === "warning").length
  const fallbackScore = readinessChecks.length
    ? Math.round(((passedCheckCount + warningCheckCount * 0.5) / readinessChecks.length) * 100)
    : 0
  const inputReadinessScore = Math.max(0, Math.min(100, Number(readiness?.readiness_score ?? fallbackScore)))
  const score = activeCoverageIssue ? Math.min(inputReadinessScore, 75) : inputReadinessScore
  const ownerName = project?.metadata_json?.owner_name || project?.metadata_json?.owner || "Unassigned"
  const dueDate = project?.metadata_json?.due_date || null
  const projectDueState = dueState(dueDate)
  const projectStage = (() => {
    if (project?.status === "exported") return 5
    if (project?.status === "approved") return 4
    if (project?.status === "validation_ready") return 3
    if (["inputs_ready", "mapping_review"].includes(project?.status)) return 1
    if (project?.status === "archived") {
      if (exports.some((item) => item.status === "exported")) return 5
      if (exports.some((item) => item.status === "approved")) return 4
      if (currentRun?.readiness_status === "ready" || currentRun?.readinessStatus === "ready") return 3
      return readiness?.can_run_draft_report ? 1 : 0
    }
    return readiness?.can_run_draft_report ? 1 : 0
  })()

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase()
    return projects.filter((item) => {
      if (statusFilter === "active" && ["exported", "archived"].includes(item.status)) return false
      if (statusFilter !== "all" && statusFilter !== "active" && item.status !== statusFilter) return false
      if (!query) return true
      return [item.name, item.report_type, item.metadata_json?.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [projects, search, statusFilter])

  const refreshAll = async () => {
    await loadWorkbench()
    if (selectedProjectId) await loadProject(selectedProjectId, { quiet: true })
  }

  const createProject = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setBusyAction("create")
    try {
      const response = await apiRequest(`/funds/${selectedFundId}/reporting-projects`, {
        method: "POST",
        token,
        body: {
          name: createForm.name,
          report_type: createForm.report_type,
          period_start: createForm.period_start,
          period_end: createForm.period_end,
          template_id: createForm.template_id || null,
          metadata_json: {
            owner_name: createForm.owner_name || user?.full_name || null,
            owner_id: createForm.owner_name === user?.full_name ? user?.id || null : null,
            due_date: createForm.due_date || null,
            created_from: "reporting_workbench",
          },
        },
      })
      const created = response.data.project
      setShowCreate(false)
      setCreateForm((current) => ({ ...current, name: "" }))
      await loadWorkbench()
      setSelectedProjectId(created.id)
      onNote(`Created ${created.name}`)
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const saveProject = async (event) => {
    event.preventDefault()
    if (!project) return
    setBusyAction("save")
    try {
      const response = await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}`, {
        method: "PATCH",
        token,
        body: editForm,
      })
      setProject(response.data.project)
      setEditing(false)
      await loadProject(project.id, { quiet: true })
      onNote("Project details saved")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const chooseSource = (selection) => {
    const option = sourceOptions.find((item) => item.key === selection)
    setSourceForm((current) => ({ ...current, selection, source_role: option?.role || "other" }))
  }

  const attachSource = async (event) => {
    event.preventDefault()
    const option = sourceOptions.find((item) => item.key === sourceForm.selection)
    if (!project || !option) return
    const body = { source_role: sourceForm.source_role, required: sourceForm.required }
    if (option.kind === "repository") body.repository_version_id = option.id
    if (option.kind === "template") body.template_version_id = option.id
    if (option.kind === "run") body.report_run_id = option.id
    setBusyAction("attach")
    try {
      await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}/sources`, {
        method: "POST",
        token,
        body,
      })
      setShowSourcePicker(false)
      setSourceForm({ selection: "", source_role: "other", required: true })
      await loadProject(project.id, { quiet: true })
      onNote("Source added to the reporting project")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const removeSource = async (source) => {
    setBusyAction(`remove:${source.id}`)
    try {
      await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}/sources/${source.id}`, {
        method: "DELETE",
        token,
      })
      await loadProject(project.id, { quiet: true })
      onNote("Source removed")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const runDraft = async () => {
    if (!project) return
    setBusyAction("run")
    try {
      await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}/run`, {
        method: "POST",
        token,
        body: { run_validation: true },
      })
      onCoverageIssue?.(null)
      await refreshAll()
      setActiveTab("outputs")
      onNote("Draft report generated and validation completed")
    } catch (error) {
      const coverage = getCoverageErrorDetails(error)
      if (coverage) {
        onCoverageIssue?.({
          action: "review_missing_rows",
          coverage,
          projectId: project.id,
          source: "reporting_workbench",
        })
        setActiveTab("exceptions")
        onNote("Draft stopped before writing. The missing template rows are now in Exceptions.")
      } else {
        onError(error.message)
      }
    } finally {
      setBusyAction("")
    }
  }

  const requestApproval = async () => {
    if (!project?.current_report_run_id) return
    setBusyAction("request-approval")
    try {
      const endpoint =
        project.report_type === "cash_flow"
          ? `/cash-flow/reports/${project.current_report_run_id}/export-requests`
          : `/reports/${project.current_report_run_id}/export-requests`
      await apiRequest(endpoint, { method: "POST", token, body: { format: "xlsx" } })
      await refreshAll()
      setActiveTab("approvals")
      onNote("Final export approval requested")
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const decideApproval = async (task, action) => {
    setBusyAction(`${action}:${task.id}`)
    try {
      await apiRequest(`/review-tasks/${task.id}/${action}`, {
        method: "POST",
        token,
        body: { rationale: `${words(action)} from reporting workbench` },
      })
      if (action === "approve") {
        await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}`, {
          method: "PATCH",
          token,
          body: { status: "approved" },
        })
      }
      await refreshAll()
      onNote(`Approval ${action === "approve" ? "completed" : action === "reject" ? "rejected" : "deferred"}`)
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const downloadOutput = async (final = false) => {
    if (!project?.current_report_run_id) return
    setBusyAction(final ? "download-final" : "download-draft")
    try {
      const path =
        project.report_type === "cash_flow"
          ? `/cash-flow/reports/download/${project.current_report_run_id}${final ? "?final=true" : ""}`
          : `/reports/download/${project.current_report_run_id}/xlsx${final ? "?final=true" : ""}`
      const download = await apiDownload(path, {
        token,
        defaultFileName: `${project.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}${final ? "_final" : "_draft"}.xlsx`,
      })
      saveDownload(download)
      if (final && project.status !== "exported") {
        await apiRequest(`/funds/${selectedFundId}/reporting-projects/${project.id}`, {
          method: "PATCH",
          token,
          body: { status: "exported" },
        })
        await loadProject(project.id, { quiet: true })
      }
      onNote(`Downloaded ${download.filename}`)
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyAction("")
    }
  }

  const openSourcePicker = () => {
    const first = sourceOptions[0]
    setSourceForm({ selection: first?.key || "", source_role: first?.role || "other", required: true })
    setShowSourcePicker(true)
  }

  if (!selectedFundId) {
    return <EmptyState title="Select a fund" detail="Choose an active fund before opening its reporting workbench." />
  }

  return (
    <section className="reporting-workbench stack">
      <div className="workbench-titlebar">
        <div>
          <p className="kicker">Reporting control center</p>
          <h2>Reporting workbench</h2>
          <p className="muted small">Own each reporting cycle from source selection through controlled final output.</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => loadWorkbench()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="primary" type="button" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? "Close" : "+ New project"}
          </button>
        </div>
      </div>

      {showCreate && (
        <form className="workbench-create panel stack" onSubmit={createProject}>
          <div className="section-heading">
            <div>
              <p className="kicker">New reporting cycle</p>
              <h3>Set the accountability frame first</h3>
            </div>
            <Pill tone="neutral">Draft only</Pill>
          </div>
          <div className="form-grid">
            <label>
              Project name
              <input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Q4 2026 cash flow" required />
            </label>
            <label>
              Report type
              <select value={createForm.report_type} onChange={(event) => setCreateForm({ ...createForm, report_type: event.target.value })}>
                {REPORT_TYPES.map((type) => <option value={type} key={type}>{words(type)}</option>)}
              </select>
            </label>
            <label>
              Owner
              <input value={createForm.owner_name} onChange={(event) => setCreateForm({ ...createForm, owner_name: event.target.value })} required />
            </label>
            <label>
              Due date
              <input type="date" value={createForm.due_date} onChange={(event) => setCreateForm({ ...createForm, due_date: event.target.value })} />
            </label>
            <label>
              Period start
              <input type="date" value={createForm.period_start} onChange={(event) => setCreateForm({ ...createForm, period_start: event.target.value })} required />
            </label>
            <label>
              Period end
              <input type="date" value={createForm.period_end} onChange={(event) => setCreateForm({ ...createForm, period_end: event.target.value })} required />
            </label>
            <label>
              Starting template
              <select value={createForm.template_id} onChange={(event) => setCreateForm({ ...createForm, template_id: event.target.value })}>
                <option value="">Select later</option>
                {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
              </select>
            </label>
          </div>
          <div className="inline-actions">
            <button className="primary" type="submit" disabled={busyAction === "create"}>{busyAction === "create" ? "Creating…" : "Create project"}</button>
            <button type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="workbench-layout">
        <aside className="workbench-project-rail">
          <div className="workbench-rail-head">
            <div>
              <strong>{selectedFund?.name || "Fund"}</strong>
              <span>{projects.length} reporting project{projects.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <input aria-label="Search reporting projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" />
          <select aria-label="Filter reporting projects" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="active">Active projects</option>
            <option value="all">All statuses</option>
            {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{words(status)}</option>)}
          </select>
          <div className="workbench-project-list">
            {filteredProjects.map((item) => {
              const itemDue = dueState(item.metadata_json?.due_date)
              return (
                <button type="button" className={`workbench-project-card ${selectedProjectId === item.id ? "active" : ""}`} key={item.id} onClick={() => { setSelectedProjectId(item.id); setActiveTab("overview") }}>
                  <span className="workbench-project-card-top">
                    <Pill tone={item.status === "exported" ? "ok" : item.status === "mapping_review" ? "warn" : "neutral"}>{words(item.status)}</Pill>
                    <small>{itemDue.label}</small>
                  </span>
                  <strong>{item.name}</strong>
                  <span>{words(item.report_type)} · {(item.sources || []).length} sources</span>
                  <small>{item.metadata_json?.owner_name || "Unassigned"}</small>
                </button>
              )
            })}
            {!filteredProjects.length && !loading && (
              <EmptyState title="No projects found" detail="Create the first reporting cycle or change the filter." />
            )}
          </div>
        </aside>

        <div className="workbench-canvas">
          {!project && !detailLoading && (
            <EmptyState
              title="No reporting project selected"
              detail="Create a reporting project to organize accountability, inputs, exceptions, approvals, and outputs."
              action={<button className="primary" type="button" onClick={() => setShowCreate(true)}>Create project</button>}
            />
          )}
          {detailLoading && !project && <div className="workbench-loading">Loading reporting project…</div>}
          {project && (
            <>
              <header className="workbench-project-head">
                <div className="workbench-project-heading">
                  <div className="inline-actions">
                    <Pill tone={project.status === "exported" || project.status === "approved" ? "ok" : project.status === "mapping_review" ? "warn" : "neutral"}>{words(project.status)}</Pill>
                    <span className="muted small">Updated {shortDate(project.updated_at || project.updatedAt)}</span>
                  </div>
                  <h2>{project.name}</h2>
                  <p>{words(project.report_type)} · {compactDate(project.period_start)} – {compactDate(project.period_end)}</p>
                </div>
                <button type="button" onClick={() => setEditing((current) => !current)}>{editing ? "Close details" : "Edit details"}</button>
              </header>

              {editing && (
                <form className="workbench-edit-form" onSubmit={saveProject}>
                  <label>Project name<input value={editForm.name || ""} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label>
                  <label>Owner<input value={editForm.owner_name || ""} onChange={(event) => setEditForm({ ...editForm, owner_name: event.target.value })} /></label>
                  <label>Due date<input type="date" value={editForm.due_date || ""} onChange={(event) => setEditForm({ ...editForm, due_date: event.target.value })} /></label>
                  <label>Status<select value={editForm.status || "draft"} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{words(status)}</option>)}</select></label>
                  <label>Period start<input type="date" value={editForm.period_start || ""} onChange={(event) => setEditForm({ ...editForm, period_start: event.target.value })} /></label>
                  <label>Period end<input type="date" value={editForm.period_end || ""} onChange={(event) => setEditForm({ ...editForm, period_end: event.target.value })} /></label>
                  <button className="primary" type="submit" disabled={busyAction === "save"}>{busyAction === "save" ? "Saving…" : "Save changes"}</button>
                </form>
              )}

              <div className="workbench-facts">
                <div><span>Owner</span><strong>{ownerName}</strong><small>Accountable preparer</small></div>
                <div><span>Due date</span><strong>{compactDate(dueDate)}</strong><small className={projectDueState.tone}>{projectDueState.label}</small></div>
                <div><span>Reporting period</span><strong>{compactDate(project.period_end)}</strong><small>{compactDate(project.period_start)} start</small></div>
                <div><span>Current output</span><strong>{currentRun ? "Draft generated" : "Not generated"}</strong><small>{currentRun ? shortDate(currentRun.created_at || currentRun.createdAt) : "Awaiting ready inputs"}</small></div>
              </div>

              <div className="workbench-metrics">
                <button type="button" onClick={() => setActiveTab("overview")} className="workbench-metric">
                  <span className={`readiness-ring ${score >= 80 ? "good" : score >= 50 ? "warning" : "blocked"}`} style={{ "--readiness": `${score * 3.6}deg` }}><strong>{score}</strong><small>%</small></span>
                  <span><small>Readiness score</small><strong>{words(activeCoverageIssue ? "mapping_review" : readiness?.status || "Checking")}</strong></span>
                </button>
                <button type="button" onClick={() => setActiveTab("sources")} className="workbench-metric"><strong>{project.sources?.length || 0}</strong><span><small>Selected sources</small><b>{readiness?.missing_source_roles?.length ? `${readiness.missing_source_roles.length} missing` : "Required set covered"}</b></span></button>
                <button type="button" onClick={() => setActiveTab("exceptions")} className="workbench-metric"><strong>{totalExceptionCount}</strong><span><small>Open exceptions</small><b>{activeCoverageIssue || readinessIssues.some((item) => item.status === "fail") ? "Blocking work" : "No hard blocker"}</b></span></button>
                <button type="button" onClick={() => setActiveTab("approvals")} className="workbench-metric"><strong>{openApprovalTasks.length}</strong><span><small>Pending approvals</small><b>{exports.some((item) => ["approved", "exported"].includes(item.status)) ? "Final output approved" : "Human sign-off required"}</b></span></button>
              </div>

              <nav className="workbench-tabs" aria-label="Reporting project sections">
                {["overview", "sources", "exceptions", "approvals", "outputs"].map((tab) => (
                  <button type="button" key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                    {words(tab)}
                    {tab === "exceptions" && totalExceptionCount > 0 && <span>{totalExceptionCount}</span>}
                    {tab === "approvals" && openApprovalTasks.length > 0 && <span>{openApprovalTasks.length}</span>}
                  </button>
                ))}
              </nav>

              {activeTab === "overview" && (
                <div className="workbench-tab-content overview-grid">
                  <section className="workbench-section">
                    <div className="section-heading"><div><p className="kicker">Control path</p><h3>Cycle progress</h3></div><Pill tone={score >= 80 ? "ok" : score >= 50 ? "warn" : "bad"}>{score}% ready</Pill></div>
                    <div className="workbench-stage-track">
                      {["Inputs", "Mapping", "Validation", "Approval", "Export"].map((stage, index) => {
                        const complete = index < Math.min(projectStage, 5)
                        const current = projectStage < 5 && !complete && index === Math.min(projectStage, 4)
                        return <div key={stage} className={`${complete ? "complete" : ""} ${current ? "current" : ""}`}><span>{complete ? "✓" : index + 1}</span><strong>{stage}</strong></div>
                      })}
                    </div>
                    <div className="workbench-next-action">
                      <div><p className="kicker">Next best action</p><strong>{activeCoverageIssue ? "Add or map the missing template rows" : readiness?.can_run_draft_report ? (currentRun ? "Review validation and request approval" : "Generate the controlled draft") : "Complete the required input set"}</strong><p>{activeCoverageIssue ? activeCoverageIssue.message : readiness?.can_run_draft_report ? "The source and template gates are clear enough to produce a draft." : readiness?.export_block_reason || "Resolve failed readiness checks before generation."}</p></div>
                      <button className="primary" type="button" onClick={activeCoverageIssue ? () => onOpenTemplates?.({ action: "review_missing_rows", coverage: activeCoverageIssue, projectId: project.id }) : readiness?.can_run_draft_report ? runDraft : () => setActiveTab("sources")} disabled={busyAction === "run"}>{busyAction === "run" ? "Running…" : activeCoverageIssue ? "Open template mapping" : readiness?.can_run_draft_report ? (currentRun ? "Run new draft" : "Run draft") : "Review sources"}</button>
                    </div>
                  </section>
                  <section className="workbench-section">
                    <div className="section-heading"><div><p className="kicker">Gate checks</p><h3>Readiness evidence</h3></div><span className="muted small">{readiness?.check_counts?.passed ?? passedCheckCount}/{readiness?.check_counts?.total ?? readinessChecks.length} passed</span></div>
                    <div className="workbench-check-list">
                      {(readiness?.checks || []).map((check, index) => <div key={`${check.check_type}-${check.target_role || index}`}><CheckIcon status={check.status} /><span><strong>{words(check.target_role || check.check_type)}</strong><small>{check.message}</small></span></div>)}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "sources" && (
                <div className="workbench-tab-content">
                  <section className="workbench-section stack">
                    <div className="section-heading"><div><p className="kicker">Selected evidence</p><h3>Project sources</h3><p className="muted small">Attach immutable repository versions, a governed template, or an earlier report run.</p></div><button className="primary" type="button" onClick={openSourcePicker}>+ Add source</button></div>
                    {showSourcePicker && (
                      <form className="workbench-source-picker" onSubmit={attachSource}>
                        <label>Source<select value={sourceForm.selection} onChange={(event) => chooseSource(event.target.value)} required><option value="">Select a source</option>{[...new Set(sourceOptions.map((option) => option.group))].map((group) => <optgroup label={group} key={group}>{sourceOptions.filter((option) => option.group === group).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}</select></label>
                        <label>Role<select value={sourceForm.source_role} onChange={(event) => setSourceForm({ ...sourceForm, source_role: event.target.value })}>{SOURCE_ROLES.map((role) => <option key={role} value={role}>{words(role)}</option>)}</select></label>
                        <label className="checkbox-row"><input type="checkbox" checked={sourceForm.required} onChange={(event) => setSourceForm({ ...sourceForm, required: event.target.checked })} />Required for this cycle</label>
                        <div className="inline-actions"><button className="primary" type="submit" disabled={!sourceForm.selection || busyAction === "attach"}>{busyAction === "attach" ? "Adding…" : "Add source"}</button><button type="button" onClick={() => setShowSourcePicker(false)}>Cancel</button></div>
                      </form>
                    )}
                    <div className="workbench-source-list">
                      {(project.sources || []).map((source) => <article key={source.id}><div className={`workbench-source-icon ${source.source_type}`}>{source.source_type === "template_version" ? "T" : source.source_type === "report_run" ? "R" : "D"}</div><div><div className="inline-actions"><Pill tone={source.required ? "neutral" : "subtle"}>{source.required ? "Required" : "Optional"}</Pill><span className="muted small">{words(source.source_role)}</span></div><strong>{sourceDisplayName(source)}</strong><small>{sourceDetail(source)}</small></div><div className="workbench-source-actions"><Pill tone={source.status === "attached" ? "ok" : "warn"}>{words(source.status)}</Pill><button type="button" onClick={() => removeSource(source)} disabled={busyAction === `remove:${source.id}`}>{busyAction === `remove:${source.id}` ? "Removing…" : "Remove"}</button></div></article>)}
                    </div>
                    {!project.sources?.length && <EmptyState title="No sources selected" detail="Attach the governed template and current-period datasets to make readiness measurable." action={<button type="button" onClick={onOpenRepository}>Open fund repository</button>} />}
                  </section>
                </div>
              )}

              {activeTab === "exceptions" && (
                <div className="workbench-tab-content">
                  <section className="workbench-section stack">
                    <div className="section-heading"><div><p className="kicker">Exception register</p><h3>Work requiring attention</h3><p className="muted small">Failed gates and review tasks stay visible until they are resolved or explicitly deferred.</p></div><Pill tone={totalExceptionCount ? "warn" : "ok"}>{totalExceptionCount} open</Pill></div>
                    {activeCoverageIssue && (
                      <div className="workbench-coverage-exception stack">
                        <div className="alert warn">
                          <strong>{activeCoverageIssue.title || "Template needs rows before this report can run"}</strong>
                          <p className="small">{activeCoverageIssue.message || "Add or map the missing cash-flow rows before generating this report."}</p>
                        </div>
                        <div className="cards-grid">
                          {missingCoverageItems.map((item, index) => (
                            <article className="mini-card stack" key={`${item.display_name || "missing"}_${index}`}>
                              <p className="kicker">Missing template row</p>
                              <h3>{item.display_name || "Cash-flow category"}</h3>
                              {item.plain_description && <p className="muted small">{item.plain_description}</p>}
                              <p className="muted small">GL amount found: <strong>{currency(item.total_amount || 0)}</strong></p>
                              {Array.isArray(item.accounts) && item.accounts.length > 0 && (
                                <p className="muted small">Affected accounts: <strong>{item.accounts.slice(0, 3).map((account) => account.account_name || account.normalized_account).filter(Boolean).join(", ") || "Not available"}</strong></p>
                              )}
                              {item.suggested_template_row_label && <p className="muted small">Add a writable row like: <strong>{item.suggested_template_row_label}</strong></p>}
                            </article>
                          ))}
                        </div>
                        <div className="workbench-coverage-actions">
                          <div>
                            <strong>How to clear this blocker</strong>
                            <p className="muted small">Open Templates & Mapping, add or map the rows listed above in the active workbook, then reanalyze the template and run this draft again.</p>
                          </div>
                          <button className="primary" type="button" onClick={() => onOpenTemplates?.({ action: "review_missing_rows", coverage: activeCoverageIssue, projectId: project.id })}>Open Templates & Mapping</button>
                        </div>
                      </div>
                    )}
                    <div className="workbench-exception-list">
                      {readinessIssues.map((check, index) => <article key={`check-${check.check_type}-${index}`}><CheckIcon status={check.status} /><div><span>{words(check.check_type)}</span><strong>{check.message}</strong><small>{check.target_role ? `Source role: ${words(check.target_role)}` : "Project readiness gate"}</small></div><Pill tone={check.status === "fail" ? "bad" : "warn"}>{check.status === "fail" ? "Blocking" : "Review"}</Pill></article>)}
                      {exceptionTasks.map((task) => <article key={task.id}><CheckIcon status="warning" /><div><span>{words(task.targetType)}</span><strong>{task.target?.label || words(task.reviewReason)}</strong><small>{words(task.reviewReason)} · {task.priority} priority</small></div><Pill tone={task.priority === "high" ? "bad" : "warn"}>{words(task.status)}</Pill></article>)}
                    </div>
                    {!activeCoverageIssue && !readinessIssues.length && !exceptionTasks.length && <EmptyState title="No open exceptions" detail="All current readiness gates and linked review tasks are clear." />}
                  </section>
                </div>
              )}

              {activeTab === "approvals" && (
                <div className="workbench-tab-content">
                  <section className="workbench-section stack">
                    <div className="section-heading"><div><p className="kicker">Human control gate</p><h3>Final output approvals</h3><p className="muted small">Approval is separate from preparation and binds to the validated artifact checksum.</p></div>{currentRun && !openApprovalTasks.length && !exports.some((item) => ["approved", "exported"].includes(item.status)) && <button className="primary" type="button" onClick={requestApproval} disabled={busyAction === "request-approval"}>{busyAction === "request-approval" ? "Requesting…" : "Request approval"}</button>}</div>
                    <div className="workbench-approval-list">
                      {approvalTasks.map((task) => {
                        const metadata = task.metadata || {}
                        const isOpen = ACTIVE_REVIEW_STATUSES.has(task.status)
                        return <article key={task.id}><div className="workbench-approval-head"><div><Pill tone={isOpen ? "warn" : task.status === "approved" ? "ok" : "bad"}>{words(task.status)}</Pill><span className="muted small">{words(task.priority)} priority</span></div><small>{shortDate(task.createdAt)}</small></div><h4>{task.target?.label || "XLSX final export"}</h4><p>Validate and authorize the controlled output for external delivery.</p><dl><div><dt>Report run</dt><dd>{String(metadata.report_run_id || "—").slice(0, 12)}</dd></div><div><dt>Format</dt><dd>{String(metadata.format || "xlsx").toUpperCase()}</dd></div><div><dt>Checksum</dt><dd>{metadata.checksum_sha256 ? `${metadata.checksum_sha256.slice(0, 12)}…` : "—"}</dd></div></dl>{isOpen && <div className="inline-actions"><button className="primary" type="button" onClick={() => decideApproval(task, "approve")} disabled={busyAction.endsWith(task.id)}>Approve</button><button type="button" onClick={() => decideApproval(task, "defer")} disabled={busyAction.endsWith(task.id)}>Defer</button><button className="danger-text" type="button" onClick={() => decideApproval(task, "reject")} disabled={busyAction.endsWith(task.id)}>Reject</button></div>}</article>
                      })}
                    </div>
                    {!approvalTasks.length && <EmptyState title={currentRun ? "No approval request yet" : "No output to approve"} detail={currentRun ? "Request final export approval after validation is ready." : "Generate a draft output before starting the approval gate."} action={currentRun ? <button className="primary" type="button" onClick={requestApproval}>Request approval</button> : <button type="button" onClick={() => setActiveTab("overview")}>Return to readiness</button>} />}
                  </section>
                </div>
              )}

              {activeTab === "outputs" && (
                <div className="workbench-tab-content">
                  <section className="workbench-section stack">
                    <div className="section-heading"><div><p className="kicker">Controlled artifacts</p><h3>Final outputs</h3><p className="muted small">Drafts remain clearly separated from human-approved delivery files.</p></div><button className="primary" type="button" onClick={runDraft} disabled={!readiness?.can_run_draft_report || busyAction === "run"}>{busyAction === "run" ? "Running…" : currentRun ? "Run new draft" : "Generate draft"}</button></div>
                    {currentRun ? <div className="workbench-output-list"><article><div className="workbench-file-icon">XLSX</div><div><div className="inline-actions"><Pill tone="neutral">Draft</Pill><span className="muted small">Run {String(currentRun.id).slice(0, 8)}</span></div><strong>{project.name} — working draft</strong><small>Generated {shortDate(currentRun.created_at || currentRun.createdAt)} · {words(currentRun.readiness_status || currentRun.readinessStatus || "not validated")}</small></div><button type="button" onClick={() => downloadOutput(false)} disabled={busyAction === "download-draft"}>{busyAction === "download-draft" ? "Downloading…" : "Download draft"}</button></article>{exports.map((item) => { const available = ["approved", "exported"].includes(item.status); return <article key={item.id} className={available ? "final" : "pending"}><div className="workbench-file-icon">{String(item.format || "xlsx").toUpperCase()}</div><div><div className="inline-actions"><Pill tone={available ? "ok" : item.status === "rejected" ? "bad" : "warn"}>{words(item.status)}</Pill><span className="muted small">Final controlled output</span></div><strong>{project.name} — final</strong><small>{available ? `Approved ${shortDate(item.approved_at || item.approvedAt || item.updated_at || item.updatedAt)}` : "Awaiting human approval"}</small></div>{available ? <button className="primary" type="button" onClick={() => downloadOutput(true)} disabled={busyAction === "download-final"}>{busyAction === "download-final" ? "Downloading…" : "Download final"}</button> : <button type="button" onClick={() => setActiveTab("approvals")}>View approval</button>}</article>})}</div> : <EmptyState title="No generated outputs" detail="Once required inputs pass readiness, generate the first validated working draft." action={<button className="primary" type="button" onClick={runDraft} disabled={!readiness?.can_run_draft_report}>Generate draft</button>} />}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
