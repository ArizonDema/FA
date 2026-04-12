const express = require("express")
const CashFlowTemplateController = require("../modules/templates/controllers/cashFlowTemplate.controller")
const CashFlowReportController = require("../modules/reports/controllers/cashFlowReport.controller")
const { createUploadMiddleware } = require("../modules/storage/upload.middleware")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const upload = createUploadMiddleware({
  namespace: "cash-flow",
  tempDir: "tmp",
  allowedExtensions: [".xlsx"],
  maxFileSize: 20 * 1024 * 1024,
})

router.get("/templates", CashFlowTemplateController.getTemplates)
router.post("/templates/analyze", upload.single("template_file"), CashFlowTemplateController.analyzeTemplate)
router.post("/templates", upload.single("template_file"), CashFlowTemplateController.createTemplate)
router.post("/templates/:id/versions/:versionId/parse", CashFlowTemplateController.parseTemplateVersion)
router.get("/templates/:id/versions/:versionId/structure", CashFlowTemplateController.getTemplateVersionStructure)
router.get("/templates/:id/versions/:versionId/rows", CashFlowTemplateController.getTemplateVersionRows)
router.put("/templates/:id", CashFlowTemplateController.updateTemplate)
router.put("/templates/:id/activate", CashFlowTemplateController.activateTemplate)
router.post("/templates/:id/reanalyze", CashFlowTemplateController.reanalyzeTemplate)

router.post(
  "/reports/run",
  upload.fields([
    { name: "tb_file", maxCount: 1 },
    { name: "gl_file", maxCount: 1 },
  ]),
  CashFlowReportController.runCashFlowReport,
)
router.get("/reports/history", CashFlowReportController.getReportHistory)
router.get("/reports/download/:run_id", CashFlowReportController.downloadReport)

module.exports = router
