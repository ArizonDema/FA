const path = require("path")
const { Fund, Portfolio } = require("../../../models")
const ResponseHandler = require("../../../utils/responseHandler")
const CashFlowService = require("../../../services/cashFlow.service")
const StorageService = require("../../storage/services/storage.service")
const CashFlowReportService = require("../cash-flow/cashFlowReport.service")
const { ReportGenerationService } = require("../services/reportGeneration.service")
const ValidationResultService = require("../services/validationResult.service")
const { ValidationEngineService } = require("../services/validationEngine.service")
const { resolveFundId } = require("../../shared/fund")

const FundModel = Fund || Portfolio

class CashFlowReportController {
  static cleanupTempUploads(req) {
    const tbUpload = req.files?.tb_file?.[0]
    const glUpload = req.files?.gl_file?.[0]
    StorageService.removeFileSilently(tbUpload?.path)
    StorageService.removeFileSilently(glUpload?.path)
  }

  static async runCashFlowReport(req, res, next) {
    try {
      const fundId = resolveFundId(req)
      const templateId = req.body.template_id || null
      const dateStart = req.body.date_start ? String(req.body.date_start).trim() : null
      const dateEnd = req.body.date_end ? String(req.body.date_end).trim() : null
      const preset = req.body.preset ? String(req.body.preset).trim().toUpperCase() : null
      const fiscalYearRaw = req.body.fiscal_year
      const fiscalYear =
        fiscalYearRaw === undefined || fiscalYearRaw === null || String(fiscalYearRaw).trim() === ""
          ? null
          : Number.parseInt(fiscalYearRaw, 10)
      const tbUpload = req.files?.tb_file?.[0]
      const glUpload = req.files?.gl_file?.[0]
      const tbRepositoryVersionId = req.body.tb_repository_version_id || null
      const glRepositoryVersionId = req.body.gl_repository_version_id || null
      const saveUploadsToRepository =
        req.body.save_uploads_to_repository === true ||
        String(req.body.save_uploads_to_repository || "").toLowerCase() === "true" ||
        String(req.body.save_uploads_to_repository || "") === "1"

      if (!fundId) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }
      if (!dateStart && !dateEnd && !preset && !Number.isInteger(fiscalYear)) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(
          res,
          "Provide date_start/date_end, or preset, or fiscal_year (deprecated fallback).",
        )
      }
      if ((dateStart && !dateEnd) || (!dateStart && dateEnd)) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(res, "date_start and date_end must be provided together")
      }
      if (tbUpload && tbRepositoryVersionId) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(res, "Provide either tb_file or tb_repository_version_id, not both")
      }
      if (glUpload && glRepositoryVersionId) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(res, "Provide either gl_file or gl_repository_version_id, not both")
      }
      if ((!tbUpload && !tbRepositoryVersionId) || (!glUpload && !glRepositoryVersionId)) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.badRequest(
          res,
          "Provide a Trial Balance and General Ledger using uploads or repository versions",
        )
      }

      const fund = await FundModel.findByPk(fundId)
      if (!fund) {
        CashFlowReportController.cleanupTempUploads(req)
        return ResponseHandler.notFound(res, "Fund not found")
      }

      const result = await CashFlowReportService.runReport({
        fundId,
        templateId,
        actorId: req.user?.id || null,
        rangeInput: { dateStart, dateEnd, preset, fiscalYear },
        tbUpload,
        glUpload,
        tbRepositoryVersionId,
        glRepositoryVersionId,
        saveUploadsToRepository,
      })

      return ResponseHandler.success(res, result, "Cash flow report generated")
    } catch (error) {
      CashFlowReportController.cleanupTempUploads(req)
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getReportHistory(req, res, next) {
    try {
      const fundId = resolveFundId(req.query)
      if (!fundId) {
        return ResponseHandler.badRequest(res, "portfolio_id is required")
      }

      const runs = await CashFlowReportService.getHistory({ fundId })
      return ResponseHandler.success(res, { runs }, "Cash flow report history retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async generateApprovedMappingReport(req, res, next) {
    try {
      const templateVersionId = req.body.template_version_id || req.body.templateVersionId || null
      const fundId = resolveFundId(req.body)
      const periodStart = req.body.period_start || req.body.periodStart || null
      const periodEnd = req.body.period_end || req.body.periodEnd || null

      if (!templateVersionId) {
        return ResponseHandler.badRequest(res, "template_version_id is required")
      }
      if (!periodStart || !periodEnd) {
        return ResponseHandler.badRequest(res, "period_start and period_end are required")
      }

      const result = await ReportGenerationService.generateReport({
        templateVersionId,
        fundId,
        periodStart,
        periodEnd,
        actorId: req.user?.id || null,
      })

      if (!result) {
        return ResponseHandler.notFound(res, "Template version not found")
      }

      return ResponseHandler.success(res, result, "Deterministic approved-mapping report generated")
    } catch (error) {
      if (error instanceof CashFlowService.CashFlowValidationError) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      if (error.code === "report_generation_validation" || error.statusCode === 400) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getGeneratedReport(req, res, next) {
    try {
      const result = await ReportGenerationService.getReportRun({ runId: req.params.run_id })
      if (!result) {
        return ResponseHandler.notFound(res, "Report run not found")
      }

      return ResponseHandler.success(res, result, "Generated report retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getGeneratedReportRows(req, res, next) {
    try {
      const result = await ReportGenerationService.getReportRunRows({ runId: req.params.run_id })
      if (!result) {
        return ResponseHandler.notFound(res, "Report run not found")
      }

      return ResponseHandler.success(res, result, "Generated report rows retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async validateGeneratedReport(req, res, next) {
    try {
      const result = await ValidationEngineService.validateReportRun({
        runId: req.params.run_id,
        actorId: req.user?.id || null,
      })
      if (!result) {
        return ResponseHandler.notFound(res, "Report run not found")
      }

      return ResponseHandler.success(res, result, "Report validation completed")
    } catch (error) {
      if (error.code === "report_validation_validation" || error.statusCode === 400) {
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getGeneratedReportValidation(req, res, next) {
    try {
      const result = await ValidationResultService.getLatestForRun({ runId: req.params.run_id })
      if (!result) {
        return ResponseHandler.notFound(res, "Validation result not found")
      }

      return ResponseHandler.success(res, result, "Report validation retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getGeneratedReportReadiness(req, res, next) {
    try {
      const result = await ValidationResultService.getReadiness({ runId: req.params.run_id })
      if (!result) {
        return ResponseHandler.notFound(res, "Report run not found")
      }

      return ResponseHandler.success(res, result, "Report readiness retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async downloadReport(req, res, next) {
    try {
      const requireFinalApproval = String(req.query.final || "").toLowerCase() === "true"
      const download = await CashFlowReportService.getDownloadPath(req.params.run_id, {
        actorId: req.user?.id || null,
        requireFinalApproval,
      })
      if (!download) {
        return ResponseHandler.notFound(res, "Cash flow report file not found")
      }

      return res.download(download.filePath, path.basename(download.filePath))
    } catch (error) {
      return next(error)
    }
  }

  static async requestFinalExport(req, res, next) {
    try {
      const result = await CashFlowReportService.requestFinalExport({
        runId: req.params.run_id,
        actorId: req.user?.id || null,
        format: req.body?.format || "xlsx",
      })
      if (!result) {
        return ResponseHandler.notFound(res, "Cash flow report run not found")
      }
      return ResponseHandler.created(res, result, "Final export approval requested")
    } catch (error) {
      return next(error)
    }
  }

  static async listExports(req, res, next) {
    try {
      const exports = await CashFlowReportService.listExports({ runId: req.params.run_id })
      if (!exports) {
        return ResponseHandler.notFound(res, "Cash flow report run not found")
      }
      return ResponseHandler.success(res, { exports }, "Report exports retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = CashFlowReportController
