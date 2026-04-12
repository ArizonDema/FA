const {
  ReportRun,
} = require("../../../models")
const ReportService = require("../../../services/report.service")
const AuditService = require("../../audit/services/audit.service")

class ReportRunService {
  static async runGenericReport({ actorId = null, payload }) {
    const { type, portfolio_id, period_start, period_end, format, template_id, share_class_id } = payload

    const run = await ReportRun.create({
      type,
      portfolio_id,
      period_start,
      period_end,
      inputs_json: payload,
      input_artifacts_json: payload,
      created_by: actorId,
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

    await run.update({
      output_paths: outputs,
      output_artifacts_json: outputs,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "report_extraction_requested",
      entityType: "report_run",
      entityId: run.id,
      after: run.toJSON(),
      metadata: {
        type,
        fund_id: portfolio_id,
      },
    })

    return {
      run,
      preview: data,
      outputs,
    }
  }

  static async getHistory({ fundId = null, type = null } = {}) {
    const where = {}
    if (fundId) where.portfolio_id = fundId
    if (type) where.type = type

    return await ReportRun.findAll({
      where,
      order: [["created_at", "DESC"]],
    })
  }
}

module.exports = ReportRunService
