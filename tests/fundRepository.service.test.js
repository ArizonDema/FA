const fs = require("fs")
const os = require("os")
const path = require("path")

const mockUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fund-repository-uploads-"))
process.env.UPLOAD_ROOT_DIR = mockUploadRoot

const mockItems = []
const mockVersions = []
const mockAuditLogEvent = jest.fn()
const mockAnalyzeIfSupported = jest.fn()

function plain(record) {
  return typeof record?.toJSON === "function" ? record.toJSON() : record
}

function makeItem(values) {
  return {
    ...values,
    async update(updates) {
      Object.assign(this, updates)
      return this
    },
    toJSON() {
      return {
        ...this,
        currentVersion: mockVersions.find((version) => version.id === this.current_version_id) || null,
        versions: mockVersions.filter((version) => version.item_id === this.id).sort((a, b) => b.version_number - a.version_number),
      }
    },
  }
}

function makeVersion(values) {
  return {
    ...values,
    toJSON() {
      return { ...this }
    },
  }
}

const mockModels = {
  Fund: { findByPk: jest.fn() },
  Portfolio: { findByPk: jest.fn() },
  FundRepositoryItem: {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
  FundRepositoryVersion: {
    create: jest.fn(),
    findOne: jest.fn(),
    max: jest.fn(),
  },
  AuditEvent: { findAll: jest.fn() },
  AuditLog: { findAll: jest.fn() },
}

jest.mock("../src/models", () => mockModels)
jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))
jest.mock("../src/modules/repository/services/repositoryAnalysis.service", () => ({
  analyzeIfSupported: (...args) => mockAnalyzeIfSupported(...args),
}))

const RepositoryService = require("../src/modules/repository/services/repository.service")

function makeUpload(name, content = "file-content") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fund-repository-source-"))
  const filePath = path.join(directory, name)
  fs.writeFileSync(filePath, content)
  return {
    originalname: name,
    path: filePath,
    size: Buffer.byteLength(content),
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}

