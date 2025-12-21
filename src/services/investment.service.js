const { InvestmentContract, PortfolioRound, User, UnitLedger, CashLedger, Portfolio, FeeRecord } = require("../models")
const NavService = require("./nav.service")
const logger = require("../config/logger")
const config = require("../config/app")
const { Op } = require("sequelize")
const db = require("../models")

/**
 * Investment Service
 * Handles investment operations and unit issuance
 */
class InvestmentService {
  /**
   * Create a new investment
   * Issues units based on current NAV
   *
   * @param {String} userId - User UUID
   * @param {String} portfolioRoundId - Portfolio round UUID
   * @param {Number} amount - Investment amount
   * @returns {Object} Investment contract
   */
  static async createInvestment(userId, portfolioRoundId, amount) {
    const transaction = await db.sequelize.transaction()

    try {
      logger.info(`[v0] Creating investment: User ${userId}, Round ${portfolioRoundId}, Amount ${amount}`)

      // Validate user
      const user = await User.findByPk(userId)
      if (!user) {
        throw new Error("User not found")
      }

      if (user.kyc_status !== "verified") {
        throw new Error("KYC verification required")
      }

      // Validate portfolio round
      const round = await PortfolioRound.findByPk(portfolioRoundId)
      if (!round || round.status !== "open") {
        throw new Error("Portfolio round is not open for investment")
      }

      // Get current NAV
      const navData = await NavService.getLatestNAV(portfolioRoundId)
      const currentNAV = navData.nav

      logger.info(`[v0] Current NAV: ${currentNAV}`)

      // Calculate units to issue
      // Units = Investment Amount / Current NAV
      const unitsToIssue = amount / currentNAV

      logger.info(`[v0] Units to issue: ${unitsToIssue}`)

      // Calculate lockup end date
      const lockupEndDate = new Date()
      lockupEndDate.setMonth(lockupEndDate.getMonth() + config.lockup.defaultMonths)

      // Create investment contract
      const investment = await InvestmentContract.create(
        {
          user_id: userId,
          portfolio_round_id: portfolioRoundId,
          invested_amount: amount,
          units_issued: unitsToIssue,
          units_remaining: unitsToIssue,
          entry_nav: currentNAV,
          entry_date: new Date(),
          lockup_end_date: lockupEndDate,
          status: "active",
        },
        { transaction },
      )

      logger.info(`[v0] Investment contract created: ${investment.id}`)

      // Record unit issuance in ledger
      await UnitLedger.create(
        {
          investment_contract_id: investment.id,
          units: unitsToIssue,
          type: "issue",
          nav: currentNAV,
          event_date: new Date(),
          reference_type: "investment",
          reference_id: investment.id,
          notes: `Initial investment of ${amount}`,
        },
        { transaction },
      )

      logger.info(`[v0] Unit ledger entry created`)

      // Record cash deposit in cash ledger
      await CashLedger.create(
        {
          portfolio_round_id: portfolioRoundId,
          amount: amount,
          type: "deposit",
          reference_type: "investment",
          reference_id: investment.id,
          description: `Investment from user ${user.full_name}`,
          recorded_at: new Date(),
        },
        { transaction },
      )

      logger.info(`[v0] Cash ledger entry created`)

      // Update round statistics
      await round.update(
        {
          total_units_issued: Number.parseFloat(round.total_units_issued) + unitsToIssue,
          total_cash_collected: Number.parseFloat(round.total_cash_collected) + amount,
        },
        { transaction },
      )

      logger.info(`[v0] Round statistics updated`)

      await transaction.commit()

      // Return investment with related data
      return await InvestmentContract.findByPk(investment.id, {
        include: [
          { model: User, as: "user", attributes: ["id", "full_name", "email"] },
          { model: PortfolioRound, as: "round", include: [{ model: Portfolio, as: "portfolio" }] },
        ],
      })
    } catch (error) {
      await transaction.rollback()
      logger.error(`[v0] Investment creation error:`, error)
      throw error
    }
  }

