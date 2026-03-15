const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const FundAdminController = require("../controllers/fundAdmin.controller")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const uploadDir = path.join(__dirname, "..", "..", "uploads", "documents")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")
    cb(null, `${Date.now()}_${safeName}`)
  },
})

const upload = multer({ storage })

router.get("/funds", FundAdminController.getFunds)
router.post("/funds", FundAdminController.createFund)
router.get("/funds/:id/profile", FundAdminController.getFundProfile)
router.put("/funds/:id/profile", FundAdminController.updateFundProfile)

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

router.get("/report-templates", FundAdminController.getReportTemplates)
router.post("/report-templates", FundAdminController.createReportTemplate)
router.put("/report-templates/:id", FundAdminController.updateReportTemplate)

router.post("/reports/run", FundAdminController.runReport)
router.get("/reports/history", FundAdminController.getReportHistory)
router.get("/reports/download/:id/:format", FundAdminController.downloadReportFile)

module.exports = router
