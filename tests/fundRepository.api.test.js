const fs = require("fs")
const os = require("os")
const path = require("path")
const express = require("express")
const multer = require("multer")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockRepositoryService = {
  getSummary: jest.fn(),
  listItems: jest.fn(),
  createItem: jest.fn(),
  addVersion: jest.fn(),
  updateItem: jest.fn(),
  setCurrentVersion: jest.fn(),
  resolveDownload: jest.fn(),
  getActivity: jest.fn(),
}
const mockRepositoryAnalysisService = {
  getReaderCatalog: jest.fn(),
  suggestReaderForVersion: jest.fn(),
  analyzeCurrentVersions: jest.fn(),
  analyzeVersion: jest.fn(),
  getVersionAnalyses: jest.fn(),
  getVersionComparison: jest.fn(),
  getInsights: jest.fn(),
  getReadiness: jest.fn(),
  getKnowledgePack: jest.fn(),
  getKeyPointIndex: jest.fn(),
  addManualKeyPoint: jest.fn(),
  reviewVersionKeyPoints: jest.fn(),
  reviewKeyPoint: jest.fn(),
}

jest.mock("../src/modules/repository/services/repository.service", () => mockRepositoryService)
jest.mock("../src/modules/repository/services/repositoryAnalysis.service", () => mockRepositoryAnalysisService)

const RepositoryController = require("../src/modules/repository/controllers/repository.controller")

