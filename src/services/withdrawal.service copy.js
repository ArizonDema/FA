// backend/src/services/withdrawal.service.js

const {
  WithdrawalRequest,
  InvestmentContract,
  User,
  UnitLedger,
  CashLedger,
  FeeRecord,
  PortfolioRound,
} = require("../models")
const NavService = require("./nav.service")
const logger = require("../config/logger")
const config = require("../config/app")
const db = require("../models")

/**
 * Withdrawal Service
 * Handles withdrawal requests and unit burning
 */
class WithdrawalService {
  /**
   * Create withdrawal request
   *
   * @param {String} userId - User UUID
   * @param {String} investmentContractId - Investment contract UUID
   * @param {Number} unitsToRedeem - Number of units to redeem
   */
  static async createWithdrawalRequest(userId, investmentContractId, unitsToRedeem) {
    try {
      logger.info(
        `[v0] Creating withdrawal request: User ${userId}, Contract ${investmentContractId}, Units ${unitsToRedeem}`,
      )

      // Validate investment contract
      const contract = await InvestmentContract.findOne({
        where: { id: investmentContractId, user_id: userId },
        include: [{ model: PortfolioRound, as: "round" }],
      })

      if (!contract) {
        throw new Error("Investment contract not found")
      }

      if (contract.status === "fully_exited") {
        throw new Error("Investment already fully exited")
      }

      // Validate units
      const unitsRemaining = Number.parseFloat(contract.units_remaining)
      if (unitsToRedeem > unitsRemaining) {
        throw new Error(`Insufficient units. Available: ${unitsRemaining}`)
      }

      // Get current NAV
      const navData = await NavService.getLatestNAV(contract.portfolio_round_id)
      const currentNAV = navData.nav

      logger.info(`[v0] Current NAV for withdrawal: ${currentNAV}`)

      // Calculate gross amount (before fees)
      const grossAmount = unitsToRedeem * currentNAV

      // Calculate fees
      const fees = await this._calculateWithdrawalFees(contract, unitsToRedeem, grossAmount)

      logger.info(`[v0] Withdrawal fees calculated:`, fees)

      // Create withdrawal request
      const withdrawal = await WithdrawalRequest.create({
        user_id: userId,
        investment_contract_id: investmentContractId,
        units_to_redeem: unitsToRedeem,
        nav_at_request: currentNAV,
        gross_amount: grossAmount,
        management_fees: fees.managementFees,
        performance_fees: fees.performanceFees,
        penalty_fees: fees.penaltyFees,
        total_fees: fees.totalFees,
        net_amount: grossAmount - fees.totalFees,
        status: "pending",
        requested_at: new Date(),
      })

      logger.info(`[v0] Withdrawal request created: ${withdrawal.id}`)

      return await WithdrawalRequest.findByPk(withdrawal.id, {
        include: [
          { model: User, as: "user", attributes: ["id", "full_name", "email"] },
          { model: InvestmentContract, as: "contract", include: [{ model: PortfolioRound, as: "round" }] },
        ],
      })
    } catch (error) {
      logger.error(`[v0] Withdrawal request error:`, error)
      throw error
    }
  }

