const fs = require("fs")
const path = require("path")
const { Op } = require("sequelize")
const {
  Portfolio,
  PortfolioRound,
  FundProfile,
  FundGovernance,
  FundAccountingPolicy,
  FundTaxProfile,
  FundBankAccount,
  ShareClass,
  InvestorProfile,
  InvestorUserLink,
  Commitment,
  CapitalCall,
  CapitalCallLine,
  Distribution,
  DistributionLine,
  GLAccount,
  JournalEntry,
  JournalLine,
  ReportTemplate,
  ReportRun,
  FundDocument,
  CashLedger,
} = require("../models")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")
const ReportService = require("../services/report.service")
const AuditService = require("../modules/audit/services/audit.service")

const DOCUMENT_DIR = path.join(__dirname, "..", "..", "uploads", "documents")

function ensureDocumentDir() {
  if (!fs.existsSync(DOCUMENT_DIR)) {
    fs.mkdirSync(DOCUMENT_DIR, { recursive: true })
  }
}

async function ensureFundSections(portfolioId) {
  await FundProfile.findOrCreate({ where: { portfolio_id: portfolioId }, defaults: { portfolio_id: portfolioId } })
  await FundGovernance.findOrCreate({ where: { portfolio_id: portfolioId }, defaults: { portfolio_id: portfolioId } })
  await FundAccountingPolicy.findOrCreate({
    where: { portfolio_id: portfolioId },
    defaults: { portfolio_id: portfolioId },
  })
  await FundTaxProfile.findOrCreate({ where: { portfolio_id: portfolioId }, defaults: { portfolio_id: portfolioId } })
}

async function resolveRoundId(portfolioId, requestedRoundId) {
  if (requestedRoundId) {
    const round = await PortfolioRound.findByPk(requestedRoundId)
    return round ? round.id : null
  }
  const latest = await PortfolioRound.findOne({
    where: { portfolio_id: portfolioId, status: "open" },
    order: [["start_date", "DESC"]],
  })
  return latest ? latest.id : null
}

async function recordAudit(req, entityType, entityId, action, before, after) {
  await AuditService.logRequestEvent(req, {
    eventType: action,
    entityType,
    entityId,
    before,
    after,
  })
}

