const express = require("express")
const SemanticConceptController = require("../controllers/semanticConcept.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))
router.get("/", SemanticConceptController.list)
router.get("/categories", SemanticConceptController.listCategories)
router.get("/key/:key", SemanticConceptController.getByKey)
router.get("/:id", SemanticConceptController.getById)
router.post("/", SemanticConceptController.create)

module.exports = router
