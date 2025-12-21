const {
  PortfolioRound,
  PortfolioNavHistory,
  InvestmentContract,
  CashLedger,
  StockPosition,
  FeeRecord,
} = require("../models")
const logger = require("../config/logger")
const config = require("../config/app")
const { Op } = require("sequelize")

/**
 * NAV Calculation Service
 * Core financial logic for NAV computation
 */
class NavService {
  /**
   * Calculate current NAV for a portfolio round
   * Formula: NAV = (cash + market value - accrued fees) / total units
   *
   * @param {String} portfolioRoundId - Portfolio round UUID
   * @returns {Object} NAV calculation details
   */
  static async calculateNAV(portfolioRoundId) {
    try {
      logger.info(`[v0] Starting NAV calculation for round: ${portfolioRoundId}`)

      // Get portfolio round
      const round = await PortfolioRound.findByPk(portfolioRoundId)
      if (!round) {
        throw new Error("Portfolio round not found")
      }

      if (round.status === "closed" || round.status === "settled") {
        logger.warn(`[v0] Attempted NAV calculation on closed round: ${portfolioRoundId}`)
        throw new Error("Cannot calculate NAV for closed round")
      }

      // 1. Calculate total cash balance
      const cashEntries = await CashLedger.findAll({
        where: { portfolio_round_id: portfolioRoundId },
      })

      const cashBalance = cashEntries.reduce((sum, entry) => {
        return sum + Number.parseFloat(entry.amount)
      }, 0)

      logger.info(`[v0] Cash balance: ${cashBalance}`)

      // 2. Calculate market value of holdings
      const positions = await StockPosition.findAll({
        where: { portfolio_round_id: portfolioRoundId },
        order: [["recorded_at", "DESC"]],
      })

      // Get latest position for each stock
      const latestPositions = {}
      positions.forEach((pos) => {
        const stockId = pos.stock_asset_id
        if (!latestPositions[stockId]) {
          latestPositions[stockId] = pos
        }
      })

      const marketValue = Object.values(latestPositions).reduce((sum, pos) => {
        const value = Number.parseFloat(pos.shares) * Number.parseFloat(pos.current_price || pos.avg_price)
        return sum + value
      }, 0)

      logger.info(`[v0] Market value: ${marketValue}`)

      // 3. Calculate accrued fees (not yet charged)
      const accruedFees = await this._calculateAccruedFees(portfolioRoundId)
      logger.info(`[v0] Accrued fees: ${accruedFees}`)

      // 4. Get total outstanding units
      const totalUnits = Number.parseFloat(round.total_units_issued) || 0

      if (totalUnits === 0) {
        logger.warn(`[v0] No units issued yet for round ${portfolioRoundId}`)
        return {
          nav: round.opening_nav,
          totalUnits: 0,
          portfolioValue: 0,
          cashBalance,
          marketValue,
          accruedFees: 0,
        }
      }

      // 5. Calculate NAV
      const portfolioValue = cashBalance + marketValue - accruedFees
      const nav = portfolioValue / totalUnits

      logger.info(`[v0] NAV Calculation Complete:`, {
        nav,
        totalUnits,
        portfolioValue,
        cashBalance,
        marketValue,
        accruedFees,
      })

      return {
        nav: Number.parseFloat(nav.toFixed(6)),
        totalUnits: Number.parseFloat(totalUnits.toFixed(6)),
        portfolioValue: Number.parseFloat(portfolioValue.toFixed(2)),
        cashBalance: Number.parseFloat(cashBalance.toFixed(2)),
        marketValue: Number.parseFloat(marketValue.toFixed(2)),
        accruedFees: Number.parseFloat(accruedFees.toFixed(2)),
      }
    } catch (error) {
      logger.error(`[v0] NAV calculation error:`, error)
      throw error
    }
  }

