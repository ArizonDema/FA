const {
  ReportRun,
} = require("../../../models")
const ReportService = require("../../../services/report.service")
const AuditService = require("../../audit/services/audit.service")
const TemplateService = require("../../templates/services/template.service")
const { TEMPLATE_KINDS } = require("../../templates/template.constants")
const CashFlowService = require("../../../services/cashFlow.service")
const ReportLineageService = require("./reportLineage.service")

class ReportRunService {
  static async runGenericReport({ actorId = null, payload }) {
    const {
      type,
      portfolio_id,
      period_start,
      period_end,
      format,
      template_id,
      share_class_id,
      investor_profile_id,
    } = payload

    let runtimeTemplate = null
    let runtimeTemplateVersion = null
    if (type === "capital_account_statement") {
      runtimeTemplate = await TemplateService.getActiveTemplateForFund(
        portfolio_id,
        TEMPLATE_KINDS.CAPITAL_ACCOUNT_STATEMENT,
      )
      if (!runtimeTemplate) {
        throw new CashFlowService.CashFlowValidationError(
          "No active capital account statement template found for this fund. Upload, map, and activate one first.",
          { code: "active_capital_account_template_required" },
        )
      }
      const readiness = TemplateService.evaluateReadinessForTemplate(runtimeTemplate)
      if (!runtimeTemplate.is_active || runtimeTemplate.status !== "active" || !readiness.can_activate) {
        throw new CashFlowService.CashFlowValidationError(
          readiness.activation_block_reason || "The active capital account statement template is not ready.",
          readiness,
        )
      }
      runtimeTemplateVersion = runtimeTemplate.activeVersion
      if (!runtimeTemplateVersion) {
        throw new CashFlowService.CashFlowValidationError(
          "The active capital account statement template has no active version.",
        )
      }
    }

    const resolvedInputs = runtimeTemplate
      ? {
          ...payload,
          template_id: runtimeTemplate.id,
          template_version_id: runtimeTemplateVersion.id,
        }
      : payload

    const run = await ReportRun.create({
      type,
      portfolio_id,
      period_start,
      period_end,
      template_version_id: runtimeTemplateVersion?.id || null,
      inputs_json: resolvedInputs,
      input_artifacts_json: resolvedInputs,
      status: "pending",
      created_by: actorId,
    })

    try {
      const data = await ReportService.buildReportData({
        type,
        portfolioId: portfolio_id,
        periodStart: period_start,
        periodEnd: period_end,
        shareClassId: share_class_id,
        investorProfileId: investor_profile_id,
      })

      const template = type === "capital_account_statement" ? null : await ReportService.getTemplate(template_id)
      const outputs = {}
      const wantsPdf = !format || format === "pdf" || format === "both"
      const wantsXlsx = format === "xlsx" || format === "both"
      const title = type === "capital_account_statement" ? "Capital Account Statements" : "Fund Report"

      if (wantsPdf) {
        outputs.pdf = await ReportService.generatePdfReport(run.id, title, data, template?.template_body)
      }
      if (wantsXlsx && type === "capital_account_statement") {
        outputs.xlsx = await ReportService.generateCapitalAccountTemplateReport(run.id, data, {
          templatePath: runtimeTemplateVersion.source_file_path || runtimeTemplate.template_file_path,
          config: runtimeTemplateVersion.config_json || runtimeTemplate.config_json,
        })
      } else if (wantsXlsx) {
        outputs.xlsx = await ReportService.generateXlsxReport(run.id, title, data)
      }

      const warnings = data.capitalAccountStatements?.warnings || []
      await run.update({
        output_paths: outputs,
        output_artifacts_json: outputs,
        summary_json: data.capitalAccountStatements?.totals || null,
        mapping_snapshot_json: runtimeTemplate
          ? {
              template_kind: TEMPLATE_KINDS.CAPITAL_ACCOUNT_STATEMENT,
              template_id: runtimeTemplate.id,
              template_version_id: runtimeTemplateVersion.id,
              config_version: runtimeTemplateVersion.config_json?.version || null,
            }
          : null,
        status: "completed",
        readiness_status: warnings.length ? "ready_with_warnings" : "ready",
        completed_at: new Date(),
      })

      if (runtimeTemplate) {
        await ReportLineageService.persistForTemplateDrivenRun({
          run,
          template: runtimeTemplate,
          templateVersion: runtimeTemplateVersion,
          templateKind: TEMPLATE_KINDS.CAPITAL_ACCOUNT_STATEMENT,
          configVersion: runtimeTemplateVersion.config_json?.version || null,
        })
      }

      await AuditService.logEvent({
        actorId,
        eventType: "report_extraction_requested",
        entityType: "report_run",
        entityId: run.id,
        after: run.toJSON(),
        metadata: {
          type,
          fund_id: portfolio_id,
          template_id: runtimeTemplate?.id || template_id || null,
          template_version_id: runtimeTemplateVersion?.id || null,
        },
      })

      return {
        run,
        preview: data,
        outputs,
        warnings,
      }
    } catch (error) {
      await run.update({
        status: "failed",
        error_json: {
          code: error.code || "report_generation_failed",
          message: error.message,
        },
        completed_at: new Date(),
      })
      throw error
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
