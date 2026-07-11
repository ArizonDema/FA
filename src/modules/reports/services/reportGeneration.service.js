const { Op } = require("sequelize")
const logger = require("../../../config/logger")
const {
  ReportRun,
  ReportRunRow,
  SemanticConcept,
  Template,
  CashFlowTemplate,
  TemplateRow,
  TemplateRowSemanticMapping,
  TemplateVersion,
  sequelize,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")
const {
  REPORT_ROW_RESOLUTION_STATUSES,
  REPORT_RUN_STATUSES,
} = require("../report.constants")
const { REPORT_READINESS_STATUSES } = require("../validation.constants")
const SemanticValueAggregationService = require("./semanticValueAggregation.service")
const TemplateRowRenderService = require("./templateRowRender.service")
const ReportLineageService = require("./reportLineage.service")
const ValidationResultService = require("./validationResult.service")
const { ValidationEngineService } = require("./validationEngine.service")

const TemplateModel = Template || CashFlowTemplate

function createReportGenerationError(message, code = "report_generation_validation", statusCode = 400, details = null) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  error.details = details
  return error
}

function normalizeDateOnly(value, fieldName) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw createReportGenerationError(`${fieldName} must be a valid date`)
  }
  return parsed.toISOString().slice(0, 10)
}

function buildActiveDateOverlapClause({ periodStart, periodEnd }) {
  return {
    [Op.and]: [
      {
        [Op.or]: [{ effective_start: null }, { effective_start: { [Op.lte]: periodEnd } }],
      },
      {
        [Op.or]: [{ effective_end: null }, { effective_end: { [Op.gte]: periodStart } }],
      },
    ],
  }
}

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function pickCurrentApprovedMapping(mappings = []) {
  return [...mappings]
    .sort((left, right) => {
      const leftActive = left.effective_end ? 1 : 0
      const rightActive = right.effective_end ? 1 : 0
      if (leftActive !== rightActive) return leftActive - rightActive

      const leftApprovedAt = new Date(left.approved_at || left.created_at || 0).getTime()
      const rightApprovedAt = new Date(right.approved_at || right.created_at || 0).getTime()
      return rightApprovedAt - leftApprovedAt
    })[0] || null
}

function summarizeRows(rows = []) {
  const summary = {
    totalRows: rows.length,
    resolvedRows: 0,
    unresolvedRows: 0,
    structuralRows: 0,
    missingMappingsCount: 0,
    partialGroundingCount: 0,
    formulaNotComputedCount: 0,
    statusBreakdown: {},
  }

  const structuralStatuses = new Set([
    REPORT_ROW_RESOLUTION_STATUSES.SKIPPED_BLANK_ROW,
    REPORT_ROW_RESOLUTION_STATUSES.NOTE_ROW,
    REPORT_ROW_RESOLUTION_STATUSES.SECTION_HEADER,
  ])
  const unresolvedStatuses = new Set([
    REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING,
    REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_SOURCE_SUPPORT,
    REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_PARTIAL_GROUNDING,
    REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED,
  ])

  rows.forEach((row) => {
    summary.statusBreakdown[row.resolutionStatus] = (summary.statusBreakdown[row.resolutionStatus] || 0) + 1

    if (row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.RESOLVED) {
      summary.resolvedRows += 1
    }
    if (row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_NO_APPROVED_MAPPING) {
      summary.missingMappingsCount += 1
    }
    if (row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.UNRESOLVED_PARTIAL_GROUNDING) {
      summary.partialGroundingCount += 1
    }
    if (row.resolutionStatus === REPORT_ROW_RESOLUTION_STATUSES.FORMULA_NOT_COMPUTED) {
      summary.formulaNotComputedCount += 1
    }
    if (structuralStatuses.has(row.resolutionStatus)) {
      summary.structuralRows += 1
    }
    if (unresolvedStatuses.has(row.resolutionStatus)) {
      summary.unresolvedRows += 1
    }
  })

  return summary
}