  /**
   * Get user's investments
   *
   * @param {String} userId - User UUID
   * @param {Object} filters - Optional filters
   */
  static async getUserInvestments(userId, filters = {}) {
    logger.info(`[v0] Fetching investments for user: ${userId}`)

    const where = { user_id: userId }

    if (filters.status) {
      where.status = filters.status
    }

    if (filters.portfolioId) {
      where["$round.portfolio_id$"] = filters.portfolioId
    }

    const investments = await InvestmentContract.findAll({
      where,
      include: [
        {
          model: PortfolioRound,
          as: "round",
          include: [{ model: Portfolio, as: "portfolio" }],
        },
        {
          model: UnitLedger,
          as: "unitEntries",
          order: [["event_date", "DESC"]],
          limit: 5,
        },
      ],
      order: [["created_at", "DESC"]],
    })

    // Enrich with current values
    const enrichedInvestments = await Promise.all(
      investments.map(async (investment) => {
        const inv = investment.toJSON()

        // Get current NAV
        const navData = await NavService.getLatestNAV(investment.portfolio_round_id)

        // Calculate current value
        const currentValue = Number.parseFloat(investment.units_remaining) * navData.nav

        // Calculate returns
        const investedAmount = Number.parseFloat(investment.invested_amount)
        const profit = currentValue - investedAmount
        const returnPercentage = (profit / investedAmount) * 100

        return {
          ...inv,
          currentNAV: navData.nav,
          currentValue: Number.parseFloat(currentValue.toFixed(2)),
          profit: Number.parseFloat(profit.toFixed(2)),
          returnPercentage: Number.parseFloat(returnPercentage.toFixed(2)),
          isLocked: new Date() < new Date(investment.lockup_end_date),
        }
      }),
    )

    return enrichedInvestments
  }

  /**
   * Get investment details by ID
   *
   * @param {String} investmentId - Investment contract UUID
   * @param {String} userId - User UUID (for authorization)
   */
  static async getInvestmentDetails(investmentId, userId = null) {
    logger.info(`[v0] Fetching investment details: ${investmentId}`)

    const where = { id: investmentId }
    if (userId) {
      where.user_id = userId
    }

    const investment = await InvestmentContract.findOne({
      where,
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
        {
          model: PortfolioRound,
          as: "round",
          include: [{ model: Portfolio, as: "portfolio" }],
        },
        { model: UnitLedger, as: "unitEntries", order: [["event_date", "DESC"]] },
        { model: FeeRecord, as: "fees", order: [["charged_at", "DESC"]] },
      ],
    })

    if (!investment) {
      throw new Error("Investment not found")
    }

    return investment
  }

  /**
   * Get investment statistics for a user
   *
   * @param {String} userId - User UUID
   */
  static async getUserStatistics(userId) {
    logger.info(`[v0] Calculating statistics for user: ${userId}`)

    const investments = await InvestmentContract.findAll({
      where: {
        user_id: userId,
        status: { [Op.in]: ["active", "partially_exited"] },
      },
    })

    let totalInvested = 0
    let currentValue = 0
    const uniqueRounds = new Set()

    for (const investment of investments) {
      totalInvested += Number.parseFloat(investment.invested_amount)
      uniqueRounds.add(investment.portfolio_round_id)

      // Get current NAV
      const navData = await NavService.getLatestNAV(investment.portfolio_round_id)
      const value = Number.parseFloat(investment.units_remaining) * navData.nav
      currentValue += value
    }

    const profit = currentValue - totalInvested
    const returnPercentage = totalInvested > 0 ? (profit / totalInvested) * 100 : 0

    return {
      totalInvestments: investments.length,
      roundsJoined: uniqueRounds.size,
      totalInvested: Number.parseFloat(totalInvested.toFixed(2)),
      currentValue: Number.parseFloat(currentValue.toFixed(2)),
      totalProfit: Number.parseFloat(profit.toFixed(2)),
      overallReturn: Number.parseFloat(returnPercentage.toFixed(2)),
    }
  }
}

module.exports = InvestmentService
