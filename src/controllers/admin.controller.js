// backend/src/controllers/admin.controller.js

const PortfolioService = require("../services/portfolio.service")
const NavService = require("../services/nav.service")
const WithdrawalService = require("../services/withdrawal.service")

// Don’t forget to require the new services at the top of admin.controller.js:
const CashLedgerService = require("../services/cashLedger.service")
const FeeRecordService = require("../services/feeRecord.service")
const InvestmentContractService = require("../services/investmentContract.service")
const StockAssetService = require("../services/stockAsset.service")
const StockPositionService = require("../services/stockPosition.service")
const TradeTransactionService = require("../services/tradeTransaction.service")
const UnitLedgerService = require("../services/unitLedger.service")

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




  // Extend Admin Controller (src/controllers/admin.controller.js)
  // Add these static methods inside the existing AdminController class (after the existing ones):

  // === CASH LEDGER ===
  static async getCashLedger(req, res, next) {
    try {
      const records = await CashLedgerService.getAll(req.query);
      ResponseHandler.success(res, { records }, "Cash ledger retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createCashLedger(req, res, next) {
    try {
      const record = await CashLedgerService.create(req.body);
      ResponseHandler.created(res, { record }, "Cash ledger entry created");
    } catch (error) {
      next(error);
    }
  }

  static async updateCashLedger(req, res, next) {
    try {
      const record = await CashLedgerService.update(req.params.id, req.body);
      ResponseHandler.success(res, { record }, "Cash ledger entry updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteCashLedger(req, res, next) {
    try {
      const result = await CashLedgerService.delete(req.params.id);
      ResponseHandler.success(res, result, "Cash ledger entry deleted");
    } catch (error) {
      next(error);
    }
  }

  // === FEE RECORD ===
  static async getFeeRecords(req, res, next) {
    try {
      const records = await FeeRecordService.getAll(req.query);
      ResponseHandler.success(res, { records }, "Fee records retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createFeeRecord(req, res, next) {
    try {
      const record = await FeeRecordService.create(req.body);
      ResponseHandler.created(res, { record }, "Fee record created");
    } catch (error) {
      next(error);
    }
  }

  static async updateFeeRecord(req, res, next) {
    try {
      const record = await FeeRecordService.update(req.params.id, req.body);
      ResponseHandler.success(res, { record }, "Fee record updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteFeeRecord(req, res, next) {
    try {
      const result = await FeeRecordService.delete(req.params.id);
      ResponseHandler.success(res, result, "Fee record deleted");
    } catch (error) {
      next(error);
    }
  }

  // === INVESTMENT CONTRACT ===
  static async getInvestmentContracts(req, res, next) {
    try {
      const contracts = await InvestmentContractService.getAll(req.query);
      ResponseHandler.success(res, { contracts }, "Investment contracts retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createInvestmentContract(req, res, next) {
    try {
      const contract = await InvestmentContractService.create(req.body);
      ResponseHandler.created(res, { contract }, "Investment contract created");
    } catch (error) {
      next(error);
    }
  }

  static async updateInvestmentContract(req, res, next) {
    try {
      const contract = await InvestmentContractService.update(req.params.id, req.body);
      ResponseHandler.success(res, { contract }, "Investment contract updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteInvestmentContract(req, res, next) {
    try {
      const result = await InvestmentContractService.delete(req.params.id);
      ResponseHandler.success(res, result, "Investment contract deleted");
    } catch (error) {
      next(error);
    }
  }

  // === STOCK ASSET ===
  static async getStockAssets(req, res, next) {
    try {
      const assets = await StockAssetService.getAll(req.query);
      ResponseHandler.success(res, { assets }, "Stock assets retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createStockAsset(req, res, next) {
    try {
      const asset = await StockAssetService.create(req.body);
      ResponseHandler.created(res, { asset }, "Stock asset created");
    } catch (error) {
      next(error);
    }
  }

  static async updateStockAsset(req, res, next) {
    try {
      const asset = await StockAssetService.update(req.params.id, req.body);
      ResponseHandler.success(res, { asset }, "Stock asset updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteStockAsset(req, res, next) {
    try {
      const result = await StockAssetService.delete(req.params.id);
      ResponseHandler.success(res, result, "Stock asset deleted");
    } catch (error) {
      next(error);
    }
  }

  // === STOCK POSITION ===
  static async getStockPositions(req, res, next) {
    try {
      const positions = await StockPositionService.getAll(req.query);
      ResponseHandler.success(res, { positions }, "Stock positions retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createStockPosition(req, res, next) {
    try {
      const position = await StockPositionService.create(req.body);
      ResponseHandler.created(res, { position }, "Stock position created");
    } catch (error) {
      next(error);
    }
  }

  static async updateStockPosition(req, res, next) {
    try {
      const position = await StockPositionService.update(req.params.id, req.body);
      ResponseHandler.success(res, { position }, "Stock position updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteStockPosition(req, res, next) {
    try {
      const result = await StockPositionService.delete(req.params.id);
      ResponseHandler.success(res, result, "Stock position deleted");
    } catch (error) {
      next(error);
    }
  }

  // === TRADE TRANSACTION ===
  static async getTradeTransactions(req, res, next) {
    try {
      const trades = await TradeTransactionService.getAll(req.query);
      ResponseHandler.success(res, { trades }, "Trade transactions retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createTradeTransaction(req, res, next) {
    try {
      const trade = await TradeTransactionService.create(req.body);
      ResponseHandler.created(res, { trade }, "Trade transaction created");
    } catch (error) {
      next(error);
    }
  }

  static async updateTradeTransaction(req, res, next) {
    try {
      const trade = await TradeTransactionService.update(req.params.id, req.body);
      ResponseHandler.success(res, { trade }, "Trade transaction updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteTradeTransaction(req, res, next) {
    try {
      const result = await TradeTransactionService.delete(req.params.id);
      ResponseHandler.success(res, result, "Trade transaction deleted");
    } catch (error) {
      next(error);
    }
  }

  // === UNIT LEDGER ===
  static async getUnitLedger(req, res, next) {
    try {
      const entries = await UnitLedgerService.getAll(req.query);
      ResponseHandler.success(res, { entries }, "Unit ledger retrieved");
    } catch (error) {
      next(error);
    }
  }

  static async createUnitLedger(req, res, next) {
    try {
      const entry = await UnitLedgerService.create(req.body);
      ResponseHandler.created(res, { entry }, "Unit ledger entry created");
    } catch (error) {
      next(error);
    }
  }

  static async updateUnitLedger(req, res, next) {
    try {
      const entry = await UnitLedgerService.update(req.params.id, req.body);
      ResponseHandler.success(res, { entry }, "Unit ledger entry updated");
    } catch (error) {
      next(error);
    }
  }

  static async deleteUnitLedger(req, res, next) {
    try {
      const result = await UnitLedgerService.delete(req.params.id);
      ResponseHandler.success(res, result, "Unit ledger entry deleted");
    } catch (error) {
      next(error);
    }
  }



}

module.exports = AdminController