class ReportGenerationService {
  static serializeRun(run) {
    const payload = asPlainObject(run) || {}
    return {
      id: payload.id,
      type: payload.type,
      fundId: payload.portfolio_id || null,
      templateVersionId: payload.template_version_id || null,
      periodStart: payload.period_start || null,
      periodEnd: payload.period_end || null,
      status: payload.status || null,
      readinessStatus: payload.readiness_status || null,
      lastValidatedAt: payload.last_validated_at || null,
      summary: payload.summary_json || null,
      inputs: payload.inputs_json || null,
      completedAt: payload.completed_at || null,
      createdAt: payload.created_at || payload.createdAt || null,
      updatedAt: payload.updated_at || payload.updatedAt || null,
    }
  }

  static serializeRunRow(record) {
    const payload = asPlainObject(record) || {}
    return {
      id: payload.id,
      reportRunId: payload.report_run_id,
      templateVersionId: payload.template_version_id,
      templateRowId: payload.template_row_id || null,
      semanticConceptId: payload.semantic_concept_id || null,
      rowOrder: payload.row_order,
      rowLabel: payload.row_label || null,
      rowType: payload.row_type || null,
      sectionName: payload.section_name || null,
      formulaText: payload.formula_text || null,
      value: payload.resolved_value !== null && payload.resolved_value !== undefined ? Number(payload.resolved_value) : null,
      currency: payload.currency || null,
      resolutionStatus: payload.resolution_status,
      valueSource: payload.value_source,
      semanticConceptKey: payload.semanticConcept?.stable_key || payload.metadata_json?.semanticConceptKey || null,
      semanticConceptLabel: payload.semanticConcept?.label || payload.metadata_json?.semanticConceptLabel || null,
      metadata: payload.metadata_json || {},
    }
  }

  static async loadTemplateVersion({ templateVersionId, fundId = null }) {
    const version = await TemplateVersion.findByPk(templateVersionId)
    if (!version) {
      return null
    }

    if (fundId && version.portfolio_id !== fundId) {
      throw createReportGenerationError("templateVersionId is invalid for the selected fund")
    }

    const template = await TemplateModel.findByPk(version.template_id)
    return {
      version,
      template,
      fundId: version.portfolio_id,
    }
  }

  static async getApprovedMappingsByRow({ templateVersionId, periodStart, periodEnd }) {
    const mappings = await TemplateRowSemanticMapping.findAll({
      where: {
        template_version_id: templateVersionId,
        status: "approved",
        ...buildActiveDateOverlapClause({ periodStart, periodEnd }),
      },
      include: [{ model: SemanticConcept, as: "semanticConcept" }],
      order: [
        ["approved_at", "DESC"],
        ["created_at", "DESC"],
      ],
    })

    const mappingsByRow = new Map()
    mappings.forEach((mappingRecord) => {
      const mapping = asPlainObject(mappingRecord)
      const rowId = mapping.template_row_id
      if (!mappingsByRow.has(rowId)) {
        mappingsByRow.set(rowId, [])
      }
      mappingsByRow.get(rowId).push(mapping)
    })

    return new Map(
      Array.from(mappingsByRow.entries()).map(([rowId, rowMappings]) => [rowId, pickCurrentApprovedMapping(rowMappings)]),
    )
  }

  static buildRowPersistencePayload({ runId, templateVersionId, row }) {
    return {
      report_run_id: runId,
      template_version_id: templateVersionId,
      template_row_id: row.templateRowId || null,
      semantic_concept_id: row.semanticConceptId || null,
      row_order: row.rowOrder || null,
      row_label: row.rowLabel || null,
      row_type: row.rowType || null,
      section_name: row.sectionName || null,
      formula_text: row.formulaText || null,
      resolved_value: row.value,
      currency: row.currency || null,
      resolution_status: row.resolutionStatus,
      value_source: row.valueSource,
      metadata_json: {
        semanticConceptKey: row.semanticConceptKey || null,
        semanticConceptLabel: row.semanticConceptLabel || null,
        rowKey: row.rowKey || null,
        rowIndex: row.rowIndex || null,
        sheetName: row.sheetName || null,
        parentSectionName: row.parentSectionName || null,
        indentationLevel: row.indentationLevel || 0,
        ...row.metadata,
      },
    }
  }

