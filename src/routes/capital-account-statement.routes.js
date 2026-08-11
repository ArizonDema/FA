const express = require("express")
const CapitalAccountStatementController = require("../modules/reports/controllers/capitalAccountStatement.controller")
const CapitalAccountTemplateController = require("../modules/templates/controllers/capitalAccountTemplate.controller")
const { createUploadMiddleware } = require("../modules/storage/upload.middleware")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const upload = createUploadMiddleware({
  namespace: "capital-account-statements",
  tempDir: "tmp",
  allowedExtensions: [".xlsx"],
  maxFileSize: 20 * 1024 * 1024,
})

router.get("/templates", CapitalAccountTemplateController.list)
router.post("/templates/analyze", upload.single("template_file"), CapitalAccountTemplateController.analyze)
router.post("/templates", upload.single("template_file"), CapitalAccountTemplateController.create)
router.get("/templates/:id/editor-context", CapitalAccountTemplateController.editorContext)
router.put("/templates/:id", CapitalAccountTemplateController.update)
router.put("/templates/:id/activate", CapitalAccountTemplateController.activate)
router.post("/templates/:id/reanalyze", CapitalAccountTemplateController.reanalyze)

router.post("/reports/run", CapitalAccountStatementController.run)
router.get("/reports/history", CapitalAccountStatementController.history)
router.get("/reports/download/:run_id", CapitalAccountStatementController.download)

module.exports = router
