const express = require("express")
const MappingController = require("../controllers/mapping.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

router.get("/accounts", MappingController.listAccountMappings)
router.post("/accounts", MappingController.createAccountMapping)
router.post("/accounts/suggest", MappingController.suggestAccountMappings)
router.get("/accounts/:id/suggestions", MappingController.getAccountSuggestions)
router.patch("/accounts/:id/status", MappingController.updateAccountMappingStatus)

router.get("/template-rows", MappingController.listTemplateRowMappings)
router.post("/template-rows", MappingController.createTemplateRowMapping)
router.get("/template-rows/:id/suggestions", MappingController.getTemplateRowSuggestions)
router.get("/template-rows/:id/llm-mapping-suggestions", MappingController.getTemplateRowLlmSuggestions)
router.patch("/template-rows/:id/status", MappingController.updateTemplateRowMappingStatus)
router.get("/suggestions/:id/trace", MappingController.getSuggestionTrace)

module.exports = router
