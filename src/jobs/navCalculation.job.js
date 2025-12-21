const { PortfolioRound } = require("../models")
const NavService = require("../services/nav.service")
const logger = require("../config/logger")
const { Op } = require("sequelize")

/**
 * NAV Calculation Background Job
 * Calculates and records NAV for all open portfolio rounds
 * Runs daily (configurable via cron schedule)
 */
class NavCalculationJob {
  /**
   * Execute NAV calculation for all active rounds
   */
  static async execute() {
    const startTime = Date.now()
    logger.info("[v0] NAV Calculation Job - Starting execution")

    try {
      // Get all open rounds
      const openRounds = await PortfolioRound.findAll({
        where: {
          status: "open",
        },
      })

      logger.info(`[v0] Found ${openRounds.length} open rounds to process`)

      const results = {
        success: 0,
        failed: 0,
        errors: [],
      }

      // Process each round
      for (const round of openRounds) {
        try {
          logger.info(`[v0] Processing round: ${round.id} (Portfolio: ${round.portfolio_id})`)

          // Calculate NAV
          const navData = await NavService.calculateNAV(round.id)

          logger.info(`[v0] NAV calculated for round ${round.id}: ${navData.nav}`)

          // Record NAV in history
          await NavService.recordNAV(round.id, navData)

          logger.info(`[v0] NAV recorded for round ${round.id}`)

          results.success++
        } catch (error) {
          logger.error(`[v0] Failed to calculate NAV for round ${round.id}:`, error)
          results.failed++
          results.errors.push({
            roundId: round.id,
            error: error.message,
          })
        }
      }

      const duration = Date.now() - startTime

      logger.info("[v0] NAV Calculation Job - Execution completed", {
        duration: `${duration}ms`,
        totalRounds: openRounds.length,
        successful: results.success,
        failed: results.failed,
      })

      return results
    } catch (error) {
      logger.error("[v0] NAV Calculation Job - Fatal error:", error)
      throw error
    }
  }

  /**
   * Calculate NAV for a specific round (manual trigger)
   * @param {String} roundId - Portfolio round UUID
   */
  static async executeForRound(roundId) {
    logger.info(`[v0] NAV Calculation Job - Manual execution for round: ${roundId}`)

    try {
      const navData = await NavService.calculateNAV(roundId)
      await NavService.recordNAV(roundId, navData)

      logger.info(`[v0] NAV calculation completed for round ${roundId}`)
      return navData
    } catch (error) {
      logger.error(`[v0] NAV calculation failed for round ${roundId}:`, error)
      throw error
    }
  }
}

module.exports = NavCalculationJob
