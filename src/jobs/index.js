const cron = require("node-cron")
const config = require("../config/app")
const logger = require("../config/logger")
const navCalculationJob = require("./navCalculation.job")
const feeAccrualJob = require("./feeAccrual.job")

/**
 * Background Jobs Orchestrator
 * Manages all scheduled background jobs
 */

let navJob = null
let feeJob = null

/**
 * Start all background jobs
 */
function startBackgroundJobs() {
  logger.info("[v0] Initializing background jobs...")

  // NAV Calculation Job - Runs daily at midnight
  navJob = cron.schedule(
    config.jobs.navCalculationSchedule,
    async () => {
      logger.info("[v0] Starting scheduled NAV calculation job")
      try {
        await navCalculationJob.execute()
        logger.info("[v0] NAV calculation job completed successfully")
      } catch (error) {
        logger.error("[v0] NAV calculation job failed:", error)
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  )

  // Fee Accrual Job - Runs daily at 1 AM
  feeJob = cron.schedule(
    config.jobs.feeAccrualSchedule,
    async () => {
      logger.info("[v0] Starting scheduled fee accrual job")
      try {
        await feeAccrualJob.execute()
        logger.info("[v0] Fee accrual job completed successfully")
      } catch (error) {
        logger.error("[v0] Fee accrual job failed:", error)
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  )

  logger.info("[v0] Background jobs started:")
  logger.info(`  - NAV Calculation: ${config.jobs.navCalculationSchedule}`)
  logger.info(`  - Fee Accrual: ${config.jobs.feeAccrualSchedule}`)
}

/**
 * Stop all background jobs
 */
function stopBackgroundJobs() {
  logger.info("[v0] Stopping background jobs...")

  if (navJob) {
    navJob.stop()
  }

  if (feeJob) {
    feeJob.stop()
  }

  logger.info("[v0] Background jobs stopped")
}

module.exports = {
  startBackgroundJobs,
  stopBackgroundJobs,
}
