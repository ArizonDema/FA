const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { Op } = require("sequelize")
const {
  Fund,
  Portfolio,
  FundRepositoryItem,
  FundRepositoryVersion,
  AuditEvent,
  AuditLog,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const StorageService = require("../../storage/services/storage.service")
const RepositoryAnalysisService = require("./repositoryAnalysis.service")

const FundModel = Fund || Portfolio
const AuditModel = AuditEvent || AuditLog
const MAX_RUNTIME_DATASET_BYTES = 20 * 1024 * 1024

const DOCUMENT_CATEGORIES = [
  "lpa",
  "ppm",
  "subscription_agreement",
  "financial_statement",
  "audit_report",
  "tax_document",
  "service_agreement",
  "other_document",
]

const DATASET_CATEGORIES = [
  "trial_balance",
  "general_ledger",
  "bank_statement",
  "valuation",
  "holdings_register",
  "investor_register",
  "other_dataset",
]

const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".md", ".png", ".jpg", ".jpeg"]
const DATASET_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"]
const REPORT_DATASET_CATEGORIES = ["trial_balance", "general_ledger"]

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function booleanValue(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value) === "1"
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean)
  }
  if (!value) return []
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parseTags(parsed)
    } catch (error) {
      void error
    }
    return value.split(",").map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

function publicVersion(versionRecord) {
  const version = asPlain(versionRecord)
  if (!version) return null
  const { storage_path: ignoredPath, ...safeVersion } = version
  void ignoredPath
  return safeVersion
}

function publicItem(itemRecord) {
  const item = asPlain(itemRecord)
  if (!item) return null
  return {
    ...item,
    currentVersion: publicVersion(item.currentVersion),
    versions: Array.isArray(item.versions) ? item.versions.map(publicVersion) : [],
  }
}

function itemInclude() {
  return [
    { model: FundRepositoryVersion, as: "currentVersion" },
    { model: FundRepositoryVersion, as: "versions", separate: true, order: [["version_number", "DESC"]] },
  ]
}

function categoryList(kind) {
  return kind === "document" ? DOCUMENT_CATEGORIES : DATASET_CATEGORIES
}

function validateMetadata({ kind, category, title, periodStart, periodEnd }) {
  if (!["document", "dataset"].includes(kind)) {
    throw new AppError("Repository kind must be document or dataset", 400)
  }
  if (!categoryList(kind).includes(category)) {
    throw new AppError(`Unsupported ${kind} category`, 400)
  }
  if (!String(title || "").trim()) {
    throw new AppError("Repository item title is required", 400)
  }
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) {
    throw new AppError("Provide both period_start and period_end, or neither", 400)
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new AppError("period_start cannot be after period_end", 400)
  }
}

