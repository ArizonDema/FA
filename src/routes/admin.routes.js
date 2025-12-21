const express = require("express")
const AdminController = require("../controllers/admin.controller")
const { authenticate, authorize } = require("../middlewares/auth")
const validate = require("../middlewares/validation")
const Joi = require("joi")

const router = express.Router()

// All routes require admin authentication
router.use(authenticate, authorize("admin"))

// Validation schemas
// Validation schemas
const portfolioSchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Portfolio name is required",
    "any.required": "Portfolio name is required",
  }),

  description: Joi.string().trim().allow("").optional(),

  strategy_type: Joi.string().trim().required().messages({
    "string.empty": "Strategy type is required",
    "any.required": "Strategy type is required",
  }),

  management_fee_percent: Joi.number().precision(2).min(0).max(100).required().messages({
    "number.base": "Management fee must be a valid number",
    "number.min": "Management fee cannot be negative",
    "any.required": "Management fee is required",
  }),

  performance_fee_percent: Joi.number().precision(2).min(0).max(100).required().messages({
    "number.base": "Performance fee must be a valid number",
    "number.min": "Performance fee cannot be negative",
    "any.required": "Performance fee is required",
  }),

  lock_up_period_months: Joi.number().integer().min(0).required().messages({
    "number.base": "Lock-up period must be a valid whole number",
    "number.integer": "Lock-up period must be a whole number (months)",
    "any.required": "Lock-up period is required",
  }),

  early_withdrawal_penalty_percent: Joi.number().precision(2).min(0).max(100).required().messages({
    "number.base": "Early withdrawal penalty must be a valid number",
    "number.min": "Early withdrawal penalty cannot be negative",
    "any.required": "Early withdrawal penalty is required",
  }),

  minimum_investment: Joi.number().precision(2).min(0).required().messages({
    "number.base": "Minimum investment must be a valid amount",
    "number.min": "Minimum investment cannot be negative",
    "any.required": "Minimum investment is required",
  }),

  // Existing fields from your original schema
  risk_level: Joi.string()
    .valid("low", "medium", "high")
    .default("medium")
    .required()
    .messages({
      "any.only": "Risk level must be low, medium, or high",
    }),

  base_currency: Joi.string()
    .length(3)
    .uppercase()
    .default("USD"),
});

const roundSchema = Joi.object({
  portfolio_id: Joi.string().uuid().required(),
  start_date: Joi.date().optional(),
})

const kycSchema = Joi.object({
  kyc_status: Joi.string().valid("pending", "verified", "rejected").required(),
})

const withdrawalActionSchema = Joi.object({
  admin_notes: Joi.string().optional(),
  reason: Joi.string().optional(),
})

/**
 * @swagger
 * /admin/portfolios:
 *   post:
 *     summary: Create portfolio (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post("/portfolios", validate(portfolioSchema), AdminController.createPortfolio)

/**
 * @swagger
 * /admin/rounds:
 *   post:
 *     summary: Create portfolio round (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post("/rounds", validate(roundSchema), AdminController.createRound)

/**
 * @swagger
 * /admin/rounds/:id/close:
 *   put:
 *     summary: Close portfolio round (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put("/rounds/:id/close", AdminController.closeRound)

/**
 * @swagger
 * /admin/nav/calculate/:roundId:
 *   post:
 *     summary: Calculate and record NAV (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post("/nav/calculate/:roundId", AdminController.calculateNAV)

/**
 * @swagger
 * /admin/withdrawals:
 *   get:
 *     summary: Get all withdrawal requests (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get("/withdrawals", AdminController.getWithdrawalRequests)

/**
 * @swagger
 * /admin/withdrawals/:id/approve:
 *   put:
 *     summary: Approve withdrawal (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put("/withdrawals/:id/approve", validate(withdrawalActionSchema), AdminController.approveWithdrawal)

/**
 * @swagger
 * /admin/withdrawals/:id/reject:
 *   put:
 *     summary: Reject withdrawal (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put("/withdrawals/:id/reject", validate(withdrawalActionSchema), AdminController.rejectWithdrawal)

/**
 * @swagger
 * /admin/aum:
 *   get:
 *     summary: Get AUM statistics (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get("/aum", AdminController.getAUM)

/**
 * @swagger
 * /admin/users/:id/kyc:
 *   put:
 *     summary: Update user KYC status (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put("/users/:id/kyc", validate(kycSchema), AdminController.updateKYCStatus)

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get("/users", AdminController.getUsers)

module.exports = router
