// backend/src/controllers/investor.controller.js

const InvestmentService = require("../services/investment.service")
const WithdrawalService = require("../services/withdrawal.service")
const PortfolioService = require("../services/portfolio.service")
const NavService = require("../services/nav.service")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")

/**
 * Investor Controller
 * Handles investor-specific operations
 */
class InvestorController {
  /**
   * Get available portfolios
   * @route GET /api/v1/investor/portfolios
   */
  static async getPortfolios(req, res, next) {
    try {
      const portfolios = await PortfolioService.getAllPortfolios({ status: "active" })
      ResponseHandler.success(res, { portfolios }, "Portfolios retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get active investment rounds
   * @route GET /api/v1/investor/rounds
   */
  static async getActiveRounds(req, res, next) {
    try {
      const rounds = await PortfolioService.getActiveRounds()
      ResponseHandler.success(res, { rounds }, "Active rounds retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create investment
   * @route POST /api/v1/investor/invest
   */
  static async createInvestment(req, res, next) {
    try {
      const { portfolio_round_id, amount } = req.body
      const userId = req.user.id

      logger.info(`[v0] Investment request from user ${userId}`)

      const investment = await InvestmentService.createInvestment(userId, portfolio_round_id, amount)

      ResponseHandler.created(res, { investment }, "Investment created successfully")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get user investments
   * @route GET /api/v1/investor/investments
   */
  static async getInvestments(req, res, next) {
    try {
      const investments = await InvestmentService.getUserInvestments(req.user.id, req.query)

      ResponseHandler.success(res, { investments }, "Investments retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get investment details
   * @route GET /api/v1/investor/investments/:id
   */
  static async getInvestmentDetails(req, res, next) {
    try {
      const investment = await InvestmentService.getInvestmentDetails(req.params.id, req.user.id)

      ResponseHandler.success(res, { investment }, "Investment details retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get user statistics
   * @route GET /api/v1/investor/statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const stats = await InvestmentService.getUserStatistics(req.user.id)

      ResponseHandler.success(res, { statistics: stats }, "Statistics retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get NAV history for a round
   * @route GET /api/v1/investor/nav-history/:roundId
   */
  static async getNAVHistory(req, res, next) {
    try {
      const { roundId } = req.params
      const limit = Number.parseInt(req.query.limit) || 30

      const history = await NavService.getNAVHistory(roundId, limit)

      ResponseHandler.success(res, { history }, "NAV history retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Request withdrawal
   * @route POST /api/v1/investor/withdraw
   */
  static async requestWithdrawal(req, res, next) {
    try {
      const { investment_contract_id, units_to_redeem } = req.body

      logger.info(`[v0] Withdrawal request from user ${req.user.id}`)

      const withdrawal = await WithdrawalService.createWithdrawalRequest(
        req.user.id,
        investment_contract_id,
        units_to_redeem,
      )

      ResponseHandler.created(res, { withdrawal }, "Withdrawal request created")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get withdrawal requests
   * @route GET /api/v1/investor/withdrawals
   */
  static async getWithdrawals(req, res, next) {
    try {
      const withdrawals = await WithdrawalService.getUserWithdrawals(req.user.id)

      ResponseHandler.success(res, { withdrawals }, "Withdrawal requests retrieved")
    } catch (error) {
      next(error)
    }
  }
}

module.exports = InvestorController
