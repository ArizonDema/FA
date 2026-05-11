const fs = require("fs")
const path = require("path")
const { Op } = require("sequelize")
const {
  ReportRun,
  CashFlowAccountMapping,
  sequelize,
} = require("../../../models")
const CashFlowService = require("../../../services/cashFlow.service")
const StorageService = require("../../storage/services/storage.service")
const AuditService = require("../../audit/services/audit.service")
const TemplateService = require("../../templates/services/template.service")
const ReportReliabilityService = require("./reportReliability.service")

class CashFlowReportService {
  static async runReport({
    fundId,
    templateId = null,
    actorId = null,
    rangeInput,
    tbUpload,
    glUpload,
  }) {
    const resolvedRange = CashFlowService.resolveRunDateRange(rangeInput)
    let template = null

    if (templateId) {
      template = await TemplateService.getTemplate(templateId)
      if (!template || template.portfolio_id !== fundId) {
        throw new CashFlowService.CashFlowValidationError("template_id is invalid for the selected fund")
      }
    } else {
      template = await TemplateService.getActiveTemplateForFund(fundId)
    }

    if (!template) {
      throw new CashFlowService.CashFlowValidationError(
        "No active cash flow template found for this fund. Upload and activate one first.",
      )
    }
    const readiness = TemplateService.evaluateReadinessForTemplate(template)
    if (!template.is_active || template.status !== "active" || !readiness.can_activate) {
      throw new CashFlowService.CashFlowValidationError(
        readiness.activation_block_reason ||
          "Selected cash flow template is still a draft. Resolve required anchors and activate it before running extraction.",
        readiness,
      )
    }

    const activeVersion = template.activeVersion
    const templateVersionId = activeVersion?.id || template.active_version_id || null

    const run = await ReportRun.create({
      type: "cash_flow",
      portfolio_id: fundId,
      period_start: resolvedRange.start.toISOString().slice(0, 10),
      period_end: resolvedRange.end.toISOString().slice(0, 10),
      template_version_id: templateVersionId,
      inputs_json: {
        date_start: resolvedRange.start.toISOString().slice(0, 10),
        date_end: resolvedRange.end.toISOString().slice(0, 10),
        preset: rangeInput.preset || null,
        fiscal_year: Number.isInteger(rangeInput.fiscalYear) ? rangeInput.fiscalYear : null,
        template_id: template.id,
        template_name: template.name,
        tb_file_name: tbUpload.originalname,
        gl_file_name: glUpload.originalname,
      },
      created_by: actorId,
    })

    const runFolder = StorageService.ensureNamespace("cash-flow", "runs", run.id)
    const tbFilePath = path.join(runFolder, `tb_${StorageService.sanitizeFileName(tbUpload.originalname, "trial_balance")}`)
    const glFilePath = path.join(runFolder, `gl_${StorageService.sanitizeFileName(glUpload.originalname, "general_ledger")}`)
    StorageService.moveFile(tbUpload.path, tbFilePath)
    StorageService.moveFile(glUpload.path, glFilePath)

    const outputFilePath = path.join(
      runFolder,
      `cash_flow_${resolvedRange.start.toISOString().slice(0, 10)}_${resolvedRange.end
        .toISOString()
        .slice(0, 10)}.xlsx`,
    )

    const learnedMappingsRaw = await CashFlowAccountMapping.findAll({
      where: {
        portfolio_id: fundId,
        status: { [Op.in]: ["suggested", "approved"] },
        [Op.or]: [{ template_id: null }, { template_id: template.id }],
        [Op.and]: [
          {
            [Op.or]: [{ effective_start: null }, { effective_start: { [Op.lte]: resolvedRange.end.toISOString().slice(0, 10) } }],
          },
          {
            [Op.or]: [{ effective_end: null }, { effective_end: { [Op.gte]: resolvedRange.start.toISOString().slice(0, 10) } }],
          },
        ],
      },
    })

    const learnedMappings = learnedMappingsRaw
      .map((item) => item.toJSON())
      .sort((left, right) => {
        const leftTemplateSpecific = left.template_id === template.id ? 1 : 0
        const rightTemplateSpecific = right.template_id === template.id ? 1 : 0
        return leftTemplateSpecific - rightTemplateSpecific
      })

    let templateConfigForRun = activeVersion?.config_json || template.config_json
    const templatePathForRun = activeVersion?.source_file_path || template.template_file_path
    let autoCorrectedSheetName = null
    let result = null

    try {
      result = await CashFlowService.generateCashFlowReport({
        templatePath: templatePathForRun,
        templateConfig: templateConfigForRun,
        tbFilePath,
        glFilePath,
        dateStart: resolvedRange.start.toISOString().slice(0, 10),
        dateEnd: resolvedRange.end.toISOString().slice(0, 10),
        preset: rangeInput.preset || null,
        fiscalYear: rangeInput.fiscalYear || null,
        outputFilePath,
        learnedMappings,
      })
    } catch (generationError) {
      const availableSheets = Array.isArray(generationError?.details?.available_sheets)
        ? generationError.details.available_sheets.filter(Boolean)
        : []
      const currentSheetName = String(templateConfigForRun?.sheet_name || "").trim()
      const caseInsensitiveMatch =
        currentSheetName && availableSheets.length
          ? availableSheets.find((sheetName) => String(sheetName).trim().toLowerCase() === currentSheetName.toLowerCase())
          : null
      const fallbackSheetName = caseInsensitiveMatch || (availableSheets.length === 1 ? availableSheets[0] : null)
      const canAutoCorrectSheet =
        generationError instanceof CashFlowService.CashFlowValidationError &&
        /^Template sheet ".+" not found$/.test(String(generationError.message || "")) &&
        Boolean(fallbackSheetName) &&
        fallbackSheetName !== currentSheetName

      if (!canAutoCorrectSheet) {
        throw generationError
      }

      const correctedConfig = await CashFlowService.ensureV3TemplateConfig({
        templateConfig: {
          ...(templateConfigForRun || {}),
          sheet_name: fallbackSheetName,
        },
        templatePath: templatePathForRun,
      })

      result = await CashFlowService.generateCashFlowReport({
        templatePath: templatePathForRun,
        templateConfig: correctedConfig,
        tbFilePath,
        glFilePath,
        dateStart: resolvedRange.start.toISOString().slice(0, 10),
        dateEnd: resolvedRange.end.toISOString().slice(0, 10),
        preset: rangeInput.preset || null,
        fiscalYear: rangeInput.fiscalYear || null,
        outputFilePath,
        learnedMappings,
      })
      templateConfigForRun = correctedConfig
      autoCorrectedSheetName = fallbackSheetName
    }

    if (autoCorrectedSheetName) {
      result = {
        ...result,
        warnings: [
          ...(Array.isArray(result.warnings) ? result.warnings : []),
          `Template sheet mapping was auto-corrected to "${autoCorrectedSheetName}" for this run. Review and confirm the template config.`,
        ],
        normalizedConfig: templateConfigForRun,
      }
    }

    const reliabilitySummary = ReportReliabilityService.assess({
      assignments: result.mapping?.final_bucket_assignments || [],
      totalMovementCount: result.preview?.mapping_summary?.total_cash_movements || 0,
      lowConfidenceMappings: result.mapping?.low_confidence_mappings || [],
      unmappedMovementCount:
        Number(result.preview?.mapping_summary?.total_cash_movements || 0) -
        Number(result.preview?.mapping_summary?.mapped_cash_movements || 0),
    })
    result = {
      ...result,
      mapping: {
        ...(result.mapping || {}),
        reliability_summary: reliabilitySummary,
      },
      preview: {
        ...(result.preview || {}),
        mapping_summary: {
          ...(result.preview?.mapping_summary || {}),
          reliability: reliabilitySummary,
        },
      },
    }

    const buildAutoMappingMetadata = (mapping, action) => ({
      ...(mapping?.metadata_json || mapping?.metadata || {}),
      [action]: "cash_flow_report_run",
      report_run_id: run.id,
      profile_score: Number(mapping?.profile_score || 0),
      llm_score: Number(mapping?.llm_score || 0),
      deterministic_score: Number(mapping?.deterministic_score || mapping?.confidence || 0),
      evidence: Array.isArray(mapping?.evidence) ? mapping.evidence : [],
      reasoning: mapping?.reasoning || null,
      previous_bucket_key: mapping?.previous_bucket_key || null,
      account_profile: mapping?.account_profile || mapping?.profile_evidence || null,
    })

    await sequelize.transaction(async (transaction) => {
      const autoMappings = Array.isArray(result.mapping?.auto_mappings_created)
        ? result.mapping.auto_mappings_created
        : []

      for (const mapping of autoMappings) {
        const [record, created] = await CashFlowAccountMapping.findOrCreate({
          where: {
            portfolio_id: fundId,
            template_id: template.id,
            normalized_account: mapping.normalized_account,
            direction: mapping.direction,
          },
          defaults: {
            bucket_key: mapping.bucket_key,
            confidence: mapping.confidence,
            source: mapping.source || "auto_semantic",
            status: "suggested",
            effective_start: resolvedRange.start.toISOString().slice(0, 10),
            usage_count: 0,
            last_used_at: null,
            created_by: actorId,
            metadata_json: buildAutoMappingMetadata(mapping, "created_from"),
          },
          transaction,
        })

        if (!created) {
          await record.update(
            {
              bucket_key: mapping.bucket_key,
              confidence: mapping.confidence,
              source: mapping.source || record.source,
              status: record.status === "approved" ? "approved" : "suggested",
              metadata_json: {
                ...(record.metadata_json || {}),
                ...buildAutoMappingMetadata(mapping, "updated_from"),
              },
            },
            { transaction },
          )
        }
      }

      const finalAssignments = Array.isArray(result.mapping?.final_bucket_assignments)
        ? result.mapping.final_bucket_assignments
        : []
      for (const assignment of finalAssignments) {
        const existing = await CashFlowAccountMapping.findOne({
          where: {
            portfolio_id: fundId,
            template_id: template.id,
            normalized_account: assignment.normalized_account,
            direction: assignment.direction,
          },
          transaction,
        })
        if (existing) {
          await existing.update(
            {
              usage_count: Number(existing.usage_count || 0) + 1,
              last_used_at: new Date(),
            },
            { transaction },
          )
        }
      }
    })

    await run.update({
      inputs_json: {
        ...run.inputs_json,
        tb_file_path: tbFilePath,
        gl_file_path: glFilePath,
        warnings: result.warnings,
        auto_mappings_created: result.mapping?.auto_mappings_created || [],
        low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
        final_bucket_assignments: result.mapping?.final_bucket_assignments || [],
        assistance_summary: result.mapping?.assistance_summary || null,
        account_profile_summary: result.mapping?.account_profile_summary || null,
        reliability_summary: result.mapping?.reliability_summary || null,
      },
      output_paths: {
        xlsx: result.outputFilePath,
      },
      mapping_snapshot_json: {
        auto_mappings_created: result.mapping?.auto_mappings_created || [],
        low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
        final_bucket_assignments: result.mapping?.final_bucket_assignments || [],
        assistance_summary: result.mapping?.assistance_summary || null,
        account_profile_summary: result.mapping?.account_profile_summary || null,
        reliability_summary: result.mapping?.reliability_summary || null,
      },
      input_artifacts_json: {
        tb_file_path: tbFilePath,
        gl_file_path: glFilePath,
      },
      output_artifacts_json: {
        xlsx: result.outputFilePath,
      },
    })

    await AuditService.logEvent({
      actorId,
      eventType: "report_extraction_requested",
      entityType: "cash_flow_report_run",
      entityId: run.id,
      after: run.toJSON(),
      metadata: {
        fund_id: fundId,
        template_id: template.id,
        template_version_id: templateVersionId,
      },
    })

    return {
      run,
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
        active_version_id: templateVersionId,
      },
      outputs: { xlsx: true },
      preview: result.preview,
      warnings: result.warnings,
      report_reliability: result.mapping?.reliability_summary || null,
      auto_mappings_created: result.mapping?.auto_mappings_created || [],
      low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
      final_bucket_assignments: result.mapping?.final_bucket_assignments || [],
      assistance_summary: result.mapping?.assistance_summary || null,
      account_profile_summary: result.mapping?.account_profile_summary || null,
      reliability_summary: result.mapping?.reliability_summary || null,
    }
  }

  static async getHistory({ fundId }) {
    return await ReportRun.findAll({
      where: {
        portfolio_id: fundId,
        type: "cash_flow",
      },
      order: [["created_at", "DESC"]],
    })
  }

  static async getDownloadPath(runId) {
    const run = await ReportRun.findByPk(runId)
    if (!run || run.type !== "cash_flow") return null

    const xlsxPath = run.output_paths?.xlsx
    if (!xlsxPath || !fs.existsSync(xlsxPath)) return null

    return {
      run,
      filePath: xlsxPath,
    }
  }
}

module.exports = CashFlowReportService
