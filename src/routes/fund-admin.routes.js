const express = require("express")
const FundAdminController = require("../controllers/fundAdmin.controller")
const FundController = require("../modules/funds/controllers/fund.controller")
const ReportController = require("../modules/reports/controllers/report.controller")
const RepositoryController = require("../modules/repository/controllers/repository.controller")
const ReportingProjectController = require("../modules/reporting-projects/controllers/reportingProject.controller")
const { createUploadMiddleware } = require("../modules/storage/upload.middleware")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const upload = createUploadMiddleware({
  namespace: "documents",
  tempDir: "incoming",
  maxFileSize: 25 * 1024 * 1024,
})

const repositoryUpload = createUploadMiddleware({
  namespace: "repository",
  tempDir: "incoming",
  maxFileSize: 25 * 1024 * 1024,
})

router.get("/funds", FundController.getFunds)
router.post("/funds", FundController.createFund)
router.get("/funds/:id/profile", FundController.getFundProfile)
router.put("/funds/:id/profile", FundController.updateFundProfile)
router.get("/funds/:fundId/reporting-projects", ReportingProjectController.listProjects)
router.post("/funds/:fundId/reporting-projects", ReportingProjectController.createProject)
router.get("/funds/:fundId/reporting-projects/:projectId", ReportingProjectController.getProject)
router.patch("/funds/:fundId/reporting-projects/:projectId", ReportingProjectController.updateProject)
router.post("/funds/:fundId/reporting-projects/:projectId/run", ReportingProjectController.runDraft)
router.post("/funds/:fundId/reporting-projects/:projectId/sources", ReportingProjectController.attachSource)
router.delete(
  "/funds/:fundId/reporting-projects/:projectId/sources/:sourceId",
  ReportingProjectController.removeSource,
)
router.get("/funds/:fundId/reporting-projects/:projectId/readiness", ReportingProjectController.getReadiness)
router.get("/funds/:fundId/repository/readers", RepositoryController.getReaders)
router.get("/funds/:fundId/repository/summary", RepositoryController.getSummary)
router.get("/funds/:fundId/repository/items", RepositoryController.getItems)
router.post("/funds/:fundId/repository/items", repositoryUpload.single("file"), RepositoryController.createItem)
router.post(
  "/funds/:fundId/repository/items/:itemId/versions",
  repositoryUpload.single("file"),
  RepositoryController.addVersion,
)
router.put("/funds/:fundId/repository/items/:itemId", RepositoryController.updateItem)
router.put("/funds/:fundId/repository/items/:itemId/current-version", RepositoryController.setCurrentVersion)
router.get("/funds/:fundId/repository/versions/:versionId/download", RepositoryController.downloadVersion)
router.get("/funds/:fundId/repository/versions/:versionId/reader-suggestion", RepositoryController.getReaderSuggestion)
router.post("/funds/:fundId/repository/analyze-current", RepositoryController.analyzeCurrentVersions)
router.post("/funds/:fundId/repository/versions/:versionId/analyze", RepositoryController.analyzeVersion)
router.get("/funds/:fundId/repository/versions/:versionId/analyses", RepositoryController.getVersionAnalyses)
router.post("/funds/:fundId/repository/versions/:versionId/key-points", RepositoryController.addManualKeyPoint)
router.put("/funds/:fundId/repository/versions/:versionId/key-points/review", RepositoryController.reviewVersionKeyPoints)
router.get(
  "/funds/:fundId/repository/items/:itemId/versions/:versionId/comparison",
  RepositoryController.getVersionComparison,
)
router.get("/funds/:fundId/repository/insights", RepositoryController.getInsights)
router.get("/funds/:fundId/repository/readiness", RepositoryController.getReadiness)
router.get("/funds/:fundId/repository/knowledge", RepositoryController.getKnowledgePack)
router.get("/funds/:fundId/repository/key-points", RepositoryController.getKeyPointIndex)
router.put("/funds/:fundId/repository/key-points/:keyPointId", RepositoryController.reviewKeyPoint)
router.get("/funds/:fundId/repository/activity", RepositoryController.getActivity)

router.get("/share-classes", FundAdminController.getShareClasses)
router.post("/share-classes", FundAdminController.createShareClass)
router.put("/share-classes/:id", FundAdminController.updateShareClass)
router.delete("/share-classes/:id", FundAdminController.deleteShareClass)

router.get("/investors", FundAdminController.getInvestors)
router.post("/investors", FundAdminController.createInvestor)
router.put("/investors/:id", FundAdminController.updateInvestor)
router.delete("/investors/:id", FundAdminController.deleteInvestor)

router.get("/commitments", FundAdminController.getCommitments)
router.post("/commitments", FundAdminController.createCommitment)
router.put("/commitments/:id", FundAdminController.updateCommitment)
router.delete("/commitments/:id", FundAdminController.deleteCommitment)

router.get("/capital-calls", FundAdminController.getCapitalCalls)
router.post("/capital-calls", FundAdminController.createCapitalCall)
router.put("/capital-calls/:id", FundAdminController.updateCapitalCall)
router.put("/capital-call-lines/:id", FundAdminController.updateCapitalCallLine)

router.get("/distributions", FundAdminController.getDistributions)
router.post("/distributions", FundAdminController.createDistribution)
router.put("/distributions/:id", FundAdminController.updateDistribution)
router.put("/distribution-lines/:id", FundAdminController.updateDistributionLine)

router.get("/gl-accounts", FundAdminController.getGLAccounts)
router.post("/gl-accounts", FundAdminController.createGLAccount)
router.put("/gl-accounts/:id", FundAdminController.updateGLAccount)
router.delete("/gl-accounts/:id", FundAdminController.deleteGLAccount)

router.get("/journal-entries", FundAdminController.getJournalEntries)
router.post("/journal-entries", FundAdminController.createJournalEntry)

router.get("/documents", FundAdminController.getDocuments)
router.post("/documents", upload.single("file"), FundAdminController.uploadDocument)

router.get("/report-templates", ReportController.getReportTemplates)
router.post("/report-templates", ReportController.createReportTemplate)
router.put("/report-templates/:id", ReportController.updateReportTemplate)

router.post("/reports/run", ReportController.runReport)
router.get("/reports/history", ReportController.getReportHistory)
router.post("/reports/:id/export-requests", ReportController.requestReportExport)
router.get("/reports/:id/exports", ReportController.listReportExports)
router.get("/reports/download/:id/:format", ReportController.downloadReportFile)

module.exports = router
