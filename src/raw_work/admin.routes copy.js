// backend/src/routes/admin.routes.js

const express = require("express")
const router = express.Router()
const Joi = require("joi")
const validate = require("../middlewares/validation")
const AdminController = require("../controllers/admin.controller")

// Import schemas
const portfolioSchema = require("../schemas/portfolio.schema")
const roundSchema = require("../schemas/round.schema")
const stockSchema = require("../schemas/stock.schema")
const tradeSchema = require("../schemas/trade.schema")
const feeSchema = require("../schemas/fee.schema")
const withdrawalActionSchema = require("../schemas/withdrawalAction.schema")
const kycSchema = require("../schemas/kyc.schema")

// Portfolio routes
/**
 * @swagger
 * /admin/portfolios:
 *   get:
 *     summary: Get all portfolios
 *     tags: [Admin - Portfolios]
 *     parameters:
 *       - in: query
 *         name: risk_level
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all portfolios
 *     security:
 *       - bearerAuth: []
 */
router.get("/portfolios", AdminController.getPortfolios)

/**
 * @swagger
 * /admin/portfolios:
 *   post:
 *     summary: Create new portfolio
 *     tags: [Admin - Portfolios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Portfolio'
 *     responses:
 *       201:
 *         description: Portfolio created successfully
 *     security:
 *       - bearerAuth: []
 */
router.post("/portfolios", validate(portfolioSchema), AdminController.createPortfolio)

/**
 * @swagger
 * /admin/portfolios/{id}:
 *   get:
 *     summary: Get portfolio by ID
 *     tags: [Admin - Portfolios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio details
 *       404:
 *         description: Portfolio not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/portfolios/:id", AdminController.getPortfolioById)

/**
 * @swagger
 * /admin/portfolios/{id}:
 *   put:
 *     summary: Update portfolio
 *     tags: [Admin - Portfolios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Portfolio'
 *     responses:
 *       200:
 *         description: Portfolio updated
 *       404:
 *         description: Portfolio not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/portfolios/:id", validate(portfolioSchema), AdminController.updatePortfolio)

/**
 * @swagger
 * /admin/portfolios/{id}:
 *   delete:
 *     summary: Delete portfolio
 *     tags: [Admin - Portfolios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio deleted
 *       404:
 *         description: Portfolio not found
 *     security:
 *       - bearerAuth: []
 */
router.delete("/portfolios/:id", AdminController.deletePortfolio)

// Portfolio Rounds routes
/**
 * @swagger
 * /admin/rounds:
 *   get:
 *     summary: Get all portfolio rounds
 *     tags: [Admin - Rounds]
 *     parameters:
 *       - in: query
 *         name: portfolio_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all rounds
 *     security:
 *       - bearerAuth: []
 */
router.get("/rounds", AdminController.getRounds)

/**
 * @swagger
 * /admin/rounds:
 *   post:
 *     summary: Create portfolio round
 *     tags: [Admin - Rounds]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PortfolioRound'
 *     responses:
 *       201:
 *         description: Round created
 *     security:
 *       - bearerAuth: []
 */
router.post("/rounds", validate(roundSchema), AdminController.createRound)

/**
 * @swagger
 * /admin/rounds/{id}:
 *   get:
 *     summary: Get round by ID
 *     tags: [Admin - Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Round details with NAV history
 *       404:
 *         description: Round not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/rounds/:id", AdminController.getRoundById)

/**
 * @swagger
 * /admin/rounds/{id}/close:
 *   put:
 *     summary: Close portfolio round
 *     tags: [Admin - Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Round closed
 *       404:
 *         description: Round not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/rounds/:id/close", AdminController.closeRound)

// Stock Management routes
/**
 * @swagger
 * /admin/stocks:
 *   get:
 *     summary: Get all stocks
 *     tags: [Admin - Stocks]
 *     parameters:
 *       - in: query
 *         name: sector
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all stocks
 *     security:
 *       - bearerAuth: []
 */
router.get("/stocks", AdminController.getStocks)

/**
 * @swagger
 * /admin/stocks:
 *   post:
 *     summary: Create new stock
 *     tags: [Admin - Stocks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Stock'
 *     responses:
 *       201:
 *         description: Stock created
 *     security:
 *       - bearerAuth: []
 */
router.post("/stocks", validate(stockSchema), AdminController.createStock)