describe("RepositoryController API", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repository-api-test-"))
  const upload = multer({ dest: tempDir })
  const app = express()
  app.use(express.json())
  app.get("/funds/:fundId/repository/summary", RepositoryController.getSummary)
  app.get("/funds/:fundId/repository/readers", RepositoryController.getReaders)
  app.get("/funds/:fundId/repository/versions/:versionId/reader-suggestion", RepositoryController.getReaderSuggestion)
  app.get("/funds/:fundId/repository/items", RepositoryController.getItems)
  app.post("/funds/:fundId/repository/items", upload.single("file"), (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.createItem(req, res, next)
  })
  app.post("/funds/:fundId/repository/items/:itemId/versions", upload.single("file"), RepositoryController.addVersion)
  app.put("/funds/:fundId/repository/items/:itemId", RepositoryController.updateItem)
  app.put("/funds/:fundId/repository/items/:itemId/current-version", RepositoryController.setCurrentVersion)
  app.post("/funds/:fundId/repository/versions/:versionId/analyze", (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.analyzeVersion(req, res, next)
  })
  app.post("/funds/:fundId/repository/analyze-current", (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.analyzeCurrentVersions(req, res, next)
  })
  app.get("/funds/:fundId/repository/versions/:versionId/analyses", RepositoryController.getVersionAnalyses)
  app.post("/funds/:fundId/repository/versions/:versionId/key-points", (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.addManualKeyPoint(req, res, next)
  })
  app.put("/funds/:fundId/repository/versions/:versionId/key-points/review", (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.reviewVersionKeyPoints(req, res, next)
  })
  app.get(
    "/funds/:fundId/repository/items/:itemId/versions/:versionId/comparison",
    RepositoryController.getVersionComparison,
  )
  app.get("/funds/:fundId/repository/insights", RepositoryController.getInsights)
  app.get("/funds/:fundId/repository/readiness", RepositoryController.getReadiness)
  app.get("/funds/:fundId/repository/knowledge", RepositoryController.getKnowledgePack)
  app.get("/funds/:fundId/repository/key-points", RepositoryController.getKeyPointIndex)
  app.put("/funds/:fundId/repository/key-points/:keyPointId", (req, res, next) => {
    req.user = { id: "admin-1" }
    return RepositoryController.reviewKeyPoint(req, res, next)
  })
  app.get("/funds/:fundId/repository/activity", RepositoryController.getActivity)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    const item = { id: "item-1", kind: "dataset", category: "trial_balance" }
    mockRepositoryService.getSummary.mockResolvedValue({ counts: { datasets: 1 } })
    mockRepositoryService.listItems.mockResolvedValue([item])
    mockRepositoryService.createItem.mockResolvedValue(item)
    mockRepositoryService.addVersion.mockResolvedValue(item)
    mockRepositoryService.updateItem.mockResolvedValue({ ...item, is_archived: true })
    mockRepositoryService.setCurrentVersion.mockResolvedValue(item)
    mockRepositoryService.getActivity.mockResolvedValue([{ id: "audit-1", event_type: "repository_item_created" }])
    mockRepositoryAnalysisService.getReaderCatalog.mockResolvedValue([{ key: "lpa", label: "Limited Partnership Agreement", version: "lpa.v1" }])
    mockRepositoryAnalysisService.suggestReaderForVersion.mockResolvedValue({
      status: "suggested",
      reader_key: "lpa",
      reader: { key: "lpa", label: "Limited Partnership Agreement" },
    })
    mockRepositoryAnalysisService.analyzeCurrentVersions.mockResolvedValue({
      summary: { analyzed: 2, skipped_existing: 1, skipped_unsupported: 1, failed: 0 },
      results: [],
    })
    mockRepositoryAnalysisService.analyzeVersion.mockResolvedValue({ id: "analysis-1", status: "completed" })
    mockRepositoryAnalysisService.getVersionAnalyses.mockResolvedValue([{ id: "analysis-1", status: "completed" }])
    mockRepositoryAnalysisService.getVersionComparison.mockResolvedValue({
      status: "compared",
      counts: { changed: 1, added: 0, removed: 0, unchanged: 1, differences: 1, reconfirmation_needed: 1, review_needed: 2 },
    })
    mockRepositoryAnalysisService.getInsights.mockResolvedValue([{ id: "analysis-1", item_id: "item-1" }])
    mockRepositoryAnalysisService.getReadiness.mockResolvedValue({
      counts: { readiness_score: 75, readable_sources: 4, unread_sources: 1 },
      unread_sources: [{ item: { id: "item-unread", title: "Unread LPA" } }],
    })
    mockRepositoryAnalysisService.getKnowledgePack.mockResolvedValue({ review_status: "confirmed", sources: [{ item_id: "item-1" }] })
    mockRepositoryAnalysisService.getKeyPointIndex.mockResolvedValue({
      records: [{ id: "point-1", point_key: "management_fee", value_text: "1.75%" }],
      counts: { filtered_key_points: 1 },
    })
    mockRepositoryAnalysisService.addManualKeyPoint.mockResolvedValue({ id: "point-manual", label: "Notice Period", review_status: "confirmed" })
    mockRepositoryAnalysisService.reviewVersionKeyPoints.mockResolvedValue({
      summary: { reviewed: 2, review_status: "confirmed", from_status: "suggested" },
      key_points: [{ id: "point-2", review_status: "confirmed" }],
    })
    mockRepositoryAnalysisService.reviewKeyPoint.mockResolvedValue({ id: "point-1", value_text: "1.75%", review_status: "confirmed" })
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("retrieves repository summary and filtered items for a fund", async () => {
    const summaryResponse = await request(app).get("/funds/fund-1/repository/summary")
    const itemsResponse = await request(app).get("/funds/fund-1/repository/items?kind=dataset&status=active")

    expect(summaryResponse.status).toBe(200)
    expect(summaryResponse.body.data.summary.counts.datasets).toBe(1)
    expect(itemsResponse.status).toBe(200)
    expect(mockRepositoryService.listItems).toHaveBeenCalledWith({
      fundId: "fund-1",
      filters: { kind: "dataset", status: "active" },
    })
  })

  test("uploads a new item, updates archive status, and changes its current version", async () => {
    const filePath = path.join(tempDir, "tb.xlsx")
    fs.writeFileSync(filePath, "xlsx")
    const uploadResponse = await request(app)
      .post("/funds/fund-1/repository/items")
      .field("kind", "dataset")
      .field("category", "trial_balance")
      .field("title", "Trial Balance")
      .attach("file", filePath)
    const archiveResponse = await request(app)
      .put("/funds/fund-1/repository/items/item-1")
      .send({ is_archived: true })
    const versionResponse = await request(app)
      .put("/funds/fund-1/repository/items/item-1/current-version")
      .send({ version_id: "version-1" })

    expect(uploadResponse.status).toBe(201)
    expect(mockRepositoryService.createItem).toHaveBeenCalledWith(expect.objectContaining({ fundId: "fund-1", actorId: "admin-1" }))
    expect(archiveResponse.body.data.item.is_archived).toBe(true)
    expect(versionResponse.status).toBe(200)
    expect(mockRepositoryService.setCurrentVersion).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1", itemId: "item-1", versionId: "version-1" }),
    )
  })

  test("returns repository activity", async () => {
    const response = await request(app).get("/funds/fund-1/repository/activity")
    expect(response.status).toBe(200)
    expect(response.body.data.activity[0].event_type).toBe("repository_item_created")
  })

  test("returns repository reader catalog", async () => {
    const response = await request(app).get("/funds/fund-1/repository/readers")
    expect(response.status).toBe(200)
    expect(response.body.data.readers[0]).toEqual(expect.objectContaining({ key: "lpa" }))
    expect(mockRepositoryAnalysisService.getReaderCatalog).toHaveBeenCalledWith({ fundId: "fund-1" })
  })

  test("returns a non-destructive reader suggestion for a stored version", async () => {
    const response = await request(app).get("/funds/fund-1/repository/versions/version-1/reader-suggestion")

    expect(response.status).toBe(200)
    expect(response.body.data.reader_suggestion).toEqual(expect.objectContaining({ reader_key: "lpa" }))
    expect(mockRepositoryAnalysisService.suggestReaderForVersion).toHaveBeenCalledWith({
      fundId: "fund-1",
      versionId: "version-1",
    })
  })

  test("returns repository readiness", async () => {
    const response = await request(app).get("/funds/fund-1/repository/readiness")

    expect(response.status).toBe(200)
    expect(response.body.data.readiness.counts.readiness_score).toBe(75)
    expect(response.body.data.readiness.unread_sources[0].item.id).toBe("item-unread")
    expect(mockRepositoryAnalysisService.getReadiness).toHaveBeenCalledWith({ fundId: "fund-1" })
  })

  test("reads a version, returns insights, adds a manual key point, and reviews an extracted key point", async () => {
    const batchResponse = await request(app)
      .post("/funds/fund-1/repository/analyze-current")
      .send({ include_existing: true })
    const analyzeResponse = await request(app)
      .post("/funds/fund-1/repository/versions/version-1/analyze")
      .send({ reader_key: "lpa" })
    const historyResponse = await request(app).get("/funds/fund-1/repository/versions/version-1/analyses")
    const comparisonResponse = await request(app).get(
      "/funds/fund-1/repository/items/item-1/versions/version-2/comparison",
    )
    const insightResponse = await request(app).get("/funds/fund-1/repository/insights")
    const knowledgeResponse = await request(app).get("/funds/fund-1/repository/knowledge?status=confirmed")
    const keyPointIndexResponse = await request(app).get("/funds/fund-1/repository/key-points?status=all&search=fee")
    const reviewResponse = await request(app)
      .put("/funds/fund-1/repository/key-points/point-1")
      .send({ review_status: "confirmed", value_text: "1.75%" })
    const manualResponse = await request(app)
      .post("/funds/fund-1/repository/versions/version-1/key-points")
      .send({ label: "Notice Period", value_text: "90 days", source_reference: "Admin review" })
    const bulkReviewResponse = await request(app)
      .put("/funds/fund-1/repository/versions/version-1/key-points/review")
      .send({ review_status: "confirmed" })

    expect(batchResponse.status).toBe(201)
    expect(batchResponse.body.data.batch.summary.analyzed).toBe(2)
    expect(mockRepositoryAnalysisService.analyzeCurrentVersions).toHaveBeenCalledWith({
      fundId: "fund-1",
      actorId: "admin-1",
      includeExisting: true,
    })
    expect(analyzeResponse.status).toBe(201)
    expect(mockRepositoryAnalysisService.analyzeVersion).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1", versionId: "version-1", readerKey: "lpa", actorId: "admin-1" }),
    )
    expect(insightResponse.body.data.insights[0].item_id).toBe("item-1")
    expect(historyResponse.body.data.analyses[0].status).toBe("completed")
    expect(mockRepositoryAnalysisService.getVersionAnalyses).toHaveBeenCalledWith({
      fundId: "fund-1",
      versionId: "version-1",
    })
    expect(comparisonResponse.body.data.comparison.counts.changed).toBe(1)
    expect(mockRepositoryAnalysisService.getVersionComparison).toHaveBeenCalledWith({
      fundId: "fund-1",
      itemId: "item-1",
      versionId: "version-2",
    })
    expect(knowledgeResponse.body.data.knowledge.sources[0].item_id).toBe("item-1")
    expect(mockRepositoryAnalysisService.getKnowledgePack).toHaveBeenCalledWith({
      fundId: "fund-1",
      reviewStatus: "confirmed",
    })
    expect(keyPointIndexResponse.body.data.key_point_index.records[0].point_key).toBe("management_fee")
    expect(mockRepositoryAnalysisService.getKeyPointIndex).toHaveBeenCalledWith({
      fundId: "fund-1",
      filters: { status: "all", search: "fee" },
    })
    expect(reviewResponse.body.data.key_point.review_status).toBe("confirmed")
    expect(mockRepositoryAnalysisService.reviewKeyPoint).toHaveBeenCalledWith(
      expect.objectContaining({ fields: { review_status: "confirmed", value_text: "1.75%" } }),
    )
    expect(manualResponse.status).toBe(201)
    expect(mockRepositoryAnalysisService.addManualKeyPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        versionId: "version-1",
        actorId: "admin-1",
        fields: { label: "Notice Period", value_text: "90 days", source_reference: "Admin review" },
      }),
    )
    expect(bulkReviewResponse.status).toBe(200)
    expect(bulkReviewResponse.body.data.review.summary.reviewed).toBe(2)
    expect(mockRepositoryAnalysisService.reviewVersionKeyPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        versionId: "version-1",
        actorId: "admin-1",
        fields: { review_status: "confirmed" },
      }),
    )
  })
})