  static async generateReport({
    templateVersionId,
    fundId = null,
    periodStart,
    periodEnd,
    actorId = null,
    persist = true,
  }) {
    if (!templateVersionId) {
      throw createReportGenerationError("templateVersionId is required")
    }

    const normalizedPeriodStart = normalizeDateOnly(periodStart, "periodStart")
    const normalizedPeriodEnd = normalizeDateOnly(periodEnd, "periodEnd")
    if (normalizedPeriodStart > normalizedPeriodEnd) {
      throw createReportGenerationError("periodStart must be before or equal to periodEnd")
    }

    const templateVersionRecord = await this.loadTemplateVersion({
      templateVersionId,
      fundId,
    })
    if (!templateVersionRecord) {
      return null
    }

    const resolvedFundId = templateVersionRecord.fundId
    let run = null
    const startedAt = Date.now()

    if (persist) {
      run = await ReportRun.create({
        type: "cash_flow",
        portfolio_id: resolvedFundId,
        template_version_id: templateVersionId,
        period_start: normalizedPeriodStart,
        period_end: normalizedPeriodEnd,
        status: REPORT_RUN_STATUSES.PENDING,
        inputs_json: {
          generation_mode: "approved_mapping_report_engine",
          source_kind: "journal_entries",
          template_version_id: templateVersionId,
          template_id: templateVersionRecord.template?.id || null,
          period_start: normalizedPeriodStart,
          period_end: normalizedPeriodEnd,
        },
        created_by: actorId,
      })

      await AuditService.logEvent({
        actorId,
        eventType: "report_generation_requested",
        entityType: "report_run",
        entityId: run.id,
        after: run.toJSON(),
        metadata: {
          fund_id: resolvedFundId,
          template_version_id: templateVersionId,
          period_start: normalizedPeriodStart,
          period_end: normalizedPeriodEnd,
        },
      })
    }

    try {
      const [rows, approvedMappingsByRow, aggregatedValues] = await Promise.all([
        TemplateRow.findAll({
          where: { template_version_id: templateVersionId },
          order: [
            ["row_order", "ASC"],
            ["row_index", "ASC"],
          ],
        }),
        this.getApprovedMappingsByRow({
          templateVersionId,
          periodStart: normalizedPeriodStart,
          periodEnd: normalizedPeriodEnd,
        }),
        SemanticValueAggregationService.aggregate({
          fundId: resolvedFundId,
          periodStart: normalizedPeriodStart,
          periodEnd: normalizedPeriodEnd,
        }),
      ])

      const renderedRows = rows.map((rowRecord) => {
        const row = asPlainObject(rowRecord)
        const approvedMapping = approvedMappingsByRow.get(row.id) || null
        const semanticValue = approvedMapping
          ? aggregatedValues.conceptsById.get(approvedMapping.semantic_concept_id) || null
          : null

        return TemplateRowRenderService.render({
          row,
          approvedMapping,
          semanticValue,
        })
      })

      const summary = {
        ...summarizeRows(renderedRows),
        approvedMappingsUsed: Array.from(approvedMappingsByRow.values()).filter(Boolean).length,
        sourceSummary: aggregatedValues.summary,
        durationMs: Date.now() - startedAt,
      }
      const runStatus =
        summary.unresolvedRows > 0
          ? REPORT_RUN_STATUSES.COMPLETED_WITH_UNRESOLVED_ROWS
          : REPORT_RUN_STATUSES.COMPLETED

      if (persist && run) {
        await sequelize.transaction(async (transaction) => {
          const rowPayloads = renderedRows.map((row) =>
            this.buildRowPersistencePayload({
              runId: run.id,
              templateVersionId,
              row,
            }),
          )
          const persistedRows = await ReportRunRow.bulkCreate(rowPayloads, { transaction })

          await ReportLineageService.persistForReportRows({
            run,
            rows: persistedRows,
            transaction,
          })

          await run.update(
            {
              status: runStatus,
              summary_json: summary,
              mapping_snapshot_json: {
                generation_mode: "approved_mapping_report_engine",
                approved_row_mapping_ids: Array.from(approvedMappingsByRow.values())
                  .filter(Boolean)
                  .map((mapping) => mapping.id),
                source_summary: aggregatedValues.summary,
              },
              completed_at: new Date(),
            },
            { transaction },
          )
        })

        await AuditService.logEvent({
          actorId,
          eventType: "report_generated",
          entityType: "report_run",
          entityId: run.id,
          after: run.toJSON(),
          metadata: {
            fund_id: resolvedFundId,
            template_version_id: templateVersionId,
            period_start: normalizedPeriodStart,
            period_end: normalizedPeriodEnd,
            summary,
          },
        })
      }

      logger.info("[phase7] Deterministic report generated from approved mappings", {
        fund_id: resolvedFundId,
        template_version_id: templateVersionId,
        rows_processed: renderedRows.length,
        resolved_rows: summary.resolvedRows,
        unresolved_rows: summary.unresolvedRows,
        approved_mappings_used: summary.approvedMappingsUsed,
        missing_mappings_count: summary.missingMappingsCount,
        duration_ms: summary.durationMs,
      })

      let validation = null
      let validationError = null
      if (persist && run) {
        try {
          validation = await ValidationEngineService.validateReportRun({
            runId: run.id,
            actorId,
          })
          const refreshedRun = await ReportRun.findByPk(run.id)
          if (refreshedRun) {
            run = refreshedRun
          }
        } catch (error) {
          validationError = {
            code: error.code || "report_validation_failed",
            message: error.message,
            details: error.details || null,
          }
          logger.error("[phase8] Automatic report validation failed after generation", {
            report_run_id: run.id,
            error_code: validationError.code,
            error_message: validationError.message,
          })
        }
      }

      return {
        reportRun: {
          ...(run ? this.serializeRun(run) : {}),
          id: run?.id || null,
          templateVersionId,
          fundId: resolvedFundId,
          periodStart: normalizedPeriodStart,
          periodEnd: normalizedPeriodEnd,
          status: runStatus,
          readinessStatus:
            validation?.validationResult?.readinessStatus ||
            run?.readiness_status ||
            REPORT_READINESS_STATUSES.NOT_READY,
        },
        templateVersion: {
          id: templateVersionRecord.version.id,
          templateId: templateVersionRecord.version.template_id,
          fundId: templateVersionRecord.version.portfolio_id,
          versionLabel: templateVersionRecord.version.version_label,
          workbookMetadata: templateVersionRecord.version.parsed_structure_json?.workbookMetadata || null,
        },
        rows: renderedRows,
        summary,
        validationResult: validation?.validationResult || null,
        validationChecks: validation?.checks || [],
        validationError,
      }
    } catch (error) {
      if (persist && run) {
        await run.update({
          status: REPORT_RUN_STATUSES.FAILED,
          error_json: {
            code: error.code || "report_generation_failed",
            message: error.message,
            details: error.details || null,
          },
          completed_at: new Date(),
        })

        await AuditService.logEvent({
          actorId,
          eventType: "report_generation_failed",
          entityType: "report_run",
          entityId: run.id,
          after: run.toJSON(),
          metadata: {
            fund_id: resolvedFundId,
            template_version_id: templateVersionId,
            period_start: normalizedPeriodStart,
            period_end: normalizedPeriodEnd,
            error: {
              code: error.code || "report_generation_failed",
              message: error.message,
            },
          },
        })
      }

      throw error
    }
  }