/**
 * @swagger
 * /admin/stocks/{id}:
 *   get:
 *     summary: Get stock by ID
 *     tags: [Admin - Stocks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stock details
 *       404:
 *         description: Stock not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/stocks/:id", AdminController.getStockById)

/**
 * @swagger
 * /admin/stocks/{id}:
 *   put:
 *     summary: Update stock
 *     tags: [Admin - Stocks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Stock'
 *     responses:
 *       200:
 *         description: Stock updated
 *       404:
 *         description: Stock not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/stocks/:id", validate(stockSchema), AdminController.updateStock)

/**
 * @swagger
 * /admin/stocks/{id}:
 *   delete:
 *     summary: Delete stock
 *     tags: [Admin - Stocks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stock deleted
 *       404:
 *         description: Stock not found
 *     security:
 *       - bearerAuth: []
 */
router.delete("/stocks/:id", AdminController.deleteStock)

// Trade Management routes
/**
 * @swagger
 * /admin/trades:
 *   get:
 *     summary: Get all trades
 *     tags: [Admin - Trades]
 *     parameters:
 *       - in: query
 *         name: portfolio_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: stock_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: trade_type
 *         schema:
 *           type: string
 *           enum: [buy, sell]
 *     responses:
 *       200:
 *         description: List of all trades
 *     security:
 *       - bearerAuth: []
 */
router.get("/trades", AdminController.getTrades)

/**
 * @swagger
 * /admin/trades:
 *   post:
 *     summary: Record trade transaction
 *     tags: [Admin - Trades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Trade'
 *     responses:
 *       201:
 *         description: Trade recorded
 *     security:
 *       - bearerAuth: []
 */
router.post("/trades", validate(tradeSchema), AdminController.createTrade)

/**
 * @swagger
 * /admin/trades/{id}:
 *   get:
 *     summary: Get trade by ID
 *     tags: [Admin - Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trade details
 *       404:
 *         description: Trade not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/trades/:id", AdminController.getTradeById)

/**
 * @swagger
 * /admin/trades/{id}:
 *   put:
 *     summary: Update trade
 *     tags: [Admin - Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Trade'
 *     responses:
 *       200:
 *         description: Trade updated
 *       404:
 *         description: Trade not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/trades/:id", validate(tradeSchema), AdminController.updateTrade)

/**
 * @swagger
 * /admin/trades/{id}:
 *   delete:
 *     summary: Delete trade
 *     tags: [Admin - Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trade deleted
 *       404:
 *         description: Trade not found
 *     security:
 *       - bearerAuth: []
 */
router.delete("/trades/:id", AdminController.deleteTrade)

// Fee Management routes
/**
 * @swagger
 * /admin/fees:
 *   get:
 *     summary: Get all fees
 *     tags: [Admin - Fees]
 *     parameters:
 *       - in: query
 *         name: investment_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: fee_type
 *         schema:
 *           type: string
 *           enum: [management, performance, penalty]
 *     responses:
 *       200:
 *         description: List of all fees
 *     security:
 *       - bearerAuth: []
 */
router.get("/fees", AdminController.getFees)

/**
 * @swagger
 * /admin/fees:
 *   post:
 *     summary: Create fee record
 *     tags: [Admin - Fees]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Fee'
 *     responses:
 *       201:
 *         description: Fee record created
 *     security:
 *       - bearerAuth: []
 */
router.post("/fees", validate(feeSchema), AdminController.createFee)

/**
 * @swagger
 * /admin/fees/{id}:
 *   get:
 *     summary: Get fee by ID
 *     tags: [Admin - Fees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fee details
 *       404:
 *         description: Fee not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/fees/:id", AdminController.getFeeById)

// Investment Management routes
/**
 * @swagger
 * /admin/investments:
 *   get:
 *     summary: Get all investments from all users
 *     tags: [Admin - Investments]
 *     parameters:
 *       - in: query
 *         name: portfolio_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all investments with details
 *     security:
 *       - bearerAuth: []
 */
router.get("/investments", AdminController.getInvestments)

/**
 * @swagger
 * /admin/investments/{id}:
 *   get:
 *     summary: Get investment details by ID
 *     tags: [Admin - Investments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Complete investment details with ledgers
 *       404:
 *         description: Investment not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/investments/:id", AdminController.getInvestmentById)

// NAV Management routes
/**
 * @swagger
 * /admin/nav/calculate/{roundId}:
 *   post:
 *     summary: Calculate and record NAV
 *     tags: [Admin - NAV]
 *     parameters:
 *       - in: path
 *         name: roundId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: NAV calculated and recorded
 *     security:
 *       - bearerAuth: []
 */
