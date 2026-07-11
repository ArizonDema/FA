const crypto = require("crypto")
const fs = require("fs")
const { Op } = require("sequelize")
const {
  ReportExport,
  ReportRun,
  ReviewTask,
  sequelize,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const {
  REVIEW_PRIORITIES,
  REVIEW_REASONS,
  REVIEW_TARGET_TYPES,
  REVIEW_TASK_STATUSES,
} = require("../../reviews/review.constants")
const ValidationResultService = require("./validationResult.service")
const { REPORT_READINESS_STATUSES } = require("../validation.constants")

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function normalizeFormat(format) {
  return String(format || "xlsx").trim().toLowerCase()
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function serializeExport(record) {
  const payload = asPlainObject(record) || {}
  const { output_path: ignoredPath, ...safePayload } = payload
  void ignoredPath
  return {
    ...safePayload,
    output_available: Boolean(payload.output_path),
  }
}

class ReportExportService {
  static async requireRun(runId) {
    const run = await ReportRun.findByPk(runId)
    if (!run) throw new AppError("Report run not found", 404)
    return run
  }

  static resolveOutputPath(run, format) {
    const filePath = run.output_paths?.[format]
    if (!filePath || !fs.existsSync(filePath)) {
      throw new AppError("Report file not found", 404)
    }
    return filePath
  }

  static async listExports({ runId }) {
    if (!ReportExport || typeof ReportExport.findAll !== "function") return []
    const exports = await ReportExport.findAll({
      where: { report_run_id: runId },
      order: [["created_at", "DESC"]],
    })
    return exports.map(serializeExport)
  }

  static async requestFinalExport({ runId, format = "xlsx", actorId = null }) {
    if (!ReportExport || !ReviewTask) {
      throw new AppError("Report export controls are not available", 500)
    }

    const run = await this.requireRun(runId)
    const normalizedFormat = normalizeFormat(format)
    const outputPath = this.resolveOutputPath(run, normalizedFormat)
    const latestValidation = await ValidationResultService.getLatestForRun({ runId })

    if (!latestValidation?.validationResult) {
      throw new AppError("Validate this report before requesting final export", 400)
    }

    if (latestValidation.validationResult.readinessStatus !== REPORT_READINESS_STATUSES.READY) {
      throw new AppError("Final export requires a ready validation result with no unresolved blocking checks", 400, {
        validation_result_id: latestValidation.validationResult.id,
        readiness_status: latestValidation.validationResult.readinessStatus,
      })
    }

    const existing = await ReportExport.findOne?.({
      where: {
        report_run_id: runId,
        format: normalizedFormat,
        status: "approval_requested",
      },
    })
    if (existing) {
      return {
        export: serializeExport(existing),
        reviewTaskId: existing.approval_review_task_id || null,
        reused: true,
      }
    }

    const checksum = sha256(outputPath)
    const result = await sequelize.transaction(async (transaction) => {
      const exportRecord = await ReportExport.create(
        {
          report_run_id: runId,
          format: normalizedFormat,
          status: "approval_requested",
          output_path: outputPath,
          checksum_sha256: checksum,
          validation_result_id: latestValidation.validationResult.id,
          created_by: actorId,
          metadata_json: {
            readiness_status: latestValidation.validationResult.readinessStatus,
            requested_at: new Date().toISOString(),
          },
        },
        { transaction },
      )

      const reviewTask = await ReviewTask.create(
        {
          task_type: "export_approval",
          target_type: REVIEW_TARGET_TYPES.REPORT_EXPORT,
          target_id: exportRecord.id,
          template_version_id: run.template_version_id || null,
          portfolio_id: run.portfolio_id || null,
          status: REVIEW_TASK_STATUSES.OPEN,
          priority: REVIEW_PRIORITIES.HIGH,
          review_reason: REVIEW_REASONS.EXPORT_APPROVAL_REQUIRED,
          metadata_json: {
            report_run_id: runId,
            export_id: exportRecord.id,
            format: normalizedFormat,
            validation_result_id: latestValidation.validationResult.id,
            checksum_sha256: checksum,
          },
          created_by: actorId,
        },
        { transaction },
      )

      await exportRecord.update(
        {
          approval_review_task_id: reviewTask.id,
        },
        { transaction },
      )

      return { exportRecord, reviewTask }
    })

    await AuditService.logEvent({
      actorId,
      eventType: "report_export_approval_requested",
      entityType: "report_export",
      entityId: result.exportRecord.id,
      metadata: {
        report_run_id: runId,
        review_task_id: result.reviewTask.id,
        validation_result_id: latestValidation.validationResult.id,
        format: normalizedFormat,
      },
      after: serializeExport(result.exportRecord),
    })

    return {
      export: serializeExport(result.exportRecord),
      reviewTaskId: result.reviewTask.id,
      reused: false,
    }
  }

  static async findApprovedExport({ runId, format }) {
    if (!ReportExport || typeof ReportExport.findOne !== "function") return null
    return await ReportExport.findOne({
      where: {
        report_run_id: runId,
        format,
        status: { [Op.in]: ["approved", "exported"] },
      },
      order: [["updated_at", "DESC"]],
    })
  }

  static async resolveDownload({ runId, format = "xlsx", actorId = null, requireFinalApproval = false }) {
    const run = await this.requireRun(runId)
    const normalizedFormat = normalizeFormat(format)
    const filePath = this.resolveOutputPath(run, normalizedFormat)

    if (!requireFinalApproval) {
      return { run, filePath, final: false }
    }

    const exportRecord = await this.findApprovedExport({ runId, format: normalizedFormat })
    if (!exportRecord) {
      throw new AppError("Final export requires approved export review", 403)
    }

    const currentChecksum = sha256(filePath)
    if (exportRecord.checksum_sha256 && exportRecord.checksum_sha256 !== currentChecksum) {
      throw new AppError("Approved export artifact has changed since approval", 409)
    }

    if (exportRecord.status !== "exported" && typeof exportRecord.update === "function") {
      await exportRecord.update({
        status: "exported",
        exported_by: actorId,
        exported_at: new Date(),
      })
    }

    await AuditService.logEvent({
      actorId,
      eventType: "report_final_export_downloaded",
      entityType: "report_export",
      entityId: exportRecord.id,
      metadata: {
        report_run_id: runId,
        format: normalizedFormat,
      },
    })

    return { run, filePath, final: true, export: serializeExport(exportRecord) }
  }
}

module.exports = ReportExportService