  static async getReportRun({ runId }) {
    const run = await ReportRun.findByPk(runId, {
      include: [{ model: TemplateVersion, as: "templateVersion" }],
    })
    if (!run) return null

    const latestValidation = await ValidationResultService.getLatestForRun({ runId })

    return {
      reportRun: this.serializeRun(run),
      templateVersion: run.templateVersion
        ? {
            id: run.templateVersion.id,
            templateId: run.templateVersion.template_id,
            fundId: run.templateVersion.portfolio_id,
            versionLabel: run.templateVersion.version_label,
            workbookMetadata: run.templateVersion.parsed_structure_json?.workbookMetadata || null,
          }
        : null,
      validationResult: latestValidation?.validationResult || null,
    }
  }

  static async getReportRunRows({ runId }) {
    const run = await ReportRun.findByPk(runId)
    if (!run) return null

    const rows = await ReportRunRow.findAll({
      where: { report_run_id: runId },
      include: [{ model: SemanticConcept, as: "semanticConcept" }],
      order: [
        ["row_order", "ASC"],
        ["created_at", "ASC"],
      ],
    })

    const latestValidation = await ValidationResultService.getLatestForRun({ runId })

    return {
      reportRun: this.serializeRun(run),
      rows: rows.map((row) => this.serializeRunRow(row)),
      summary: run.summary_json || null,
      validationResult: latestValidation?.validationResult || null,
    }
  }
}

module.exports = {
  ReportGenerationService,
  createReportGenerationError,
}
