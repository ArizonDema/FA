const fs = require("fs")
const ResponseHandler = require("../../../utils/responseHandler")
const { ReportRun } = require("../../../models")
const ReportDefinitionService = require("../services/reportDefinition.service")
const ReportRunService = require("../services/reportRun.service")
const ReportExportService = require("../services/reportExport.service")
const { resolveFundId } = require("../../shared/fund")

class ReportController {
  static async getReportTemplates(req, res, next) {
    try {
      const templates = await ReportDefinitionService.list({ type: req.query.type || null })
      return ResponseHandler.success(res, { templates }, "Report templates retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createReportTemplate(req, res, next) {
    try {
      const template = await ReportDefinitionService.create({
        payload: req.body,
        actorId: req.user?.id || null,
      })
      return ResponseHandler.created(res, { template }, "Report template created")
    } catch (error) {
      return next(error)
    }
  }

  static async updateReportTemplate(req, res, next) {
    try {
      const template = await ReportDefinitionService.update({
        definitionId: req.params.id,
        payload: req.body,
        actorId: req.user?.id || null,
      })
      if (!template) {
        return ResponseHandler.notFound(res, "Report template not found")
      }
      return ResponseHandler.success(res, { template }, "Report template updated")
    } catch (error) {
      return next(error)
    }
  }

  static async runReport(req, res, next) {
    try {
      const result = await ReportRunService.runGenericReport({
        actorId: req.user?.id || null,
        payload: req.body,
      })
      return ResponseHandler.success(res, result, "Report generated")
    } catch (error) {
      return next(error)
    }
  }

  static async getReportHistory(req, res, next) {
    try {
      const runs = await ReportRunService.getHistory({
        fundId: resolveFundId(req.query),
        type: req.query.type || null,
      })
      return ResponseHandler.success(res, { runs }, "Report history retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async downloadReportFile(req, res, next) {
    try {
      const requireFinalApproval = String(req.query.final || "").toLowerCase() === "true"
      if (requireFinalApproval) {
        const download = await ReportExportService.resolveDownload({
          runId: req.params.id,
          format: req.params.format,
          actorId: req.user?.id || null,
          requireFinalApproval: true,
        })
        return res.download(download.filePath)
      }

      const run = await ReportRun.findByPk(req.params.id)
      if (!run) {
        return ResponseHandler.notFound(res, "Report run not found")
      }

      const filePath = run.output_paths?.[req.params.format]
      if (!filePath || !fs.existsSync(filePath)) {
        return ResponseHandler.notFound(res, "Report file not found")
      }

      return res.download(filePath)
    } catch (error) {
      return next(error)
    }
  }

  static async requestReportExport(req, res, next) {
    try {
      const result = await ReportExportService.requestFinalExport({
        runId: req.params.id,
        format: req.body?.format || req.params.format || "xlsx",
        actorId: req.user?.id || null,
      })
      return ResponseHandler.created(res, result, "Final export approval requested")
    } catch (error) {
      return next(error)
    }
  }

  static async listReportExports(req, res, next) {
    try {
      const exports = await ReportExportService.listExports({ runId: req.params.id })
      return ResponseHandler.success(res, { exports }, "Report exports retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = ReportController
