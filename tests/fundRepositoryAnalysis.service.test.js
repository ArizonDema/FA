const fs = require("fs")
const os = require("os")
const path = require("path")

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repository-analysis-tests-"))
const storedFile = path.join(tempDir, "agreement.txt")
fs.writeFileSync(storedFile, "Agreement text")

const mockAuditLogEvent = jest.fn()
const mockSourceRead = jest.fn()
const mockReaderAnalyze = jest.fn()
const mockResolveWithMetadata = jest.fn()
const mockSupportsAutomaticAnalysis = jest.fn()
const mockAnalyses = []
const mockPoints = []

function modelRecord(values) {
  return {
    ...values,
    async update(updates) {
      Object.assign(this, updates)
      return this
    },
    toJSON() {
      return { ...this }
    },
  }
}

const item = { id: "item-1", portfolio_id: "fund-1", category: "lpa", is_archived: false, current_version_id: "version-1" }
const version = { id: "version-1", item_id: "item-1", extension: ".txt", storage_path: storedFile, is_archived: false, item }
const mockModels = {
  Fund: { findByPk: jest.fn() },
  Portfolio: { findByPk: jest.fn() },
  FundRepositoryItem: { findAll: jest.fn() },
  FundRepositoryVersion: { findOne: jest.fn(), findAll: jest.fn() },
  FundRepositoryAnalysis: { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  FundRepositoryKeyPoint: { bulkCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
}

jest.mock("../src/models", () => mockModels)
jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))
jest.mock("../src/modules/repository/services/repositorySourceReader.service", () => ({
  read: (...args) => mockSourceRead(...args),
}))
jest.mock("../src/modules/repository/services/repositoryReaderRegistry.service", () => ({
  resolve: () => ({ key: "lpa", version: "lpa.v1", analyze: (...args) => mockReaderAnalyze(...args) }),
  resolveWithMetadata: (...args) => mockResolveWithMetadata(...args),
  readerInfo: (readerKey) => ({
    key: readerKey,
    label: readerKey === "lpa" ? "Limited Partnership Agreement" : String(readerKey || "").replace(/_/g, " "),
    version: `${readerKey}.v1`,
  }),
  supportsAutomaticAnalysis: (...args) => mockSupportsAutomaticAnalysis(...args),
  availableReaders: () => [{ key: "lpa", label: "Limited Partnership Agreement", version: "lpa.v1" }],
}))

const RepositoryAnalysisService = require("../src/modules/repository/services/repositoryAnalysis.service")

