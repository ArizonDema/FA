const { InvestmentContract, FeeRecord } = require("../models")
const config = require("../config/app")
const logger = require("../config/logger")
const { Op } = require("sequelize")

/**
 * Fee Accrual Background Job
 * Calculates and records daily management fees
 * Runs daily (configurable via cron schedule)
 */
class FeeAccrualJob {
  /**
   * Execute fee accrual for all active investments
   */
  static async execute() {
    const startTime = Date.now()
    logger.info("[v0] Fee Accrual Job - Starting execution")

    try {
      // Get all active investment contracts
      const activeContracts = await InvestmentContract.findAll({
        where: {
          status: {
            [Op.in]: ["active", "partially_exited"],
          },
          units_remaining: {
            [Op.gt]: 0,
          },
        },
        include: [
          {
            model: FeeRecord,
            as: "fees",
            where: { fee_type: "management" },
            required: false,
            order: [["charged_at", "DESC"]],
            limit: 1,
          },
        ],
      })

      logger.info(`[v0] Found ${activeContracts.length} active contracts to process`)

      const results = {
        success: 0,
        skipped: 0,
        failed: 0,
        totalFeesAccrued: 0,
        errors: [],
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Process each contract
      for (const contract of activeContracts) {
        try {
          // Get last fee charge date
          const lastFeeDate =
            contract.fees.length > 0 ? new Date(contract.fees[0].charged_at) : new Date(contract.entry_date)

          lastFeeDate.setHours(0, 0, 0, 0)

          // Check if fee already charged today
          if (lastFeeDate.getTime() === today.getTime()) {
            logger.info(`[v0] Fee already charged today for contract ${contract.id}, skipping`)
            results.skipped++
            continue
          }

          // Calculate daily fee
          const contractValue = Number.parseFloat(contract.units_remaining) * Number.parseFloat(contract.entry_nav)

          const dailyFeeRate = config.fees.managementFeeAnnual / 100 / 365
          const dailyFee = contractValue * dailyFeeRate

          // Only record if fee is significant (> 0.01)
          if (dailyFee < 0.01) {
            results.skipped++
            continue
          }

          // Record fee
          await FeeRecord.create({
            investment_contract_id: contract.id,
            fee_type: "management",
            amount: dailyFee,
            nav: contract.entry_nav,
            calculation_basis: contractValue,
            fee_percentage: config.fees.managementFeeAnnual / 365,
            charged_at: new Date(),
            notes: "Daily management fee accrual",
          })

          logger.info(`[v0] Fee accrued for contract ${contract.id}: ${dailyFee.toFixed(2)}`)

          results.success++
          results.totalFeesAccrued += dailyFee
        } catch (error) {
          logger.error(`[v0] Failed to accrue fee for contract ${contract.id}:`, error)
          results.failed++
          results.errors.push({
            contractId: contract.id,
            error: error.message,
          })
        }
      }

      const duration = Date.now() - startTime

      logger.info("[v0] Fee Accrual Job - Execution completed", {
        duration: `${duration}ms`,
        totalContracts: activeContracts.length,
        successful: results.success,
        skipped: results.skipped,
        failed: results.failed,
        totalFeesAccrued: results.totalFeesAccrued.toFixed(2),
      })

      return results
    } catch (error) {
      logger.error("[v0] Fee Accrual Job - Fatal error:", error)
      throw error
    }
  }

  /**
   * Calculate accrued fees without recording (for preview)
   * @param {String} contractId - Investment contract UUID
   */
  static async previewFees(contractId) {
    logger.info(`[v0] Fee Accrual Job - Preview for contract: ${contractId}`)

    try {
      const contract = await InvestmentContract.findByPk(contractId, {
        include: [
          {
            model: FeeRecord,
            as: "fees",
            where: { fee_type: "management" },
            required: false,
            order: [["charged_at", "DESC"]],
            limit: 1,
          },
        ],
      })

      if (!contract) {
        throw new Error("Contract not found")
      }

      const lastFeeDate =
        contract.fees.length > 0 ? new Date(contract.fees[0].charged_at) : new Date(contract.entry_date)

      const daysSinceLastFee = Math.floor((new Date() - lastFeeDate) / (1000 * 60 * 60 * 24))

      const contractValue = Number.parseFloat(contract.units_remaining) * Number.parseFloat(contract.entry_nav)

      const dailyFeeRate = config.fees.managementFeeAnnual / 100 / 365
      const accruedFee = contractValue * dailyFeeRate * daysSinceLastFee

      return {
        contractId: contract.id,
        contractValue: Number.parseFloat(contractValue.toFixed(2)),
        dailyFeeRate: Number.parseFloat((dailyFeeRate * 100).toFixed(4)),
        daysSinceLastFee,
        accruedFee: Number.parseFloat(accruedFee.toFixed(2)),
        lastFeeDate,
      }
    } catch (error) {
      logger.error(`[v0] Fee preview failed for contract ${contractId}:`, error)
      throw error
    }
  }
}

module.exports = FeeAccrualJob