router.post("/nav/calculate/:roundId", AdminController.calculateNAV)

/**
 * @swagger
 * /admin/nav-history:
 *   get:
 *     summary: Get NAV history
 *     tags: [Admin - NAV]
 *     parameters:
 *       - in: query
 *         name: portfolio_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: round_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: NAV history with pagination
 *     security:
 *       - bearerAuth: []
 */
router.get("/nav-history", AdminController.getNavHistory)

// Ledger routes
/**
 * @swagger
 * /admin/ledger/units/{investmentId}:
 *   get:
 *     summary: Get unit ledger for investment
 *     tags: [Admin - Ledger]
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unit ledger audit trail
 *       404:
 *         description: Ledger not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/ledger/units/:investmentId", AdminController.getUnitLedger)

/**
 * @swagger
 * /admin/ledger/cash/{investmentId}:
 *   get:
 *     summary: Get cash ledger for investment
 *     tags: [Admin - Ledger]
 *     parameters:
 *       - in: path
 *         name: investmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cash ledger audit trail
 *       404:
 *         description: Ledger not found
 *     security:
 *       - bearerAuth: []
 */
router.get("/ledger/cash/:investmentId", AdminController.getCashLedger)

// Withdrawal Management routes (expanded)
/**
 * @swagger
 * /admin/withdrawals:
 *   get:
 *     summary: Get all withdrawal requests with filters
 *     tags: [Admin - Withdrawals]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, completed]
 *     responses:
 *       200:
 *         description: List of withdrawal requests
 *     security:
 *       - bearerAuth: []
 */
router.get("/withdrawals", AdminController.getWithdrawalRequests)

/**
 * @swagger
 * /admin/withdrawals/{id}/approve:
 *   put:
 *     summary: Approve withdrawal request
 *     tags: [Admin - Withdrawals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal approved and processed
 *     security:
 *       - bearerAuth: []
 */
router.put("/withdrawals/:id/approve", validate(withdrawalActionSchema), AdminController.approveWithdrawal)

/**
 * @swagger
 * /admin/withdrawals/{id}/reject:
 *   put:
 *     summary: Reject withdrawal request
 *     tags: [Admin - Withdrawals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal rejected
 *     security:
 *       - bearerAuth: []
 */
router.put("/withdrawals/:id/reject", validate(withdrawalActionSchema), AdminController.rejectWithdrawal)

// User Management routes (expanded)
/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users with filters
 *     tags: [Admin - Users]
 *     parameters:
 *       - in: query
 *         name: kyc_status
 *         schema:
 *           type: string
 *           enum: [pending, verified, rejected]
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [investor, admin]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: List of users
 *     security:
 *       - bearerAuth: []
 */
router.get("/users", AdminController.getUsers)

/**
 * @swagger
 * /admin/users/{id}/kyc:
 *   put:
 *     summary: Update user KYC status
 *     tags: [Admin - Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               kyc_status:
 *                 type: string
 *                 enum: [pending, verified, rejected]
 *     responses:
 *       200:
 *         description: KYC status updated
 *     security:
 *       - bearerAuth: []
 */
router.put("/users/:id/kyc", validate(kycSchema), AdminController.updateKYCStatus)

/**
 * @swagger
 * /admin/users/{id}/deactivate:
 *   put:
 *     summary: Deactivate user account
 *     tags: [Admin - Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 *     security:
 *       - bearerAuth: []
 */
router.put("/users/:id/deactivate", AdminController.deactivateUser)

/**
 * @swagger
 * /admin/users/{id}/reactivate:
 *   put:
 *     summary: Reactivate user account
 *     tags: [Admin - Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User reactivated
 *     security:
 *       - bearerAuth: []
 */
router.put("/users/:id/reactivate", AdminController.reactivateUser)

// Platform Statistics route
/**
 * @swagger
 * /admin/statistics:
 *   get:
 *     summary: Get platform statistics
 *     tags: [Admin - Statistics]
 *     responses:
 *       200:
 *         description: Platform-wide statistics including AUM, user counts, fees
 *     security:
 *       - bearerAuth: []
 */
router.get("/statistics", AdminController.getStatistics)

// AUM route
/**
 * @swagger
 * /admin/aum:
 *   get:
 *     summary: Get total Assets Under Management
 *     tags: [Admin - Statistics]
 *     responses:
 *       200:
 *         description: AUM breakdown by portfolio
 *     security:
 *       - bearerAuth: []
 */
router.get("/aum", AdminController.getAUM)

module.exports = router