  /**
   * Record NAV in history table
   *
   * @param {String} portfolioRoundId - Portfolio round UUID
   * @param {Object} navData - NAV calculation data
   */
  static async recordNAV(portfolioRoundId, navData) {
    try {
      logger.info(`[v0] Recording NAV for round: ${portfolioRoundId}`)

      const recorded = await PortfolioNavHistory.create({
        portfolio_round_id: portfolioRoundId,
        nav: navData.nav,
        total_units: navData.totalUnits,
        portfolio_value: navData.portfolioValue,
        cash_balance: navData.cashBalance,
        market_value: navData.marketValue,
        accrued_fees: navData.accruedFees,
        recorded_at: new Date(),
      })

      logger.info(`[v0] NAV recorded successfully: ${recorded.id}`)
      return recorded
    } catch (error) {
      // Handle duplicate entry (same round and timestamp)
      if (error.name === "SequelizeUniqueConstraintError") {
        logger.warn(`[v0] NAV already recorded for this timestamp`)
        return null
      }
      throw error
    }
  }

  /**
   * Get NAV history for a round
   *
   * @param {String} portfolioRoundId - Portfolio round UUID
   * @param {Number} limit - Number of records to return
   */
  static async getNAVHistory(portfolioRoundId, limit = 30) {
    logger.info(`[v0] Fetching NAV history for round: ${portfolioRoundId}`)

    const history = await PortfolioNavHistory.findAll({
      where: { portfolio_round_id: portfolioRoundId },
      order: [["recorded_at", "DESC"]],
      limit,
    })

    return history
  }

  /**
   * Get latest NAV for a round
   *
   * @param {String} portfolioRoundId - Portfolio round UUID
   * @returns {Object} Latest NAV data
   */
  static async getLatestNAV(portfolioRoundId) {
    logger.info(`[v0] Fetching latest NAV for round: ${portfolioRoundId}`)

    const latest = await PortfolioNavHistory.findOne({
      where: { portfolio_round_id: portfolioRoundId },
      order: [["recorded_at", "DESC"]],
    })

    if (!latest) {
      // If no history, calculate fresh NAV
      return await this.calculateNAV(portfolioRoundId)
    }

    return {
      nav: Number.parseFloat(latest.nav),
      totalUnits: Number.parseFloat(latest.total_units),
      portfolioValue: Number.parseFloat(latest.portfolio_value),
      cashBalance: Number.parseFloat(latest.cash_balance),
      marketValue: Number.parseFloat(latest.market_value),
      accruedFees: Number.parseFloat(latest.accrued_fees),
      recordedAt: latest.recorded_at,
    }
  }

  /**
   * Calculate accrued but not yet charged management fees
   * @private
   */
  static async _calculateAccruedFees(portfolioRoundId) {
    const contracts = await InvestmentContract.findAll({
      where: {
        portfolio_round_id: portfolioRoundId,
        status: { [Op.in]: ["active", "partially_exited"] },
      },
      include: [
        {
          model: FeeRecord,
          as: "fees",
          where: { fee_type: "management" },
          required: false,
        },
      ],
    })

    let totalAccrued = 0

    for (const contract of contracts) {
      // Get last fee charge date
      const lastFeeDate =
        contract.fees.length > 0
          ? new Date(Math.max(...contract.fees.map((f) => new Date(f.charged_at))))
          : new Date(contract.entry_date)

      // Calculate days since last fee
      const daysSinceLastFee = Math.floor((new Date() - lastFeeDate) / (1000 * 60 * 60 * 24))

      if (daysSinceLastFee > 0) {
        // Calculate accrued fee
        const contractValue = Number.parseFloat(contract.units_remaining) * Number.parseFloat(contract.entry_nav)
        const dailyFeeRate = config.fees.managementFeeAnnual / 100 / 365
        const accruedFee = contractValue * dailyFeeRate * daysSinceLastFee

        totalAccrued += accruedFee
      }
    }

    return totalAccrued
  }
}

module.exports = NavService