describe("RepositoryAnalysisService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAnalyses.length = 0
    mockPoints.length = 0
    mockModels.Fund.findByPk.mockResolvedValue({ id: "fund-1" })
    mockModels.FundRepositoryItem.findAll.mockResolvedValue([])
    mockModels.FundRepositoryVersion.findOne.mockResolvedValue(modelRecord(version))
    mockModels.FundRepositoryVersion.findAll.mockResolvedValue([modelRecord({ ...version, version_number: 1 })])
    mockModels.FundRepositoryAnalysis.create.mockImplementation(async (values) => {
      const analysis = modelRecord({ id: `analysis-${mockAnalyses.length + 1}`, ...values })
      mockAnalyses.push(analysis)
      return analysis
    })
    mockModels.FundRepositoryAnalysis.findAll.mockImplementation(async () =>
      mockAnalyses.map((analysis) =>
        modelRecord({
          ...analysis.toJSON(),
          item,
          version,
          keyPoints: mockPoints,
        }),
      ),
    )
    mockModels.FundRepositoryAnalysis.findOne.mockImplementation(async ({ where } = {}) => {
      const analysis = [...mockAnalyses].reverse().find((entry) => {
        const data = entry.toJSON()
        if (where?.portfolio_id && data.portfolio_id !== where.portfolio_id) return false
        if (where?.item_id && data.item_id !== where.item_id) return false
        if (where?.version_id && data.version_id !== where.version_id) return false
        return true
      })
      if (!analysis) return null
      const data = analysis.toJSON()
      return modelRecord({
        ...data,
        item,
        version,
        keyPoints: mockPoints.filter((point) => point.analysis_id === data.id),
      })
    })
    mockModels.FundRepositoryKeyPoint.bulkCreate.mockImplementation(async (values) => {
      const points = values.map((value, index) => modelRecord({ id: `point-${index + 1}`, ...value }))
      mockPoints.push(...points)
      return points
    })
    mockModels.FundRepositoryKeyPoint.findAll.mockImplementation(async ({ where } = {}) =>
      mockPoints.filter((pointRecord) => {
        const point = pointRecord.toJSON()
        if (where?.id && point.id !== where.id) return false
        if (where?.portfolio_id && point.portfolio_id !== where.portfolio_id) return false
        if (where?.item_id && point.item_id !== where.item_id) return false
        if (where?.version_id && point.version_id !== where.version_id) return false
        if (where?.review_status && point.review_status !== where.review_status) return false
        return true
      }),
    )
    mockModels.FundRepositoryKeyPoint.findOne.mockImplementation(async ({ where } = {}) =>
      mockPoints.find((pointRecord) => {
        const point = pointRecord.toJSON()
        if (where?.id && point.id !== where.id) return false
        if (where?.portfolio_id && point.portfolio_id !== where.portfolio_id) return false
        if (where?.item_id && point.item_id !== where.item_id) return false
        if (where?.version_id && point.version_id !== where.version_id) return false
        if (where?.point_key && point.point_key !== where.point_key) return false
        return true
      }) || null,
    )
    mockSourceRead.mockResolvedValue({
      status: "ready",
      format: "txt",
      extraction_method: "plain_text",
      text: "Management Fee: 2%",
      issues: [],
    })
    mockResolveWithMetadata.mockReturnValue({
      reader: { key: "lpa", version: "lpa.v1" },
      reader_key: "lpa",
      selection_type: "category",
      category_reader_key: "lpa",
      inferred_reader_key: null,
    })
    mockSupportsAutomaticAnalysis.mockImplementation((record) =>
      record?.kind === "document" ||
      ["bank_statement", "valuation", "investor_register", "holdings_register", "other_dataset"].includes(record?.category),
    )
    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "Found one term.",
      confidence: 0.9,
      key_points: [{ point_key: "management_fee", label: "Management Fee", value_text: "2%", value_json: { parsed: 2 }, confidence: 0.9 }],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "Management Fee: 2%",
    })
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("returns the available repository reader catalog for a fund", async () => {
    const readers = await RepositoryAnalysisService.getReaderCatalog({ fundId: "fund-1" })

    expect(readers).toEqual([
      expect.objectContaining({ key: "lpa", label: "Limited Partnership Agreement", version: "lpa.v1" }),
    ])
    expect(mockModels.Fund.findByPk).toHaveBeenCalledWith("fund-1")
  })

  test("suggests a reader for a stored version without creating analysis records", async () => {
    mockResolveWithMetadata.mockReturnValueOnce({
      reader: { key: "management_fee_statement", version: "management-fee-statement.v1" },
      reader_key: "management_fee_statement",
      selection_type: "inferred",
      category_reader_key: null,
      inferred_reader_key: "management_fee_statement",
    })

    const suggestion = await RepositoryAnalysisService.suggestReaderForVersion({
      fundId: "fund-1",
      versionId: "version-1",
    })

    expect(suggestion).toEqual(
      expect.objectContaining({
        status: "suggested",
        reader_key: "management_fee_statement",
        reader_version: "management-fee-statement.v1",
        selection_type: "inferred",
        inferred_reader_key: "management_fee_statement",
        source_format: "txt",
        extraction_method: "plain_text",
      }),
    )
    expect(suggestion.reader).toEqual(expect.objectContaining({ key: "management_fee_statement" }))
    expect(suggestion.version.storage_path).toBeUndefined()
    expect(mockModels.FundRepositoryAnalysis.create).not.toHaveBeenCalled()
    expect(mockModels.FundRepositoryKeyPoint.bulkCreate).not.toHaveBeenCalled()
  })

  test("returns reader extraction requirements when a stored version is not machine-readable", async () => {
    mockSourceRead.mockResolvedValueOnce({
      status: "requires_reader",
      format: "pdf",
      extraction_method: "pdf_parse",
      text: "",
      issues: [{ code: "pdf_text_not_detected", message: "No searchable text was found." }],
    })

    const suggestion = await RepositoryAnalysisService.suggestReaderForVersion({
      fundId: "fund-1",
      versionId: "version-1",
    })

    expect(suggestion).toEqual(
      expect.objectContaining({
        status: "requires_reader",
        reader_key: null,
        reader: null,
        selection_type: "unreadable",
        source_format: "pdf",
      }),
    )
    expect(suggestion.issues[0]).toEqual(expect.objectContaining({ code: "pdf_text_not_detected" }))
    expect(mockResolveWithMetadata).not.toHaveBeenCalled()
  })

  test("persists reader analysis, key points, and audit evidence", async () => {
    const analysis = await RepositoryAnalysisService.analyzeVersion({
      fundId: "fund-1",
      versionId: "version-1",
      actorId: "admin-1",
    })

    expect(analysis.status).toBe("completed")
    expect(analysis.keyPoints[0].value_text).toBe("2%")
    expect(mockModels.FundRepositoryKeyPoint.bulkCreate).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "repository_version_analyzed", entityId: "fund-1" }),
    )
  })

  test("bulk reads unread current repository sources while skipping unsupported and already-read versions", async () => {
    const tbVersion = {
      id: "version-tb",
      item_id: "item-tb",
      extension: ".xlsx",
      storage_path: "C:\\private\\tb.xlsx",
      is_archived: false,
    }
    const existingVersion = {
      id: "version-existing",
      item_id: "item-existing",
      extension: ".txt",
      storage_path: "C:\\private\\existing.txt",
      is_archived: false,
    }
    mockModels.FundRepositoryItem.findAll.mockResolvedValueOnce([
      modelRecord({
        ...item,
        kind: "document",
        category: "other_document",
        title: "Management Fee Statement",
        currentVersion: version,
      }),
      modelRecord({
        id: "item-tb",
        portfolio_id: "fund-1",
        kind: "dataset",
        category: "trial_balance",
        title: "Trial Balance",
        current_version_id: "version-tb",
        currentVersion: tbVersion,
      }),
      modelRecord({
        id: "item-existing",
        portfolio_id: "fund-1",
        kind: "document",
        category: "lpa",
        title: "Existing LPA",
        current_version_id: "version-existing",
        currentVersion: existingVersion,
      }),
    ])
    mockAnalyses.push(modelRecord({
      id: "analysis-existing",
      portfolio_id: "fund-1",
      item_id: "item-existing",
      version_id: "version-existing",
      reader_key: "lpa",
      reader_version: "lpa.v1",
      status: "completed",
      created_at: "2026-05-29T12:00:00.000Z",
    }))

    const batch = await RepositoryAnalysisService.analyzeCurrentVersions({
      fundId: "fund-1",
      actorId: "admin-1",
    })

    expect(batch.summary).toEqual({
      current_sources: 3,
      analyzed: 1,
      skipped_existing: 1,
      skipped_unsupported: 1,
      skipped_missing_version: 0,
      failed: 0,
    })
    expect(batch.results.map((result) => result.status)).toEqual(
      expect.arrayContaining(["analyzed", "skipped_unsupported", "skipped_existing"]),
    )
    expect(mockModels.FundRepositoryKeyPoint.bulkCreate).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "repository_bulk_analysis_completed",
        metadata: expect.objectContaining({ analyzed: 1, skipped_existing: 1, skipped_unsupported: 1 }),
      }),
    )
  })

  test("stores normalized typed values for extracted and corrected key points", async () => {
    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "Found typed facts.",
      confidence: 0.9,
      key_points: [
        { point_key: "net_asset_value", label: "Net Asset Value", value_text: "USD 1,750,000.00", confidence: 0.9 },
        { point_key: "management_fee", label: "Management Fee", value_text: "1.75%", confidence: 0.9 },
        { point_key: "valuation_date", label: "Valuation Date", value_text: "March 31, 2026", confidence: 0.9 },
        { point_key: "holder_count", label: "Holder Count", value_text: "42", confidence: 0.9 },
        { point_key: "existing_structured", label: "Existing Structured", value_text: "Class A", value_json: { type: "custom", code: "A" } },
      ],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "Typed facts.",
    })

    const analysis = await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    const byKey = Object.fromEntries(analysis.keyPoints.map((point) => [point.point_key, point]))

    expect(byKey.net_asset_value.value_json).toEqual({ type: "money", amount: 1750000, currency: "USD" })
    expect(byKey.management_fee.value_json).toEqual({ type: "percent", value: 1.75 })
    expect(byKey.valuation_date.value_json).toEqual({ type: "date", value: "2026-03-31" })
    expect(byKey.holder_count.value_json).toEqual({ type: "number", value: 42 })
    expect(byKey.existing_structured.value_json).toEqual({ type: "custom", code: "A" })

    const corrected = await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-2",
      actorId: "admin-1",
      fields: { review_status: "confirmed", value_text: "2.00%" },
    })
    expect(corrected.value_json).toEqual({ type: "percent", value: 2 })
  })

  test("stores an explicit pending-reader result when source extraction is unavailable", async () => {
    mockSourceRead.mockResolvedValue({
      status: "requires_reader",
      format: "pdf",
      extraction_method: null,
      text: "",
      issues: [{ code: "pdf_reader_unavailable", message: "PDF reader missing." }],
    })

    const analysis = await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })

    expect(analysis.status).toBe("requires_reader")
    expect(analysis.issues_json[0].code).toBe("pdf_reader_unavailable")
    expect(mockModels.FundRepositoryKeyPoint.bulkCreate).not.toHaveBeenCalled()
  })

  test("returns current insights without physical repository storage paths", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    const insights = await RepositoryAnalysisService.getInsights({ fundId: "fund-1" })

    expect(insights).toHaveLength(1)
    expect(insights[0].version.storage_path).toBeUndefined()
    expect(insights[0].keyPoints[0].point_key).toBe("management_fee")
  })

  test("summarizes repository readiness without leaking physical storage paths", async () => {
    const lpaItem = {
      id: "item-lpa",
      portfolio_id: "fund-1",
      kind: "document",
      category: "lpa",
      title: "Executed LPA",
      is_archived: false,
      current_version_id: "version-lpa",
      currentVersion: { id: "version-lpa", item_id: "item-lpa", storage_path: "C:\\private\\lpa.pdf", is_archived: false },
    }
    const ppmItem = {
      id: "item-ppm",
      portfolio_id: "fund-1",
      kind: "document",
      category: "ppm",
      title: "Offering Memorandum",
      is_archived: false,
      current_version_id: "version-ppm",
      currentVersion: { id: "version-ppm", item_id: "item-ppm", storage_path: "C:\\private\\ppm.pdf", is_archived: false },
    }
    const trialBalanceItem = {
      id: "item-tb",
      portfolio_id: "fund-1",
      kind: "dataset",
      category: "trial_balance",
      title: "Q1 Trial Balance",
      is_archived: false,
      current_version_id: "version-tb",
      currentVersion: { id: "version-tb", item_id: "item-tb", storage_path: "C:\\private\\tb.xlsx", is_archived: false },
    }
    mockModels.FundRepositoryItem.findAll.mockResolvedValueOnce([
      modelRecord(lpaItem),
      modelRecord(ppmItem),
      modelRecord(trialBalanceItem),
    ])
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-lpa",
        portfolio_id: "fund-1",
        item_id: "item-lpa",
        version_id: "version-lpa",
        reader_key: "lpa",
        reader_version: "lpa.v1",
        status: "partial",
        issues_json: [{ code: "low_confidence", message: "Needs admin review." }],
        created_at: "2026-05-29T12:00:00.000Z",
        item: lpaItem,
        version: lpaItem.currentVersion,
        keyPoints: [
          {
            id: "point-confirmed",
            point_key: "management_fee",
            label: "Management Fee",
            value_text: "2.00%",
            review_status: "confirmed",
          },
          {
            id: "point-suggested",
            point_key: "fund_term",
            label: "Fund Term",
            value_text: "10 years",
            review_status: "suggested",
          },
        ],
      }),
    ])

    const readiness = await RepositoryAnalysisService.getReadiness({ fundId: "fund-1" })

    expect(readiness.counts).toEqual({
      active_items: 3,
      readable_sources: 2,
      read_sources: 1,
      unread_sources: 1,
      review_sources: 1,
      confirmed_key_points: 1,
      suggested_key_points: 1,
      dismissed_key_points: 0,
      conflicts: 0,
      readiness_score: 50,
    })
    expect(readiness.unread_sources[0].item).toEqual(expect.objectContaining({ id: "item-ppm", title: "Offering Memorandum" }))
    expect(readiness.review_sources[0]).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({ id: "item-lpa" }),
        reader_keys: ["lpa"],
        status: "partial",
        suggested_key_points: 1,
        confirmed_key_points: 1,
        issue_count: 1,
      }),
    )
    expect(JSON.stringify(readiness)).not.toContain("storage_path")
    expect(JSON.stringify(readiness)).not.toContain("C:\\\\private")
  })

  test("returns immutable version reading history with facts but without physical storage paths", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })

    const analyses = await RepositoryAnalysisService.getVersionAnalyses({
      fundId: "fund-1",
      versionId: "version-1",
    })

    expect(analyses[0].version.storage_path).toBeUndefined()
    expect(analyses[0].keyPoints[0]).toEqual(
      expect.objectContaining({ point_key: "management_fee", value_text: "2%" }),
    )
  })

  test("compares new and prior version facts without carrying prior approvals to the new version", async () => {
    const comparisonItem = { ...item, current_version_id: "version-2" }
    const previousVersion = {
      ...version,
      id: "version-1",
      version_number: 1,
      storage_path: "C:\\private\\agreement-v1.txt",
      item: comparisonItem,
    }
    const currentVersion = {
      ...version,
      id: "version-2",
      version_number: 2,
      storage_path: "C:\\private\\agreement-v2.txt",
      item: comparisonItem,
    }
    mockModels.FundRepositoryVersion.findOne.mockResolvedValueOnce(modelRecord(currentVersion))
    mockModels.FundRepositoryVersion.findAll.mockResolvedValueOnce([
      modelRecord(currentVersion),
      modelRecord(previousVersion),
    ])
    mockModels.FundRepositoryAnalysis.findOne
      .mockResolvedValueOnce(
        modelRecord({
          id: "analysis-current",
          reader_key: "lpa",
          reader_version: "lpa.v1",
          status: "completed",
          version: currentVersion,
          keyPoints: [
            { point_key: "management_fee", label: "Management Fee", value_text: "1.75%", review_status: "suggested" },
            { point_key: "fund_term", label: "Fund Term", value_text: "10 years", review_status: "suggested" },
            { point_key: "extension", label: "Extension", value_text: "2 years", review_status: "suggested" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelRecord({
          id: "analysis-prior",
          reader_key: "lpa",
          reader_version: "lpa.v1",
          status: "completed",
          version: previousVersion,
          keyPoints: [
            { point_key: "management_fee", label: "Management Fee", value_text: "2.00%", review_status: "confirmed" },
            { point_key: "fund_term", label: "Fund Term", value_text: "10 years", review_status: "confirmed" },
            { point_key: "audit_requirement", label: "Audit Requirement", value_text: "Annual audit", review_status: "confirmed" },
          ],
        }),
      )

    const comparison = await RepositoryAnalysisService.getVersionComparison({
      fundId: "fund-1",
      itemId: "item-1",
      versionId: "version-2",
    })

    expect(comparison.status).toBe("compared")
    expect(comparison.counts).toEqual({
      changed: 1,
      added: 1,
      removed: 1,
      unchanged: 1,
      differences: 3,
      reconfirmation_needed: 1,
      review_needed: 4,
    })
    expect(comparison.version.storage_path).toBeUndefined()
    expect(comparison.previous_version.storage_path).toBeUndefined()
    expect(comparison.changes.find((change) => change.point_key === "management_fee")).toEqual(
      expect.objectContaining({
        change_type: "changed",
        previous: expect.objectContaining({ value_text: "2.00%", review_status: "confirmed" }),
        current: expect.objectContaining({ value_text: "1.75%", review_status: "suggested" }),
      }),
    )
  })

  test("builds a confirmed current-version knowledge pack for downstream reporting context", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-1",
      actorId: "admin-1",
      fields: { review_status: "confirmed", value_text: "1.75%" },
    })

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.review_status).toBe("confirmed")
    expect(knowledge.counts).toEqual(expect.objectContaining({ confirmed: 1, selected_key_points: 1, conflicts: 0 }))
    expect(knowledge.conflicts).toEqual([])
    expect(knowledge.sources[0]).toEqual(
      expect.objectContaining({
        version_id: "version-1",
        key_points: [expect.objectContaining({ point_key: "management_fee", value_text: "1.75%" })],
      }),
    )
    expect(knowledge.sources[0].storage_path).toBeUndefined()
    expect(knowledge.sources[0].source_text_excerpt).toBeUndefined()
  })

  test("builds a searchable current-version key point index without storage paths", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-current",
        item_id: "item-current",
        version_id: "version-current",
        reader_key: "lpa",
        reader_version: "lpa.v1",
        created_at: "2026-05-25T12:00:00.000Z",
        item: {
          id: "item-current",
          kind: "document",
          category: "lpa",
          title: "Current LPA",
          current_version_id: "version-current",
        },
        version: { id: "version-current", storage_path: "C:\\private\\current-lpa.pdf" },
        keyPoints: [
          {
            id: "point-current-1",
            point_key: "management_fee",
            label: "Management Fee",
            value_text: "1.75%",
            source_reference: "Clause 6.1",
            review_status: "confirmed",
          },
          {
            id: "point-current-2",
            point_key: "carried_interest",
            label: "Carried Interest",
            value_text: "20%",
            review_status: "suggested",
          },
        ],
      }),
      modelRecord({
        id: "analysis-old",
        item_id: "item-old",
        version_id: "version-old",
        reader_key: "ppm",
        reader_version: "ppm.v1",
        created_at: "2026-05-24T12:00:00.000Z",
        item: {
          id: "item-old",
          kind: "document",
          category: "ppm",
          title: "Old PPM Version",
          current_version_id: "version-new",
        },
        version: { id: "version-old", storage_path: "C:\\private\\old-ppm.pdf" },
        keyPoints: [{
          id: "point-old-1",
          point_key: "management_fee",
          label: "Management Fee",
          value_text: "2.00%",
          review_status: "confirmed",
        }],
      }),
    ])

    const index = await RepositoryAnalysisService.getKeyPointIndex({
      fundId: "fund-1",
      filters: { status: "confirmed", search: "fee", category: "lpa" },
    })

    expect(index.counts).toEqual(
      expect.objectContaining({
        current_key_points: 2,
        filtered_key_points: 1,
        by_status: { confirmed: 1 },
        by_category: { lpa: 1 },
      }),
    )
    expect(index.records).toEqual([
      expect.objectContaining({
        id: "point-current-1",
        point_key: "management_fee",
        value_text: "1.75%",
        item: expect.objectContaining({ title: "Current LPA", effective_category: "lpa" }),
      }),
    ])
    expect(JSON.stringify(index)).not.toContain("storage_path")
    expect(JSON.stringify(index)).not.toContain("C:\\\\private")
    expect(JSON.stringify(index)).not.toContain("point-old-1")
  })

  test("keeps the knowledge index current per source and reader without changing card insights", async () => {
    const sameSourceItem = {
      id: "item-mixed",
      kind: "document",
      category: "other_document",
      title: "Mixed Fund Terms Upload",
      current_version_id: "version-mixed",
    }
    const mixedAnalyses = [
      modelRecord({
        id: "analysis-side-letter",
        item_id: "item-mixed",
        version_id: "version-mixed",
        reader_key: "side_letter",
        reader_version: "side-letter.v1",
        created_at: "2026-05-29T10:00:00.000Z",
        item: sameSourceItem,
        version: { id: "version-mixed", storage_path: "C:\\private\\mixed.pdf" },
        keyPoints: [{
          id: "point-side-letter",
          point_key: "reporting_obligation",
          label: "Reporting Obligation",
          value_text: "Quarterly exposure schedule",
          review_status: "confirmed",
        }],
      }),
      modelRecord({
        id: "analysis-lpa-current",
        item_id: "item-mixed",
        version_id: "version-mixed",
        reader_key: "lpa",
        reader_version: "lpa.v1",
        created_at: "2026-05-29T09:00:00.000Z",
        item: sameSourceItem,
        version: { id: "version-mixed", storage_path: "C:\\private\\mixed.pdf" },
        keyPoints: [{
          id: "point-lpa-current",
          point_key: "management_fee",
          label: "Management Fee",
          value_text: "1.75%",
          review_status: "confirmed",
        }],
      }),
      modelRecord({
        id: "analysis-lpa-old",
        item_id: "item-mixed",
        version_id: "version-mixed",
        reader_key: "lpa",
        reader_version: "lpa.v1",
        created_at: "2026-05-29T08:00:00.000Z",
        item: sameSourceItem,
        version: { id: "version-mixed", storage_path: "C:\\private\\mixed.pdf" },
        keyPoints: [{
          id: "point-lpa-old",
          point_key: "management_fee",
          label: "Management Fee",
          value_text: "2.00%",
          review_status: "confirmed",
        }],
      }),
    ]
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce(mixedAnalyses)
    const insights = await RepositoryAnalysisService.getInsights({ fundId: "fund-1" })
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce(mixedAnalyses)
    const index = await RepositoryAnalysisService.getKeyPointIndex({ fundId: "fund-1", filters: { status: "confirmed" } })

    expect(insights).toHaveLength(1)
    expect(insights[0].reader_key).toBe("side_letter")
    expect(index.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "point-side-letter", point_key: "reporting_obligation" }),
        expect.objectContaining({ id: "point-lpa-current", point_key: "management_fee", value_text: "1.75%" }),
      ]),
    )
    expect(index.records).toHaveLength(2)
    expect(JSON.stringify(index)).not.toContain("point-lpa-old")
    expect(JSON.stringify(index)).not.toContain("storage_path")
    expect(JSON.stringify(index)).not.toContain("C:\\\\private")
  })

  test("adds a manual confirmed key point and carries it into later rereads", async () => {
    const keyPoint = await RepositoryAnalysisService.addManualKeyPoint({
      fundId: "fund-1",
      versionId: "version-1",
      actorId: "admin-1",
      fields: {
        label: "Notice Period",
        value_text: "90 days",
        source_reference: "Admin reviewed clause 12.1",
      },
    })

    expect(keyPoint).toEqual(
      expect.objectContaining({
        point_key: "notice_period",
        label: "Notice Period",
        value_text: "90 days",
        review_status: "confirmed",
        reviewed_by: "admin-1",
      }),
    )
    expect(mockAnalyses[0]).toEqual(
      expect.objectContaining({
        reader_key: "manual",
        trigger_type: "manual_key_point",
        extraction_method: "manual_entry",
      }),
    )
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "repository_key_point_created",
        metadata: expect.objectContaining({ point_key: "notice_period" }),
      }),
    )

    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "Reader did not rediscover the manual fact.",
      confidence: 0.2,
      key_points: [],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "",
    })
    const reread = await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })

    expect(reread.status).toBe("partial")
    expect(reread.keyPoints[0]).toEqual(
      expect.objectContaining({ point_key: "notice_period", value_text: "90 days", review_status: "confirmed" }),
    )
    expect(reread.structured_data_json.reviewed_points_not_redetected).toEqual(["notice_period"])
  })

  test("adds manual facts to an existing reading but rejects duplicate version keys", async () => {
    const analysis = await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    const manual = await RepositoryAnalysisService.addManualKeyPoint({
      fundId: "fund-1",
      versionId: "version-1",
      actorId: "admin-1",
      fields: { label: "Notice Period", value_text: "90 days" },
    })

    expect(manual.analysis_id).toBe(analysis.id)
    expect(mockAnalyses).toHaveLength(1)
    await expect(
      RepositoryAnalysisService.addManualKeyPoint({
        fundId: "fund-1",
        versionId: "version-1",
        actorId: "admin-1",
        fields: { label: "Management Fee", value_text: "1.75%" },
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPoints.filter((point) => point.point_key === "management_fee")).toHaveLength(1)
  })

  test("surfaces conflicting confirmed governing terms without confusing separate reporting periods", async () => {
    const currentAnalysis = ({ id, itemId, versionId, category, title, periodStart = null, periodEnd = null, points }) =>
      modelRecord({
        id,
        item_id: itemId,
        version_id: versionId,
        reader_key: category,
        reader_version: `${category}.v1`,
        created_at: "2026-05-25T12:00:00.000Z",
        item: {
          id: itemId,
          kind: category === "valuation" ? "dataset" : "document",
          category,
          title,
          period_start: periodStart,
          period_end: periodEnd,
          current_version_id: versionId,
        },
        version: { id: versionId, storage_path: `C:\\private\\${versionId}.txt` },
        keyPoints: points.map((point, index) => ({
          id: `${id}-point-${index}`,
          label: point.point_key === "management_fee" ? "Management Fee" : "Net Asset Value",
          review_status: "confirmed",
          ...point,
        })),
      })

    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      currentAnalysis({
        id: "analysis-lpa",
        itemId: "item-lpa",
        versionId: "version-lpa",
        category: "lpa",
        title: "Executed LPA",
        points: [{ point_key: "management_fee", value_text: "2.00% of committed capital" }],
      }),
      currentAnalysis({
        id: "analysis-ppm-match",
        itemId: "item-ppm-match",
        versionId: "version-ppm-match",
        category: "ppm",
        title: "Offering Memorandum",
        points: [{ point_key: "management_fee", value_text: "2% of committed capital" }],
      }),
      currentAnalysis({
        id: "analysis-ppm-conflict",
        itemId: "item-ppm-conflict",
        versionId: "version-ppm-conflict",
        category: "ppm",
        title: "Updated Offering Memorandum",
        points: [{ point_key: "management_fee", value_text: "1.50% of committed capital" }],
      }),
      currentAnalysis({
        id: "analysis-nav-q1",
        itemId: "item-nav-q1",
        versionId: "version-nav-q1",
        category: "valuation",
        title: "Q1 NAV",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        points: [{ point_key: "net_asset_value", value_text: "USD 10,000,000.00" }],
      }),
      currentAnalysis({
        id: "analysis-nav-q2",
        itemId: "item-nav-q2",
        versionId: "version-nav-q2",
        category: "valuation",
        title: "Q2 NAV",
        periodStart: "2026-04-01",
        periodEnd: "2026-06-30",
        points: [{ point_key: "net_asset_value", value_text: "USD 11,000,000.00" }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.counts.conflicts).toBe(1)
    expect(knowledge.conflicts).toHaveLength(1)
    expect(knowledge.conflicts[0]).toEqual(
      expect.objectContaining({
        point_key: "management_fee",
        scope: "governing_terms",
        values: expect.arrayContaining([
          expect.objectContaining({ title: "Executed LPA", value_text: "2.00% of committed capital" }),
          expect.objectContaining({ title: "Updated Offering Memorandum", value_text: "1.50% of committed capital" }),
        ]),
      }),
    )
    expect(knowledge.conflicts.find((entry) => entry.point_key === "net_asset_value")).toBeUndefined()
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("C:\\\\private")
  })

  test("uses inferred reader categories for Other Document knowledge conflicts", async () => {
    const inferredAnalysis = ({ id, itemId, versionId, readerKey, title, points }) =>
      modelRecord({
        id,
        item_id: itemId,
        version_id: versionId,
        reader_key: readerKey,
        reader_version: `${readerKey}.v1`,
        created_at: "2026-05-26T12:00:00.000Z",
        item: {
          id: itemId,
          kind: "document",
          category: "other_document",
          title,
          current_version_id: versionId,
        },
        version: { id: versionId, storage_path: `C:\\private\\${versionId}.txt` },
        keyPoints: points.map((point, index) => ({
          id: `${id}-point-${index}`,
          label: "Management Fee",
          review_status: "confirmed",
          ...point,
        })),
      })

    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      inferredAnalysis({
        id: "analysis-inferred-lpa",
        itemId: "item-other-lpa",
        versionId: "version-other-lpa",
        readerKey: "lpa",
        title: "Uploaded as Other - LPA",
        points: [{ point_key: "management_fee", value_text: "2.00% of committed capital" }],
      }),
      inferredAnalysis({
        id: "analysis-inferred-ppm",
        itemId: "item-other-ppm",
        versionId: "version-other-ppm",
        readerKey: "ppm",
        title: "Uploaded as Other - PPM",
        points: [{ point_key: "management_fee", value_text: "1.50% of committed capital" }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.counts.conflicts).toBe(1)
    expect(knowledge.sources.map((source) => source.item)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "other_document", effective_category: "lpa" }),
        expect.objectContaining({ category: "other_document", effective_category: "ppm" }),
      ]),
    )
    expect(knowledge.conflicts[0]).toEqual(
      expect.objectContaining({
        point_key: "management_fee",
        values: expect.arrayContaining([
          expect.objectContaining({ category: "lpa", stored_category: "other_document", title: "Uploaded as Other - LPA" }),
          expect.objectContaining({ category: "ppm", stored_category: "other_document", title: "Uploaded as Other - PPM" }),
        ]),
      }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("surfaces side-letter economics as investor-specific governing term conflicts", async () => {
    const analysisRecord = ({ id, itemId, versionId, readerKey, category, title, valueText }) =>
      modelRecord({
        id,
        item_id: itemId,
        version_id: versionId,
        reader_key: readerKey,
        reader_version: `${readerKey}.v1`,
        created_at: "2026-05-27T12:00:00.000Z",
        item: {
          id: itemId,
          kind: "document",
          category,
          title,
          current_version_id: versionId,
        },
        version: { id: versionId, storage_path: `C:\\private\\${versionId}.txt` },
        keyPoints: [{
          id: `${id}-point-0`,
          point_key: "management_fee",
          label: "Management Fee",
          value_text: valueText,
          review_status: "confirmed",
        }],
      })

    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      analysisRecord({
        id: "analysis-lpa",
        itemId: "item-lpa",
        versionId: "version-lpa",
        readerKey: "lpa",
        category: "lpa",
        title: "Executed LPA",
        valueText: "2.00% of committed capital",
      }),
      analysisRecord({
        id: "analysis-side-letter",
        itemId: "item-side-letter",
        versionId: "version-side-letter",
        readerKey: "side_letter",
        category: "other_document",
        title: "Silver Lake Side Letter",
        valueText: "1.25% of committed capital",
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.counts.conflicts).toBe(1)
    expect(knowledge.sources.find((source) => source.item.title === "Silver Lake Side Letter").item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "side_letter" }),
    )
    expect(knowledge.conflicts[0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "lpa", stored_category: "lpa", value_text: "2.00% of committed capital" }),
        expect.objectContaining({ category: "side_letter", stored_category: "other_document", value_text: "1.25% of committed capital" }),
      ]),
    )
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("C:\\\\private")
  })

  test("surfaces LPA amendments as governing term conflicts", async () => {
    const analysisRecord = ({ id, itemId, versionId, readerKey, category, title, valueText }) =>
      modelRecord({
        id,
        item_id: itemId,
        version_id: versionId,
        reader_key: readerKey,
        reader_version: `${readerKey}.v1`,
        created_at: "2026-05-27T13:00:00.000Z",
        item: {
          id: itemId,
          kind: "document",
          category,
          title,
          current_version_id: versionId,
        },
        version: { id: versionId, storage_path: `C:\\private\\${versionId}.txt` },
        keyPoints: [{
          id: `${id}-point-0`,
          point_key: "management_fee",
          label: "Management Fee",
          value_text: valueText,
          review_status: "confirmed",
        }],
      })

    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      analysisRecord({
        id: "analysis-lpa-base",
        itemId: "item-lpa-base",
        versionId: "version-lpa-base",
        readerKey: "lpa",
        category: "lpa",
        title: "Executed LPA",
        valueText: "2.00% of committed capital",
      }),
      analysisRecord({
        id: "analysis-lpa-amendment",
        itemId: "item-lpa-amendment",
        versionId: "version-lpa-amendment",
        readerKey: "lpa_amendment",
        category: "other_document",
        title: "First LPA Amendment",
        valueText: "1.75% of net asset value",
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.counts.conflicts).toBe(1)
    expect(knowledge.sources.find((source) => source.item.title === "First LPA Amendment").item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "lpa_amendment" }),
    )
    expect(knowledge.conflicts[0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "lpa", stored_category: "lpa", value_text: "2.00% of committed capital" }),
        expect.objectContaining({ category: "lpa_amendment", stored_category: "other_document", value_text: "1.75% of net asset value" }),
      ]),
    )
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge.conflicts)).not.toContain("C:\\\\private")
  })

  test("marks inferred governance minutes with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-governance-minutes",
        item_id: "item-governance-minutes",
        version_id: "version-governance-minutes",
        reader_key: "governance_minutes",
        reader_version: "governance-minutes.v1",
        created_at: "2026-05-27T13:20:00.000Z",
        item: {
          id: "item-governance-minutes",
          kind: "document",
          category: "other_document",
          title: "April Board Consent",
          current_version_id: "version-governance-minutes",
        },
        version: { id: "version-governance-minutes", storage_path: "C:\\private\\governance-minutes.pdf" },
        keyPoints: [{
          id: "governance-minutes-point-1",
          point_key: "nav_approval",
          label: "NAV / Valuation Approval",
          value_text: "Approved",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "governance_minutes" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "nav_approval", value_text: "Approved" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred capital account statements with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-capital-account",
        item_id: "item-capital-account",
        version_id: "version-capital-account",
        reader_key: "capital_account_statement",
        reader_version: "capital-account-statement.v1",
        created_at: "2026-05-28T12:00:00.000Z",
        item: {
          id: "item-capital-account",
          kind: "dataset",
          category: "other_dataset",
          title: "Q1 Capital Accounts",
          current_version_id: "version-capital-account",
        },
        version: { id: "version-capital-account", storage_path: "C:\\private\\capital-accounts.xlsx" },
        keyPoints: [{
          id: "capital-account-point-1",
          point_key: "total_ending_capital",
          label: "Total Ending Capital",
          value_text: "1,740,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "capital_account_statement" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "total_ending_capital", value_text: "1,740,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred commitment schedules with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-commitment-schedule",
        item_id: "item-commitment-schedule",
        version_id: "version-commitment-schedule",
        reader_key: "commitment_schedule",
        reader_version: "commitment-schedule.v1",
        created_at: "2026-05-28T12:03:00.000Z",
        item: {
          id: "item-commitment-schedule",
          kind: "dataset",
          category: "other_dataset",
          title: "Q1 Commitment Schedule",
          current_version_id: "version-commitment-schedule",
        },
        version: { id: "version-commitment-schedule", storage_path: "C:\\private\\commitment-schedule.xlsx" },
        keyPoints: [{
          id: "commitment-schedule-point-1",
          point_key: "total_unfunded_commitment",
          label: "Total Unfunded Commitment",
          value_text: "1,200,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "commitment_schedule" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "total_unfunded_commitment", value_text: "1,200,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred investor activity statements with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-investor-activity",
        item_id: "item-investor-activity",
        version_id: "version-investor-activity",
        reader_key: "investor_activity_statement",
        reader_version: "investor-activity-statement.v1",
        created_at: "2026-05-28T12:05:00.000Z",
        item: {
          id: "item-investor-activity",
          kind: "dataset",
          category: "other_dataset",
          title: "Q1 Investor Activity",
          current_version_id: "version-investor-activity",
        },
        version: { id: "version-investor-activity", storage_path: "C:\\private\\investor-activity.xlsx" },
        keyPoints: [{
          id: "investor-activity-point-1",
          point_key: "net_activity_amount",
          label: "Net Activity Amount",
          value_text: "150,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "investor_activity_statement" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "net_activity_amount", value_text: "150,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred waterfall statements with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-waterfall",
        item_id: "item-waterfall",
        version_id: "version-waterfall",
        reader_key: "waterfall_statement",
        reader_version: "waterfall-statement.v1",
        created_at: "2026-05-28T12:08:00.000Z",
        item: {
          id: "item-waterfall",
          kind: "document",
          category: "other_document",
          title: "Q1 Waterfall Statement",
          current_version_id: "version-waterfall",
        },
        version: { id: "version-waterfall", storage_path: "C:\\private\\waterfall.pdf" },
        keyPoints: [{
          id: "waterfall-point-1",
          point_key: "carried_interest_distribution",
          label: "Carried Interest Distribution",
          value_text: "USD 50,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "waterfall_statement" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "carried_interest_distribution", value_text: "USD 50,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred notice documents with effective knowledge categories", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-capital-call",
        item_id: "item-capital-call",
        version_id: "version-capital-call",
        reader_key: "capital_call_notice",
        reader_version: "capital-call-notice.v1",
        created_at: "2026-05-28T12:00:00.000Z",
        item: {
          id: "item-capital-call",
          kind: "document",
          category: "other_document",
          title: "Q1 Capital Call Notice",
          current_version_id: "version-capital-call",
        },
        version: { id: "version-capital-call", storage_path: "C:\\private\\capital-call.pdf" },
        keyPoints: [{
          id: "capital-call-point-1",
          point_key: "call_amount",
          label: "Capital Call Amount",
          value_text: "USD 250,000.00",
          review_status: "confirmed",
        }],
      }),
      modelRecord({
        id: "analysis-distribution",
        item_id: "item-distribution",
        version_id: "version-distribution",
        reader_key: "distribution_notice",
        reader_version: "distribution-notice.v1",
        created_at: "2026-05-28T12:10:00.000Z",
        item: {
          id: "item-distribution",
          kind: "document",
          category: "other_document",
          title: "Q1 Distribution Notice",
          current_version_id: "version-distribution",
        },
        version: { id: "version-distribution", storage_path: "C:\\private\\distribution.pdf" },
        keyPoints: [{
          id: "distribution-point-1",
          point_key: "distribution_amount",
          label: "Distribution Amount",
          value_text: "USD 125,000.00",
          review_status: "confirmed",
        }],
      }),
      modelRecord({
        id: "analysis-redemption",
        item_id: "item-redemption",
        version_id: "version-redemption",
        reader_key: "redemption_notice",
        reader_version: "redemption-notice.v1",
        created_at: "2026-05-28T12:12:00.000Z",
        item: {
          id: "item-redemption",
          kind: "document",
          category: "other_document",
          title: "Q1 Redemption Notice",
          current_version_id: "version-redemption",
        },
        version: { id: "version-redemption", storage_path: "C:\\private\\redemption.pdf" },
        keyPoints: [{
          id: "redemption-point-1",
          point_key: "net_redemption_amount",
          label: "Net Redemption Amount",
          value_text: "USD 95,000.00",
          review_status: "confirmed",
        }],
      }),
      modelRecord({
        id: "analysis-transfer",
        item_id: "item-transfer",
        version_id: "version-transfer",
        reader_key: "transfer_notice",
        reader_version: "transfer-notice.v1",
        created_at: "2026-05-28T12:14:00.000Z",
        item: {
          id: "item-transfer",
          kind: "document",
          category: "other_document",
          title: "Q1 Investor Transfer Notice",
          current_version_id: "version-transfer",
        },
        version: { id: "version-transfer", storage_path: "C:\\private\\transfer.pdf" },
        keyPoints: [{
          id: "transfer-point-1",
          point_key: "units_transferred",
          label: "Units / Shares Transferred",
          value_text: "25,000.0000",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources.map((source) => source.item)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "other_document", effective_category: "capital_call_notice" }),
        expect.objectContaining({ category: "other_document", effective_category: "distribution_notice" }),
        expect.objectContaining({ category: "other_document", effective_category: "redemption_notice" }),
        expect.objectContaining({ category: "other_document", effective_category: "transfer_notice" }),
      ]),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred management fee statements with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-management-fee",
        item_id: "item-management-fee",
        version_id: "version-management-fee",
        reader_key: "management_fee_statement",
        reader_version: "management-fee-statement.v1",
        created_at: "2026-05-28T12:20:00.000Z",
        item: {
          id: "item-management-fee",
          kind: "document",
          category: "other_document",
          title: "Q1 Management Fee Statement",
          current_version_id: "version-management-fee",
        },
        version: { id: "version-management-fee", storage_path: "C:\\private\\management-fee.pdf" },
        keyPoints: [{
          id: "management-fee-point-1",
          point_key: "net_management_fee",
          label: "Net Management Fee",
          value_text: "USD 412,500.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "management_fee_statement" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "net_management_fee", value_text: "USD 412,500.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred NAV packages with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-nav-package",
        item_id: "item-nav-package",
        version_id: "version-nav-package",
        reader_key: "nav_package",
        reader_version: "nav-package.v1",
        created_at: "2026-05-28T12:25:00.000Z",
        item: {
          id: "item-nav-package",
          kind: "dataset",
          category: "other_dataset",
          title: "Q1 NAV Package",
          current_version_id: "version-nav-package",
        },
        version: { id: "version-nav-package", storage_path: "C:\\private\\nav-package.xlsx" },
        keyPoints: [{
          id: "nav-package-point-1",
          point_key: "ending_nav",
          label: "Ending NAV",
          value_text: "USD 11,750,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "nav_package" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "ending_nav", value_text: "USD 11,750,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred expense invoices with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-expense-invoice",
        item_id: "item-expense-invoice",
        version_id: "version-expense-invoice",
        reader_key: "expense_invoice",
        reader_version: "expense-invoice.v1",
        created_at: "2026-05-28T12:30:00.000Z",
        item: {
          id: "item-expense-invoice",
          kind: "document",
          category: "other_document",
          title: "Q1 Administration Invoice",
          current_version_id: "version-expense-invoice",
        },
        version: { id: "version-expense-invoice", storage_path: "C:\\private\\expense-invoice.pdf" },
        keyPoints: [{
          id: "expense-invoice-point-1",
          point_key: "amount_due",
          label: "Amount Due",
          value_text: "USD 60,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "expense_invoice" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "amount_due", value_text: "USD 60,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred accrual schedules with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-accrual-schedule",
        item_id: "item-accrual-schedule",
        version_id: "version-accrual-schedule",
        reader_key: "accrual_schedule",
        reader_version: "accrual-schedule.v1",
        created_at: "2026-05-28T12:32:00.000Z",
        item: {
          id: "item-accrual-schedule",
          kind: "dataset",
          category: "other_dataset",
          title: "Q1 Accrual Schedule",
          current_version_id: "version-accrual-schedule",
        },
        version: { id: "version-accrual-schedule", storage_path: "C:\\private\\accrual-schedule.xlsx" },
        keyPoints: [{
          id: "accrual-schedule-point-1",
          point_key: "total_accrued_expenses",
          label: "Total Accrued Expenses",
          value_text: "USD 60,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "accrual_schedule" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "total_accrued_expenses", value_text: "USD 60,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred audit adjustment schedules with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-audit-adjustment-schedule",
        item_id: "item-audit-adjustment-schedule",
        version_id: "version-audit-adjustment-schedule",
        reader_key: "audit_adjustment_schedule",
        reader_version: "audit-adjustment-schedule.v1",
        created_at: "2026-05-28T12:32:30.000Z",
        item: {
          id: "item-audit-adjustment-schedule",
          kind: "dataset",
          category: "other_dataset",
          title: "FY2025 Audit Adjustments",
          current_version_id: "version-audit-adjustment-schedule",
        },
        version: { id: "version-audit-adjustment-schedule", storage_path: "C:\\private\\audit-adjustments.xlsx" },
        keyPoints: [{
          id: "audit-adjustment-schedule-point-1",
          point_key: "adjustment_balance_reconciliation",
          label: "Adjustment Balance Reconciliation",
          value_text: "Reconciled",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "audit_adjustment_schedule" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "adjustment_balance_reconciliation", value_text: "Reconciled" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred bank reconciliations with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-bank-reconciliation",
        item_id: "item-bank-reconciliation",
        version_id: "version-bank-reconciliation",
        reader_key: "bank_reconciliation",
        reader_version: "bank-reconciliation.v1",
        created_at: "2026-05-28T12:33:00.000Z",
        item: {
          id: "item-bank-reconciliation",
          kind: "dataset",
          category: "other_dataset",
          title: "March Bank Reconciliation",
          current_version_id: "version-bank-reconciliation",
        },
        version: { id: "version-bank-reconciliation", storage_path: "C:\\private\\bank-reconciliation.xlsx" },
        keyPoints: [{
          id: "bank-reconciliation-point-1",
          point_key: "book_bank_reconciliation",
          label: "Book to Bank Reconciliation",
          value_text: "Reconciled",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "bank_reconciliation" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "book_bank_reconciliation", value_text: "Reconciled" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred portfolio transactions with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-portfolio-transaction",
        item_id: "item-portfolio-transaction",
        version_id: "version-portfolio-transaction",
        reader_key: "portfolio_transaction",
        reader_version: "portfolio-transaction.v1",
        created_at: "2026-05-28T12:34:00.000Z",
        item: {
          id: "item-portfolio-transaction",
          kind: "dataset",
          category: "other_dataset",
          title: "North Harbor Sale Notice",
          current_version_id: "version-portfolio-transaction",
        },
        version: { id: "version-portfolio-transaction", storage_path: "C:\\private\\portfolio-transaction.xlsx" },
        keyPoints: [{
          id: "portfolio-transaction-point-1",
          point_key: "realized_gain_loss",
          label: "Realized Gain / Loss",
          value_text: "USD 125,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "portfolio_transaction" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "realized_gain_loss", value_text: "USD 125,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred custodian statements with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-custodian-statement",
        item_id: "item-custodian-statement",
        version_id: "version-custodian-statement",
        reader_key: "custodian_statement",
        reader_version: "custodian-statement.v1",
        created_at: "2026-05-28T12:35:00.000Z",
        item: {
          id: "item-custodian-statement",
          kind: "dataset",
          category: "other_dataset",
          title: "April Custodian Statement",
          current_version_id: "version-custodian-statement",
        },
        version: { id: "version-custodian-statement", storage_path: "C:\\private\\custodian-statement.xlsx" },
        keyPoints: [{
          id: "custodian-statement-point-1",
          point_key: "total_account_value",
          label: "Total Account Value",
          value_text: "USD 2,000,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_dataset", effective_category: "custodian_statement" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "total_account_value", value_text: "USD 2,000,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("marks inferred credit facility documents with an effective knowledge category", async () => {
    mockModels.FundRepositoryAnalysis.findAll.mockResolvedValueOnce([
      modelRecord({
        id: "analysis-credit-facility",
        item_id: "item-credit-facility",
        version_id: "version-credit-facility",
        reader_key: "credit_facility",
        reader_version: "credit-facility.v1",
        created_at: "2026-05-28T12:40:00.000Z",
        item: {
          id: "item-credit-facility",
          kind: "document",
          category: "other_document",
          title: "Subscription Line Covenant Certificate",
          current_version_id: "version-credit-facility",
        },
        version: { id: "version-credit-facility", storage_path: "C:\\private\\credit-facility.pdf" },
        keyPoints: [{
          id: "credit-facility-point-1",
          point_key: "outstanding_principal",
          label: "Outstanding Principal",
          value_text: "USD 12,500,000.00",
          review_status: "confirmed",
        }],
      }),
    ])

    const knowledge = await RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1" })

    expect(knowledge.sources[0].item).toEqual(
      expect.objectContaining({ category: "other_document", effective_category: "credit_facility" }),
    )
    expect(knowledge.sources[0].key_points[0]).toEqual(
      expect.objectContaining({ point_key: "outstanding_principal", value_text: "USD 12,500,000.00" }),
    )
    expect(JSON.stringify(knowledge)).not.toContain("storage_path")
    expect(JSON.stringify(knowledge)).not.toContain("C:\\\\private")
  })

  test("rejects unsupported knowledge pack status filters", async () => {
    await expect(
      RepositoryAnalysisService.getKnowledgePack({ fundId: "fund-1", reviewStatus: "approved" }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test("allows an admin to correct and confirm a suggested key point", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    const reviewed = await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-1",
      actorId: "admin-1",
      fields: { review_status: "confirmed", value_text: "1.75%" },
    })

    expect(reviewed.review_status).toBe("confirmed")
    expect(reviewed.value_text).toBe("1.75%")
    expect(reviewed.value_json).toEqual({ type: "percent", value: 1.75 })
    expect(reviewed.reviewed_by).toBe("admin-1")
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "repository_key_point_reviewed" }),
    )
  })

  test("bulk confirms suggested key points for a repository version without touching reviewed facts", async () => {
    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "Found three facts.",
      confidence: 0.9,
      key_points: [
        { point_key: "management_fee", label: "Management Fee", value_text: "1.75%", confidence: 0.9 },
        { point_key: "fund_term", label: "Fund Term", value_text: "10 years", confidence: 0.9 },
        { point_key: "governing_law", label: "Governing Law", value_text: "Delaware", confidence: 0.9 },
      ],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "Fund terms.",
    })
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-1",
      actorId: "admin-1",
      fields: { review_status: "dismissed" },
    })

    const review = await RepositoryAnalysisService.reviewVersionKeyPoints({
      fundId: "fund-1",
      versionId: "version-1",
      actorId: "admin-2",
      fields: { review_status: "confirmed" },
    })

    expect(review.summary).toEqual({
      review_status: "confirmed",
      from_status: "suggested",
      matched: 2,
      reviewed: 2,
    })
    expect(review.key_points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ point_key: "fund_term", review_status: "confirmed", reviewed_by: "admin-2" }),
        expect.objectContaining({ point_key: "governing_law", review_status: "confirmed", reviewed_by: "admin-2" }),
      ]),
    )
    expect(mockPoints.find((point) => point.id === "point-1").review_status).toBe("dismissed")
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "repository_key_points_bulk_reviewed",
        metadata: expect.objectContaining({ reviewed_count: 2, review_status: "confirmed" }),
      }),
    )
  })

  test("carries confirmed corrections forward when rereading the same immutable version", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-1",
      actorId: "admin-1",
      fields: { review_status: "confirmed", value_text: "1.75%" },
    })
    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "Found one term again.",
      confidence: 0.9,
      key_points: [{ point_key: "management_fee", label: "Management Fee", value_text: "2.25%", confidence: 0.9 }],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "Management Fee: 2.25%",
    })

    const reread = await RepositoryAnalysisService.analyzeVersion({
      fundId: "fund-1",
      versionId: "version-1",
      actorId: "admin-2",
    })

    expect(reread.keyPoints[0]).toEqual(
      expect.objectContaining({ point_key: "management_fee", value_text: "1.75%", review_status: "confirmed" }),
    )
    expect(reread.structured_data_json.reviewed_decisions_carried_forward).toEqual(["management_fee"])
    expect(mockAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "repository_version_analyzed",
        metadata: expect.objectContaining({ carried_review_count: 1 }),
      }),
    )
  })

  test("retains reviewed facts that are not rediscovered during a reread", async () => {
    await RepositoryAnalysisService.analyzeVersion({ fundId: "fund-1", versionId: "version-1" })
    await RepositoryAnalysisService.reviewKeyPoint({
      fundId: "fund-1",
      keyPointId: "point-1",
      actorId: "admin-1",
      fields: { review_status: "confirmed" },
    })
    mockReaderAnalyze.mockReturnValue({
      status: "completed",
      summary_text: "No terms rediscovered.",
      confidence: 0.2,
      key_points: [],
      structured_data_json: {},
      issues_json: [],
      source_text_excerpt: "",
    })

    const reread = await RepositoryAnalysisService.analyzeVersion({
      fundId: "fund-1",
      versionId: "version-1",
    })

    expect(reread.status).toBe("partial")
    expect(reread.keyPoints[0]).toEqual(
      expect.objectContaining({ point_key: "management_fee", review_status: "confirmed" }),
    )
    expect(reread.issues_json).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "reviewed_points_not_redetected" })]),
    )
  })
})
