// backend/src/routes/investor.routes.js

const express = require("express")
const InvestorController = require("../controllers/investor.controller")
const { authenticate, checkKYC } = require("../middlewares/auth")
const validate = require("../middlewares/validation")
const Joi = require("joi")

const router = express.Router()

// All routes require authentication
router.use(authenticate)

// Validation schemas
const investSchema = Joi.object({
  portfolio_round_id: Joi.string().uuid().required(),
  amount: Joi.number().positive().min(100).required(),
})

const withdrawSchema = Joi.object({
  investment_contract_id: Joi.string().uuid().required(),
  units_to_redeem: Joi.number().positive().required(),
})

/**
 * @swagger
 * /investor/portfolios:
 *   get:
 *     summary: Get available portfolios
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/portfolios", InvestorController.getPortfolios)

/**
 * @swagger
 * /investor/rounds:
 *   get:
 *     summary: Get active investment rounds
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/rounds", InvestorController.getActiveRounds)

/**
 * @swagger
 * /investor/invest:
 *   post:
 *     summary: Create new investment
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - portfolio_round_id
 *               - amount
 *             properties:
 *               portfolio_round_id:
 *                 type: string
 *               amount:
 *                 type: number
 */
router.post("/invest", checkKYC, validate(investSchema), InvestorController.createInvestment)

/**
 * @swagger
 * /investor/investments:
 *   get:
 *     summary: Get user investments
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/investments", InvestorController.getInvestments)

/**
 * @swagger
 * /investor/investments/:id:
 *   get:
 *     summary: Get investment details
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/investments/:id", InvestorController.getInvestmentDetails)

/**
 * @swagger
 * /investor/statistics:
 *   get:
 *     summary: Get user statistics
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/statistics", InvestorController.getStatistics)

/**
 * @swagger
 * /investor/nav-history/:roundId:
 *   get:
 *     summary: Get NAV history for a round
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/nav-history/:roundId", InvestorController.getNAVHistory)

/**
 * @swagger
 * /investor/withdraw:
 *   post:
 *     summary: Request withdrawal
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.post("/withdraw", validate(withdrawSchema), InvestorController.requestWithdrawal)

/**
 * @swagger
 * /investor/withdrawals:
 *   get:
 *     summary: Get withdrawal requests
 *     tags: [Investor]
 *     security:
 *       - bearerAuth: []
 */
router.get("/withdrawals", InvestorController.getWithdrawals)

module.exports = router
