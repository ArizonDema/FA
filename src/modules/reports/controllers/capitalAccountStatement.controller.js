const fs = require("fs")
const ResponseHandler = require("../../../utils/responseHandler")
const { Portfolio, ReportRun } = require("../../../models")
const ReportRunService = require("../services/reportRun.service")
const CashFlowService = require("../../../services/cashFlow.service")

const REPORT_TYPE = "capital_account_statement"

function normalizedDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

class CapitalAccountStatementController {
  static async run(req, res, next) {
    try {
      const portfolioId = req.body?.portfolio_id
      const periodStart = normalizedDate(req.body?.period_start)
      const periodEnd = normalizedDate(req.body?.period_end)
      if (!portfolioId) return ResponseHandler.badRequest(res, "portfolio_id is required")
      if (!periodStart || !periodEnd) {
        return ResponseHandler.badRequest(res, "period_start and period_end must be valid dates")
      }
      if (periodStart > periodEnd) {
        return ResponseHandler.badRequest(res, "period_start must be on or before period_end")
      }

      const portfolio = await Portfolio.findByPk(portfolioId)
      if (!portfolio) return ResponseHandler.notFound(res, "Fund not found")

      const result = await ReportRunService.runGenericReport({
        actorId: req.user?.id || null,
        payload: {
          ...req.body,
          portfolio_id: portfolioId,
          period_start: periodStart,
          period_end: periodEnd,
          type: REPORT_TYPE,
          format: "xlsx",
        },
      })
      return ResponseHandler.success(res, result, "Capital account statements generated")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async history(req, res, next) {
    try {
      if (!req.query.portfolio_id) {
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      const runs = await ReportRunService.getHistory({
        fundId: req.query.portfolio_id,
        type: REPORT_TYPE,
      })
      return ResponseHandler.success(res, { runs }, "Capital account statement history retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async download(req, res, next) {
    try {
      const run = await ReportRun.findByPk(req.params.run_id)
      if (!run || run.type !== REPORT_TYPE) {
        return ResponseHandler.notFound(res, "Capital account statement run not found")
      }
      const filePath = run.output_paths?.xlsx
      if (!filePath || !fs.existsSync(filePath)) {
        return ResponseHandler.notFound(res, "Capital account statement workbook not found")
      }
      const suffix = run.period_end ? `_${run.period_end}` : ""
      return res.download(filePath, `capital_account_statements${suffix}.xlsx`)
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = CapitalAccountStatementController
