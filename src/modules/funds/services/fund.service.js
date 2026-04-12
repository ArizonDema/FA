const {
  Fund,
  Portfolio,
  FundProfile,
  FundGovernance,
  FundAccountingPolicy,
  FundTaxProfile,
  FundBankAccount,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")
const { withFundId } = require("../../shared/fund")

const FundModel = Fund || Portfolio

async function ensureFundSections(fundId) {
  await FundProfile.findOrCreate({ where: { portfolio_id: fundId }, defaults: { portfolio_id: fundId } })
  await FundGovernance.findOrCreate({ where: { portfolio_id: fundId }, defaults: { portfolio_id: fundId } })
  await FundAccountingPolicy.findOrCreate({
    where: { portfolio_id: fundId },
    defaults: { portfolio_id: fundId },
  })
  await FundTaxProfile.findOrCreate({ where: { portfolio_id: fundId }, defaults: { portfolio_id: fundId } })
}

class FundService {
  static async listFunds() {
    const funds = await FundModel.findAll({
      order: [["created_at", "DESC"]],
      include: [{ model: FundProfile, as: "fundProfile" }],
    })
    return funds.map((fund) => withFundId(fund))
  }

  static async createFund({ actorId = null, payload }) {
    const defaults = {
      strategy_type: "closed_end",
      management_fee_percent: 2,
      performance_fee_percent: 20,
      lock_up_period_months: 12,
      early_withdrawal_penalty_percent: 5,
      minimum_investment: 1000,
      risk_level: "medium",
      base_currency: "USD",
      status: "active",
    }

    const fund = await FundModel.create({ ...defaults, ...payload })
    await ensureFundSections(fund.id)
    await AuditService.logEvent({
      actorId,
      eventType: "company_created",
      entityType: "fund",
      entityId: fund.id,
      after: fund.toJSON(),
      metadata: { source: "fund_service" },
    })

    return withFundId(fund)
  }

  static async getFundProfile(fundId) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) return null

    await ensureFundSections(fund.id)
    const [profile, governance, policies, tax, bankAccounts] = await Promise.all([
      FundProfile.findByPk(fund.id),
      FundGovernance.findByPk(fund.id),
      FundAccountingPolicy.findByPk(fund.id),
      FundTaxProfile.findByPk(fund.id),
      FundBankAccount.findAll({ where: { portfolio_id: fund.id } }),
    ])

    return {
      fund: withFundId(fund),
      profile,
      governance,
      policies,
      tax,
      bank_accounts: bankAccounts,
    }
  }

  static async updateFundProfile({ fundId, payload, actorId = null }) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) return null

    const before = fund.toJSON()
    const { fund: fundPayload, profile, governance, policies, tax, bank_accounts: bankAccounts } = payload || {}

    if (fundPayload && typeof fundPayload === "object") {
      await fund.update(fundPayload)
    }

    await FundProfile.upsert({ portfolio_id: fund.id, ...(profile || {}) })
    await FundGovernance.upsert({ portfolio_id: fund.id, ...(governance || {}) })
    await FundAccountingPolicy.upsert({ portfolio_id: fund.id, ...(policies || {}) })
    await FundTaxProfile.upsert({ portfolio_id: fund.id, ...(tax || {}) })

    if (Array.isArray(bankAccounts)) {
      await FundBankAccount.destroy({ where: { portfolio_id: fund.id } })
      const entries = bankAccounts
        .filter((item) => item && (item.bank_name || item.account_number || item.iban))
        .map((item) => ({
          portfolio_id: fund.id,
          bank_name: item.bank_name || "",
          account_number: item.account_number || "",
          iban: item.iban || "",
          currency: item.currency || "",
          swift: item.swift || "",
          notes: item.notes || "",
        }))

      if (entries.length) {
        await FundBankAccount.bulkCreate(entries)
      }
    }

    const updatedFund = await FundModel.findByPk(fund.id)
    await AuditService.logEvent({
      actorId,
      eventType: "fund_updated",
      entityType: "fund",
      entityId: fund.id,
      before,
      after: updatedFund.toJSON(),
      metadata: { source: "fund_service" },
    })

    return withFundId(updatedFund)
  }
}

module.exports = FundService
