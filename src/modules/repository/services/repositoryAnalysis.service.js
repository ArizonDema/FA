const fs = require("fs")
const { Op } = require("sequelize")
const {
  Fund,
  Portfolio,
  FundRepositoryItem,
  FundRepositoryVersion,
  FundRepositoryAnalysis,
  FundRepositoryKeyPoint,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const RepositoryReaderRegistryService = require("./repositoryReaderRegistry.service")
const RepositorySourceReaderService = require("./repositorySourceReader.service")
const { parseNumber } = require("../readers/reader.utils")

const FundModel = Fund || Portfolio

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function publicKeyPoint(record) {
  const keyPoint = asPlain(record)
  if (!keyPoint) return null
  return keyPoint
}

function publicVersion(record) {
  const version = asPlain(record)
  if (!version) return null
  const { storage_path: ignoredPath, ...safeVersion } = version
  void ignoredPath
  return safeVersion
}

function publicAnalysis(record) {
  const analysis = asPlain(record)
  if (!analysis) return null
  return {
    ...analysis,
    item: asPlain(analysis.item),
    version: publicVersion(analysis.version),
    keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints.map(publicKeyPoint) : [],
  }
}

function normalizeReviewStatus(value) {
  const status = String(value || "").trim().toLowerCase()
  if (!["suggested", "confirmed", "dismissed"].includes(status)) {
    throw new AppError("Key point review_status must be suggested, confirmed, or dismissed", 400)
  }
  return status
}

function normalizeKnowledgeFilter(value) {
  const status = String(value || "confirmed").trim().toLowerCase()
  if (!["confirmed", "suggested", "dismissed", "all"].includes(status)) {
    throw new AppError("Knowledge status must be confirmed, suggested, dismissed, or all", 400)
  }
  return status
}

function normalizeKeyPointIndexFilters(filters = {}) {
  const reviewStatus = normalizeKnowledgeFilter(filters.status || filters.review_status || "all")
  const limit = Math.min(Math.max(Number(filters.limit || 200) || 200, 1), 500)
  return {
    review_status: reviewStatus,
    category: String(filters.category || "").trim(),
    reader_key: String(filters.reader_key || "").trim(),
    query: String(filters.query || filters.search || "").trim().toLowerCase(),
    limit,
  }
}

function reviewedPointState(record) {
  const point = publicKeyPoint(record)
  if (!point || !["confirmed", "dismissed"].includes(point.review_status)) return null
  return point
}

function comparisonPoint(record) {
  const point = publicKeyPoint(record)
  if (!point) return null
  return {
    id: point.id,
    point_key: point.point_key,
    label: point.label,
    value_text: point.value_text,
    value_json: point.value_json,
    source_reference: point.source_reference,
    confidence: point.confidence,
    review_status: point.review_status,
    reviewed_at: point.reviewed_at,
  }
}

function analysisSummary(record) {
  const analysis = publicAnalysis(record)
  if (!analysis) return null
  return {
    id: analysis.id,
    reader_key: analysis.reader_key,
    reader_version: analysis.reader_version,
    status: analysis.status,
    created_at: analysis.created_at,
    key_point_count: analysis.keyPoints.length,
  }
}

function publicSuggestionItem(item) {
  if (!item) return null
  return {
    id: item.id,
    kind: item.kind,
    category: item.category,
    title: item.title,
    period_start: item.period_start || null,
    period_end: item.period_end || null,
  }
}

function publicReadinessSource({ item, version = null, state = null }) {
  const safeItem = publicSuggestionItem(item)
  if (!safeItem) return null
  return {
    item: safeItem,
    version: publicVersion(version),
    ...(state
      ? {
          reader_keys: Array.from(state.readerKeys || []),
          status: Array.from(state.statuses || []).join(", ") || null,
          suggested_key_points: state.suggested || 0,
          confirmed_key_points: state.confirmed || 0,
          dismissed_key_points: state.dismissed || 0,
          issue_count: state.issueCount || 0,
          analyzed_at: state.latestAnalyzedAt || null,
        }
      : {}),
  }
}

function booleanValue(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value) === "1"
}

function normalizedPointValue(point) {
  return String(point?.value_text || "").replace(/\s+/g, " ").trim()
}

function normalizePointKey(value, fallbackLabel) {
  const normalized = String(value || fallbackLabel || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)
  if (!normalized) throw new AppError("Key point label or key is required", 400)
  return normalized
}

function normalizeManualPointFields(fields = {}) {
  const label = String(fields.label || "").trim()
  const valueText = String(fields.value_text || "").trim()
  if (!label) throw new AppError("Key point label is required", 400)
  if (!valueText) throw new AppError("Key point value_text is required", 400)
  return {
    point_key: normalizePointKey(fields.point_key, label),
    label: label.slice(0, 255),
    value_text: valueText,
    source_reference: String(fields.source_reference || "").trim() || null,
    review_status: fields.review_status === undefined ? "confirmed" : normalizeReviewStatus(fields.review_status),
  }
}

function detectCurrency(value) {
  const text = String(value || "")
  const code = text.match(/\b(USD|EUR|GBP|AUD|CAD|CHF|JPY)\b/i)?.[1]
  if (code) return code.toUpperCase()
  if (/US\$/i.test(text)) return "USD"
  if (/\$/.test(text)) return "USD"
  if (/€/.test(text)) return "EUR"
  if (/£/.test(text)) return "GBP"
  return null
}