  /**
   * Process/approve withdrawal request (Admin only)
   *
   * @param {String} withdrawalId - Withdrawal request UUID
   * @param {String} adminNotes - Admin notes
   */
  static async processWithdrawal(withdrawalId, adminNotes = null) {
    const transaction = await db.sequelize.transaction()

    try {
      logger.info(`[v0] Processing withdrawal: ${withdrawalId}`)

      const withdrawal = await WithdrawalRequest.findByPk(withdrawalId, {
        include: [{ model: InvestmentContract, as: "contract" }],
      })

      if (!withdrawal) {
        throw new Error("Withdrawal request not found")
      }

      if (withdrawal.status !== "pending") {
        throw new Error(`Withdrawal already processed with status: ${withdrawal.status}`)
      }

      const contract = withdrawal.contract

      // Burn units in ledger
      await UnitLedger.create(
        {
          investment_contract_id: contract.id,
          units: -Number.parseFloat(withdrawal.units_to_redeem), // Negative for burn
          type: "burn",
          nav: withdrawal.nav_at_request,
          event_date: new Date(),
          reference_type: "withdrawal",
          reference_id: withdrawal.id,
          notes: `Withdrawal of ${withdrawal.units_to_redeem} units`,
        },
        { transaction },
      )

      logger.info(`[v0] Units burned in ledger`)

      // Record cash outflow
      await CashLedger.create(
        {
          portfolio_round_id: contract.portfolio_round_id,
          amount: -Number.parseFloat(withdrawal.net_amount), // Negative for outflow
          type: "withdrawal",
          reference_type: "withdrawal",
          reference_id: withdrawal.id,
          description: `Withdrawal payout to user ${withdrawal.user_id}`,
          recorded_at: new Date(),
        },
        { transaction },
      )

      logger.info(`[v0] Cash outflow recorded`)

      // Record fee charges
      if (withdrawal.management_fees > 0) {
        await FeeRecord.create(
          {
            investment_contract_id: contract.id,
            fee_type: "management",
            amount: withdrawal.management_fees,
            nav: withdrawal.nav_at_request,
            charged_at: new Date(),
            notes: "Management fee on withdrawal",
          },
          { transaction },
        )
      }

      if (withdrawal.performance_fees > 0) {
        await FeeRecord.create(
          {
            investment_contract_id: contract.id,
            fee_type: "performance",
            amount: withdrawal.performance_fees,
            nav: withdrawal.nav_at_request,
            charged_at: new Date(),
            notes: "Performance fee on withdrawal",
          },
          { transaction },
        )
      }

      if (withdrawal.penalty_fees > 0) {
        await FeeRecord.create(
          {
            investment_contract_id: contract.id,
            fee_type: "penalty",
            amount: withdrawal.penalty_fees,
            nav: withdrawal.nav_at_request,
            charged_at: new Date(),
            notes: "Early withdrawal penalty",
          },
          { transaction },
        )
      }

      logger.info(`[v0] Fee records created`)

      // Update contract units
      const newUnitsRemaining =
        Number.parseFloat(contract.units_remaining) - Number.parseFloat(withdrawal.units_to_redeem)

      const newStatus =
        newUnitsRemaining === 0
          ? "fully_exited"
          : newUnitsRemaining < Number.parseFloat(contract.units_issued)
            ? "partially_exited"
            : "active"

      await contract.update(
        {
          units_remaining: newUnitsRemaining,
          status: newStatus,
        },
        { transaction },
      )

      logger.info(`[v0] Contract updated: units_remaining=${newUnitsRemaining}, status=${newStatus}`)

      // Update withdrawal status
      await withdrawal.update(
        {
          status: "approved",
          processed_at: new Date(),
          admin_notes: adminNotes,
        },
        { transaction },
      )

      await transaction.commit()

      logger.info(`[v0] Withdrawal processed successfully`)

      return await WithdrawalRequest.findByPk(withdrawalId, {
        include: [
          { model: User, as: "user", attributes: ["id", "full_name", "email"] },
          { model: InvestmentContract, as: "contract" },
        ],
      })
    } catch (error) {
      await transaction.rollback()
      logger.error(`[v0] Withdrawal processing error:`, error)
      throw error
    }
  }

  /**
   * Reject withdrawal request
   *
   * @param {String} withdrawalId - Withdrawal request UUID
   * @param {String} reason - Rejection reason
   */
  static async rejectWithdrawal(withdrawalId, reason) {
    logger.info(`[v0] Rejecting withdrawal: ${withdrawalId}`)

    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId)

    if (!withdrawal) {
      throw new Error("Withdrawal request not found")
    }

    if (withdrawal.status !== "pending") {
      throw new Error("Can only reject pending withdrawals")
    }

    await withdrawal.update({
      status: "rejected",
      processed_at: new Date(),
      admin_notes: reason,
    })

    return withdrawal
  }

  /**
   * Get user's withdrawal requests
   *
   * @param {String} userId - User UUID
   */
  static async getUserWithdrawals(userId) {
    logger.info(`[v0] Fetching withdrawals for user: ${userId}`)

    return await WithdrawalRequest.findAll({
      where: { user_id: userId },
      include: [{ model: InvestmentContract, as: "contract", include: [{ model: PortfolioRound, as: "round" }] }],
      order: [["created_at", "DESC"]],
    })
  }

  /**
   * Calculate withdrawal fees
   * @private
   */
  static async _calculateWithdrawalFees(contract, unitsToRedeem, grossAmount) {
    const managementFees = 0
    let performanceFees = 0
    let penaltyFees = 0

    // Check if within lockup period
    const isWithinLockup = new Date() < new Date(contract.lockup_end_date)

    // Calculate penalty if early withdrawal
    if (isWithinLockup) {
      penaltyFees = (grossAmount * config.fees.earlyWithdrawalPenalty) / 100
      logger.info(`[v0] Early withdrawal penalty applied: ${penaltyFees}`)
    }

    // Calculate performance fee (only if profit)
    const invested =
      (Number.parseFloat(contract.invested_amount) / Number.parseFloat(contract.units_issued)) * unitsToRedeem

    const profit = grossAmount - invested

    if (profit > 0) {
      performanceFees = (profit * config.fees.performanceFee) / 100
      logger.info(`[v0] Performance fee on profit ${profit}: ${performanceFees}`)
    }

    const totalFees = managementFees + performanceFees + penaltyFees

    return {
      managementFees: Number.parseFloat(managementFees.toFixed(2)),
      performanceFees: Number.parseFloat(performanceFees.toFixed(2)),
      penaltyFees: Number.parseFloat(penaltyFees.toFixed(2)),
      totalFees: Number.parseFloat(totalFees.toFixed(2)),
    }
  }
}

module.exports = WithdrawalService
