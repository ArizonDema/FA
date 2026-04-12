const express = require("express")
const AuditController = require("../controllers/audit.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

router.get("/", AuditController.getEvents)

module.exports = router