function parseDateValue(value) {
  const text = String(value || "").trim()
  const isoMatch = text.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/)
  if (isoMatch) return isoMatch[0]
  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})\b/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const namedMonthMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/i)
  if (!namedMonthMatch) return null
  const [, monthName, day, year] = namedMonthMatch
  const monthIndex = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(monthName.toLowerCase())
  if (monthIndex < 0) return null
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function inferKeyPointValueJson(valueText) {
  const text = String(valueText || "").trim()
  if (!text) return null
  const numericValue = parseNumber(text)
  const currency = detectCurrency(text)
  if (currency && numericValue !== null) {
    return { type: "money", amount: numericValue, currency }
  }
  if (/%/.test(text) && numericValue !== null) {
    return { type: "percent", value: numericValue }
  }
  const dateValue = parseDateValue(text)
  if (dateValue) {
    return { type: "date", value: dateValue }
  }
  if (numericValue !== null && /^[\s($€£A-Z0-9,.-]+$/i.test(text) && /\d/.test(text)) {
    return { type: "number", value: numericValue }
  }
  return null
}

function keyPointValueJson(entry) {
  if (entry.value_json !== undefined && entry.value_json !== null) return entry.value_json
  return inferKeyPointValueJson(entry.value_text)
}

const KNOWLEDGE_CONFLICT_RULES = {
  management_fee: { categories: ["lpa", "lpa_amendment", "ppm", "side_letter"], scope: "governing_terms", scope_label: "Fund terms" },
  carried_interest: { categories: ["lpa", "lpa_amendment", "ppm", "side_letter"], scope: "governing_terms", scope_label: "Fund terms" },
  preferred_return: { categories: ["lpa", "lpa_amendment", "ppm"], scope: "governing_terms", scope_label: "Fund terms" },
  fund_term: { categories: ["lpa", "lpa_amendment"], scope: "governing_terms", scope_label: "Fund terms" },
  investment_period: { categories: ["lpa", "lpa_amendment"], scope: "governing_terms", scope_label: "Fund terms" },
  governing_law: { categories: ["lpa", "lpa_amendment"], scope: "governing_terms", scope_label: "Fund terms" },
  net_asset_value: {
    categories: ["financial_statement", "valuation"],
    scope: "reporting_period",
    scope_label: "Period-matched reporting values",
    period_scoped: true,
  },
}

const READER_EFFECTIVE_CATEGORIES = {
  accrual_schedule: "accrual_schedule",
  bank_reconciliation: "bank_reconciliation",
  audit_report: "audit_report",
  audit_adjustment_schedule: "audit_adjustment_schedule",
  bank_statement: "bank_statement",
  capital_account_statement: "capital_account_statement",
  capital_call_notice: "capital_call_notice",
  commitment_schedule: "commitment_schedule",
  credit_facility: "credit_facility",
  custodian_statement: "custodian_statement",
  distribution_notice: "distribution_notice",
  expense_invoice: "expense_invoice",
  financial_statement: "financial_statement",
  governance_minutes: "governance_minutes",
  holdings_register: "holdings_register",
  investor_activity_statement: "investor_activity_statement",
  lpa: "lpa",
  lpa_amendment: "lpa_amendment",
  management_fee_statement: "management_fee_statement",
  nav_package: "nav_package",
  ppm: "ppm",
  portfolio_transaction: "portfolio_transaction",
  redemption_notice: "redemption_notice",
  service_agreement: "service_agreement",
  shareholder_register: "investor_register",
  side_letter: "side_letter",
  subscription_agreement: "subscription_agreement",
  tax_document: "tax_document",
  transfer_notice: "transfer_notice",
  valuation: "valuation",
  waterfall_statement: "waterfall_statement",
}

function effectiveKnowledgeCategory({ item, analysis }) {
  const category = item?.category || null
  if (!["other_document", "other_dataset"].includes(category)) return category
  return READER_EFFECTIVE_CATEGORIES[analysis?.reader_key] || category
}

function comparableKnowledgeValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\(?-?\d+(?:\.\d+)?\)?/g, (match) => {
      const isNegative = match.includes("(")
      const numeric = Number(match.replace(/[()]/g, ""))
      if (!Number.isFinite(numeric)) return match
      return String(isNegative ? -numeric : numeric)
    })
    .replace(/[.;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function includesQuery(record, query) {
  if (!query) return true
  return [
    record.point_key,
    record.label,
    record.value_text,
    record.source_reference,
    record.reader_key,
    record.item?.title,
    record.item?.category,
    record.item?.effective_category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query)
}

function countBy(records, getter) {
  return records.reduce((counts, record) => {
    const key = getter(record) || "unknown"
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function conflictScope(rule, item) {
  if (!rule.period_scoped) return rule.scope
  if (!item.period_start || !item.period_end) return null
  return `${rule.scope}:${item.period_start}:${item.period_end}`
}

function buildKnowledgeConflicts(candidates) {
  const groupedCandidates = new Map()
  candidates.forEach(({ analysis, item, point }) => {
    const category = effectiveKnowledgeCategory({ item, analysis })
    const rule = KNOWLEDGE_CONFLICT_RULES[point.point_key]
    if (!rule || !rule.categories.includes(category)) return
    const scope = conflictScope(rule, item)
    if (!scope) return
    const groupKey = `${scope}:${point.point_key}`
    const values = groupedCandidates.get(groupKey) || []
    values.push({
      key_point_id: point.id,
      item_id: analysis.item_id,
      version_id: analysis.version_id,
      category,
      stored_category: item.category,
      title: item.title,
      label: point.label,
      value_text: point.value_text,
      reviewed_at: point.reviewed_at,
      comparable_value: comparableKnowledgeValue(point.value_text),
    })
    groupedCandidates.set(groupKey, values)
  })

  return Array.from(groupedCandidates.entries())
    .map(([id, values]) => {
      const distinctValues = new Set(values.map((entry) => entry.comparable_value).filter(Boolean))
      if (values.length < 2 || distinctValues.size < 2) return null
      const pointKey = id.slice(id.lastIndexOf(":") + 1)
      const rule = KNOWLEDGE_CONFLICT_RULES[pointKey]
      return {
        id,
        point_key: pointKey,
        label: values[0]?.label || pointKey.replace(/_/g, " "),
        scope: rule.scope,
        scope_label: rule.scope_label,
        values: values.map(({ comparable_value: ignoredValue, ...entry }) => {
          void ignoredValue
          return entry
        }),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label))
}

class RepositoryAnalysisService {
  static async requireFund(fundId) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) throw new AppError("Fund not found", 404)
    return fund
  }

  static async getReaderCatalog({ fundId }) {
    await this.requireFund(fundId)
    return RepositoryReaderRegistryService.availableReaders()
  }

  static async suggestReaderForVersion({ fundId, versionId }) {
    const { version, item } = await this.findReadableVersion({ fundId, versionId })
    const source = await RepositorySourceReaderService.read({
      filePath: version.storage_path,
      extension: version.extension,
    })
    if (source.status !== "ready") {
      return {
        status: source.status || "requires_reader",
        item: publicSuggestionItem(item),
        version: publicVersion(version),
        reader_key: null,
        reader_version: null,
        reader: null,
        selection_type: "unreadable",
        source_format: source.format || version.extension?.replace(".", "") || null,
        extraction_method: source.extraction_method || null,
        issues: source.issues || [],
      }
    }

    const resolved = RepositoryReaderRegistryService.resolveWithMetadata({
      kind: item.kind,
      category: item.category,
      source,
    })
    return {
      status: "suggested",
      item: publicSuggestionItem(item),
      version: publicVersion(version),
      reader_key: resolved.reader.key,
      reader_version: resolved.reader.version,
      reader: RepositoryReaderRegistryService.readerInfo(resolved.reader.key),
      selection_type: resolved.selection_type,
      category_reader_key: resolved.category_reader_key,
      inferred_reader_key: resolved.inferred_reader_key,
      source_format: source.format || version.extension?.replace(".", "") || null,
      extraction_method: source.extraction_method || null,
      issues: source.issues || [],
    }
  }

  static async findOwnedVersion({ fundId, versionId, requireActive = true }) {
    await this.requireFund(fundId)
    const version = await FundRepositoryVersion.findOne({
      where: { id: versionId, ...(requireActive ? { is_archived: false } : {}) },
      include: [
        {
          model: FundRepositoryItem,
          as: "item",
          where: { portfolio_id: fundId, ...(requireActive ? { is_archived: false } : {}) },
        },
      ],
    })
    const data = asPlain(version)
    const item = asPlain(data?.item)
    if (!version || !item) throw new AppError("Repository version not found", 404)
    return { version: data, item }
  }

  static async findReadableVersion({ fundId, versionId }) {
    const { version, item } = await this.findOwnedVersion({ fundId, versionId, requireActive: true })
    if (!version.storage_path || !fs.existsSync(version.storage_path)) {
      throw new AppError("Repository source file is missing from storage", 404)
    }
    return { version, item }
  }

  static async findPriorReviewedKeyPoints({ fundId, itemId, versionId, readerKey }) {
    const analyses = await FundRepositoryAnalysis.findAll({
      where: {
        portfolio_id: fundId,
        item_id: itemId,
        version_id: versionId,
        reader_key: { [Op.in]: Array.from(new Set([readerKey, "manual"].filter(Boolean))) },
      },
      include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
      order: [["created_at", "DESC"]],
    })
    const latestReviewedByKey = new Map()
    analyses.forEach((analysisRecord) => {
      const analysis = asPlain(analysisRecord)
      ;(analysis?.keyPoints || []).forEach((pointRecord) => {
        const point = reviewedPointState(pointRecord)
        if (point && !latestReviewedByKey.has(point.point_key)) {
          latestReviewedByKey.set(point.point_key, point)
        }
      })
    })
    return latestReviewedByKey
  }

  static async findOrCreateKeyPointAnalysis({ fundId, item, version, actorId }) {
    const existing = await FundRepositoryAnalysis.findOne({
      where: {
        portfolio_id: fundId,
        item_id: item.id,
        version_id: version.id,
      },
      include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
      order: [["created_at", "DESC"]],
    })
    if (existing) return existing

    return await FundRepositoryAnalysis.create({
      portfolio_id: fundId,
      item_id: item.id,
      version_id: version.id,
      reader_key: "manual",
      reader_version: "manual.v1",
      status: "completed",
      trigger_type: "manual_key_point",
      source_format: version.extension?.replace(".", "") || null,
      extraction_method: "manual_entry",
      summary_text: "Manual key points recorded by an admin.",
      source_text_excerpt: null,
      structured_data_json: { manual_key_points: true },
      issues_json: [],
      confidence: null,
      created_by: actorId,
    })
  }

  static async findVersionKeyPoint({ fundId, itemId, versionId, pointKey }) {
    const keyPoint = await FundRepositoryKeyPoint.findOne({
      where: {
        portfolio_id: fundId,
        item_id: itemId,
        version_id: versionId,
        point_key: pointKey,
      },
    })
    return publicKeyPoint(keyPoint)
  }

  static async createAnalysisRecord({ fundId, actorId, item, version, reader, triggerType, source, output }) {
    const reviewedByKey = await this.findPriorReviewedKeyPoints({
      fundId,
      itemId: item.id,
      versionId: version.id,
      readerKey: reader.key,
    })
    const extractedPoints = Array.isArray(output.key_points) ? output.key_points.filter(Boolean) : []
    const encounteredKeys = new Set()
    const carriedForwardKeys = []
    const points = extractedPoints.map((entry) => {
      encounteredKeys.add(entry.point_key)
      const reviewed = reviewedByKey.get(entry.point_key)
      if (!reviewed) return { ...entry, review_status: "suggested" }
      carriedForwardKeys.push(entry.point_key)
      return {
        ...entry,
        value_text: reviewed.value_text,
        value_json: reviewed.value_json,
        review_status: reviewed.review_status,
        reviewed_by: reviewed.reviewed_by,
        reviewed_at: reviewed.reviewed_at,
      }
    })
    const preservedWithoutRedetection = []
    reviewedByKey.forEach((reviewed, pointKey) => {
      if (encounteredKeys.has(pointKey)) return
      carriedForwardKeys.push(pointKey)
      preservedWithoutRedetection.push(pointKey)
      points.push(reviewed)
    })
    const carriedIssue =
      preservedWithoutRedetection.length > 0
        ? [{
            code: "reviewed_points_not_redetected",
            message: "Previously reviewed facts remain available, but were not rediscovered by this reading.",
          }]
        : []
    const status = preservedWithoutRedetection.length && output.status === "completed" ? "partial" : output.status
    const structuredData = {
      ...(output.structured_data_json || {}),
      ...(carriedForwardKeys.length ? { reviewed_decisions_carried_forward: carriedForwardKeys } : {}),
      ...(preservedWithoutRedetection.length ? { reviewed_points_not_redetected: preservedWithoutRedetection } : {}),
    }
    const analysis = await FundRepositoryAnalysis.create({
      portfolio_id: fundId,
      item_id: item.id,
      version_id: version.id,
      reader_key: reader.key,
      reader_version: reader.version,
      status,
      trigger_type: triggerType,
      source_format: source.format || version.extension?.replace(".", "") || null,
      extraction_method: source.extraction_method || null,
      summary_text: output.summary_text || null,
      source_text_excerpt: output.source_text_excerpt || null,
      structured_data_json: Object.keys(structuredData).length ? structuredData : null,
      issues_json: [...(source.issues || []), ...(output.issues_json || []), ...carriedIssue],
      confidence: output.confidence === null || output.confidence === undefined ? null : output.confidence,
      created_by: actorId,
    })

    const keyPoints = points.length
      ? await FundRepositoryKeyPoint.bulkCreate(
          points.map((entry) => ({
            portfolio_id: fundId,
            analysis_id: analysis.id,
            item_id: item.id,
            version_id: version.id,
            point_key: entry.point_key,
            label: entry.label,
            value_text: entry.value_text || null,
            value_json: keyPointValueJson(entry),
            source_reference: entry.source_reference || null,
            confidence: entry.confidence === undefined ? null : entry.confidence,
            review_status: entry.review_status || "suggested",
            reviewed_by: entry.reviewed_by || null,
            reviewed_at: entry.reviewed_at || null,
          })),
        )
      : []

    await AuditService.logEvent({
      actorId,
      eventType: "repository_version_analyzed",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: {
        item_id: item.id,
        version_id: version.id,
        analysis_id: analysis.id,
        reader_key: reader.key,
        status,
        key_point_count: keyPoints.length,
        carried_review_count: carriedForwardKeys.length,
        trigger_type: triggerType,
      },
    })

    return publicAnalysis({ ...asPlain(analysis), keyPoints: keyPoints.map(asPlain) })
  }

  static async analyzeVersion({ fundId, versionId, actorId = null, readerKey = null, triggerType = "manual" }) {
    const { version, item } = await this.findReadableVersion({ fundId, versionId })
    let reader = RepositoryReaderRegistryService.resolve({ kind: item.kind, category: item.category, readerKey })
    let source = null
    let output = null

    try {
      source = await RepositorySourceReaderService.read({
        filePath: version.storage_path,
        extension: version.extension,
      })
      if (source.status !== "ready") {
        output = {
          status: "requires_reader",
          summary_text: "The file is stored, but a machine-readable source is required before key points can be extracted.",
          confidence: null,
          key_points: [],
          structured_data_json: { category: item.category },
          issues_json: [],
          source_text_excerpt: null,
        }
      } else {
        reader = RepositoryReaderRegistryService.resolve({
          kind: item.kind,
          category: item.category,
          readerKey,
          source,
        })
        output = reader.analyze({ item, version, source })
      }
    } catch (error) {
      source = source || {
        format: version.extension?.replace(".", "") || null,
        extraction_method: null,
        issues: [],
      }
      output = {
        status: "failed",
        summary_text: "Repository reading failed for this version.",
        confidence: null,
        key_points: [],
        structured_data_json: null,
        issues_json: [{ code: "reader_failed", message: String(error.message || "Reader failed") }],
        source_text_excerpt: null,
      }
    }

    return await this.createAnalysisRecord({
      fundId,
      actorId,
      item,
      version,
      reader,
      triggerType,
      source,
      output,
    })
  }

  static async analyzeIfSupported({ fundId, versionId, item, actorId = null }) {
    if (!RepositoryReaderRegistryService.supportsAutomaticAnalysis(item)) return null
    return await this.analyzeVersion({
      fundId,
      versionId,
      actorId,
      triggerType: "upload",
    })
  }

  static async analyzeCurrentVersions({ fundId, actorId = null, includeExisting = false }) {
    await this.requireFund(fundId)
    const items = await FundRepositoryItem.findAll({
      where: { portfolio_id: fundId, is_archived: false },
      include: [{ model: FundRepositoryVersion, as: "currentVersion", where: { is_archived: false }, required: false }],
      order: [["updated_at", "DESC"]],
    })
    const shouldIncludeExisting = booleanValue(includeExisting)
    const summary = {
      current_sources: items.length,
      analyzed: 0,
      skipped_existing: 0,
      skipped_unsupported: 0,
      skipped_missing_version: 0,
      failed: 0,
    }
    const results = []

    for (const itemRecord of items) {
      const item = asPlain(itemRecord) || {}
      const version = asPlain(item.currentVersion)
      if (!version?.id) {
        summary.skipped_missing_version += 1
        results.push({
          item: publicSuggestionItem(item),
          status: "skipped_missing_version",
          reason: "Current repository version is missing.",
        })
        continue
      }
      if (!RepositoryReaderRegistryService.supportsAutomaticAnalysis(item)) {
        summary.skipped_unsupported += 1
        results.push({
          item: publicSuggestionItem(item),
          version: publicVersion(version),
          status: "skipped_unsupported",
          reason: "This repository category is stored for report input reuse and is not read for key points.",
        })
        continue
      }
      const existing = shouldIncludeExisting
        ? null
        : await FundRepositoryAnalysis.findOne({
            where: { portfolio_id: fundId, item_id: item.id, version_id: version.id },
            include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
            order: [["created_at", "DESC"]],
          })
      if (existing) {
        summary.skipped_existing += 1
        results.push({
          item: publicSuggestionItem(item),
          version: publicVersion(version),
          status: "skipped_existing",
          analysis: analysisSummary(existing),
        })
        continue
      }

      try {
        const analysis = await this.analyzeVersion({
          fundId,
          versionId: version.id,
          actorId,
          triggerType: "bulk",
        })
        summary.analyzed += 1
        results.push({
          item: publicSuggestionItem(item),
          version: publicVersion(version),
          status: "analyzed",
          analysis: analysisSummary(analysis),
        })
      } catch (error) {
        summary.failed += 1
        results.push({
          item: publicSuggestionItem(item),
          version: publicVersion(version),
          status: "failed",
          error: String(error.message || "Repository reading failed"),
        })
      }
    }

    await AuditService.logEvent({
      actorId,
      eventType: "repository_bulk_analysis_completed",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: summary,
    })

    return { summary, results }
  }

  static async addManualKeyPoint({ fundId, versionId, actorId = null, fields }) {
    const { version, item } = await this.findOwnedVersion({ fundId, versionId, requireActive: true })
    const manualPoint = normalizeManualPointFields(fields)
    const duplicatePoint = await this.findVersionKeyPoint({
      fundId,
      itemId: item.id,
      versionId: version.id,
      pointKey: manualPoint.point_key,
    })
    if (duplicatePoint) {
      throw new AppError("A key point with this key already exists for this repository version", 409)
    }
    const analysisRecord = await this.findOrCreateKeyPointAnalysis({ fundId, item, version, actorId })
    const analysis = asPlain(analysisRecord)

    const reviewedAt = manualPoint.review_status === "suggested" ? null : new Date()
    const reviewedBy = manualPoint.review_status === "suggested" ? null : actorId
    const [keyPointRecord] = await FundRepositoryKeyPoint.bulkCreate([
      {
        portfolio_id: fundId,
        analysis_id: analysis.id,
        item_id: item.id,
        version_id: version.id,
        point_key: manualPoint.point_key,
        label: manualPoint.label,
        value_text: manualPoint.value_text,
        value_json: inferKeyPointValueJson(manualPoint.value_text),
        source_reference: manualPoint.source_reference,
        confidence: null,
        review_status: manualPoint.review_status,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
      },
    ])

    const keyPoint = publicKeyPoint(keyPointRecord)
    await AuditService.logEvent({
      actorId,
      eventType: "repository_key_point_created",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: {
        item_id: item.id,
        version_id: version.id,
        analysis_id: analysis.id,
        key_point_id: keyPoint?.id,
        point_key: manualPoint.point_key,
        review_status: manualPoint.review_status,
      },
      after: keyPoint,
    })
    return keyPoint
  }

  static async getVersionAnalyses({ fundId, versionId }) {
    await this.findOwnedVersion({ fundId, versionId, requireActive: false })
    const analyses = await FundRepositoryAnalysis.findAll({
      where: { portfolio_id: fundId, version_id: versionId },
      include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
      order: [["created_at", "DESC"]],
    })
    return analyses.map(publicAnalysis)
  }

  static async getVersionComparison({ fundId, itemId, versionId }) {
    const { version, item } = await this.findOwnedVersion({ fundId, versionId, requireActive: false })
    if (item.id !== itemId) throw new AppError("Repository version not found for item", 404)
    const versions = await FundRepositoryVersion.findAll({
      where: { item_id: itemId },
      order: [["version_number", "DESC"]],
    })
    const previousVersion = versions
      .map(asPlain)
      .filter(Boolean)
      .filter((entry) => Number(entry.version_number) < Number(version.version_number))
      .sort((left, right) => Number(right.version_number) - Number(left.version_number))[0] || null
    const currentAnalysis = await FundRepositoryAnalysis.findOne({
      where: { portfolio_id: fundId, item_id: itemId, version_id: versionId },
      include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
      order: [["created_at", "DESC"]],
    })
    const priorAnalysis = previousVersion
      ? await FundRepositoryAnalysis.findOne({
          where: { portfolio_id: fundId, item_id: itemId, version_id: previousVersion.id },
          include: [{ model: FundRepositoryKeyPoint, as: "keyPoints" }],
          order: [["created_at", "DESC"]],
        })
      : null
    const current = publicAnalysis(currentAnalysis)
    const prior = publicAnalysis(priorAnalysis)
    let status = "compared"
    if (!previousVersion) status = "no_previous_version"
    else if (!current) status = "current_unread"
    else if (!prior) status = "previous_unread"

    const changes = []
    if (status === "compared") {
      const currentByKey = new Map(current.keyPoints.map((point) => [point.point_key, comparisonPoint(point)]))
      const priorByKey = new Map(prior.keyPoints.map((point) => [point.point_key, comparisonPoint(point)]))
      const keys = new Set([...currentByKey.keys(), ...priorByKey.keys()])
      keys.forEach((pointKey) => {
        const currentPoint = currentByKey.get(pointKey) || null
        const priorPoint = priorByKey.get(pointKey) || null
        let changeType = "unchanged"
        if (!priorPoint) changeType = "added"
        else if (!currentPoint) changeType = "removed"
        else if (normalizedPointValue(currentPoint) !== normalizedPointValue(priorPoint)) changeType = "changed"
        changes.push({
          point_key: pointKey,
          label: currentPoint?.label || priorPoint?.label || pointKey.replace(/_/g, " "),
          change_type: changeType,
          previous: priorPoint,
          current: currentPoint,
        })
      })
      const priority = { changed: 0, added: 1, removed: 2, unchanged: 3 }
      changes.sort((left, right) => priority[left.change_type] - priority[right.change_type] || left.label.localeCompare(right.label))
    }
    const counts = changes.reduce(
      (totals, change) => ({ ...totals, [change.change_type]: totals[change.change_type] + 1 }),
      { changed: 0, added: 0, removed: 0, unchanged: 0 },
    )
    const reconfirmationNeeded = changes.filter(
      (change) =>
        change.change_type === "unchanged" &&
        change.previous?.review_status === "confirmed" &&
        change.current?.review_status !== "confirmed",
    ).length
    const differences = counts.changed + counts.added + counts.removed

    return {
      status,
      item: {
        id: item.id,
        kind: item.kind,
        category: item.category,
        title: item.title,
      },
      version: publicVersion(version),
      previous_version: publicVersion(previousVersion),
      current_analysis: analysisSummary(currentAnalysis),
      previous_analysis: analysisSummary(priorAnalysis),
      counts: {
        ...counts,
        differences,
        reconfirmation_needed: reconfirmationNeeded,
        review_needed: differences + reconfirmationNeeded,
      },
      changes,
    }
  }

  static async getCurrentAnalyses({ fundId, groupBy = "item" }) {
    await this.requireFund(fundId)
    const analyses = await FundRepositoryAnalysis.findAll({
      where: { portfolio_id: fundId },
      include: [
        { model: FundRepositoryItem, as: "item", where: { portfolio_id: fundId, is_archived: false } },
        { model: FundRepositoryVersion, as: "version", where: { is_archived: false } },
        { model: FundRepositoryKeyPoint, as: "keyPoints" },
      ],
      order: [["created_at", "DESC"]],
    })
    const latestAnalyses = new Map()
    analyses.forEach((analysisRecord) => {
      const analysis = publicAnalysis(analysisRecord)
      const item = asPlain(analysis.item)
      if (!item || item.current_version_id !== analysis.version_id) return
      const key = groupBy === "reader" ? `${analysis.item_id}:${analysis.reader_key}` : analysis.item_id
      if (latestAnalyses.has(key)) return
      latestAnalyses.set(key, analysis)
    })
    return Array.from(latestAnalyses.values())
  }

  static async getInsights({ fundId }) {
    return await this.getCurrentAnalyses({ fundId, groupBy: "item" })
  }

  static async getReadiness({ fundId }) {
    await this.requireFund(fundId)
    const items = (await FundRepositoryItem.findAll({
      where: { portfolio_id: fundId, is_archived: false },
      include: [{ model: FundRepositoryVersion, as: "currentVersion", where: { is_archived: false }, required: false }],
      order: [["updated_at", "DESC"]],
    })).map(asPlain)
    const currentAnalyses = await this.getCurrentAnalyses({ fundId, groupBy: "reader" })
    const sourceStates = new Map()
    const keyPointCounts = { confirmed: 0, suggested: 0, dismissed: 0 }
    const confirmedConflictCandidates = []

    currentAnalyses.forEach((analysis) => {
      const item = asPlain(analysis.item) || {}
      const version = asPlain(analysis.version) || {}
      if (!item.id) return
      const state = sourceStates.get(item.id) || {
        item,
        version,
        readerKeys: new Set(),
        statuses: new Set(),
        suggested: 0,
        confirmed: 0,
        dismissed: 0,
        issueCount: 0,
        latestAnalyzedAt: null,
      }
      state.readerKeys.add(analysis.reader_key)
      state.statuses.add(analysis.status)
      state.issueCount += Array.isArray(analysis.issues_json) ? analysis.issues_json.length : 0
      if (!state.latestAnalyzedAt || String(analysis.created_at || "") > String(state.latestAnalyzedAt || "")) {
        state.latestAnalyzedAt = analysis.created_at || null
      }
      ;(analysis.keyPoints || []).map(publicKeyPoint).filter(Boolean).forEach((point) => {
        if (Object.prototype.hasOwnProperty.call(keyPointCounts, point.review_status)) {
          keyPointCounts[point.review_status] += 1
          state[point.review_status] += 1
        }
        if (point.review_status === "confirmed") {
          confirmedConflictCandidates.push({ analysis, item, point })
        }
      })
      sourceStates.set(item.id, state)
    })

    const readableSources = items.filter((item) => item.currentVersion && RepositoryReaderRegistryService.supportsAutomaticAnalysis(item))
    const unreadSources = readableSources.filter((item) => !sourceStates.has(item.id))
    const readSources = readableSources.filter((item) => sourceStates.has(item.id))
    const reviewSources = Array.from(sourceStates.values())
      .filter((state) => state.suggested > 0 || state.issueCount > 0 || Array.from(state.statuses).some((status) => status !== "completed"))
      .sort((left, right) => (right.suggested - left.suggested) || (right.issueCount - left.issueCount))
    const conflicts = buildKnowledgeConflicts(confirmedConflictCandidates)
    const completionRatio = readableSources.length ? (readableSources.length - unreadSources.length) / readableSources.length : 1
    const reviewRatio = keyPointCounts.confirmed + keyPointCounts.suggested
      ? keyPointCounts.confirmed / (keyPointCounts.confirmed + keyPointCounts.suggested)
      : 1

    return {
      counts: {
        active_items: items.length,
        readable_sources: readableSources.length,
        read_sources: readSources.length,
        unread_sources: unreadSources.length,
        review_sources: reviewSources.length,
        confirmed_key_points: keyPointCounts.confirmed,
        suggested_key_points: keyPointCounts.suggested,
        dismissed_key_points: keyPointCounts.dismissed,
        conflicts: conflicts.length,
        readiness_score: Math.round(((completionRatio + reviewRatio) / 2) * 100),
      },
      unread_sources: unreadSources.slice(0, 10).map((item) => publicReadinessSource({ item, version: item.currentVersion })).filter(Boolean),
      review_sources: reviewSources.slice(0, 10).map((state) => publicReadinessSource({ item: state.item, version: state.version, state })).filter(Boolean),
      conflicts: conflicts.slice(0, 10),
    }
  }

  static async getKnowledgePack({ fundId, reviewStatus = "confirmed" }) {
    const status = normalizeKnowledgeFilter(reviewStatus)
    const insights = await this.getCurrentAnalyses({ fundId, groupBy: "reader" })
    const counts = { confirmed: 0, suggested: 0, dismissed: 0 }
    const sources = []
    const confirmedConflictCandidates = []

    insights.forEach((analysis) => {
      const item = asPlain(analysis.item) || {}
      const effectiveCategory = effectiveKnowledgeCategory({ item, analysis })
      const currentPoints = (analysis.keyPoints || []).map(publicKeyPoint).filter(Boolean)
      currentPoints.forEach((point) => {
        if (Object.prototype.hasOwnProperty.call(counts, point.review_status)) {
          counts[point.review_status] += 1
        }
        if (point.review_status === "confirmed") {
          confirmedConflictCandidates.push({ analysis, item, point })
        }
      })
      const selectedPoints =
        status === "all" ? currentPoints : currentPoints.filter((point) => point.review_status === status)
      if (!selectedPoints.length) return
      sources.push({
        item_id: analysis.item_id,
        version_id: analysis.version_id,
        reader_key: analysis.reader_key,
        reader_version: analysis.reader_version,
        analyzed_at: analysis.created_at,
        item: {
          id: item.id,
          kind: item.kind,
          category: item.category,
          effective_category: effectiveCategory,
          title: item.title,
          period_start: item.period_start || null,
          period_end: item.period_end || null,
        },
        key_points: selectedPoints.map((point) => ({
          id: point.id,
          point_key: point.point_key,
          label: point.label,
          value_text: point.value_text,
          value_json: point.value_json,
          source_reference: point.source_reference,
          confidence: point.confidence,
          review_status: point.review_status,
          reviewed_at: point.reviewed_at,
        })),
      })
    })
    const conflicts = buildKnowledgeConflicts(confirmedConflictCandidates)

    return {
      review_status: status,
      counts: {
        ...counts,
        current_sources: insights.length,
        selected_sources: sources.length,
        selected_key_points: sources.reduce((total, source) => total + source.key_points.length, 0),
        conflicts: conflicts.length,
      },
      sources,
      conflicts,
    }
  }

  static async getKeyPointIndex({ fundId, filters = {} }) {
    const normalizedFilters = normalizeKeyPointIndexFilters(filters)
    const insights = await this.getCurrentAnalyses({ fundId, groupBy: "reader" })
    const records = []

    insights.forEach((analysis) => {
      const item = asPlain(analysis.item) || {}
      const effectiveCategory = effectiveKnowledgeCategory({ item, analysis })
      ;(analysis.keyPoints || []).map(publicKeyPoint).filter(Boolean).forEach((point) => {
        records.push({
          id: point.id,
          analysis_id: analysis.id,
          item_id: analysis.item_id,
          version_id: analysis.version_id,
          reader_key: analysis.reader_key,
          reader_version: analysis.reader_version,
          analyzed_at: analysis.created_at,
          point_key: point.point_key,
          label: point.label,
          value_text: point.value_text,
          value_json: point.value_json,
          source_reference: point.source_reference,
          confidence: point.confidence,
          review_status: point.review_status,
          reviewed_at: point.reviewed_at,
          item: {
            id: item.id,
            kind: item.kind,
            category: item.category,
            effective_category: effectiveCategory,
            title: item.title,
            period_start: item.period_start || null,
            period_end: item.period_end || null,
          },
        })
      })
    })

    const filtered = records
      .filter((record) =>
        normalizedFilters.review_status === "all" ? true : record.review_status === normalizedFilters.review_status,
      )
      .filter((record) =>
        normalizedFilters.category
          ? record.item.category === normalizedFilters.category || record.item.effective_category === normalizedFilters.category
          : true,
      )
      .filter((record) => (normalizedFilters.reader_key ? record.reader_key === normalizedFilters.reader_key : true))
      .filter((record) => includesQuery(record, normalizedFilters.query))
      .sort((left, right) => {
        const statusPriority = { suggested: 0, confirmed: 1, dismissed: 2 }
        return (
          (statusPriority[left.review_status] ?? 3) - (statusPriority[right.review_status] ?? 3) ||
          String(left.item.title || "").localeCompare(String(right.item.title || "")) ||
          String(left.label || "").localeCompare(String(right.label || ""))
        )
      })

    return {
      filters: normalizedFilters,
      counts: {
        current_key_points: records.length,
        filtered_key_points: filtered.length,
        by_status: countBy(filtered, (record) => record.review_status),
        by_category: countBy(filtered, (record) => record.item.effective_category),
      },
      records: filtered.slice(0, normalizedFilters.limit),
    }
  }

  static async reviewKeyPoint({ fundId, keyPointId, actorId = null, fields }) {
    await this.requireFund(fundId)
    const keyPoint = await FundRepositoryKeyPoint.findOne({
      where: { id: keyPointId, portfolio_id: fundId },
    })
    if (!keyPoint) throw new AppError("Repository key point not found", 404)
    const before = publicKeyPoint(keyPoint)
    const reviewStatus = normalizeReviewStatus(fields.review_status)
    const updates = {
      review_status: reviewStatus,
      reviewed_by: reviewStatus === "suggested" ? null : actorId,
      reviewed_at: reviewStatus === "suggested" ? null : new Date(),
    }
    if (fields.value_text !== undefined) {
      updates.value_text = String(fields.value_text || "").trim() || null
      updates.value_json = inferKeyPointValueJson(updates.value_text)
    }
    await keyPoint.update(updates)
    const after = publicKeyPoint(keyPoint)
    await AuditService.logEvent({
      actorId,
      eventType: "repository_key_point_reviewed",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { key_point_id: keyPointId, analysis_id: before.analysis_id, review_status: reviewStatus },
      before,
      after,
    })
    return after
  }

  static async reviewVersionKeyPoints({ fundId, versionId, actorId = null, fields = {} }) {
    const { version, item } = await this.findOwnedVersion({ fundId, versionId, requireActive: false })
    const reviewStatus = normalizeReviewStatus(fields.review_status || "confirmed")
    if (reviewStatus === "suggested") {
      throw new AppError("Bulk review can only confirm or dismiss suggested key points", 400)
    }
    const fromStatus = fields.from_status === undefined ? "suggested" : normalizeReviewStatus(fields.from_status)
    if (fromStatus !== "suggested") {
      throw new AppError("Bulk review can only target suggested key points", 400)
    }
    const keyPoints = await FundRepositoryKeyPoint.findAll({
      where: {
        portfolio_id: fundId,
        version_id: version.id,
        review_status: "suggested",
      },
      order: [["created_at", "ASC"]],
    })
    const before = keyPoints.map(publicKeyPoint)
    const reviewedAt = new Date()
    const reviewed = []
    for (const keyPoint of keyPoints) {
      const point = publicKeyPoint(keyPoint)
      if (!point || point.review_status === reviewStatus) continue
      await keyPoint.update({
        review_status: reviewStatus,
        reviewed_by: actorId,
        reviewed_at: reviewedAt,
      })
      reviewed.push(publicKeyPoint(keyPoint))
    }

    await AuditService.logEvent({
      actorId,
      eventType: "repository_key_points_bulk_reviewed",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: {
        item_id: item.id,
        version_id: version.id,
        review_status: reviewStatus,
        from_status: fromStatus,
        reviewed_count: reviewed.length,
      },
      before,
      after: reviewed,
    })

    return {
      item: publicSuggestionItem(item),
      version: publicVersion(version),
      summary: {
        review_status: reviewStatus,
        from_status: fromStatus,
        matched: keyPoints.length,
        reviewed: reviewed.length,
      },
      key_points: reviewed,
    }
  }
}

module.exports = RepositoryAnalysisService
