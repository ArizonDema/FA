const express = require("express")
const ReviewController = require("../controllers/review.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

router.get("/", ReviewController.listReviewTasks)
router.get("/:id", ReviewController.getReviewTask)
router.post("/:id/approve", ReviewController.approveReviewTask)
router.post("/:id/reject", ReviewController.rejectReviewTask)
router.post("/:id/override", ReviewController.overrideReviewTask)
router.post("/:id/defer", ReviewController.deferReviewTask)

module.exports = router