describe("RepositoryService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockItems.length = 0
    mockVersions.length = 0
    mockModels.Fund.findByPk.mockResolvedValue({ id: "fund-1" })
    mockModels.FundRepositoryItem.create.mockImplementation(async (values) => {
      const item = makeItem({ id: `item-${mockItems.length + 1}`, ...values })
      mockItems.push(item)
      return item
    })
    mockModels.FundRepositoryItem.findOne.mockImplementation(async ({ where }) => {
      return (
        mockItems.find((item) => {
          if (where.id && item.id !== where.id) return false
          if (where.portfolio_id && item.portfolio_id !== where.portfolio_id) return false
          if (where.kind && item.kind !== where.kind) return false
          if (where.category && item.category !== where.category) return false
          if (where.period_start && item.period_start !== where.period_start) return false
          if (where.period_end && item.period_end !== where.period_end) return false
          if (where.is_archived !== undefined && item.is_archived !== where.is_archived) return false
          return true
        }) || null
      )
    })
    mockModels.FundRepositoryItem.findAll.mockResolvedValue(mockItems)
    mockModels.FundRepositoryVersion.max.mockImplementation(async (field, { where }) => {
      const versionNumbers = mockVersions.filter((version) => version.item_id === where.item_id).map((version) => version.version_number)
      return versionNumbers.length ? Math.max(...versionNumbers) : null
    })
    mockModels.FundRepositoryVersion.create.mockImplementation(async (values) => {
      const version = makeVersion({ id: `version-${mockVersions.length + 1}`, ...values })
      mockVersions.push(version)
      return version
    })
    mockModels.FundRepositoryVersion.findOne.mockImplementation(async ({ where, include }) => {
      const version = mockVersions.find((entry) => {
        if (where.id && entry.id !== where.id) return false
        if (where.item_id && entry.item_id !== where.item_id) return false
        if (where.sha256 && entry.sha256 !== where.sha256) return false
        if (where.is_archived !== undefined && entry.is_archived !== where.is_archived) return false
        return true
      })
      if (!version) return null
      if (!include) return version
      const item = mockItems.find((entry) => entry.id === version.item_id)
      const expected = include[0]?.where || {}
      if (!item || Object.entries(expected).some(([key, value]) => item[key] !== value)) return null
      return makeVersion({ ...plain(version), item: plain(item) })
    })
    mockModels.AuditEvent.findAll.mockResolvedValue([])
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockAnalyzeIfSupported.mockResolvedValue(null)
  })

  afterAll(() => {
    fs.rmSync(mockUploadRoot, { recursive: true, force: true })
  })

  test("creates a versioned data item and never returns its physical storage path", async () => {
    const item = await RepositoryService.createItem({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        kind: "dataset",
        category: "trial_balance",
        title: "FY 2026 Trial Balance",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
      },
      upload: makeUpload("trial_balance.xlsx"),
    })

    expect(item.currentVersion.version_number).toBe(1)
    expect(item.currentVersion.storage_path).toBeUndefined()
    expect(mockVersions[0].storage_path).toContain("repository")
    expect(fs.existsSync(mockVersions[0].storage_path)).toBe(true)
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "repository_item_created" }))
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "repository_version_uploaded" }))
  })

  test("rejects duplicate immutable versions for one repository item", async () => {
    const item = await RepositoryService.createItem({
      fundId: "fund-1",
      fields: { kind: "document", category: "lpa", title: "LPA" },
      upload: makeUpload("agreement.pdf", "identical"),
    })

    await expect(
      RepositoryService.addVersion({
        fundId: "fund-1",
        itemId: item.id,
        upload: makeUpload("agreement.pdf", "identical"),
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(mockVersions).toHaveLength(1)
    expect(mockAnalyzeIfSupported).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1", versionId: item.currentVersion.id }),
    )
  })

  test("resolves only active fund-owned TB or GL versions for report use", async () => {
    const item = await RepositoryService.createItem({
      fundId: "fund-1",
      fields: { kind: "dataset", category: "trial_balance", title: "TB" },
      upload: makeUpload("tb.xlsx"),
    })

    const selected = await RepositoryService.resolveRuntimeDatasetVersion({
      fundId: "fund-1",
      versionId: item.currentVersion.id,
      category: "trial_balance",
      actorId: "admin-1",
    })
    expect(selected.versionId).toBe(item.currentVersion.id)
    expect(selected.storagePath).toContain("repository")

    mockItems[0].is_archived = true
    await expect(
      RepositoryService.resolveRuntimeDatasetVersion({
        fundId: "fund-1",
        versionId: item.currentVersion.id,
        category: "trial_balance",
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test("restores historic versions and permits downloads only for the owning active fund", async () => {
    const item = await RepositoryService.createItem({
      fundId: "fund-1",
      fields: { kind: "document", category: "audit_report", title: "Audit Report" },
      upload: makeUpload("audit_v1.pdf", "one"),
    })
    const updated = await RepositoryService.addVersion({
      fundId: "fund-1",
      itemId: item.id,
      upload: makeUpload("audit_v2.pdf", "two"),
    })
    const restored = await RepositoryService.setCurrentVersion({
      fundId: "fund-1",
      itemId: item.id,
      versionId: updated.versions.find((version) => version.version_number === 1).id,
    })
    const download = await RepositoryService.resolveDownload({
      fundId: "fund-1",
      versionId: restored.current_version_id,
    })

    expect(restored.currentVersion.version_number).toBe(1)
    expect(download.fileName).toBe("audit_v1.pdf")
    await RepositoryService.updateItem({ fundId: "fund-1", itemId: item.id, fields: { is_archived: true } })
    await expect(
      RepositoryService.resolveDownload({ fundId: "fund-1", versionId: restored.current_version_id }),
    ).resolves.toEqual(expect.objectContaining({ fileName: "audit_v1.pdf" }))
    await expect(
      RepositoryService.resolveDownload({ fundId: "another-fund", versionId: restored.current_version_id }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  test("groups saved report inputs by fund, category, and period as new versions", async () => {
    await RepositoryService.saveRunDatasetUpload({
      fundId: "fund-1",
      actorId: "admin-1",
      category: "general_ledger",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      upload: makeUpload("gl_v1.xlsx", "version-one"),
    })
    await RepositoryService.saveRunDatasetUpload({
      fundId: "fund-1",
      actorId: "admin-1",
      category: "general_ledger",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      upload: makeUpload("gl_v2.xlsx", "version-two"),
    })

    expect(mockItems).toHaveLength(1)
    expect(mockVersions).toHaveLength(2)
    expect(mockItems[0].current_version_id).toBe("version-2")
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "repository_version_selected_for_report" }),
    )
  })

  test("reuses an exact historic run upload without replacing the current version", async () => {
    const original = await RepositoryService.saveRunDatasetUpload({
      fundId: "fund-1",
      actorId: "admin-1",
      category: "trial_balance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      upload: makeUpload("tb_v1.xlsx", "version-one"),
    })
    await RepositoryService.saveRunDatasetUpload({
      fundId: "fund-1",
      actorId: "admin-1",
      category: "trial_balance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      upload: makeUpload("tb_v2.xlsx", "version-two"),
    })
    const reused = await RepositoryService.saveRunDatasetUpload({
      fundId: "fund-1",
      actorId: "admin-1",
      category: "trial_balance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      upload: makeUpload("tb_original_again.xlsx", "version-one"),
    })

    expect(mockVersions).toHaveLength(2)
    expect(mockItems[0].current_version_id).toBe("version-2")
    expect(reused.versionId).toBe(original.versionId)
    expect(fs.readFileSync(reused.storagePath, "utf8")).toBe("version-one")
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "repository_version_selected_for_report",
        metadata: expect.objectContaining({ version_id: original.versionId, source: "saved_report_upload" }),
      }),
    )
  })
})
