const express = require("express")
const MappingController = require("../controllers/mapping.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

router.get("/accounts", MappingController.listAccountMappings)
router.post("/accounts", MappingController.createAccountMapping)
router.patch("/accounts/:id/status", MappingController.updateAccountMappingStatus)

router.get("/template-rows", MappingController.listTemplateRowMappings)
router.post("/template-rows", MappingController.createTemplateRowMapping)
router.patch("/template-rows/:id/status", MappingController.updateTemplateRowMappingStatus)

module.exports = router
