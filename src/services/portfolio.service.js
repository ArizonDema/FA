// backend/src/services/portfolio.service.js


const { Portfolio, PortfolioRound, InvestmentContract, User } = require("../models")
const NavService = require("./nav.service")
const logger = require("../config/logger")
const { Op } = require("sequelize")

/**
 * Portfolio Service
 * Manages portfolios and rounds
 */
class PortfolioService {
  /**
   * Create a new portfolio
   */
  static async createPortfolio(data) {
    logger.info(`[v0] Creating portfolio: ${data.name}`)

    const portfolio = await Portfolio.create(data)
    return portfolio
  }

  /**
   * Get all portfolios
   */
  static async getAllPortfolios(filters = {}) {
    const where = {}

    if (filters.status) {
      where.status = filters.status
    }

    if (filters.risk_level) {
      where.risk_level = filters.risk_level
    }

    return await Portfolio.findAll({
      where,
      include: [
        {
          model: PortfolioRound,
          as: "rounds",
          order: [["round_number", "DESC"]],
          limit: 1,
        },
      ],
    })
  }

  /**
   * Create a new portfolio round
   */
  static async createRound(portfolioId, startDate) {
    logger.info(`[v0] Creating round for portfolio: ${portfolioId}`)

    const portfolio = await Portfolio.findByPk(portfolioId)
    if (!portfolio) {
      throw new Error("Portfolio not found")
    }

    // Get latest round number
    const latestRound = await PortfolioRound.findOne({
      where: { portfolio_id: portfolioId },
      order: [["round_number", "DESC"]],
    })

    const roundNumber = latestRound ? latestRound.round_number + 1 : 1

    const round = await PortfolioRound.create({
      portfolio_id: portfolioId,
      round_number: roundNumber,
      start_date: startDate || new Date(),
      status: "open",
      opening_nav: 1.0,
    })

    logger.info(`[v0] Round created: ${round.id}`)
    return round
  }

  /**
   * Get active rounds
   */
  static async getActiveRounds() {
    return await PortfolioRound.findAll({
      where: { status: "open" },
      include: [{ model: Portfolio, as: "portfolio" }],
    })
  }

  /**
   * Close a round
   */
  static async closeRound(roundId) {
    logger.info(`[v0] Closing round: ${roundId}`)

    const round = await PortfolioRound.findByPk(roundId)
    if (!round) {
      throw new Error("Round not found")
    }

    // Get final NAV
    const navData = await NavService.calculateNAV(roundId)

    await round.update({
      status: "closed",
      end_date: new Date(),
      closing_nav: navData.nav,
    })

    logger.info(`[v0] Round closed with NAV: ${navData.nav}`)
    return round
  }

  /**
   * Get AUM (Assets Under Management)
   */
  static async getAUM() {
    logger.info(`[v0] Calculating AUM`)

    const activeRounds = await PortfolioRound.findAll({
      where: { status: { [Op.in]: ["open", "closed"] } },
    })

    let totalAUM = 0

    for (const round of activeRounds) {
      const navData = await NavService.getLatestNAV(round.id)
      totalAUM += navData.portfolioValue
    }

    return {
      totalAUM: Number.parseFloat(totalAUM.toFixed(2)),
      activeRounds: activeRounds.length,
    }
  }
}

module.exports = PortfolioService
