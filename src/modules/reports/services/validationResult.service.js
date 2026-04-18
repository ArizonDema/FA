const {
  ReportRun,
  ValidationCheckResult,
  ValidationResult,
} = require("../../../models")

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

class ValidationResultService {
  static serializeCheck(checkRecord) {
    const payload = asPlainObject(checkRecord) || {}
    return {
      id: payload.id,
      validationResultId: payload.validation_result_id,
      checkType: payload.check_type,
      severity: payload.severity,
      status: payload.status,
      targetType: payload.target_type || null,
      targetId: payload.target_id || null,
      message: payload.message,
      details: payload.details_json || null,
      createdAt: payload.created_at || payload.createdAt || null,
      updatedAt: payload.updated_at || payload.updatedAt || null,
    }
  }

  static serializeResult(resultRecord) {
    const payload = asPlainObject(resultRecord) || {}
    return {
      id: payload.id,
      reportRunId: payload.report_run_id,
      overallStatus: payload.overall_status,
      readinessStatus: payload.readiness_status,
      summary: payload.summary_json || null,
      createdBy: payload.created_by || null,
      createdAt: payload.created_at || payload.createdAt || null,
      updatedAt: payload.updated_at || payload.updatedAt || null,
    }
  }

  static async getLatestForRun({ runId }) {
    const result = await ValidationResult.findOne({
      where: { report_run_id: runId },
      order: [["created_at", "DESC"]],
      include: [{ model: ValidationCheckResult, as: "checks" }],
    })
    if (!result) return null

    return {
      validationResult: this.serializeResult(result),
      checks: (result.checks || []).map((check) => this.serializeCheck(check)),
    }
  }

  static async getReadiness({ runId }) {
    const run = await ReportRun.findByPk(runId)
    if (!run) return null

    const latest = await this.getLatestForRun({ runId })
    return {
      reportRun: {
        id: run.id,
        status: run.status,
        readinessStatus: run.readiness_status || null,
        lastValidatedAt: run.last_validated_at || null,
      },
      validationResult: latest?.validationResult || null,
    }
  }
}

module.exports = ValidationResultService
