import { useCallback, useEffect, useMemo, useState } from "react"
import { apiDownload, apiMultipartRequest, apiRequest, shortDate } from "../api"

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "fund-context", label: "Fund Context" },
  { key: "documents", label: "Documents" },
  { key: "data-sources", label: "Data Sources" },
  { key: "activity", label: "Activity" },
]

const DOCUMENT_CATEGORIES = [
  ["lpa", "LPA"],
  ["ppm", "PPM"],
  ["subscription_agreement", "Subscription Agreement"],
  ["financial_statement", "Financial Statement"],
  ["audit_report", "Audit Report"],
  ["tax_document", "Tax Document"],
  ["service_agreement", "Service Agreement"],
  ["other_document", "Other Document"],
]

const DATASET_CATEGORIES = [
  ["trial_balance", "Trial Balance"],
  ["general_ledger", "General Ledger"],
  ["bank_statement", "Bank Statement"],
  ["valuation", "Valuation"],
  ["holdings_register", "Holdings Register"],
  ["investor_register", "Shareholder / Investor Register"],
  ["other_dataset", "Other Dataset"],
]

const EFFECTIVE_CATEGORY_LABELS = [
  ["accrual_schedule", "Accrual Schedule"],
  ["audit_adjustment_schedule", "Audit Adjustment Schedule"],
  ["bank_reconciliation", "Bank Reconciliation"],
  ["capital_account_statement", "Capital Account Statement"],
  ["capital_call_notice", "Capital Call Notice"],
  ["commitment_schedule", "Commitment Schedule"],
  ["credit_facility", "Credit Facility / Debt"],
  ["custodian_statement", "Custodian Statement"],
  ["distribution_notice", "Distribution Notice"],
  ["expense_invoice", "Expense Invoice"],
  ["governance_minutes", "Governance Minutes / Consent"],
  ["investor_activity_statement", "Investor Activity Statement"],
  ["lpa_amendment", "LPA Amendment"],
  ["management_fee_statement", "Management Fee Statement"],
  ["nav_package", "NAV Package / Administrator Report"],
  ["portfolio_transaction", "Portfolio Transaction Notice"],
  ["redemption_notice", "Redemption Notice"],
  ["side_letter", "Side Letter"],
  ["transfer_notice", "Investor Transfer Notice"],
  ["waterfall_statement", "Waterfall / Carry Statement"],
]

const ACTIVITY_LABELS = {
  repository_item_created: "Item created",
  repository_version_uploaded: "Version uploaded",
  repository_current_version_changed: "Current version changed",
  repository_archive_changed: "Archive status changed",
  repository_item_updated: "Item updated",
  repository_version_downloaded: "File downloaded",
  repository_version_selected_for_report: "Used for report run",
  repository_knowledge_snapshotted_for_report: "Confirmed knowledge attached to report run",
  repository_knowledge_snapshot_failed: "Knowledge snapshot failed for report run",
  repository_version_analyzed: "Version read for key points",
  repository_bulk_analysis_completed: "Current sources read",
  repository_key_point_created: "Key point added",
  repository_key_point_reviewed: "Key point reviewed",
  repository_key_points_bulk_reviewed: "Key points bulk reviewed",
  repository_analysis_failed: "Document reading failed",
}

function categoryLabel(category) {
  const labels = [...DOCUMENT_CATEGORIES, ...DATASET_CATEGORIES, ...EFFECTIVE_CATEGORY_LABELS]
  return labels.find(([key]) => key === category)?.[1] || String(category || "").replace(/_/g, " ")
}

function formatSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return "-"
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function contextCompleteness(payload) {
  const fields = [
    payload?.profile?.legal_name,
    payload?.profile?.reporting_currency,
    payload?.profile?.auditor,
    payload?.profile?.administrator,
    payload?.governance?.general_partner,
    payload?.policies?.valuation_policy,
    payload?.tax?.tax_residency,
  ]
  return fields.filter(Boolean).length
}

function canReadItem(item) {
  return (
    item.kind === "document" ||
    ["bank_statement", "valuation", "investor_register", "holdings_register", "other_dataset"].includes(item.category)
  )
}

function analysisStatusLabel(status) {
  const labels = {
    completed: "Read",
    partial: "Review needed",
    requires_reader: "Reader needed",
    failed: "Reading failed",
  }
  return labels[status] || "Not read"
}

function fallbackReaderLabel(readerKey) {
  return String(readerKey || "").replace(/_/g, " ")
}

function comparisonStatusLabel(status) {
  const labels = {
    added: "Added",
    changed: "Changed",
    removed: "Removed",
    unchanged: "Unchanged",
  }
  return labels[status] || status
}

function filterRepositoryItems(records, filters) {
  const query = String(filters.text || "").trim().toLowerCase()
  return records.filter((item) => {
    if (filters.category && item.category !== filters.category) return false
    if (filters.status === "active" && item.is_archived) return false
    if (filters.status === "archived" && !item.is_archived) return false
    if (!query) return true
    const tags = Array.isArray(item.tags_json) ? item.tags_json.join(" ") : String(item.tags_json || "")
    const versionNames = (item.versions || []).map((version) => version.original_file_name).join(" ")
    return [item.title, item.description, categoryLabel(item.category), tags, versionNames]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query)
  })
}

