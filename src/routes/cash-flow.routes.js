const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const CashFlowController = require("../controllers/cashFlow.controller")
const { authenticate, authorize } = require("../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

const uploadRoot = path.join(__dirname, "..", "..", "uploads", "cash-flow", "tmp")
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const safeName = String(file.originalname || "upload.xlsx").replace(/[^a-zA-Z0-9._-]/g, "_")
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase()
    if (extension !== ".xlsx") {
      return cb(new Error("Only .xlsx files are supported"))
    }
    return cb(null, true)
  },
})

router.get("/templates", CashFlowController.getTemplates)
router.post("/templates/analyze", upload.single("template_file"), CashFlowController.analyzeTemplate)
router.post("/templates", upload.single("template_file"), CashFlowController.createTemplate)
router.put("/templates/:id", CashFlowController.updateTemplate)
router.put("/templates/:id/activate", CashFlowController.activateTemplate)
router.post("/templates/:id/reanalyze", CashFlowController.reanalyzeTemplate)

router.post(
  "/reports/run",
  upload.fields([
    { name: "tb_file", maxCount: 1 },
    { name: "gl_file", maxCount: 1 },
  ]),
  CashFlowController.runCashFlowReport,
)
router.get("/reports/history", CashFlowController.getReportHistory)
router.get("/reports/download/:run_id", CashFlowController.downloadReport)

module.exports = router