class FundAdminController {
  static async getFunds(req, res, next) {
    try {
      const funds = await Portfolio.findAll({
        order: [["created_at", "DESC"]],
        include: [{ model: FundProfile, as: "fundProfile" }],
      })
      ResponseHandler.success(res, { funds }, "Funds retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createFund(req, res, next) {
    try {
      if (!req.body?.name) {
        return ResponseHandler.badRequest(res, "Fund name is required")
      }

      const defaults = {
        strategy_type: "closed_end",
        management_fee_percent: 2,
        performance_fee_percent: 20,
        lock_up_period_months: 12,
        early_withdrawal_penalty_percent: 5,
        minimum_investment: 1000,
        risk_level: "medium",
        base_currency: "USD",
      }

      const payload = { ...defaults, ...req.body }
      const fund = await Portfolio.create(payload)
      await ensureFundSections(fund.id)
      await recordAudit(req, "fund", fund.id, "create", null, fund.toJSON())
      ResponseHandler.created(res, { fund }, "Fund created")
    } catch (error) {
      next(error)
    }
  }

  static async getFundProfile(req, res, next) {
    try {
      const fund = await Portfolio.findByPk(req.params.id)
      if (!fund) {
        return ResponseHandler.notFound(res, "Fund not found")
      }
      await ensureFundSections(fund.id)
      const [profile, governance, policies, tax, bankAccounts] = await Promise.all([
        FundProfile.findByPk(fund.id),
        FundGovernance.findByPk(fund.id),
        FundAccountingPolicy.findByPk(fund.id),
        FundTaxProfile.findByPk(fund.id),
        FundBankAccount.findAll({ where: { portfolio_id: fund.id } }),
      ])
      ResponseHandler.success(
        res,
        { fund, profile, governance, policies, tax, bank_accounts: bankAccounts },
        "Fund profile retrieved",
      )
    } catch (error) {
      next(error)
    }
  }

  static async updateFundProfile(req, res, next) {
    try {
      const fund = await Portfolio.findByPk(req.params.id)
      if (!fund) {
        return ResponseHandler.notFound(res, "Fund not found")
      }

      const before = fund.toJSON()
      const { fund: fundPayload, profile, governance, policies, tax, bank_accounts: bankAccounts } = req.body || {}

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

      const updated = await Portfolio.findByPk(fund.id)
      await recordAudit(req, "fund", fund.id, "update", before, updated.toJSON())
      ResponseHandler.success(res, { fund: updated }, "Fund profile updated")
    } catch (error) {
      next(error)
    }
  }

  static async getShareClasses(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) {
        where.portfolio_id = req.query.portfolio_id
      }
      const shareClasses = await ShareClass.findAll({ where, order: [["created_at", "DESC"]] })
      ResponseHandler.success(res, { share_classes: shareClasses }, "Share classes retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createShareClass(req, res, next) {
    try {
      if (!req.body?.portfolio_id || !req.body?.class_name) {
        return ResponseHandler.badRequest(res, "Portfolio and class name are required")
      }
      const shareClass = await ShareClass.create(req.body)
      await recordAudit(req, "share_class", shareClass.id, "create", null, shareClass.toJSON())
      ResponseHandler.created(res, { share_class: shareClass }, "Share class created")
    } catch (error) {
      next(error)
    }
  }

  static async updateShareClass(req, res, next) {
    try {
      const shareClass = await ShareClass.findByPk(req.params.id)
      if (!shareClass) {
        return ResponseHandler.notFound(res, "Share class not found")
      }
      const before = shareClass.toJSON()
      await shareClass.update(req.body)
      await recordAudit(req, "share_class", shareClass.id, "update", before, shareClass.toJSON())
      ResponseHandler.success(res, { share_class: shareClass }, "Share class updated")
    } catch (error) {
      next(error)
    }
  }

  static async deleteShareClass(req, res, next) {
    try {
      const shareClass = await ShareClass.findByPk(req.params.id)
      if (!shareClass) {
        return ResponseHandler.notFound(res, "Share class not found")
      }
      const before = shareClass.toJSON()
      await shareClass.destroy()
      await recordAudit(req, "share_class", shareClass.id, "delete", before, null)
      ResponseHandler.success(res, { success: true }, "Share class deleted")
    } catch (error) {
      next(error)
    }
  }

  static async getInvestors(req, res, next) {
    try {
      const where = {}
      if (req.query.status) where.status = req.query.status
      if (req.query.q) {
        where.legal_name = { [Op.like]: `%${req.query.q}%` }
      }
      const investors = await InvestorProfile.findAll({ where, order: [["created_at", "DESC"]] })
      ResponseHandler.success(res, { investors }, "Investors retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createInvestor(req, res, next) {
    try {
      if (!req.body?.legal_name) {
        return ResponseHandler.badRequest(res, "Investor legal name is required")
      }
      const investor = await InvestorProfile.create(req.body)
      await recordAudit(req, "investor", investor.id, "create", null, investor.toJSON())
      ResponseHandler.created(res, { investor }, "Investor created")
    } catch (error) {
      next(error)
    }
  }

  static async updateInvestor(req, res, next) {
    try {
      const investor = await InvestorProfile.findByPk(req.params.id)
      if (!investor) {
        return ResponseHandler.notFound(res, "Investor not found")
      }
      const before = investor.toJSON()
      await investor.update(req.body)
      await recordAudit(req, "investor", investor.id, "update", before, investor.toJSON())
      ResponseHandler.success(res, { investor }, "Investor updated")
    } catch (error) {
      next(error)
    }
  }

  static async deleteInvestor(req, res, next) {
    try {
      const investor = await InvestorProfile.findByPk(req.params.id)
      if (!investor) {
        return ResponseHandler.notFound(res, "Investor not found")
      }
      const before = investor.toJSON()
      await investor.destroy()
      await recordAudit(req, "investor", investor.id, "delete", before, null)
      ResponseHandler.success(res, { success: true }, "Investor deleted")
    } catch (error) {
      next(error)
    }
  }

  static async getCommitments(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) {
        const shareClasses = await ShareClass.findAll({
          where: { portfolio_id: req.query.portfolio_id },
          attributes: ["id"],
        })
        where.share_class_id = shareClasses.map((item) => item.id)
      }
      const commitments = await Commitment.findAll({
        where,
        include: [
          { model: InvestorProfile, as: "investor" },
          { model: ShareClass, as: "shareClass" },
        ],
        order: [["created_at", "DESC"]],
      })
      ResponseHandler.success(res, { commitments }, "Commitments retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createCommitment(req, res, next) {
    try {
      if (!req.body?.investor_profile_id || !req.body?.share_class_id || !req.body?.commitment_amount) {
        return ResponseHandler.badRequest(res, "Investor, share class, and commitment amount are required")
      }
      const shareClass = await ShareClass.findByPk(req.body.share_class_id)
      if (!shareClass) {
        return ResponseHandler.notFound(res, "Share class not found")
      }
      if (
        shareClass.min_commitment &&
        Number(req.body.commitment_amount || 0) < Number(shareClass.min_commitment)
      ) {
        return ResponseHandler.badRequest(res, "Commitment is below minimum for this share class")
      }
      const commitment = await Commitment.create(req.body)
      await recordAudit(req, "commitment", commitment.id, "create", null, commitment.toJSON())
      ResponseHandler.created(res, { commitment }, "Commitment created")
    } catch (error) {
      next(error)
    }
  }

  static async updateCommitment(req, res, next) {
    try {
      const commitment = await Commitment.findByPk(req.params.id)
      if (!commitment) {
        return ResponseHandler.notFound(res, "Commitment not found")
      }
      const before = commitment.toJSON()
      await commitment.update(req.body)
      await recordAudit(req, "commitment", commitment.id, "update", before, commitment.toJSON())
      ResponseHandler.success(res, { commitment }, "Commitment updated")
    } catch (error) {
      next(error)
    }
  }

  static async deleteCommitment(req, res, next) {
    try {
      const commitment = await Commitment.findByPk(req.params.id)
      if (!commitment) {
        return ResponseHandler.notFound(res, "Commitment not found")
      }
      const before = commitment.toJSON()
      await commitment.destroy()
      await recordAudit(req, "commitment", commitment.id, "delete", before, null)
      ResponseHandler.success(res, { success: true }, "Commitment deleted")
    } catch (error) {
      next(error)
    }
  }

  static async getCapitalCalls(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) {
        where.portfolio_id = req.query.portfolio_id
      }
      const calls = await CapitalCall.findAll({
        where,
        include: [
          {
            model: CapitalCallLine,
            as: "lines",
            include: [
              {
                model: Commitment,
                as: "commitment",
                include: [
                  { model: InvestorProfile, as: "investor" },
                  { model: ShareClass, as: "shareClass" },
                ],
              },
            ],
          },
        ],
        order: [["call_date", "DESC"]],
      })
      ResponseHandler.success(res, { capital_calls: calls }, "Capital calls retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createCapitalCall(req, res, next) {
    try {
      const { portfolio_id, portfolio_round_id, call_date, due_date, memo, status, lines, total_call_amount } =
        req.body

      if (!portfolio_id || !call_date) {
        return ResponseHandler.badRequest(res, "Portfolio and call date are required")
      }
      if ((!Array.isArray(lines) || lines.length === 0) && !total_call_amount) {
        return ResponseHandler.badRequest(res, "Provide call lines or a total call amount")
      }

      const roundId = await resolveRoundId(portfolio_id, portfolio_round_id)
      const capitalCall = await CapitalCall.create({
        portfolio_id,
        portfolio_round_id: roundId,
        call_date,
        due_date,
        memo,
        status,
      })

      let linePayloads = Array.isArray(lines) ? lines : []
      if (!linePayloads.length && total_call_amount) {
        const commitments = await Commitment.findAll({
          include: [{ model: ShareClass, as: "shareClass", where: { portfolio_id } }],
        })
        const totalCommitment = commitments.reduce(
          (sum, item) => sum + Number.parseFloat(item.commitment_amount || 0),
          0,
        )
        linePayloads = commitments.map((commitment) => {
          const ratio = totalCommitment > 0 ? Number(commitment.commitment_amount) / totalCommitment : 0
          return {
            commitment_id: commitment.id,
            called_amount: Number(total_call_amount) * ratio,
            paid_amount: 0,
          }
        })
      }

      const createdLines = []
      for (const line of linePayloads) {
        const created = await CapitalCallLine.create({
          capital_call_id: capitalCall.id,
          commitment_id: line.commitment_id,
          called_amount: line.called_amount,
          paid_amount: line.paid_amount || 0,
          paid_date: line.paid_date || null,
        })
        createdLines.push(created)

        if (Number(created.paid_amount) > 0 && roundId) {
          await CashLedger.create({
            portfolio_round_id: roundId,
            amount: created.paid_amount,
            type: "capital_call",
            reference_type: "capital_call_line",
            reference_id: created.id,
            description: `Capital call payment`,
            recorded_at: new Date(),
          })
        }
      }

      await recordAudit(req, "capital_call", capitalCall.id, "create", null, capitalCall.toJSON())
      ResponseHandler.created(
        res,
        { capital_call: capitalCall, lines: createdLines },
        "Capital call created",
      )
    } catch (error) {
      next(error)
    }
  }

  static async updateCapitalCall(req, res, next) {
    try {
      const capitalCall = await CapitalCall.findByPk(req.params.id)
      if (!capitalCall) {
        return ResponseHandler.notFound(res, "Capital call not found")
      }
      const before = capitalCall.toJSON()
      await capitalCall.update(req.body)
      await recordAudit(req, "capital_call", capitalCall.id, "update", before, capitalCall.toJSON())
      ResponseHandler.success(res, { capital_call: capitalCall }, "Capital call updated")
    } catch (error) {
      next(error)
    }
  }

  static async updateCapitalCallLine(req, res, next) {
    try {
      const line = await CapitalCallLine.findByPk(req.params.id, { include: [{ model: CapitalCall, as: "capitalCall" }] })
      if (!line) {
        return ResponseHandler.notFound(res, "Capital call line not found")
      }
      const beforePaid = Number(line.paid_amount || 0)
      await line.update(req.body)
      const afterPaid = Number(line.paid_amount || 0)

      const delta = afterPaid - beforePaid
      const roundId = line.capitalCall?.portfolio_round_id
      if (delta !== 0 && roundId) {
        await CashLedger.create({
          portfolio_round_id: roundId,
          amount: delta,
          type: "capital_call",
          reference_type: "capital_call_line",
          reference_id: line.id,
          description: `Capital call payment adjustment`,
          recorded_at: new Date(),
        })
      }

      await recordAudit(req, "capital_call_line", line.id, "update", null, line.toJSON())
      ResponseHandler.success(res, { line }, "Capital call line updated")
    } catch (error) {
      next(error)
    }
  }

  static async getDistributions(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) {
        where.portfolio_id = req.query.portfolio_id
      }
      const distributions = await Distribution.findAll({
        where,
        include: [
          {
            model: DistributionLine,
            as: "lines",
            include: [
              {
                model: Commitment,
                as: "commitment",
                include: [
                  { model: InvestorProfile, as: "investor" },
                  { model: ShareClass, as: "shareClass" },
                ],
              },
            ],
          },
        ],
        order: [["distribution_date", "DESC"]],
      })
      ResponseHandler.success(res, { distributions }, "Distributions retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createDistribution(req, res, next) {
    try {
      const { portfolio_id, portfolio_round_id, distribution_date, distribution_type, memo, status, lines, total_amount } =
        req.body

      if (!portfolio_id || !distribution_date) {
        return ResponseHandler.badRequest(res, "Portfolio and distribution date are required")
      }
      if ((!Array.isArray(lines) || lines.length === 0) && !total_amount) {
        return ResponseHandler.badRequest(res, "Provide distribution lines or a total amount")
      }

      const roundId = await resolveRoundId(portfolio_id, portfolio_round_id)
      const distribution = await Distribution.create({
        portfolio_id,
        portfolio_round_id: roundId,
        distribution_date,
        distribution_type,
        memo,
        status,
      })

      let linePayloads = Array.isArray(lines) ? lines : []
      if (!linePayloads.length && total_amount) {
        const commitments = await Commitment.findAll({
          include: [{ model: ShareClass, as: "shareClass", where: { portfolio_id } }],
        })
        const totalCommitment = commitments.reduce(
          (sum, item) => sum + Number.parseFloat(item.commitment_amount || 0),
          0,
        )
        linePayloads = commitments.map((commitment) => {
          const ratio = totalCommitment > 0 ? Number(commitment.commitment_amount) / totalCommitment : 0
          const gross = Number(total_amount) * ratio
          return {
            commitment_id: commitment.id,
            gross_amount: gross,
            withholding: 0,
            net_amount: gross,
          }
        })
      }

      const createdLines = []
      for (const line of linePayloads) {
        const created = await DistributionLine.create({
          distribution_id: distribution.id,
          commitment_id: line.commitment_id,
          gross_amount: line.gross_amount,
          withholding: line.withholding || 0,
          net_amount: line.net_amount || line.gross_amount,
          paid_date: line.paid_date || null,
        })
        createdLines.push(created)

        if (Number(created.net_amount) > 0 && roundId) {
          await CashLedger.create({
            portfolio_round_id: roundId,
            amount: -Number(created.net_amount),
            type: "distribution",
            reference_type: "distribution_line",
            reference_id: created.id,
            description: `Distribution payment`,
            recorded_at: new Date(),
          })
        }
      }

      await recordAudit(req, "distribution", distribution.id, "create", null, distribution.toJSON())
      ResponseHandler.created(res, { distribution, lines: createdLines }, "Distribution created")
    } catch (error) {
      next(error)
    }
  }

  static async updateDistribution(req, res, next) {
    try {
      const distribution = await Distribution.findByPk(req.params.id)
      if (!distribution) {
        return ResponseHandler.notFound(res, "Distribution not found")
      }
      const before = distribution.toJSON()
      await distribution.update(req.body)
      await recordAudit(req, "distribution", distribution.id, "update", before, distribution.toJSON())
      ResponseHandler.success(res, { distribution }, "Distribution updated")
    } catch (error) {
      next(error)
    }
  }

  static async updateDistributionLine(req, res, next) {
    try {
      const line = await DistributionLine.findByPk(req.params.id, {
        include: [{ model: Distribution, as: "distribution" }],
      })
      if (!line) {
        return ResponseHandler.notFound(res, "Distribution line not found")
      }
      const beforeNet = Number(line.net_amount || 0)
      await line.update(req.body)
      const afterNet = Number(line.net_amount || 0)
      const delta = afterNet - beforeNet
      const roundId = line.distribution?.portfolio_round_id
      if (delta !== 0 && roundId) {
        await CashLedger.create({
          portfolio_round_id: roundId,
          amount: -Number(delta),
          type: "distribution",
          reference_type: "distribution_line",
          reference_id: line.id,
          description: `Distribution adjustment`,
          recorded_at: new Date(),
        })
      }
      await recordAudit(req, "distribution_line", line.id, "update", null, line.toJSON())
      ResponseHandler.success(res, { line }, "Distribution line updated")
    } catch (error) {
      next(error)
    }
  }

  static async getGLAccounts(req, res, next) {
    try {
      const accounts = await GLAccount.findAll({ order: [["code", "ASC"]] })
      ResponseHandler.success(res, { accounts }, "GL accounts retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createGLAccount(req, res, next) {
    try {
      const account = await GLAccount.create(req.body)
      await recordAudit(req, "gl_account", account.id, "create", null, account.toJSON())
      ResponseHandler.created(res, { account }, "GL account created")
    } catch (error) {
      next(error)
    }
  }

  static async updateGLAccount(req, res, next) {
    try {
      const account = await GLAccount.findByPk(req.params.id)
      if (!account) {
        return ResponseHandler.notFound(res, "GL account not found")
      }
      const before = account.toJSON()
      await account.update(req.body)
      await recordAudit(req, "gl_account", account.id, "update", before, account.toJSON())
      ResponseHandler.success(res, { account }, "GL account updated")
    } catch (error) {
      next(error)
    }
  }

  static async deleteGLAccount(req, res, next) {
    try {
      const account = await GLAccount.findByPk(req.params.id)
      if (!account) {
        return ResponseHandler.notFound(res, "GL account not found")
      }
      const before = account.toJSON()
      await account.destroy()
      await recordAudit(req, "gl_account", account.id, "delete", before, null)
      ResponseHandler.success(res, { success: true }, "GL account deleted")
    } catch (error) {
      next(error)
    }
  }

  static async getJournalEntries(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) where.portfolio_id = req.query.portfolio_id
      const entries = await JournalEntry.findAll({
        where,
        include: [
          { model: JournalLine, as: "lines", include: [{ model: GLAccount, as: "account" }] },
          { model: PortfolioRound, as: "round" },
        ],
        order: [["entry_date", "DESC"]],
      })
      ResponseHandler.success(res, { entries }, "Journal entries retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createJournalEntry(req, res, next) {
    try {
      const { portfolio_id, portfolio_round_id, entry_date, memo, status, lines } = req.body
      if (!Array.isArray(lines) || !lines.length) {
        return ResponseHandler.badRequest(res, "Journal lines are required")
      }

      const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
      const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
      if (Math.abs(debitTotal - creditTotal) > 0.01) {
        return ResponseHandler.badRequest(res, "Journal entry is not balanced")
      }

      const entry = await JournalEntry.create({
        portfolio_id,
        portfolio_round_id,
        entry_date,
        memo,
        status,
        posted_by: req.user?.id || null,
      })

      const createdLines = []
      for (const line of lines) {
        const created = await JournalLine.create({
          journal_entry_id: entry.id,
          gl_account_id: line.gl_account_id,
          debit: line.debit || 0,
          credit: line.credit || 0,
          currency: line.currency || null,
          fx_rate: line.fx_rate || 1,
        })
        createdLines.push(created)
      }

      await recordAudit(req, "journal_entry", entry.id, "create", null, entry.toJSON())
      ResponseHandler.created(res, { entry, lines: createdLines }, "Journal entry created")
    } catch (error) {
      next(error)
    }
  }

  static async getDocuments(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) where.portfolio_id = req.query.portfolio_id
      if (req.query.investor_profile_id) where.investor_profile_id = req.query.investor_profile_id
      const documents = await FundDocument.findAll({ where, order: [["uploaded_at", "DESC"]] })
      ResponseHandler.success(res, { documents }, "Documents retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async uploadDocument(req, res, next) {
    try {
      ensureDocumentDir()
      if (!req.file) {
        return ResponseHandler.badRequest(res, "Document file is required")
      }
      const { portfolio_id, investor_profile_id, document_type } = req.body
      const document = await FundDocument.create({
        portfolio_id: portfolio_id || null,
        investor_profile_id: investor_profile_id || null,
        document_type: document_type || "Other",
        file_name: req.file.originalname,
        file_path: req.file.path,
        uploaded_by: req.user?.id || null,
        uploaded_at: new Date(),
      })
      await recordAudit(req, "fund_document", document.id, "create", null, document.toJSON())
      ResponseHandler.created(res, { document }, "Document uploaded")
    } catch (error) {
      next(error)
    }
  }

  static async getReportTemplates(req, res, next) {
    try {
      const where = {}
      if (req.query.type) where.type = req.query.type
      const templates = await ReportTemplate.findAll({ where, order: [["created_at", "DESC"]] })
      ResponseHandler.success(res, { templates }, "Report templates retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async createReportTemplate(req, res, next) {
    try {
      const template = await ReportTemplate.create(req.body)
      await recordAudit(req, "report_template", template.id, "create", null, template.toJSON())
      ResponseHandler.created(res, { template }, "Report template created")
    } catch (error) {
      next(error)
    }
  }

  static async updateReportTemplate(req, res, next) {
    try {
      const template = await ReportTemplate.findByPk(req.params.id)
      if (!template) {
        return ResponseHandler.notFound(res, "Report template not found")
      }
      const before = template.toJSON()
      await template.update(req.body)
      await recordAudit(req, "report_template", template.id, "update", before, template.toJSON())
      ResponseHandler.success(res, { template }, "Report template updated")
    } catch (error) {
      next(error)
    }
  }

  static async runReport(req, res, next) {
    try {
      const { type, portfolio_id, period_start, period_end, format, template_id, share_class_id } = req.body
      const run = await ReportRun.create({
        type,
        portfolio_id,
        period_start,
        period_end,
        inputs_json: req.body,
        created_by: req.user?.id || null,
      })

      const data = await ReportService.buildReportData({
        type,
        portfolioId: portfolio_id,
        periodStart: period_start,
        periodEnd: period_end,
        shareClassId: share_class_id,
      })

      const template = await ReportService.getTemplate(template_id)
      const outputs = {}
      const wantsPdf = !format || format === "pdf" || format === "both"
      const wantsXlsx = format === "xlsx" || format === "both"

      if (wantsPdf) {
        outputs.pdf = await ReportService.generatePdfReport(run.id, "Fund Report", data, template?.template_body)
      }
      if (wantsXlsx) {
        outputs.xlsx = await ReportService.generateXlsxReport(run.id, "Fund Report", data)
      }

      await run.update({ output_paths: outputs })
      await recordAudit(req, "report_run", run.id, "create", null, run.toJSON())

      ResponseHandler.success(res, { run, preview: data, outputs }, "Report generated")
    } catch (error) {
      next(error)
    }
  }

  static async getReportHistory(req, res, next) {
    try {
      const where = {}
      if (req.query.portfolio_id) where.portfolio_id = req.query.portfolio_id
      const runs = await ReportRun.findAll({ where, order: [["created_at", "DESC"]] })
      ResponseHandler.success(res, { runs }, "Report history retrieved")
    } catch (error) {
      next(error)
    }
  }

  static async downloadReportFile(req, res, next) {
    try {
      const run = await ReportRun.findByPk(req.params.id)
      if (!run) {
        return ResponseHandler.notFound(res, "Report run not found")
      }
      const outputs = run.output_paths || {}
      const format = req.params.format
      const filePath = outputs[format]
      if (!filePath || !fs.existsSync(filePath)) {
        return ResponseHandler.notFound(res, "Report file not found")
      }
      res.download(filePath)
    } catch (error) {
      next(error)
    }
  }
}

module.exports = FundAdminController