export function FundRepositoryPanel({
  token,
  selectedFundId,
  selectedFund,
  fundProfile,
  onError,
  onNote,
  onRunReport,
  children,
}) {
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [activity, setActivity] = useState([])
  const [insights, setInsights] = useState([])
  const [readiness, setReadiness] = useState(null)
  const [confirmedKnowledge, setConfirmedKnowledge] = useState(null)
  const [keyPointIndex, setKeyPointIndex] = useState(null)
  const [readerCatalog, setReaderCatalog] = useState([])
  const [readerSelections, setReaderSelections] = useState({})
  const [readerSuggestions, setReaderSuggestions] = useState({})
  const [busyItemId, setBusyItemId] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [editingKeyPointId, setEditingKeyPointId] = useState(null)
  const [editingKeyPointValue, setEditingKeyPointValue] = useState("")
  const [manualKeyPointItemId, setManualKeyPointItemId] = useState(null)
  const [manualKeyPointForm, setManualKeyPointForm] = useState({ label: "", value_text: "", source_reference: "" })
  const [focusedItemId, setFocusedItemId] = useState(null)
  const [expandedVersionId, setExpandedVersionId] = useState(null)
  const [loadingVersionId, setLoadingVersionId] = useState(null)
  const [loadingSuggestionVersionId, setLoadingSuggestionVersionId] = useState(null)
  const [analysesByVersion, setAnalysesByVersion] = useState({})
  const [comparisonItemId, setComparisonItemId] = useState(null)
  const [loadingComparisonVersionId, setLoadingComparisonVersionId] = useState(null)
  const [comparisonsByVersion, setComparisonsByVersion] = useState({})
  const [itemFilters, setItemFilters] = useState({
    document: { text: "", category: "", status: "all" },
    dataset: { text: "", category: "", status: "all" },
  })
  const [knowledgeFilters, setKnowledgeFilters] = useState({ text: "", status: "all", category: "" })
  const [versionFiles, setVersionFiles] = useState({})
  const [uploadKey, setUploadKey] = useState(0)
  const [uploadForm, setUploadForm] = useState({
    kind: "document",
    category: "lpa",
    title: "",
    description: "",
    period_start: "",
    period_end: "",
    tags: "",
    file: null,
  })

  const loadRepository = useCallback(async () => {
    if (!selectedFundId) return
    setLoading(true)
    try {
      const [
        summaryResponse,
        itemsResponse,
        activityResponse,
        insightsResponse,
        readinessResponse,
        knowledgeResponse,
        keyPointIndexResponse,
        readersResponse,
      ] = await Promise.all([
        apiRequest(`/funds/${selectedFundId}/repository/summary`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/items`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/activity`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/insights`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/readiness`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/knowledge?status=confirmed`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/key-points?status=all`, { token }),
        apiRequest(`/funds/${selectedFundId}/repository/readers`, { token }),
      ])
      setSummary(summaryResponse.data.summary || null)
      setItems(itemsResponse.data.items || [])
      setActivity(activityResponse.data.activity || [])
      setInsights(insightsResponse.data.insights || [])
      setReadiness(readinessResponse.data.readiness || null)
      setConfirmedKnowledge(knowledgeResponse.data.knowledge || null)
      setKeyPointIndex(keyPointIndexResponse.data.key_point_index || null)
      setReaderCatalog(readersResponse.data.readers || [])
    } catch (error) {
      onError(error.message)
    } finally {
      setLoading(false)
    }
  }, [onError, selectedFundId, token])

  useEffect(() => {
    setActiveTab("overview")
    setSummary(null)
    setItems([])
    setActivity([])
    setInsights([])
    setReadiness(null)
    setConfirmedKnowledge(null)
    setKeyPointIndex(null)
    setReaderCatalog([])
    setReaderSelections({})
    setReaderSuggestions({})
    setVersionFiles({})
    setShowUpload(false)
    setEditingKeyPointId(null)
    setEditingKeyPointValue("")
    setManualKeyPointItemId(null)
    setManualKeyPointForm({ label: "", value_text: "", source_reference: "" })
    setFocusedItemId(null)
    setExpandedVersionId(null)
    setLoadingVersionId(null)
    setLoadingSuggestionVersionId(null)
    setAnalysesByVersion({})
    setComparisonItemId(null)
    setLoadingComparisonVersionId(null)
    setComparisonsByVersion({})
    setItemFilters({
      document: { text: "", category: "", status: "all" },
      dataset: { text: "", category: "", status: "all" },
    })
    setKnowledgeFilters({ text: "", status: "all", category: "" })
    if (selectedFundId) {
      loadRepository()
    }
  }, [loadRepository, selectedFundId])

  useEffect(() => {
    if (!focusedItemId || !["documents", "data-sources"].includes(activeTab)) return () => {}
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`repository-item-${focusedItemId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [activeTab, focusedItemId])

  const documents = useMemo(() => items.filter((item) => item.kind === "document"), [items])
  const datasets = useMemo(() => items.filter((item) => item.kind === "dataset"), [items])
  const filteredDocuments = useMemo(
    () => filterRepositoryItems(documents, itemFilters.document),
    [documents, itemFilters.document],
  )
  const filteredDatasets = useMemo(
    () => filterRepositoryItems(datasets, itemFilters.dataset),
    [datasets, itemFilters.dataset],
  )
  const activeDatasets = useMemo(() => datasets.filter((item) => !item.is_archived), [datasets])
  const insightsByItem = useMemo(() => new Map(insights.map((analysis) => [analysis.item_id, analysis])), [insights])
  const readerCatalogByKey = useMemo(() => new Map(readerCatalog.map((reader) => [reader.key, reader])), [readerCatalog])
  const readerOptionsForKind = useMemo(
    () => ({
      document: readerCatalog.filter((reader) => reader.key !== "generic" && (reader.kinds || []).includes("document")),
      dataset: readerCatalog.filter((reader) => reader.key !== "generic" && (reader.kinds || []).includes("dataset")),
    }),
    [readerCatalog],
  )
  const knowledgeOverview = useMemo(() => {
    const counts = { confirmed: 0, suggested: 0, dismissed: 0 }
    const reviewQueue = []
    insights.forEach((analysis) => {
      ;(analysis.keyPoints || []).forEach((keyPoint) => {
        if (Object.prototype.hasOwnProperty.call(counts, keyPoint.review_status)) {
          counts[keyPoint.review_status] += 1
        }
        if (keyPoint.review_status === "suggested") {
          reviewQueue.push({ analysis, keyPoint })
        }
      })
    })
    return { counts, reviewQueue }
  }, [insights])
  const knowledgeConflicts = Array.isArray(confirmedKnowledge?.conflicts) ? confirmedKnowledge.conflicts : []
  const completeness = contextCompleteness(fundProfile)

  const readerLabel = (readerKey) => readerCatalogByKey.get(readerKey)?.label || fallbackReaderLabel(readerKey)
  const keyPointRecords = Array.isArray(keyPointIndex?.records) ? keyPointIndex.records : []
  const knowledgeCategories = useMemo(() => {
    const categories = new Map()
    keyPointRecords.forEach((record) => {
      const category = record.item?.effective_category || record.item?.category
      if (category && !categories.has(category)) categories.set(category, categoryLabel(category))
    })
    return Array.from(categories.entries()).sort((left, right) => left[1].localeCompare(right[1]))
  }, [keyPointRecords])
  const filteredKeyPointRecords = useMemo(() => {
    const query = knowledgeFilters.text.trim().toLowerCase()
    return keyPointRecords.filter((record) => {
      if (knowledgeFilters.status !== "all" && record.review_status !== knowledgeFilters.status) return false
      const category = record.item?.effective_category || record.item?.category || ""
      if (knowledgeFilters.category && category !== knowledgeFilters.category) return false
      if (!query) return true
      return [
        record.label,
        record.point_key,
        record.value_text,
        record.source_reference,
        record.item?.title,
        categoryLabel(category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [keyPointRecords, knowledgeFilters])

  const setReaderSelection = (versionId, readerKey) => {
    setReaderSelections((current) => ({ ...current, [versionId]: readerKey }))
  }

  const fetchReaderSuggestion = async (item, version = item.currentVersion) => {
    if (!version) return null
    setLoadingSuggestionVersionId(version.id)
    try {
      const response = await apiRequest(`/funds/${selectedFundId}/repository/versions/${version.id}/reader-suggestion`, {
        token,
      })
      const suggestion = response.data.reader_suggestion || null
      setReaderSuggestions((current) => ({ ...current, [version.id]: suggestion }))
      if (suggestion?.selection_type === "inferred" && suggestion.reader_key && suggestion.reader_key !== "generic") {
        setReaderSelection(version.id, suggestion.reader_key)
      }
      onNote(
        suggestion?.reader_key
          ? `${readerLabel(suggestion.reader_key)} suggested for ${item.title}.`
          : "No specialist reader could be suggested for this file yet.",
      )
      return suggestion
    } catch (error) {
      onError(error.message)
      return null
    } finally {
      setLoadingSuggestionVersionId(null)
    }
  }

  const analyzeCurrentSources = async () => {
    try {
      setBusyItemId("bulk-read")
      const response = await apiRequest(`/funds/${selectedFundId}/repository/analyze-current`, {
        method: "POST",
        token,
        body: {},
      })
      const summary = response.data.batch?.summary || {}
      onNote(
        `Read ${summary.analyzed || 0} current source(s); skipped ${summary.skipped_existing || 0} already read and ${summary.skipped_unsupported || 0} report input source(s).`,
      )
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const openInsightItem = (analysis) => {
    const kind = analysis.item?.kind === "dataset" ? "dataset" : "document"
    setItemFilters((current) => ({ ...current, [kind]: { text: "", category: "", status: "all" } }))
    setFocusedItemId(analysis.item_id)
    setShowUpload(false)
    setActiveTab(kind === "dataset" ? "data-sources" : "documents")
  }

  const openConflictSource = (value) => {
    const analysis = insightsByItem.get(value.item_id)
    if (analysis) openInsightItem(analysis)
  }

  const openKeyPointSource = (record) => {
    const analysis = insightsByItem.get(record.item_id)
    if (analysis) {
      openInsightItem(analysis)
      return
    }
    const kind = record.item?.kind === "dataset" ? "dataset" : "document"
    setItemFilters((current) => ({ ...current, [kind]: { text: "", category: "", status: "all" } }))
    setFocusedItemId(record.item_id)
    setShowUpload(false)
    setActiveTab(kind === "dataset" ? "data-sources" : "documents")
  }

  const updateKnowledgeFilter = (field, value) => {
    setKnowledgeFilters((current) => ({ ...current, [field]: value }))
  }

  const updateItemFilter = (kind, field, value) => {
    setItemFilters((current) => ({
      ...current,
      [kind]: { ...current[kind], [field]: value },
    }))
    setFocusedItemId(null)
  }

  const toggleUploadFor = (kind) => {
    if (showUpload && uploadForm.kind === kind) {
      setShowUpload(false)
      return
    }
    setUploadForm({
      kind,
      category: kind === "document" ? "lpa" : "trial_balance",
      title: "",
      description: "",
      period_start: "",
      period_end: "",
      tags: "",
      file: null,
    })
    setShowUpload(true)
  }

  const submitNewItem = async (event) => {
    event.preventDefault()
    if (!uploadForm.file) {
      onError("Choose a file to store in the repository.")
      return
    }
    const formData = new FormData()
    Object.entries(uploadForm).forEach(([key, value]) => {
      if (key !== "file" && value) formData.append(key, value)
    })
    formData.append("file", uploadForm.file)
    try {
      setBusyItemId("new")
      await apiMultipartRequest(`/funds/${selectedFundId}/repository/items`, { token, formData })
      onNote(`${uploadForm.kind === "document" ? "Document" : "Data source"} stored in Fund Repository.`)
      setShowUpload(false)
      setUploadKey((key) => key + 1)
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const uploadVersion = async (item) => {
    const file = versionFiles[item.id]
    if (!file) {
      onError("Choose a new version file first.")
      return
    }
    const formData = new FormData()
    formData.append("file", file)
    try {
      setBusyItemId(item.id)
      await apiMultipartRequest(`/funds/${selectedFundId}/repository/items/${item.id}/versions`, { token, formData })
      setVersionFiles((current) => ({ ...current, [item.id]: null }))
      setComparisonItemId(null)
      setComparisonsByVersion({})
      onNote("A new immutable repository version is now current.")
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const toggleArchive = async (item) => {
    try {
      setBusyItemId(item.id)
      await apiRequest(`/funds/${selectedFundId}/repository/items/${item.id}`, {
        method: "PUT",
        token,
        body: { is_archived: !item.is_archived },
      })
      onNote(item.is_archived ? "Repository item restored." : "Repository item archived.")
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const restoreVersion = async (item, version) => {
    try {
      setBusyItemId(item.id)
      await apiRequest(`/funds/${selectedFundId}/repository/items/${item.id}/current-version`, {
        method: "PUT",
        token,
        body: { version_id: version.id },
      })
      setComparisonItemId(null)
      setComparisonsByVersion({})
      onNote(`Version ${version.version_number} restored as current.`)
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const downloadVersion = async (version) => {
    try {
      const { blob, filename } = await apiDownload(
        `/funds/${selectedFundId}/repository/versions/${version.id}/download`,
        { token, defaultFileName: version.original_file_name || "repository_file" },
      )
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      onNote(`Downloaded ${filename}`)
    } catch (error) {
      onError(error.message)
    }
  }

  const fetchVersionAnalyses = async (versionId) => {
    setLoadingVersionId(versionId)
    try {
      const response = await apiRequest(`/funds/${selectedFundId}/repository/versions/${versionId}/analyses`, { token })
      const analyses = response.data.analyses || []
      setAnalysesByVersion((current) => ({ ...current, [versionId]: analyses }))
      return analyses
    } catch (error) {
      onError(error.message)
      return []
    } finally {
      setLoadingVersionId(null)
    }
  }

  const toggleVersionAnalyses = async (version) => {
    if (expandedVersionId === version.id) {
      setExpandedVersionId(null)
      return
    }
    setExpandedVersionId(version.id)
    if (!analysesByVersion[version.id]) {
      await fetchVersionAnalyses(version.id)
    }
  }

  const analyzeVersion = async (item, version = item.currentVersion, readerKey = readerSelections[version?.id] || "") => {
    if (!version) return
    try {
      setBusyItemId(item.id)
      await apiRequest(`/funds/${selectedFundId}/repository/versions/${version.id}/analyze`, {
        method: "POST",
        token,
        body: readerKey ? { reader_key: readerKey } : {},
      })
      setExpandedVersionId(version.id)
      await fetchVersionAnalyses(version.id)
      if (item.current_version_id === version.id && comparisonItemId === item.id) {
        await fetchVersionComparison(item)
      }
      onNote(
        item.current_version_id === version.id
          ? `${readerKey ? readerLabel(readerKey) : categoryLabel(item.category)} read and key points refreshed.`
          : `Historic version ${version.version_number} read and retained for audit review.`,
      )
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const fetchVersionComparison = async (item) => {
    if (!item.currentVersion) return null
    setLoadingComparisonVersionId(item.currentVersion.id)
    try {
      const response = await apiRequest(
        `/funds/${selectedFundId}/repository/items/${item.id}/versions/${item.currentVersion.id}/comparison`,
        { token },
      )
      const comparison = response.data.comparison || null
      setComparisonsByVersion((current) => ({ ...current, [item.currentVersion.id]: comparison }))
      return comparison
    } catch (error) {
      onError(error.message)
      return null
    } finally {
      setLoadingComparisonVersionId(null)
    }
  }

  const toggleVersionComparison = async (item) => {
    if (comparisonItemId === item.id) {
      setComparisonItemId(null)
      return
    }
    setComparisonItemId(item.id)
    if (item.currentVersion && !comparisonsByVersion[item.currentVersion.id]) {
      await fetchVersionComparison(item)
    }
  }

  const reviewKeyPoint = async (keyPoint, reviewStatus, valueText) => {
    try {
      setBusyItemId(keyPoint.id)
      await apiRequest(`/funds/${selectedFundId}/repository/key-points/${keyPoint.id}`, {
        method: "PUT",
        token,
        body: {
          review_status: reviewStatus,
          ...(valueText === undefined ? {} : { value_text: valueText }),
        },
      })
      setEditingKeyPointId(null)
      setEditingKeyPointValue("")
      onNote(
        reviewStatus === "confirmed"
          ? valueText === undefined
            ? "Key point confirmed."
            : "Corrected key point confirmed."
          : "Key point dismissed.",
      )
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const reviewCurrentVersionKeyPoints = async (item, reviewStatus = "confirmed") => {
    if (!item.currentVersion) return
    try {
      setBusyItemId(`${item.currentVersion.id}_bulk_review`)
      const response = await apiRequest(
        `/funds/${selectedFundId}/repository/versions/${item.currentVersion.id}/key-points/review`,
        {
          method: "PUT",
          token,
          body: { review_status: reviewStatus },
        },
      )
      const summary = response.data.review?.summary || {}
      onNote(`${summary.reviewed || 0} suggested key point(s) ${reviewStatus === "confirmed" ? "confirmed" : "dismissed"}.`)
      if (expandedVersionId === item.currentVersion.id) {
        await fetchVersionAnalyses(item.currentVersion.id)
      }
      if (comparisonItemId === item.id) {
        await fetchVersionComparison(item)
      }
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const toggleManualKeyPoint = (item) => {
    if (manualKeyPointItemId === item.id) {
      setManualKeyPointItemId(null)
      setManualKeyPointForm({ label: "", value_text: "", source_reference: "" })
      return
    }
    setManualKeyPointItemId(item.id)
    setManualKeyPointForm({ label: "", value_text: "", source_reference: "" })
  }

  const addManualKeyPoint = async (event, item) => {
    event.preventDefault()
    if (!item.currentVersion) return
    if (!manualKeyPointForm.label.trim() || !manualKeyPointForm.value_text.trim()) {
      onError("Manual key points need both a label and a value.")
      return
    }
    try {
      setBusyItemId(item.id)
      await apiRequest(`/funds/${selectedFundId}/repository/versions/${item.currentVersion.id}/key-points`, {
        method: "POST",
        token,
        body: {
          label: manualKeyPointForm.label,
          value_text: manualKeyPointForm.value_text,
          source_reference: manualKeyPointForm.source_reference,
        },
      })
      setManualKeyPointItemId(null)
      setManualKeyPointForm({ label: "", value_text: "", source_reference: "" })
      onNote("Manual key point added and confirmed.")
      if (expandedVersionId === item.currentVersion.id) {
        await fetchVersionAnalyses(item.currentVersion.id)
      }
      if (comparisonItemId === item.id) {
        await fetchVersionComparison(item)
      }
      await loadRepository()
    } catch (error) {
      onError(error.message)
    } finally {
      setBusyItemId(null)
    }
  }

  const editKeyPoint = (keyPoint) => {
    setEditingKeyPointId(keyPoint.id)
    setEditingKeyPointValue(keyPoint.value_text || "")
  }

  const cancelKeyPointEdit = () => {
    setEditingKeyPointId(null)
    setEditingKeyPointValue("")
  }

  const renderReaderPicker = (item, version) => {
    if (!version) return null
    const options = readerOptionsForKind[item.kind] || []
    if (!options.length) return null
    return (
      <label className="repository-reader-select">
        <span>Reader</span>
        <select
          value={readerSelections[version.id] || ""}
          onChange={(event) => setReaderSelection(version.id, event.target.value)}
        >
          <option value="">Auto-detect</option>
          {options.map((reader) => (
            <option key={reader.key} value={reader.key}>
              {reader.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const renderUploadForm = (kind) => {
    const categories = kind === "document" ? DOCUMENT_CATEGORIES : DATASET_CATEGORIES
    return (
      <form className="repository-upload stack" onSubmit={submitNewItem}>
        <div className="section-heading">
          <div>
            <h3>Store New {kind === "document" ? "Document" : "Data Source"}</h3>
            <p className="muted small">Each upload is kept as an immutable version with a traceable history.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Classification
            <select
              value={uploadForm.kind === kind ? uploadForm.category : categories[0][0]}
              onChange={(event) => setUploadForm((current) => ({ ...current, kind, category: event.target.value }))}
            >
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              value={uploadForm.kind === kind ? uploadForm.title : ""}
              onChange={(event) => setUploadForm((current) => ({ ...current, kind, title: event.target.value }))}
              placeholder={kind === "document" ? "2026 Limited Partnership Agreement" : "FY 2026 Trial Balance"}
              required
            />
          </label>
          {kind === "dataset" && (
            <>
              <label>
                Period Start
                <input
                  type="date"
                  value={uploadForm.kind === kind ? uploadForm.period_start : ""}
                  onChange={(event) => setUploadForm((current) => ({ ...current, kind, period_start: event.target.value }))}
                />
              </label>
              <label>
                Period End
                <input
                  type="date"
                  value={uploadForm.kind === kind ? uploadForm.period_end : ""}
                  onChange={(event) => setUploadForm((current) => ({ ...current, kind, period_end: event.target.value }))}
                />
              </label>
            </>
          )}
          <label>
            Tags
            <input
              value={uploadForm.kind === kind ? uploadForm.tags : ""}
              onChange={(event) => setUploadForm((current) => ({ ...current, kind, tags: event.target.value }))}
              placeholder="audited, final"
            />
          </label>
          <label>
            File
            <input
              key={`${kind}_${uploadKey}`}
              type="file"
              accept={kind === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" : ".xlsx,.xls,.csv,.pdf"}
              onChange={(event) => setUploadForm((current) => ({ ...current, kind, file: event.target.files?.[0] || null }))}
              required
            />
            <span className="muted repository-format-note">
              {kind === "document"
                ? "Key-point reading supports searchable PDF, DOCX, XLSX, CSV, TXT and MD. Legacy DOC or images are stored until converted or OCR'd."
                : uploadForm.category === "trial_balance" || uploadForm.category === "general_ledger"
                  ? "Report inputs must be XLSX and can be reused immediately in Run Report."
                  : "Key-point reading supports XLSX, CSV and searchable PDF. Legacy XLS files are stored until converted."}
            </span>
          </label>
          <label className="full">
            Description
            <textarea
              rows="2"
              value={uploadForm.kind === kind ? uploadForm.description : ""}
              onChange={(event) => setUploadForm((current) => ({ ...current, kind, description: event.target.value }))}
            />
          </label>
        </div>
        <button className="primary" type="submit" disabled={busyItemId === "new"}>
          {busyItemId === "new" ? "Storing..." : "Store in Repository"}
        </button>
      </form>
    )
  }

  const renderInsight = (item) => {
    const insight = insightsByItem.get(item.id)
    const suggestion = item.currentVersion ? readerSuggestions[item.currentVersion.id] : null
    const suggestedKeyPointCount = (insight?.keyPoints || []).filter((keyPoint) => keyPoint.review_status === "suggested").length
    const hasPriorVersion = (item.versions || []).some(
      (version) => Number(version.version_number) < Number(item.currentVersion?.version_number || 0),
    )
    if (!canReadItem(item)) return null

    return (
      <div className="repository-insight stack">
        <div className="repository-insight-head">
          <div>
            <p className="kicker">Extracted Knowledge</p>
            <p className="small">
              {insight
                ? `${analysisStatusLabel(insight.status)} by ${readerLabel(insight.reader_key)} reader`
                : "No current-version reading yet."}
            </p>
          </div>
          <div className="inline-actions">
            {!item.is_archived && item.currentVersion && renderReaderPicker(item, item.currentVersion)}
            {!item.is_archived && item.currentVersion && (
              <button
                type="button"
                onClick={() => fetchReaderSuggestion(item)}
                disabled={loadingSuggestionVersionId === item.currentVersion.id || busyItemId === item.id}
              >
                {loadingSuggestionVersionId === item.currentVersion.id ? "Checking..." : "Suggest Reader"}
              </button>
            )}
            {insight && hasPriorVersion && (
              <button type="button" onClick={() => toggleVersionComparison(item)} disabled={busyItemId === item.id}>
                {comparisonItemId === item.id ? "Hide Changes" : "Review Changes"}
              </button>
            )}
            {!item.is_archived && item.currentVersion && (
              <button type="button" onClick={() => analyzeVersion(item)} disabled={busyItemId === item.id}>
                {insight ? "Read Again" : `Read ${item.kind === "dataset" ? "Data Source" : "Document"}`}
              </button>
            )}
            {suggestedKeyPointCount > 0 && item.currentVersion && (
              <button
                type="button"
                onClick={() => reviewCurrentVersionKeyPoints(item, "confirmed")}
                disabled={busyItemId === `${item.currentVersion.id}_bulk_review`}
              >
                {busyItemId === `${item.currentVersion.id}_bulk_review` ? "Confirming..." : `Confirm ${suggestedKeyPointCount} Suggested`}
              </button>
            )}
            {!item.is_archived && item.currentVersion && (
              <button type="button" onClick={() => toggleManualKeyPoint(item)} disabled={busyItemId === item.id}>
                {manualKeyPointItemId === item.id ? "Cancel Key Point" : "Add Key Point"}
              </button>
            )}
          </div>
        </div>
        {suggestion && (
          <div className="repository-reader-suggestion">
            <p className="muted small">
              Suggested reader: <strong>{suggestion.reader_key ? readerLabel(suggestion.reader_key) : "None yet"}</strong>
              {suggestion.selection_type ? ` (${fallbackReaderLabel(suggestion.selection_type)})` : ""}
            </p>
            {suggestion.issues?.map((issue) => (
              <p className="muted small" key={issue.code || issue.message}>
                {issue.message}
              </p>
            ))}
          </div>
        )}
        {insight?.summary_text && <p className="muted small">{insight.summary_text}</p>}
        {insight?.issues_json?.map((issue) => (
          <div className="alert warn repository-reading-issue" key={issue.code || issue.message}>
            <p className="small">{issue.message}</p>
          </div>
        ))}
        {manualKeyPointItemId === item.id && (
          <form className="repository-manual-key-point form-grid" onSubmit={(event) => addManualKeyPoint(event, item)}>
            <label>
              Key Point
              <input
                value={manualKeyPointForm.label}
                onChange={(event) => setManualKeyPointForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Notice Period"
                required
              />
            </label>
            <label>
              Value
              <input
                value={manualKeyPointForm.value_text}
                onChange={(event) => setManualKeyPointForm((current) => ({ ...current, value_text: event.target.value }))}
                placeholder="90 days"
                required
              />
            </label>
            <label className="full">
              Source Note
              <input
                value={manualKeyPointForm.source_reference}
                onChange={(event) => setManualKeyPointForm((current) => ({ ...current, source_reference: event.target.value }))}
                placeholder="Clause 12.1, admin review"
              />
            </label>
            <div className="inline-actions full">
              <button className="primary" type="submit" disabled={busyItemId === item.id}>
                Add Confirmed Key Point
              </button>
            </div>
          </form>
        )}
        {insight && comparisonItemId === item.id && renderVersionComparison(item)}
        {insight?.keyPoints?.length > 0 && (
          <div className="repository-key-points">
            {insight.keyPoints.map((keyPoint) => (
              <div className="repository-key-point" key={keyPoint.id}>
                <div className="repository-key-point-value">
                  <p className="small">{keyPoint.label}</p>
                  {editingKeyPointId === keyPoint.id ? (
                    <label className="repository-key-point-edit">
                      <span className="muted small">Corrected value</span>
                      <input
                        aria-label={`Corrected value for ${keyPoint.label}`}
                        value={editingKeyPointValue}
                        onChange={(event) => setEditingKeyPointValue(event.target.value)}
                      />
                    </label>
                  ) : (
                    <strong>{keyPoint.value_text || "-"}</strong>
                  )}
                  {keyPoint.source_reference && <p className="muted small">{keyPoint.source_reference}</p>}
                </div>
                <div className="inline-actions">
                  <span className={`knowledge-status ${keyPoint.review_status}`}>{keyPoint.review_status}</span>
                  {editingKeyPointId === keyPoint.id ? (
                    <>
                      <button
                        className="primary"
                        type="button"
                        onClick={() => reviewKeyPoint(keyPoint, "confirmed", editingKeyPointValue)}
                        disabled={busyItemId === keyPoint.id || !editingKeyPointValue.trim()}
                      >
                        Save and Confirm
                      </button>
                      <button
                        type="button"
                        onClick={cancelKeyPointEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => editKeyPoint(keyPoint)} disabled={busyItemId === keyPoint.id}>
                        Correct
                      </button>
                      {keyPoint.review_status !== "confirmed" && (
                        <button type="button" onClick={() => reviewKeyPoint(keyPoint, "confirmed")} disabled={busyItemId === keyPoint.id}>
                          Confirm
                        </button>
                      )}
                      {keyPoint.review_status !== "dismissed" && (
                        <button type="button" onClick={() => reviewKeyPoint(keyPoint, "dismissed")} disabled={busyItemId === keyPoint.id}>
                          Dismiss
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderVersionComparison = (item) => {
    const versionId = item.currentVersion?.id
    const comparison = comparisonsByVersion[versionId]
    if (loadingComparisonVersionId === versionId) {
      return <p className="muted small">Comparing extracted facts with the previous version...</p>
    }
    if (!comparison) return null
    if (comparison.status === "no_previous_version") {
      return <p className="muted small">There is no earlier stored version to compare against.</p>
    }
    if (comparison.status === "previous_unread") {
      return (
        <div className="alert warn repository-reading-issue">
          <p className="small">The previous version has not been read yet. View and read that version to calculate changed terms.</p>
        </div>
      )
    }
    if (comparison.status === "current_unread") {
      return <p className="muted small">Read the current version before comparing extracted facts.</p>
    }
    const reviewChanges = (comparison.changes || []).filter((change) => change.change_type !== "unchanged")
    return (
      <div className="repository-comparison stack">
        <div className="section-heading">
          <div>
            <p className="kicker">Version Comparison</p>
            <h4>
              v{comparison.version?.version_number} versus v{comparison.previous_version?.version_number}
            </h4>
          </div>
          <span className="knowledge-count">{comparison.counts.differences} differences</span>
        </div>
        {comparison.counts.reconfirmation_needed > 0 && (
          <p className="muted small">
            {comparison.counts.reconfirmation_needed} unchanged fact(s) were confirmed on the prior version and require current-version confirmation.
          </p>
        )}
        <div className="knowledge-metrics">
          <div className="knowledge-metric suggested"><strong>{comparison.counts.changed}</strong><span>Changed</span></div>
          <div className="knowledge-metric"><strong>{comparison.counts.added}</strong><span>Added</span></div>
          <div className="knowledge-metric"><strong>{comparison.counts.removed}</strong><span>Removed</span></div>
          <div className="knowledge-metric confirmed"><strong>{comparison.counts.unchanged}</strong><span>Unchanged</span></div>
        </div>
        {reviewChanges.length === 0 ? (
          <p className="muted small">No extracted fact changes were detected. Confirm current-version facts below when ready.</p>
        ) : (
          <div className="repository-change-list">
            {reviewChanges.map((change) => (
              <div className="repository-change" key={change.point_key}>
                <span className={`repository-change-type ${change.change_type}`}>{comparisonStatusLabel(change.change_type)}</span>
                <div>
                  <p className="small">{change.label}</p>
                  <strong>{change.current?.value_text || "Not detected in current version"}</strong>
                  {change.previous && (
                    <p className="muted small">
                      Previous: {change.previous.value_text || "-"} ({change.previous.review_status})
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">Use the current-version facts below to confirm or dismiss extracted terms.</p>
      </div>
    )
  }

  const renderVersionReadingHistory = (item, version) => {
    const analyses = analysesByVersion[version.id] || []
    const isCurrent = item.current_version_id === version.id
    return (
      <div className="repository-reading-history stack">
        <div className="repository-insight-head">
          <div>
            <p className="kicker">Version Reading History</p>
            <h4>v{version.version_number} | {version.original_file_name}</h4>
            <p className="muted small">
              {isCurrent
                ? "Current-version confirmations are managed in Extracted Knowledge above."
                : "Historical readings are retained as audit evidence. Make this version current to use its reviewed facts."}
            </p>
          </div>
          {!item.is_archived && !version.is_archived && !isCurrent && (
            <div className="inline-actions">
              {renderReaderPicker(item, version)}
              <button type="button" onClick={() => analyzeVersion(item, version)} disabled={busyItemId === item.id}>
                Read Version
              </button>
            </div>
          )}
        </div>
        {loadingVersionId === version.id && <p className="muted small">Loading reading history...</p>}
        {loadingVersionId !== version.id && analyses.length === 0 && (
          <p className="muted small">No key-point reading has been recorded for this version.</p>
        )}
        {analyses.map((analysis, index) => (
          <details className="repository-analysis-record" open={index === 0} key={analysis.id}>
            <summary>
              <strong>{index === 0 ? "Latest reading" : "Prior reading"}</strong>
              <span className={`knowledge-status ${analysis.status === "completed" ? "confirmed" : ""}`}>
                {analysisStatusLabel(analysis.status)}
              </span>
              <span className="muted small">
                {readerLabel(analysis.reader_key)} | {shortDate(analysis.created_at)} | {analysis.keyPoints?.length || 0} facts
              </span>
            </summary>
            <div className="stack repository-analysis-detail">
              {analysis.summary_text && <p className="muted small">{analysis.summary_text}</p>}
              {analysis.issues_json?.map((issue) => (
                <div className="alert warn repository-reading-issue" key={issue.code || issue.message}>
                  <p className="small">{issue.message}</p>
                </div>
              ))}
              {analysis.keyPoints?.length > 0 && (
                <div className="repository-history-points">
                  {analysis.keyPoints.map((keyPoint) => (
                    <div className="repository-history-point" key={keyPoint.id}>
                      <span className="muted small">{keyPoint.label}</span>
                      <strong>{keyPoint.value_text || "-"}</strong>
                      <span className={`knowledge-status ${keyPoint.review_status}`}>{keyPoint.review_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    )
  }

  const renderFilters = (kind, count, filteredCount) => {
    const categories = kind === "document" ? DOCUMENT_CATEGORIES : DATASET_CATEGORIES
    const filters = itemFilters[kind]
    return (
      <div className="repository-filters">
        <label className="repository-filter-search">
          Search
          <input
            type="search"
            value={filters.text}
            onChange={(event) => updateItemFilter(kind, "text", event.target.value)}
            placeholder="Title, tag or file"
          />
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(event) => updateItemFilter(kind, "category", event.target.value)}>
            <option value="">All categories</option>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => updateItemFilter(kind, "status", event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Current</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <p className="muted small repository-filter-count" aria-live="polite">
          {filteredCount} of {count} shown
        </p>
      </div>
    )
  }

  const renderItems = (records, emptyLabel) => (
    <div className="repository-list">
      {records.map((item) => (
        <article
          id={`repository-item-${item.id}`}
          className={`repository-record ${item.is_archived ? "archived" : ""} ${focusedItemId === item.id ? "focused" : ""}`}
          key={item.id}
        >
          <div className="repository-record-head">
            <div>
              <p className="kicker">{categoryLabel(item.category)}</p>
              <h3>{item.title}</h3>
              <p className="muted small">
                {item.period_start && item.period_end ? `${item.period_start} to ${item.period_end} | ` : ""}
                Current version: {item.currentVersion ? `v${item.currentVersion.version_number}` : "none"}
                {item.is_archived ? " | Archived" : ""}
              </p>
            </div>
            <div className="inline-actions">
              {item.currentVersion && (
                <button type="button" onClick={() => downloadVersion(item.currentVersion)}>
                  Download
                </button>
              )}
              <button type="button" onClick={() => toggleArchive(item)} disabled={busyItemId === item.id}>
                {item.is_archived ? "Restore" : "Archive"}
              </button>
            </div>
          </div>
          {item.description && <p className="muted small">{item.description}</p>}
          {renderInsight(item)}
          {!item.is_archived && (
            <div className="repository-version-add">
              <input
                type="file"
                accept={item.kind === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" : ".xlsx,.xls,.csv,.pdf"}
                onChange={(event) =>
                  setVersionFiles((current) => ({ ...current, [item.id]: event.target.files?.[0] || null }))
                }
              />
              <button type="button" onClick={() => uploadVersion(item)} disabled={busyItemId === item.id}>
                Add Version
              </button>
            </div>
          )}
          <div className="table-wrap repository-versions">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(item.versions || []).map((version) => (
                  <tr key={version.id}>
                    <td>v{version.version_number}</td>
                    <td>{version.original_file_name}</td>
                    <td>{shortDate(version.uploaded_at)}</td>
                    <td>{formatSize(version.file_size)}</td>
                    <td>{item.current_version_id === version.id ? "Current" : "Historic"}</td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" onClick={() => downloadVersion(version)}>
                          Download
                        </button>
                        {canReadItem(item) && (
                          <button type="button" onClick={() => toggleVersionAnalyses(version)}>
                            {expandedVersionId === version.id ? "Hide Readings" : "View Readings"}
                          </button>
                        )}
                        {!item.is_archived && item.current_version_id !== version.id && (
                          <button type="button" onClick={() => restoreVersion(item, version)}>
                            Make Current
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {expandedVersionId && (item.versions || []).find((version) => version.id === expandedVersionId) &&
            renderVersionReadingHistory(item, item.versions.find((version) => version.id === expandedVersionId))}
        </article>
      ))}
      {records.length === 0 && <div className="repository-empty">{emptyLabel}</div>}
    </div>
  )

  return (
    <section className="panel repository-workspace stack">
      <div className="section-heading">
        <div>
          <p className="kicker">Fund Knowledge Base</p>
          <h2>Fund Repository</h2>
          <p className="muted small">
            Store reliable context and source evidence for {selectedFund?.name || "the selected fund"}.
          </p>
        </div>
        <button type="button" onClick={loadRepository} disabled={!selectedFundId || loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={analyzeCurrentSources} disabled={!selectedFundId || busyItemId === "bulk-read"}>
          {busyItemId === "bulk-read" ? "Reading..." : "Read Current Sources"}
        </button>
      </div>

      <nav className="repository-tabs" aria-label="Fund repository sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? "repository-tab active" : "repository-tab"}
            onClick={() => {
              setActiveTab(tab.key)
              setShowUpload(false)
              setFocusedItemId(null)
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="stack">
          <div className="cards-grid reporting-grid">
            <button type="button" className="metric-card" onClick={() => setActiveTab("fund-context")}>
              <span className={completeness >= 5 ? "status-dot ok" : "status-dot warn"} />
              <p className="kicker">Fund Context</p>
              <h3>{completeness}/7</h3>
              <p className="muted small">Core reporting context fields populated.</p>
            </button>
            <button type="button" className="metric-card" onClick={() => setActiveTab("documents")}>
              <span className="status-dot neutral" />
              <p className="kicker">Documents</p>
              <h3>{summary?.counts?.documents || 0}</h3>
              <p className="muted small">Versioned reference files stored.</p>
            </button>
            <button type="button" className="metric-card" onClick={() => setActiveTab("data-sources")}>
              <span className={activeDatasets.length ? "status-dot ok" : "status-dot warn"} />
              <p className="kicker">Data Sources</p>
              <h3>{summary?.counts?.datasets || 0}</h3>
              <p className="muted small">Reusable datasets catalogued.</p>
            </button>
            <button type="button" className="metric-card" onClick={onRunReport}>
              <span className={summary?.counts?.trial_balances && summary?.counts?.general_ledgers ? "status-dot ok" : "status-dot warn"} />
              <p className="kicker">Ready Input Pairs</p>
              <h3>
                {Math.min(summary?.counts?.trial_balances || 0, summary?.counts?.general_ledgers || 0)}
              </h3>
              <p className="muted small">Stored TB and GL sources available for runs.</p>
            </button>
          </div>
          <div className="split-2">
            <div className="mini-card stack">
              <h3>Latest Documents</h3>
              {(summary?.latest_documents || []).map((item) => (
                <button key={item.id} type="button" className="repository-link" onClick={() => setActiveTab("documents")}>
                  <span>{item.title}</span>
                  <small>{categoryLabel(item.category)}</small>
                </button>
              ))}
              {!summary?.latest_documents?.length && <p className="muted small">No documents stored yet.</p>}
            </div>
            <div className="mini-card stack">
              <h3>Reporting Data</h3>
              {(summary?.latest_datasets || []).map((item) => (
                <button key={item.id} type="button" className="repository-link" onClick={() => setActiveTab("data-sources")}>
                  <span>{item.title}</span>
                  <small>{categoryLabel(item.category)}</small>
                </button>
              ))}
              {!summary?.latest_datasets?.length && <p className="muted small">Upload TB and GL files to reuse them in reports.</p>}
            </div>
          </div>
          <div className="mini-card stack">
            <div className="section-heading">
              <div>
                <p className="kicker">Extracted Knowledge</p>
                <h3>Current source readings</h3>
              </div>
              <span className="knowledge-count">{insights.length}</span>
            </div>
            <div className="knowledge-metrics" aria-label="Key point review status">
              <div className="knowledge-metric confirmed">
                <strong>{readiness?.counts?.confirmed_key_points ?? knowledgeOverview.counts.confirmed}</strong>
                <span>Confirmed</span>
              </div>
              <div className="knowledge-metric suggested">
                <strong>{readiness?.counts?.suggested_key_points ?? knowledgeOverview.counts.suggested}</strong>
                <span>To Review</span>
              </div>
              <div className={`knowledge-metric ${readiness?.counts?.unread_sources ? "conflict" : ""}`}>
                <strong>{readiness?.counts?.unread_sources || 0}</strong>
                <span>Unread</span>
              </div>
              <div className="knowledge-metric dismissed">
                <strong>{readiness?.counts?.dismissed_key_points ?? knowledgeOverview.counts.dismissed}</strong>
                <span>Dismissed</span>
              </div>
              <div className={`knowledge-metric ${knowledgeConflicts.length ? "conflict" : ""}`}>
                <strong>{knowledgeConflicts.length}</strong>
                <span>Conflicts</span>
              </div>
            </div>
            {readiness?.counts && (
              <p className="muted small">
                Readiness score {readiness.counts.readiness_score}% across {readiness.counts.readable_sources} readable current source(s).
              </p>
            )}
            {readiness?.unread_sources?.length > 0 && <p className="kicker repository-subheading">Unread Current Sources</p>}
            {readiness?.unread_sources?.slice(0, 4).map((source) => (
              <button
                key={source.item.id}
                type="button"
                className="repository-link review-link"
                onClick={() => openInsightItem({ item_id: source.item.id, item: source.item })}
              >
                <span>{source.item.title}</span>
                <small>{categoryLabel(source.item.effective_category || source.item.category)}</small>
              </button>
            ))}
            {readiness?.review_sources?.length > 0 && <p className="kicker repository-subheading">Sources Needing Review</p>}
            {readiness?.review_sources?.slice(0, 4).map((source) => (
              <button
                key={`${source.item.id}_${source.reader_keys?.join("_") || "reader"}`}
                type="button"
                className="repository-link review-link"
                onClick={() => openInsightItem({ item_id: source.item.id, item: source.item })}
              >
                <span>{source.item.title}</span>
                <small>
                  {source.suggested_key_points || 0} suggested fact(s)
                  {source.issue_count ? `, ${source.issue_count} reader issue(s)` : ""}
                </small>
              </button>
            ))}
            {knowledgeConflicts.length > 0 && <p className="kicker repository-subheading">Conflicting Confirmed Facts</p>}
            {knowledgeConflicts.slice(0, 3).map((conflict) => (
              <div className="repository-conflict stack" key={conflict.id}>
                <div className="repository-conflict-heading">
                  <strong>{conflict.label}</strong>
                  <span className="knowledge-status dismissed">Needs review</span>
                </div>
                <p className="muted small">{conflict.scope_label}: current confirmed sources contain different values.</p>
                <div className="repository-conflict-values">
                  {conflict.values.map((value) => (
                    <button
                      className="repository-conflict-source"
                      key={value.key_point_id}
                      type="button"
                      onClick={() => openConflictSource(value)}
                    >
                      <strong>{value.value_text || "-"}</strong>
                      <small>{value.title || categoryLabel(value.category)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {knowledgeOverview.reviewQueue.length > 0 && <p className="kicker repository-subheading">Awaiting Review</p>}
            {knowledgeOverview.reviewQueue.slice(0, 4).map(({ analysis, keyPoint }) => (
              <button
                key={`${analysis.id}_${keyPoint.id}`}
                type="button"
                className="repository-link review-link"
                onClick={() => openInsightItem(analysis)}
              >
                <span>{keyPoint.label}</span>
                <small>{analysis.item?.title || "Repository source"}</small>
              </button>
            ))}
            {keyPointRecords.length > 0 && <p className="kicker repository-subheading">Knowledge Index</p>}
            {keyPointRecords.length > 0 && (
              <div className="repository-knowledge-index stack">
                <div className="repository-filters compact">
                  <label className="repository-filter-search">
                    Search facts
                    <input
                      type="search"
                      value={knowledgeFilters.text}
                      onChange={(event) => updateKnowledgeFilter("text", event.target.value)}
                      placeholder="Fee, investor, NAV, due date"
                    />
                  </label>
                  <label>
                    Status
                    <select value={knowledgeFilters.status} onChange={(event) => updateKnowledgeFilter("status", event.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="suggested">To review</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </label>
                  <label>
                    Category
                    <select value={knowledgeFilters.category} onChange={(event) => updateKnowledgeFilter("category", event.target.value)}>
                      <option value="">All categories</option>
                      {knowledgeCategories.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted small repository-filter-count" aria-live="polite">
                    {filteredKeyPointRecords.length} of {keyPointRecords.length} facts
                  </p>
                </div>
                <div className="repository-knowledge-list">
                  {filteredKeyPointRecords.slice(0, 8).map((record) => (
                    <article
                      className="repository-knowledge-row"
                      key={record.id}
                    >
                      <span className={`knowledge-status ${record.review_status}`}>{record.review_status}</span>
                      <span>
                        <strong>{record.label}</strong>
                        <small>{record.item?.title || "Repository source"} | {categoryLabel(record.item?.effective_category || record.item?.category)}</small>
                      </span>
                      {editingKeyPointId === record.id ? (
                        <label className="repository-key-point-edit repository-knowledge-value editing">
                          <span className="muted small">Corrected value</span>
                          <input
                            aria-label={`Corrected value for ${record.label}`}
                            value={editingKeyPointValue}
                            onChange={(event) => setEditingKeyPointValue(event.target.value)}
                          />
                        </label>
                      ) : (
                        <span className="repository-knowledge-value">{record.value_text || "-"}</span>
                      )}
                      <span className="repository-knowledge-actions">
                        {editingKeyPointId === record.id ? (
                          <>
                            <button
                              className="primary"
                              type="button"
                              onClick={() => reviewKeyPoint(record, "confirmed", editingKeyPointValue)}
                              disabled={busyItemId === record.id || !editingKeyPointValue.trim()}
                            >
                              Save and Confirm
                            </button>
                            <button type="button" onClick={cancelKeyPointEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => editKeyPoint(record)} disabled={busyItemId === record.id}>
                              Correct
                            </button>
                            {record.review_status !== "confirmed" && (
                              <button type="button" onClick={() => reviewKeyPoint(record, "confirmed")} disabled={busyItemId === record.id}>
                                Confirm
                              </button>
                            )}
                            {record.review_status !== "dismissed" && (
                              <button type="button" onClick={() => reviewKeyPoint(record, "dismissed")} disabled={busyItemId === record.id}>
                                Dismiss
                              </button>
                            )}
                            <button type="button" onClick={() => openKeyPointSource(record)}>
                              Open Source
                            </button>
                          </>
                        )}
                      </span>
                    </article>
                  ))}
                  {filteredKeyPointRecords.length === 0 && (
                    <p className="muted small">No stored key points match those filters.</p>
                  )}
                </div>
              </div>
            )}
            {insights.length > 0 && <p className="kicker repository-subheading">Sources Read</p>}
            {insights.slice(0, 5).map((analysis) => (
              <button
                key={analysis.id}
                type="button"
                className="repository-link"
                onClick={() => openInsightItem(analysis)}
              >
                <span>{analysis.item?.title || "Repository source"}</span>
                <small>{analysisStatusLabel(analysis.status)} | {analysis.keyPoints?.length || 0} key points</small>
              </button>
            ))}
            {!insights.length && <p className="muted small">Readable uploads will surface extracted key points here.</p>}
          </div>
        </div>
      )}

      {activeTab === "fund-context" && children}

      {activeTab === "documents" && (
        <div className="stack">
          <div className="section-heading">
            <div>
              <h3>Reference Documents</h3>
              <p className="muted small">Governing and supporting files with extracted key points.</p>
            </div>
            <button
              type="button"
              aria-expanded={showUpload && uploadForm.kind === "document"}
              onClick={() => toggleUploadFor("document")}
            >
              {showUpload && uploadForm.kind === "document" ? "Cancel Upload" : "Store Document"}
            </button>
          </div>
          {showUpload && uploadForm.kind === "document" && renderUploadForm("document")}
          {renderFilters("document", documents.length, filteredDocuments.length)}
          {renderItems(filteredDocuments, documents.length ? "No documents match these filters." : "No repository documents yet. Store governing and supporting files here.")}
        </div>
      )}

      {activeTab === "data-sources" && (
        <div className="stack">
          <div className="section-heading">
            <div>
              <h3>Reusable Data Sources</h3>
              <p className="muted small">Current datasets and specialized register readings.</p>
            </div>
            <button
              type="button"
              aria-expanded={showUpload && uploadForm.kind === "dataset"}
              onClick={() => toggleUploadFor("dataset")}
            >
              {showUpload && uploadForm.kind === "dataset" ? "Cancel Upload" : "Store Data Source"}
            </button>
          </div>
          {showUpload && uploadForm.kind === "dataset" && renderUploadForm("dataset")}
          <div className="alert ok">
            <strong>Trial Balance and General Ledger files can feed Run Report immediately.</strong>
            <p className="small">Other data types are stored for future analysis workflows.</p>
          </div>
          {renderFilters("dataset", datasets.length, filteredDatasets.length)}
          {renderItems(filteredDatasets, datasets.length ? "No data sources match these filters." : "No reusable datasets yet. Store a Trial Balance or General Ledger to begin.")}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Item</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((event) => (
                <tr key={event.id}>
                  <td>{shortDate(event.created_at)}</td>
                  <td>{ACTIVITY_LABELS[event.event_type] || event.event_type}</td>
                  <td>{event.metadata_json?.item_id || "-"}</td>
                  <td>{event.metadata_json?.version_number || event.metadata_json?.version_id || "-"}</td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr>
                  <td colSpan={4}>Repository activity will appear after the first stored item.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
