const logger = require("../../../config/logger")
const {
  ReportRun,
  ReportLineage,
  ReportRunRow,
  TemplateVersion,
  ValidationCheckResult,
  ValidationResult,
  sequelize,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")
const ReviewTaskService = require("../../reviews/services/reviewTask.service")
const ReportReadinessService = require("./reportReadiness.service")
const ValidationResultService = require("./validationResult.service")
const ValidationRuleRegistry = require("./validationRuleRegistry.service")
const { REPORT_READINESS_STATUSES } = require("../validation.constants")

function createValidationError(message, code = "report_validation_validation", statusCode = 400, details = null) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  error.details = details
  return error
}

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

class ValidationEngineService {
  static async buildContext({ runId }) {
    const runRecord = await ReportRun.findByPk(runId, {
      include: [{ model: TemplateVersion, as: "templateVersion" }],
    })
    if (!runRecord) return null

    const rowRecords = await ReportRunRow.findAll({
      where: { report_run_id: runId },
      order: [
        ["row_order", "ASC"],
        ["created_at", "ASC"],
      ],
    })
    const lineageRecords =
      ReportLineage && typeof ReportLineage.findAll === "function"
        ? await ReportLineage.findAll({
            where: { report_run_id: runId },
            order: [["created_at", "ASC"]],
          })
        : []

    const run = asPlainObject(runRecord)
    const rows = rowRecords.map((record) => {
      const payload = asPlainObject(record)
      return {
        id: payload.id,
        reportRunId: payload.report_run_id,
        templateRowId: payload.template_row_id || null,
        semanticConceptId: payload.semantic_concept_id || null,
        semanticConceptKey: payload.metadata_json?.semanticConceptKey || null,
        semanticConceptLabel: payload.metadata_json?.semanticConceptLabel || null,
        rowOrder: payload.row_order,
        rowLabel: payload.row_label || null,
        rowType: payload.row_type || null,
        sectionName: payload.section_name || null,
        formulaText: payload.formula_text || null,
        value: payload.resolved_value !== null && payload.resolved_value !== undefined ? Number(payload.resolved_value) : null,
        currency: payload.currency || null,
        resolutionStatus: payload.resolution_status,
        valueSource: payload.value_source,
        metadata: payload.metadata_json || {},
      }
    })

    return {
      run: {
        id: run.id,
        type: run.type,
        fundId: run.portfolio_id || null,
        templateVersionId: run.template_version_id || null,
        periodStart: run.period_start || null,
        periodEnd: run.period_end || null,
        status: run.status || null,
        readinessStatus: run.readiness_status || null,
        lastValidatedAt: run.last_validated_at || null,
        inputs: run.inputs_json || {},
        generationSummary: run.summary_json || {},
        mappingSnapshot: run.mapping_snapshot_json || {},
      },
      runRecord,
      templateVersion: runRecord.templateVersion ? asPlainObject(runRecord.templateVersion) : null,
      rows,
      lineage: lineageRecords.map(asPlainObject),
      generationSummary: run.summary_json || {},
    }
  }

  static async validateReportRun({ runId, actorId = null }) {
    const startedAt = Date.now()
    const context = await this.buildContext({ runId })
    if (!context) return null

    await AuditService.logEvent({
      actorId,
      eventType: "report_validation_requested",
      entityType: "report_run",
      entityId: runId,
      after: context.runRecord.toJSON(),
      metadata: {
        template_version_id: context.run.templateVersionId,
        period_start: context.run.periodStart,
        period_end: context.run.periodEnd,
      },
    })

    try {
      const rules = ValidationRuleRegistry.getRules()
      const checks = rules.map((rule) => rule(context))
      const readiness = ReportReadinessService.determine({ checks })
      const summary = {
        ...readiness.summary,
        durationMs: Date.now() - startedAt,
        generationStatus: context.run.status,
        unresolvedRows: Number(context.generationSummary?.unresolvedRows || 0),
        resolvedRows: Number(context.generationSummary?.resolvedRows || 0),
      }

      const validationResultRecord = await sequelize.transaction(async (transaction) => {
        const resultRecord = await ValidationResult.create(
          {
            report_run_id: runId,
            overall_status: readiness.overallStatus,
            readiness_status: readiness.readinessStatus,
            summary_json: summary,
            created_by: actorId,
          },
          { transaction },
        )

        await ValidationCheckResult.bulkCreate(
          checks.map((check) => ({
            validation_result_id: resultRecord.id,
            check_type: check.checkType,
            severity: check.severity,
            status: check.status,
            target_type: check.targetType || "report_run",
            target_id: check.targetId || runId,
            message: check.message,
            details_json: check.details || null,
          })),
          { transaction },
        )

        await context.runRecord.update(
          {
            readiness_status: readiness.readinessStatus,
            last_validated_at: new Date(),
          },
          { transaction },
        )

        return resultRecord
      })

      const result = await ValidationResultService.getLatestForRun({ runId })

      logger.info("[phase8] Report validation completed", {
        report_run_id: runId,
        overall_status: readiness.overallStatus,
        readiness_status: readiness.readinessStatus,
        passed_checks: readiness.summary.passedChecks,
        warning_checks: readiness.summary.warningChecks,
        failed_checks: readiness.summary.failedChecks,
        duration_ms: summary.durationMs,
      })

      await AuditService.logEvent({
        actorId,
        eventType: "report_validated",
        entityType: "report_run",
        entityId: runId,
        after: context.runRecord.toJSON(),
        metadata: {
          overall_status: readiness.overallStatus,
          readiness_status: readiness.readinessStatus,
          summary,
        },
      })

      let exceptionReview = null
      try {
        exceptionReview = await ReviewTaskService.generateValidationReviewTasks({
          run: context.run,
          validationResult: result?.validationResult || null,
          checks: result?.checks || [],
          actorId,
        })
      } catch (reviewError) {
        logger.warn("[phase2] Validation exception review task generation failed", {
          report_run_id: runId,
          message: reviewError.message,
        })
      }

      return {
        ...result,
        exceptionReview,
        reportRun: {
          id: context.run.id,
          status: context.runRecord.status,
          readinessStatus: readiness.readinessStatus,
          lastValidatedAt: context.runRecord.last_validated_at,
        },
      }
    } catch (error) {
      await context.runRecord.update({
        readiness_status: REPORT_READINESS_STATUSES.NOT_READY,
        last_validated_at: new Date(),
      })

      await AuditService.logEvent({
        actorId,
        eventType: "report_validation_failed",
        entityType: "report_run",
        entityId: runId,
        after: context.runRecord.toJSON(),
        metadata: {
          error: {
            code: error.code || "report_validation_failed",
            message: error.message,
          },
        },
      })

      logger.error("[phase8] Report validation failed", {
        report_run_id: runId,
        error_code: error.code || "report_validation_failed",
        error_message: error.message,
      })

      throw error
    }
  }
}

module.exports = {
  ValidationEngineService,
  createValidationError,
}