function validateUpload({ kind, category, upload }) {
  if (!upload?.path) {
    throw new AppError("Repository file is required", 400)
  }
  const extension = path.extname(upload.originalname || "").toLowerCase()
  const allowedExtensions = kind === "document" ? DOCUMENT_EXTENSIONS : DATASET_EXTENSIONS
  if (!allowedExtensions.includes(extension)) {
    throw new AppError(`Unsupported file type. Allowed extensions: ${allowedExtensions.join(", ")}`, 400)
  }
  if (REPORT_DATASET_CATEGORIES.includes(category) && extension !== ".xlsx") {
    throw new AppError("Trial balance and general ledger datasets must be .xlsx files", 400)
  }
  const fileSize = Number(upload.size || fs.statSync(upload.path).size)
  if (REPORT_DATASET_CATEGORIES.includes(category) && fileSize > MAX_RUNTIME_DATASET_BYTES) {
    throw new AppError("Trial balance and general ledger files must be 20 MB or smaller", 400)
  }
  return { extension, fileSize }
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

class RepositoryService {
  static async requireFund(fundId) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) throw new AppError("Fund not found", 404)
    return fund
  }

  static async findOwnedItem(fundId, itemId) {
    const item = await FundRepositoryItem.findOne({
      where: { id: itemId, portfolio_id: fundId },
      include: itemInclude(),
    })
    if (!item) throw new AppError("Repository item not found", 404)
    return item
  }

  static async listItems({ fundId, filters = {} }) {
    await this.requireFund(fundId)
    const where = { portfolio_id: fundId }
    if (filters.kind) where.kind = filters.kind
    if (filters.category) where.category = filters.category
    if (filters.status === "active") where.is_archived = false
    if (filters.status === "archived") where.is_archived = true
    if (filters.period_start) where.period_start = { [Op.gte]: filters.period_start }
    if (filters.period_end) where.period_end = { [Op.lte]: filters.period_end }
    if (filters.search) {
      const like = `%${String(filters.search).trim()}%`
      where[Op.or] = [{ title: { [Op.like]: like } }, { description: { [Op.like]: like } }, { category: { [Op.like]: like } }]
    }

    const items = await FundRepositoryItem.findAll({
      where,
      include: itemInclude(),
      order: [["updated_at", "DESC"]],
    })
    return items.map(publicItem)
  }

  static async getSummary({ fundId }) {
    const items = await this.listItems({ fundId, filters: { status: "active" } })
    const documents = items.filter((item) => item.kind === "document")
    const datasets = items.filter((item) => item.kind === "dataset")
    const trialBalances = datasets.filter((item) => item.category === "trial_balance")
    const generalLedgers = datasets.filter((item) => item.category === "general_ledger")
    return {
      counts: {
        documents: documents.length,
        datasets: datasets.length,
        trial_balances: trialBalances.length,
        general_ledgers: generalLedgers.length,
      },
      latest_documents: documents.slice(0, 3),
      latest_datasets: datasets.slice(0, 3),
      trial_balances: trialBalances,
      general_ledgers: generalLedgers,
    }
  }

  static async createItem({ fundId, actorId = null, fields, upload }) {
    await this.requireFund(fundId)
    const kind = String(fields.kind || "").trim().toLowerCase()
    const category = String(fields.category || "").trim().toLowerCase()
    const title = String(fields.title || upload?.originalname || "").trim()
    const periodStart = fields.period_start || null
    const periodEnd = fields.period_end || null
    validateMetadata({ kind, category, title, periodStart, periodEnd })
    validateUpload({ kind, category, upload })

    const item = await FundRepositoryItem.create({
      portfolio_id: fundId,
      kind,
      category,
      title,
      description: String(fields.description || "").trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      tags_json: parseTags(fields.tags),
      is_archived: false,
      created_by: actorId,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "repository_item_created",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: item.id, kind, category },
      after: publicItem(item),
    })

    return await this.addVersion({
      fundId,
      itemId: item.id,
      actorId,
      fields: { notes: fields.notes },
      upload,
    })
  }

  static async addVersion({ fundId, itemId, actorId = null, fields = {}, upload, reuseDuplicate = false }) {
    const item = await this.findOwnedItem(fundId, itemId)
    const itemData = asPlain(item)
    if (itemData.is_archived) {
      StorageService.removeFileSilently(upload?.path)
      throw new AppError("Archived repository items cannot receive new versions", 400)
    }
    const { extension, fileSize } = validateUpload({ kind: itemData.kind, category: itemData.category, upload })
    const hash = sha256(upload.path)
    const duplicate = await FundRepositoryVersion.findOne({ where: { item_id: itemId, sha256: hash } })
    if (duplicate) {
      StorageService.removeFileSilently(upload.path)
      if (reuseDuplicate) {
        const currentItem = await this.findOwnedItem(fundId, itemId).then(publicItem)
        return { ...currentItem, selectedVersion: publicVersion(duplicate) }
      }
      throw new AppError("This exact file version is already stored for the repository item", 409)
    }

    const maxVersion = (await FundRepositoryVersion.max("version_number", { where: { item_id: itemId } })) || 0
    const versionNumber = Number(maxVersion) + 1
    const fileName = `${versionNumber}_${StorageService.sanitizeFileName(upload.originalname, "repository_file")}`
    const storagePath = StorageService.getNamespacePath("repository", fundId, itemId, fileName)
    StorageService.moveFile(upload.path, storagePath)
    const version = await FundRepositoryVersion.create({
      item_id: itemId,
      version_number: versionNumber,
      original_file_name: upload.originalname,
      storage_path: storagePath,
      mime_type: upload.mimetype || null,
      extension,
      file_size: fileSize,
      sha256: hash,
      notes: String(fields.notes || "").trim() || null,
      is_archived: false,
      uploaded_by: actorId,
      uploaded_at: new Date(),
    })
    await item.update({ current_version_id: version.id })

    await AuditService.logEvent({
      actorId,
      eventType: "repository_version_uploaded",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: itemId, version_id: version.id, version_number: versionNumber },
      after: publicVersion(version),
    })

    const updated = await this.findOwnedItem(fundId, itemId).then(publicItem)
    try {
      await RepositoryAnalysisService.analyzeIfSupported({
        fundId,
        versionId: version.id,
        item: itemData,
        actorId,
      })
    } catch (error) {
      await AuditService.logEvent({
        actorId,
        eventType: "repository_analysis_failed",
        entityType: "fund_repository",
        entityId: fundId,
        metadata: { item_id: itemId, version_id: version.id, message: String(error.message || "Analysis failed") },
      })
    }
    return updated
  }

  static async updateItem({ fundId, itemId, actorId = null, fields }) {
    const item = await this.findOwnedItem(fundId, itemId)
    const before = publicItem(item)
    const current = asPlain(item)
    const periodStart = fields.period_start === undefined ? current.period_start : fields.period_start || null
    const periodEnd = fields.period_end === undefined ? current.period_end : fields.period_end || null
    validateMetadata({
      kind: current.kind,
      category: current.category,
      title: fields.title === undefined ? current.title : fields.title,
      periodStart,
      periodEnd,
    })
    const updates = {
      title: fields.title === undefined ? current.title : String(fields.title).trim(),
      description: fields.description === undefined ? current.description : String(fields.description || "").trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      tags_json: fields.tags === undefined ? current.tags_json : parseTags(fields.tags),
      is_archived: fields.is_archived === undefined ? current.is_archived : booleanValue(fields.is_archived),
    }
    await item.update(updates)
    const updated = await this.findOwnedItem(fundId, itemId)
    await AuditService.logEvent({
      actorId,
      eventType: updates.is_archived !== Boolean(current.is_archived) ? "repository_archive_changed" : "repository_item_updated",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: itemId },
      before,
      after: publicItem(updated),
    })
    return publicItem(updated)
  }

  static async setCurrentVersion({ fundId, itemId, versionId, actorId = null }) {
    const item = await this.findOwnedItem(fundId, itemId)
    if (asPlain(item).is_archived) throw new AppError("Archived repository items cannot be changed", 400)
    const version = await FundRepositoryVersion.findOne({ where: { id: versionId, item_id: itemId, is_archived: false } })
    if (!version) throw new AppError("Repository version not found", 404)
    const beforeVersionId = asPlain(item).current_version_id || null
    await item.update({ current_version_id: versionId })
    const updated = await this.findOwnedItem(fundId, itemId)
    await AuditService.logEvent({
      actorId,
      eventType: "repository_current_version_changed",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: itemId, from_version_id: beforeVersionId, version_id: versionId },
    })
    return publicItem(updated)
  }

  static async resolveDownload({ fundId, versionId, actorId = null }) {
    const version = await FundRepositoryVersion.findOne({
      where: { id: versionId },
      include: [{ model: FundRepositoryItem, as: "item", where: { portfolio_id: fundId } }],
    })
    const data = asPlain(version)
    const item = asPlain(data?.item)
    if (!version || !item || data.is_archived) {
      throw new AppError("Repository file not found", 404)
    }
    if (!StorageService.fileExists(data.storage_path)) {
      throw new AppError("Repository file is missing from storage", 404)
    }
    await AuditService.logEvent({
      actorId,
      eventType: "repository_version_downloaded",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: item.id, version_id: data.id },
    })
    return { filePath: data.storage_path, fileName: data.original_file_name }
  }

  static async resolveRuntimeDatasetVersion({ fundId, versionId, category, actorId = null }) {
    const version = await FundRepositoryVersion.findOne({
      where: { id: versionId, is_archived: false },
      include: [{ model: FundRepositoryItem, as: "item", where: { portfolio_id: fundId, kind: "dataset", category, is_archived: false } }],
    })
    const data = asPlain(version)
    const item = asPlain(data?.item)
    if (!version || !item) throw new AppError(`Stored ${category.replace(/_/g, " ")} version is not available for this fund`, 400)
    if (data.extension !== ".xlsx") throw new AppError("Stored report datasets must be .xlsx files", 400)
    if (!StorageService.fileExists(data.storage_path)) throw new AppError("Stored report dataset file is missing", 400)
    await AuditService.logEvent({
      actorId,
      eventType: "repository_version_selected_for_report",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: item.id, version_id: data.id, category },
    })
    return {
      itemId: item.id,
      versionId: data.id,
      sha256: data.sha256,
      originalName: data.original_file_name,
      storagePath: data.storage_path,
    }
  }

  static async saveRunDatasetUpload({ fundId, actorId = null, category, periodStart, periodEnd, upload }) {
    const title = `${category === "trial_balance" ? "Trial Balance" : "General Ledger"} - ${periodStart} to ${periodEnd}`
    const existing = await FundRepositoryItem.findOne({
      where: {
        portfolio_id: fundId,
        kind: "dataset",
        category,
        period_start: periodStart,
        period_end: periodEnd,
        is_archived: false,
      },
    })
    const item = existing
      ? await this.addVersion({ fundId, itemId: existing.id, actorId, upload, reuseDuplicate: true })
      : await this.createItem({
          fundId,
          actorId,
          fields: { kind: "dataset", category, title, period_start: periodStart, period_end: periodEnd },
          upload,
        })
    const current = item.selectedVersion || item.currentVersion || item.versions?.[0]
    const storagePath = await this.getInternalVersionPath({ fundId, itemId: item.id, versionId: current.id })
    await AuditService.logEvent({
      actorId,
      eventType: "repository_version_selected_for_report",
      entityType: "fund_repository",
      entityId: fundId,
      metadata: { item_id: item.id, version_id: current.id, category, source: "saved_report_upload" },
    })
    return {
      itemId: item.id,
      versionId: current.id,
      sha256: current.sha256,
      originalName: current.original_file_name,
      storagePath,
    }
  }

  static async getInternalVersionPath({ fundId, itemId, versionId }) {
    const version = await FundRepositoryVersion.findOne({
      where: { id: versionId, item_id: itemId },
      include: [{ model: FundRepositoryItem, as: "item", where: { portfolio_id: fundId } }],
    })
    const data = asPlain(version)
    if (!data?.storage_path) throw new AppError("Repository file not found", 404)
    return data.storage_path
  }

  static async getActivity({ fundId }) {
    await this.requireFund(fundId)
    const events = await AuditModel.findAll({
      where: { entity_type: "fund_repository", entity_id: fundId },
      order: [["created_at", "DESC"]],
      limit: 100,
    })
    return events.map(asPlain)
  }
}

RepositoryService.DOCUMENT_CATEGORIES = DOCUMENT_CATEGORIES
RepositoryService.DATASET_CATEGORIES = DATASET_CATEGORIES
RepositoryService.REPORT_DATASET_CATEGORIES = REPORT_DATASET_CATEGORIES

module.exports = RepositoryService
