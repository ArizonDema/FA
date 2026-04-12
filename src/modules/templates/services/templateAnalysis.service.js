const {
  CashFlowTemplateAnalysis,
  TemplateRow,
} = require("../../../models")
const CashFlowService = require("../../../services/cashFlow.service")
const LlmOrchestratorService = require("../../llm/services/llmOrchestrator.service")
const AuditService = require("../../audit/services/audit.service")
const {
  buildAnalysisConfigPayload,
  buildIssuesJson,
  createSchemaHash,
  deepMerge,
  extractTemplateRows,
  normalizeAnalysisIssues,
  normalizeRequiredAnchors,
  stableStringify,
  toAnalysisResultPayload,
} = require("../utils/templateAnalysis.util")

const ANALYSIS_TTL_MS = 7 * 24 * 60 * 60 * 1000

class TemplateAnalysisService {
  static async runTemplateIngestion({ templatePath, sourceFileName }) {
    const sourceHash = LlmOrchestratorService.computeTemplateHash(templatePath)
    const ingestionResult = await LlmOrchestratorService.analyzeTemplateSchema({
      templatePath,
      sourceFileName,
    })

    const payload = toAnalysisResultPayload(ingestionResult)
    return {
      ...payload,
      source_file_sha256: sourceHash,
      schema_cache_hit: false,
      analysis_source: payload.analysis_source || "llm",
      cache_source_analysis_id: null,
    }
  }

  static async createAnalysisRecord({
    fundId,
    templateId = null,
    templateVersionId = null,
    sourceFileName,
    sourceFilePath,
    actorId = null,
    ingestionResult,
    status = "suggested",
    expiresAt = new Date(Date.now() + ANALYSIS_TTL_MS),
  }) {
    const analysisConfigPayload = buildAnalysisConfigPayload(ingestionResult)
    const analysis = await CashFlowTemplateAnalysis.create({
      portfolio_id: fundId,
      template_id: templateId,
      template_version_id: templateVersionId,
      source_file_name: sourceFileName,
      source_file_path: sourceFilePath,
      source_file_sha256: ingestionResult.source_file_sha256 || null,
      status,
      detected_layout_type: ingestionResult.detected_layout_type,
      confidence: ingestionResult.confidence,
      suggested_config_json: analysisConfigPayload,
      raw_structure_json: ingestionResult.raw_structure_json || null,
      llm_meta_json: ingestionResult.llm_meta_json || null,
      schema_hash: createSchemaHash(analysisConfigPayload),
      needs_human_review: Boolean(ingestionResult.needs_human_review),
      issues_json: buildIssuesJson({
        issues: ingestionResult.issues || [],
        requiredAnchors: ingestionResult.required_anchors || [],
        schemaCacheHit: ingestionResult.schema_cache_hit,
        analysisSource: ingestionResult.analysis_source,
        cacheSourceAnalysisId: ingestionResult.cache_source_analysis_id,
        llmFailureReason: ingestionResult.llm_failure_reason,
      }),
      created_by: actorId,
      expires_at: expiresAt,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_analysis_saved",
      entityType: "cash_flow_template_analysis",
      entityId: analysis.id,
      after: analysis.toJSON(),
      metadata: {
        fund_id: fundId,
        template_id: templateId,
        template_version_id: templateVersionId,
      },
    })

    return {
      analysis,
      analysisConfigPayload,
    }
  }

  static async resolveConfigFromAnalysisOrPayload({
    body,
    fundId,
    templatePath,
    sourceFileName,
  }) {
    const hasAnalysisId = Boolean(body.analysis_id)
    const explicitConfig = this.parseConfigJson(body.config_json)

    if (!templatePath) {
      throw new CashFlowService.CashFlowValidationError("template_file is required for template ingestion")
    }

    let analysis = null
    let ingestionResult = null
    let baseConfig = explicitConfig || null

    if (hasAnalysisId) {
      analysis = await CashFlowTemplateAnalysis.findByPk(body.analysis_id)
      if (!analysis || analysis.portfolio_id !== fundId) {
        throw new CashFlowService.CashFlowValidationError("analysis_id is invalid for the selected fund")
      }

      if (analysis.expires_at && new Date(analysis.expires_at) < new Date()) {
        throw new CashFlowService.CashFlowValidationError("analysis_id has expired. Re-run template analysis.")
      }

      const analysisConfig = analysis.suggested_config_json
      if (!analysisConfig) {
        throw new CashFlowService.CashFlowValidationError(
          "Analysis did not produce a usable config. Provide config_json with manual anchors.",
        )
      }

      const mergedConfig = explicitConfig ? deepMerge(analysisConfig, explicitConfig) : analysisConfig
      const hasMeaningfulOverride =
        Boolean(explicitConfig) && stableStringify(mergedConfig || null) !== stableStringify(analysisConfig || null)

      if (analysis.needs_human_review && !hasMeaningfulOverride) {
        throw new CashFlowService.CashFlowValidationError(
          "Selected analysis is flagged for human review. Update config_json to resolve required anchors before saving.",
          {
            issues: normalizeAnalysisIssues(analysis?.issues_json?.issues),
            required_anchors: normalizeRequiredAnchors(analysis?.issues_json?.required_anchors),
          },
        )
      }

      baseConfig = mergedConfig
    } else {
      ingestionResult = await this.runTemplateIngestion({
        templatePath,
        sourceFileName,
      })

      if (!ingestionResult?.suggested_config_json) {
        throw new CashFlowService.CashFlowValidationError("Template ingestion did not produce a usable configuration")
      }

      const mergedConfig = explicitConfig
        ? deepMerge(ingestionResult.suggested_config_json, explicitConfig)
        : ingestionResult.suggested_config_json

      const hasMeaningfulOverride =
        Boolean(explicitConfig) &&
        stableStringify(mergedConfig || null) !== stableStringify(ingestionResult.suggested_config_json || null)

      if (ingestionResult.needs_human_review && !hasMeaningfulOverride) {
        throw new CashFlowService.CashFlowValidationError(
          "Template ingestion needs human review before creation. Update config_json to resolve required anchors first.",
          {
            issues: ingestionResult.issues || [],
            required_anchors: ingestionResult.required_anchors || [],
          },
        )
      }

      baseConfig = mergedConfig
    }

    const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
      templateConfig: baseConfig,
      templatePath,
    })

    return {
      analysis,
      ingestionResult,
      normalizedConfig: CashFlowService.validateTemplateConfig(normalizedV3),
    }
  }

  static parseConfigJson(value) {
    if (value === null || value === undefined || value === "") return null
    if (typeof value === "object") return value
    if (typeof value === "string") {
      try {
        return JSON.parse(value)
      } catch (error) {
        throw new CashFlowService.CashFlowValidationError("config_json must be valid JSON")
      }
    }
    throw new CashFlowService.CashFlowValidationError("config_json must be valid JSON")
  }

  static async syncTemplateRows({ templateVersionId, rawStructureJson, actorId = null, transaction = null }) {
    const rows = extractTemplateRows(rawStructureJson)
    if (!rows.length) return []

    await TemplateRow.destroy({
      where: { template_version_id: templateVersionId },
      transaction,
    })

    return await TemplateRow.bulkCreate(
      rows.map((row) => ({
        template_version_id: templateVersionId,
        sheet_name: row.sheet_name,
        row_index: row.row_index,
        row_key: row.row_key,
        label: row.label,
        cell_addresses_json: row.cell_addresses_json,
        metadata_json: row.metadata_json,
        created_by: actorId,
      })),
      { transaction },
    )
  }
}

module.exports = TemplateAnalysisService
