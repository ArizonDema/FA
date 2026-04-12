const express = require("express")
const FundAdminController = require("../controllers/fundAdmin.controller")
const FundController = require("../modules/funds/controllers/fund.controller")
const ReportController = require("../modules/reports/controllers/report.controller")
const { createUploadMiddleware } = require("../modules/storage/upload.middleware")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const upload = createUploadMiddleware({
  namespace: "documents",
  tempDir: "incoming",
  maxFileSize: 25 * 1024 * 1024,
})

router.get("/funds", FundController.getFunds)
router.post("/funds", FundController.createFund)
router.get("/funds/:id/profile", FundController.getFundProfile)
router.put("/funds/:id/profile", FundController.updateFundProfile)

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
router.get("/reports/download/:id/:format", ReportController.downloadReportFile)

module.exports = router
