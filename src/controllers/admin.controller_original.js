// backend/src/controllers/admin.controller.js

const PortfolioService = require("../services/portfolio.service")
const NavService = require("../services/nav.service")
const WithdrawalService = require("../services/withdrawal.service")
const { User, WithdrawalRequest, InvestmentContract, PortfolioRound, Portfolio } = require("../models")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")

/**
 * Admin Controller
 * Handles admin-only operations
 */
class AdminController {
  /**
   * Create portfolio
   * @route POST /api/v1/admin/portfolios
   */
  static async createPortfolio(req, res, next) {
    try {
      const portfolio = await PortfolioService.createPortfolio(req.body)

      logger.info(`[v0] Portfolio created by admin: ${portfolio.id}`)

      ResponseHandler.created(res, { portfolio }, "Portfolio created")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create portfolio round
   * @route POST /api/v1/admin/rounds
   */
  static async createRound(req, res, next) {
    try {
      const { portfolio_id, start_date } = req.body

      const round = await PortfolioService.createRound(portfolio_id, start_date)

      logger.info(`[v0] Round created by admin: ${round.id}`)

      ResponseHandler.created(res, { round }, "Round created")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Close portfolio round
   * @route PUT /api/v1/admin/rounds/:id/close
   */
  static async closeRound(req, res, next) {
    try {
      const round = await PortfolioService.closeRound(req.params.id)

      logger.info(`[v0] Round closed by admin: ${round.id}`)

      ResponseHandler.success(res, { round }, "Round closed")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Calculate and record NAV
   * @route POST /api/v1/admin/nav/calculate/:roundId
   */
  static async calculateNAV(req, res, next) {
    try {
      const { roundId } = req.params

      logger.info(`[v0] Manual NAV calculation triggered by admin for round: ${roundId}`)

      const navData = await NavService.calculateNAV(roundId)
      const recorded = await NavService.recordNAV(roundId, navData)

      ResponseHandler.success(res, { nav: navData, recorded }, "NAV calculated and recorded")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get all withdrawal requests
   * @route GET /api/v1/admin/withdrawals
   */
  static async getWithdrawalRequests(req, res, next) {
    try {
      const { status } = req.query
      const where = {}

      if (status) {
        where.status = status
      }

      const withdrawals = await WithdrawalRequest.findAll({
        where,
        include: [
          { model: User, as: "user", attributes: ["id", "full_name", "email"] },
          { model: InvestmentContract, as: "contract", include: [{ model: PortfolioRound, as: "round" }] },
        ],
        order: [["created_at", "DESC"]],
      })

      ResponseHandler.success(res, { withdrawals }, "Withdrawal requests retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Approve withdrawal
   * @route PUT /api/v1/admin/withdrawals/:id/approve
   */
  static async approveWithdrawal(req, res, next) {
    try {
      const { admin_notes } = req.body

      logger.info(`[v0] Admin approving withdrawal: ${req.params.id}`)

      const withdrawal = await WithdrawalService.processWithdrawal(req.params.id, admin_notes)

      ResponseHandler.success(res, { withdrawal }, "Withdrawal approved and processed")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Reject withdrawal
   * @route PUT /api/v1/admin/withdrawals/:id/reject
   */
  static async rejectWithdrawal(req, res, next) {
    try {
      const { reason } = req.body

      logger.info(`[v0] Admin rejecting withdrawal: ${req.params.id}`)

      const withdrawal = await WithdrawalService.rejectWithdrawal(req.params.id, reason)

      ResponseHandler.success(res, { withdrawal }, "Withdrawal rejected")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get AUM statistics
   * @route GET /api/v1/admin/aum
   */
  static async getAUM(req, res, next) {
    try {
      const aum = await PortfolioService.getAUM()

      ResponseHandler.success(res, aum, "AUM retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Update user KYC status
   * @route PUT /api/v1/admin/users/:id/kyc
   */
  static async updateKYCStatus(req, res, next) {
    try {
      const { kyc_status } = req.body
      const user = await User.findByPk(req.params.id)

      if (!user) {
        return ResponseHandler.notFound(res, "User not found")
      }

      await user.update({ kyc_status })

      logger.info(`[v0] KYC status updated for user ${user.id}: ${kyc_status}`)

      ResponseHandler.success(res, { user: user.toSafeObject() }, "KYC status updated")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get all users
   * @route GET /api/v1/admin/users
   */
  static async getUsers(req, res, next) {
    try {
      const { kyc_status, role, status } = req.query
      const where = {}

      if (kyc_status) where.kyc_status = kyc_status
      if (role) where.role = role
      if (status) where.status = status

      const users = await User.findAll({
        where,
        attributes: { exclude: ["password"] },
        order: [["created_at", "DESC"]],
      })

      ResponseHandler.success(res, { users }, "Users retrieved")
    } catch (error) {
      next(error)
    }
  }
}

module.exports = AdminController
