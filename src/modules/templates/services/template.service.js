const fs = require("fs")
const path = require("path")
const { Op } = require("sequelize")
const {
  sequelize,
  Template,
  CashFlowTemplate,
  TemplateVersion,
  CashFlowTemplateAnalysis,
} = require("../../../models")
const CashFlowService = require("../../../services/cashFlow.service")
const logger = require("../../../config/logger")
const StorageService = require("../../storage/services/storage.service")
const AuditService = require("../../audit/services/audit.service")
const { withTemplateIdentity } = require("../../shared/template")
const { createSchemaHash } = require("../utils/templateAnalysis.util")
const TemplateAnalysisService = require("./templateAnalysis.service")
const TemplateParsingService = require("./templateParsing.service")
const { evaluateTemplateReadiness, uniqueAnchors } = require("./templateReadiness.service")

const TemplateModel = Template || CashFlowTemplate

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return fallback
}

function parseActivationMode(value) {
  const normalized = String(value || "activate_if_ready").trim().toLowerCase()
  return normalized === "draft" ? "draft" : "activate_if_ready"
}

function decorateConfigWithReviewMetadata(config, review) {
  const nextConfig = {
    ...(config || {}),
    review_metadata: {
      ...((config && typeof config.review_metadata === "object" && config.review_metadata) || {}),
    },
  }

  if (review?.can_activate) {
    nextConfig.review_metadata.needs_human_review = false
    nextConfig.review_metadata.required_anchors = []
    return nextConfig
  }

  nextConfig.review_metadata.needs_human_review = true
  nextConfig.review_metadata.required_anchors = uniqueAnchors(review?.required_anchors || [])
  if (!Array.isArray(nextConfig.review_metadata.confirmed_anchors)) {
    nextConfig.review_metadata.confirmed_anchors = []
  }
  return nextConfig
}

class TemplateService {
  static listTemplateSourceCandidates(template) {
    const names = [
      template?.template_file_name,
      template?.activeVersion?.source_file_name,
      template?.template_file_path ? path.basename(template.template_file_path) : null,
      template?.activeVersion?.source_file_path ? path.basename(template.activeVersion.source_file_path) : null,
    ]

    return Array.from(
      new Set(
        names
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    )
  }

  static findRecoverySourceForTemplate(template) {
    const analysesDir = StorageService.getNamespacePath("cash-flow", "template-analyses")
    if (!fs.existsSync(analysesDir)) return null

    const candidateNames = this.listTemplateSourceCandidates(template).map((name) => name.toLowerCase())
    if (!candidateNames.length) return null

    let files = []
    try {
      files = fs
        .readdirSync(analysesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const fullPath = path.join(analysesDir, entry.name)
          const stats = fs.statSync(fullPath)
          return {
            fullPath,
            name: entry.name,
            lowerName: entry.name.toLowerCase(),
            mtimeMs: stats.mtimeMs,
          }
        })
    } catch (error) {
      return null
    }

    const preferredMatch = files
      .filter((file) => candidateNames.some((candidate) => file.lowerName === candidate || file.lowerName.endsWith(`_${candidate}`)))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
    if (preferredMatch) return preferredMatch.fullPath

    const fuzzyMatch = files
      .filter((file) => candidateNames.some((candidate) => file.lowerName.includes(candidate)))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
    return fuzzyMatch?.fullPath || null
  }

  static async recoverTemplateSourceFromAnalysis(template) {
    const recoveryPath = this.findRecoverySourceForTemplate(template)
    if (!recoveryPath) return null

    const preferredName = String(
      template?.template_file_name || template?.activeVersion?.source_file_name || path.basename(recoveryPath),
    ).trim()
    const restoredName = StorageService.sanitizeFileName(preferredName, "cash_flow_template")
    const restoredPath = StorageService.getNamespacePath("cash-flow", "templates", `${template.id}_${restoredName}`)

    StorageService.ensureDirectory(path.dirname(restoredPath))
    if (!fs.existsSync(restoredPath)) {
      fs.copyFileSync(recoveryPath, restoredPath)
    }

    await template.update({
      template_file_name: preferredName || template.template_file_name,
      template_file_path: restoredPath,
    })

    if (template.activeVersion) {
      await template.activeVersion.update({
        source_file_name: template.activeVersion.source_file_name || preferredName || path.basename(recoveryPath),
        source_file_path: restoredPath,
      })
    }

    logger.warn("[v0] Recovered missing template source file from template analyses archive", {
      template_id: template.id,
      restored_path: restoredPath,
      recovered_from: recoveryPath,
    })

    return restoredPath
  }

  static hasReanalyzableSource(template) {
    if (!template) return false
    const candidatePaths = [template.template_file_path, template.activeVersion?.source_file_path]
    if (candidatePaths.some((candidatePath) => Boolean(candidatePath) && fs.existsSync(candidatePath))) {
      return true
    }
    return Boolean(this.findRecoverySourceForTemplate(template))
  }

  static getReanalyzeBlockReason(template) {
    if (this.hasReanalyzableSource(template)) return null
    return "Template source file is missing on disk. Re-upload this template before reanalyzing."
  }

  static evaluateReadinessForConfig({ config, analysis = null, requiredAnchors = [], baseConfig = null } = {}) {
    return evaluateTemplateReadiness({
      config,
      analysisNeedsReview: Boolean(analysis?.needs_human_review),
      requiredAnchors: requiredAnchors.length ? requiredAnchors : analysis?.issues_json?.required_anchors || [],
      baseConfig: baseConfig || analysis?.suggested_config_json || null,
    })
  }

  static evaluateReadinessForTemplate(template) {
    const config = template?.activeVersion?.config_json || template?.config_json
    return this.evaluateReadinessForConfig({ config })
  }

  static decorateTemplatePayload(template, readiness = null) {
    if (!template) return template
    const payload = withTemplateIdentity(template)
    const review = readiness || this.evaluateReadinessForTemplate(template)
    return {
      ...payload,
      review_state: review.review_state,
      can_activate: review.can_activate,
      activation_block_reason: review.activation_block_reason,
      required_anchors: review.required_anchors,
      anchor_statuses: review.anchor_statuses,
    }
  }

  static summarizeWorkbookStructure(structure) {
    const worksheets = Array.isArray(structure?.worksheets)
      ? structure.worksheets
      : Array.isArray(structure?.sheets)
        ? structure.sheets
        : []

    return {
      worksheet_count: Number(structure?.worksheet_count || worksheets.length || 0),
      worksheets: worksheets.map((worksheet) => {
        const rows = Array.isArray(worksheet.rows)
          ? worksheet.rows
          : Array.isArray(worksheet.sampled_rows)
            ? worksheet.sampled_rows
            : []
        return {
          name: worksheet.name,
          order: worksheet.order || 0,
          used_range: worksheet.used_range || null,
          row_count: worksheet.row_count || worksheet.rowCount || rows.length,
          column_count: worksheet.column_count || worksheet.columnCount || null,
          rows: rows.slice(0, 200).map((row) => ({
            row_index: row.row_index || row.row || row.rowIndex || null,
            cells: (Array.isArray(row.cells) ? row.cells : []).slice(0, 80).map((cell) => ({
              address: cell.address,
              row_index: cell.row_index || cell.row || null,
              column_index: cell.column_index || cell.column || null,
              display_value: cell.display_value ?? cell.value ?? cell.raw_value ?? "",
              value_type: cell.value_type || null,
              formula_text: cell.formula_text || null,
              is_merged: Boolean(cell.is_merged),
            })),
          })),
        }
      }),
    }
  }

  static buildEditorContext({
    template = null,
    version = null,
    analysis = null,
    config,
    mode = "draft",
    review = null,
    workbookStructure = null,
  }) {
    const resolvedConfig = config || analysis?.suggested_config_json || version?.config_json || template?.config_json || null
    const resolvedReview =
      review ||
      this.evaluateReadinessForConfig({
        config: resolvedConfig,
        analysis,
      })

    return {
      mode,
      template_id: template?.id || analysis?.template_id || null,
      template_version_id: version?.id || analysis?.template_version_id || null,
      analysis_id: analysis?.id || null,
      config: resolvedConfig,
      workbook: this.summarizeWorkbookStructure(
        workbookStructure || analysis?.raw_structure_json || version?.raw_structure_json || version?.parsed_structure_json || null,
      ),
      review: resolvedReview,
    }
  }

  static async resolveTemplateSourcePathForReanalysis(template) {
    if (!template) {
      throw new CashFlowService.CashFlowValidationError(
        "Template source file is missing on disk. Re-upload this template before reanalyzing.",
      )
    }

    const candidatePaths = [template.template_file_path, template.activeVersion?.source_file_path].filter(Boolean)
    const existingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))

    if (existingPath) {
      if (existingPath !== template.template_file_path) {
        try {
          await template.update({ template_file_path: existingPath })
        } catch (error) {
          void error
        }
      }
      return existingPath
    }

    const recoveredPath = await this.recoverTemplateSourceFromAnalysis(template)
    if (recoveredPath && fs.existsSync(recoveredPath)) {
      return recoveredPath
    }
    throw new CashFlowService.CashFlowValidationError(
      "Template source file is missing on disk. Re-upload this template before reanalyzing.",
    )
  }

  static async listTemplates(fundId) {
    const templates = await TemplateModel.findAll({
      where: { portfolio_id: fundId },
      include: [{ model: TemplateVersion, as: "activeVersion" }],
      order: [
        ["is_active", "DESC"],
        ["created_at", "DESC"],
      ],
    })

    return templates.map((template) => {
      const payload = this.decorateTemplatePayload(template)
      const reanalyzeBlockReason = this.getReanalyzeBlockReason(template)
      return {
        ...payload,
        reanalyze_available: !reanalyzeBlockReason,
        reanalyze_block_reason: reanalyzeBlockReason,
      }
    })
  }

  static async getTemplate(templateId) {
    const template = await TemplateModel.findByPk(templateId, {
      include: [{ model: TemplateVersion, as: "activeVersion" }],
    })

    return template || null
  }

  static async getTemplateVersion({ templateId, versionId }) {
    return await TemplateVersion.findOne({
      where: {
        id: versionId,
        template_id: templateId,
      },
    })
  }

  static async getActiveTemplateForFund(fundId) {
    return await TemplateModel.findOne({
      where: { portfolio_id: fundId, is_active: true },
      include: [{ model: TemplateVersion, as: "activeVersion" }],
      order: [["created_at", "DESC"]],
    })
  }

  static async createTemplate({
    fundId,
    name,
    versionLabel = null,
    requestedActive = false,
    activationMode = "activate_if_ready",
    upload,
    actorId = null,
    analysis = null,
    ingestionResult = null,
    normalizedConfig,
    review = null,
  }) {
    const activeTemplate = await this.getActiveTemplateForFund(fundId)
    const readiness =
      review ||
      this.evaluateReadinessForConfig({
        config: normalizedConfig,
        analysis,
        requiredAnchors: ingestionResult?.required_anchors || [],
        baseConfig: analysis?.suggested_config_json || ingestionResult?.suggested_config_json || null,
      })
    const mode = parseActivationMode(activationMode)
    const isActive = mode !== "draft" && readiness.can_activate && (requestedActive || !activeTemplate)
    const persistedConfig = decorateConfigWithReviewMetadata(normalizedConfig, readiness)

    const template = await sequelize.transaction(async (transaction) => {
      if (isActive) {
        await TemplateModel.update(
          { is_active: false, status: "draft" },
          {
            where: { portfolio_id: fundId, is_active: true },
            transaction,
          },
        )
      }

      const identity = await TemplateModel.create(
        {
          portfolio_id: fundId,
          name: String(name).trim(),
          version: versionLabel ? String(versionLabel).trim() : null,
          template_kind: "cash_flow",
          status: isActive ? "active" : "draft",
          template_file_name: upload.originalname,
          template_file_path: upload.path,
          config_json: persistedConfig,
          is_active: isActive,
          uploaded_by: actorId,
        },
        { transaction },
      )

      const finalPath = StorageService.getNamespacePath(
        "cash-flow",
        "templates",
        `${identity.id}_${StorageService.sanitizeFileName(upload.originalname, "cash_flow_template")}`,
      )
      StorageService.moveFile(upload.path, finalPath)

      const version = await this.createTemplateVersion({
        templateId: identity.id,
        fundId,
        versionLabel,
        sourceFileName: upload.originalname,
        sourceFilePath: finalPath,
        sourceFileSha256: analysis?.source_file_sha256 || ingestionResult?.source_file_sha256 || null,
        configJson: persistedConfig,
        rawStructureJson: analysis?.raw_structure_json || ingestionResult?.raw_structure_json || null,
        llmMetaJson: analysis?.llm_meta_json || ingestionResult?.llm_meta_json || null,
        actorId,
        transaction,
      })

      await identity.update(
        {
          version: version.version_label,
          template_file_name: upload.originalname,
          template_file_path: finalPath,
          config_json: persistedConfig,
          active_version_id: version.id,
        },
        { transaction },
      )

      if (analysis) {
        if (typeof analysis.update === "function") {
          await analysis.update(
            {
              status: "confirmed",
              template_id: identity.id,
              template_version_id: version.id,
              schema_hash: createSchemaHash(persistedConfig),
            },
            { transaction },
          )
        }

        await CashFlowTemplateAnalysis.update(
          { status: "superseded" },
          {
            where: {
              portfolio_id: fundId,
              id: { [Op.ne]: analysis.id },
              status: "suggested",
            },
            transaction,
          },
        )
      } else if (ingestionResult) {
        await TemplateAnalysisService.createAnalysisRecord({
          fundId,
          templateId: identity.id,
          templateVersionId: version.id,
          sourceFileName: upload.originalname,
          sourceFilePath: finalPath,
          actorId,
          ingestionResult: {
            ...ingestionResult,
            suggested_config_json: persistedConfig,
            needs_human_review: !readiness.can_activate,
            required_anchors: readiness.required_anchors || ingestionResult.required_anchors || [],
          },
          status: "confirmed",
        })
      }

      await AuditService.logEvent({
        actorId,
        eventType: "template_created",
        entityType: "template",
        entityId: identity.id,
        after: identity.toJSON(),
        metadata: { fund_id: fundId },
      })

      return identity
    })

    return {
      template,
      readiness: this.evaluateReadinessForConfig({ config: persistedConfig }),
      savedAsDraft: !isActive,
    }
  }

  static async createTemplateVersion({
    templateId,
    fundId,
    versionLabel = null,
    sourceFileName,
    sourceFilePath,
    sourceFileSha256 = null,
    configJson,
    rawStructureJson = null,
    llmMetaJson = null,
    actorId = null,
    transaction = null,
  }) {
    const latestVersionNumber =
      (await TemplateVersion.max("version_number", {
        where: { template_id: templateId },
        transaction,
      })) || 0

    const version = await TemplateVersion.create(
      {
        template_id: templateId,
        portfolio_id: fundId,
        version_number: latestVersionNumber + 1,
        version_label: versionLabel || `v${latestVersionNumber + 1}`,
        source_file_name: sourceFileName,
        source_file_path: sourceFilePath,
        source_file_sha256: sourceFileSha256,
        config_json: configJson,
        schema_hash: createSchemaHash(configJson),
        raw_structure_json: rawStructureJson,
        llm_meta_json: llmMetaJson,
        created_by: actorId,
      },
      { transaction },
    )

    await TemplateParsingService.persistVersionStructure({
      templateVersionId: version.id,
      sourceFilePath,
      sourceFileName,
      actorId,
      transaction,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_version_created",
      entityType: "template_version",
      entityId: version.id,
      after: version.toJSON(),
      metadata: { fund_id: fundId, template_id: templateId },
    })

    return version
  }

  static async updateTemplate({
    templateId,
    updates,
    actorId = null,
  }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    const before = template.toJSON()
    const nextValues = {}
    let responseReadiness = null
    let resultTemplate = template

    if (updates.name !== undefined) {
      const name = String(updates.name || "").trim()
      if (!name) {
        throw new CashFlowService.CashFlowValidationError("name cannot be empty")
      }
      nextValues.name = name
    }

    const shouldActivate = parseBoolean(updates.is_active, template.is_active)
    const activationMode = parseActivationMode(updates.activation_mode)
    const hasVersionedChange = updates.config_json !== undefined || updates.version !== undefined

    resultTemplate = await sequelize.transaction(async (transaction) => {
      if (hasVersionedChange) {
        const baseVersion = template.activeVersion || (await TemplateVersion.findByPk(template.active_version_id, { transaction }))
        const versionLabel = updates.version !== undefined ? String(updates.version || "").trim() || null : template.version
        const configPayload =
          updates.config_json !== undefined
            ? TemplateAnalysisService.parseConfigJson(updates.config_json)
            : baseVersion?.config_json || template.config_json

        const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
          templateConfig: configPayload,
          templatePath: template.template_file_path,
        })
        const normalizedConfig = CashFlowService.validateTemplateConfig(normalizedV3)
        const readiness = this.evaluateReadinessForConfig({ config: normalizedConfig })
        responseReadiness = readiness
        const persistedConfig = decorateConfigWithReviewMetadata(normalizedConfig, readiness)

        if (template.is_active && activationMode === "draft") {
          const draft = await TemplateModel.create(
            {
              portfolio_id: template.portfolio_id,
              name: nextValues.name || `${template.name} Draft`,
              version: versionLabel,
              template_kind: "cash_flow",
              status: "draft",
              template_file_name: baseVersion?.source_file_name || template.template_file_name,
              template_file_path: baseVersion?.source_file_path || template.template_file_path,
              config_json: persistedConfig,
              is_active: false,
              uploaded_by: actorId,
            },
            { transaction },
          )

          const version = await this.createTemplateVersion({
            templateId: draft.id,
            fundId: template.portfolio_id,
            versionLabel,
            sourceFileName: baseVersion?.source_file_name || template.template_file_name,
            sourceFilePath: baseVersion?.source_file_path || template.template_file_path,
            sourceFileSha256: baseVersion?.source_file_sha256 || null,
            configJson: persistedConfig,
            rawStructureJson: baseVersion?.raw_structure_json || null,
            llmMetaJson: baseVersion?.llm_meta_json || null,
            actorId,
            transaction,
          })

          await draft.update(
            {
              version: version.version_label,
              active_version_id: version.id,
            },
            { transaction },
          )

          return draft
        }

        if (!readiness.can_activate && shouldActivate) {
          throw new CashFlowService.CashFlowValidationError(
            readiness.activation_block_reason || "Resolve required anchors before activating this template.",
            readiness,
          )
        }

        const version = await this.createTemplateVersion({
          templateId: template.id,
          fundId: template.portfolio_id,
          versionLabel,
          sourceFileName: baseVersion?.source_file_name || template.template_file_name,
          sourceFilePath: baseVersion?.source_file_path || template.template_file_path,
          sourceFileSha256: baseVersion?.source_file_sha256 || null,
          configJson: persistedConfig,
          rawStructureJson: baseVersion?.raw_structure_json || null,
          llmMetaJson: baseVersion?.llm_meta_json || null,
          actorId,
          transaction,
        })

        nextValues.version = version.version_label
        nextValues.config_json = persistedConfig
        nextValues.active_version_id = version.id
      }

      if (shouldActivate) {
        const readiness =
          responseReadiness ||
          this.evaluateReadinessForConfig({
            config: nextValues.config_json || template.activeVersion?.config_json || template.config_json,
          })
        responseReadiness = readiness
        if (!readiness.can_activate) {
          throw new CashFlowService.CashFlowValidationError(
            readiness.activation_block_reason || "Resolve required anchors before activating this template.",
            readiness,
          )
        }

        await TemplateModel.update(
          { is_active: false, status: "draft" },
          {
            where: { portfolio_id: template.portfolio_id, is_active: true },
            transaction,
          },
        )
        nextValues.is_active = true
        nextValues.status = "active"
      } else if (updates.is_active !== undefined) {
        nextValues.is_active = false
        nextValues.status = "draft"
      }

      if (Object.keys(nextValues).length) {
        await template.update(nextValues, { transaction })
      }

      return template
    })

    await AuditService.logEvent({
      actorId,
      eventType: resultTemplate.id === template.id ? "template_updated" : "template_draft_replacement_created",
      entityType: "template",
      entityId: resultTemplate.id,
      before,
      after: resultTemplate.toJSON(),
      metadata: { fund_id: template.portfolio_id },
    })

    return {
      template: resultTemplate,
      readiness: responseReadiness || this.evaluateReadinessForTemplate(resultTemplate),
      savedAsDraft: !resultTemplate.is_active,
    }
  }

  static async activateTemplate({ templateId, actorId = null }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    const before = template.toJSON()
    const readiness = this.evaluateReadinessForTemplate(template)
    if (!readiness.can_activate) {
      throw new CashFlowService.CashFlowValidationError(
        readiness.activation_block_reason || "Resolve required anchors before activating this template.",
        readiness,
      )
    }

    await sequelize.transaction(async (transaction) => {
      await TemplateModel.update(
        { is_active: false, status: "draft" },
        {
          where: { portfolio_id: template.portfolio_id, is_active: true },
          transaction,
        },
      )
      await template.update({ is_active: true, status: "active" }, { transaction })
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_activated",
      entityType: "template",
      entityId: template.id,
      before,
      after: template.toJSON(),
      metadata: { fund_id: template.portfolio_id },
    })

    return {
      template,
      readiness,
      savedAsDraft: false,
    }
  }

  static async applyReanalysis({
    templateId,
    analysis,
    actorId = null,
  }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
      templateConfig: analysis.suggested_config_json,
      templatePath: template.template_file_path,
    })
    const normalizedConfig = CashFlowService.validateTemplateConfig(normalizedV3)
    const readiness = this.evaluateReadinessForConfig({
      config: normalizedConfig,
      analysis,
    })
    if (!readiness.can_activate) {
      throw new CashFlowService.CashFlowValidationError(
        readiness.activation_block_reason || "Resolve required anchors before applying reanalysis.",
        readiness,
      )
    }
    const persistedConfig = decorateConfigWithReviewMetadata(normalizedConfig, readiness)

    await sequelize.transaction(async (transaction) => {
      const version = await this.createTemplateVersion({
        templateId: template.id,
        fundId: template.portfolio_id,
        versionLabel: template.version,
        sourceFileName: template.template_file_name,
        sourceFilePath: template.template_file_path,
        sourceFileSha256: analysis.source_file_sha256 || null,
        configJson: persistedConfig,
        rawStructureJson: analysis.raw_structure_json || null,
        llmMetaJson: analysis.llm_meta_json || null,
        actorId,
        transaction,
      })

      await template.update(
        {
          config_json: persistedConfig,
          active_version_id: version.id,
        },
        { transaction },
      )

      await analysis.update(
        {
          status: "confirmed",
          template_id: template.id,
          template_version_id: version.id,
          schema_hash: createSchemaHash(persistedConfig),
          needs_human_review: false,
        },
        { transaction },
      )
    })

    return {
      template,
      readiness,
      savedAsDraft: false,
    }
  }

  static async getTemplateEditorContext({ templateId }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    const version = template.activeVersion || (await TemplateVersion.findByPk(template.active_version_id))
    const analyses = await CashFlowTemplateAnalysis.findAll({
      where: { template_id: template.id },
      order: [["created_at", "DESC"]],
      limit: 1,
    })
    const analysis = analyses?.[0] || null
    const config = version?.config_json || template.config_json
    const review = this.evaluateReadinessForTemplate(template)

    return {
      template: this.decorateTemplatePayload(template, review),
      editor_context: this.buildEditorContext({
        template,
        version,
        analysis,
        config,
        mode: template.is_active ? "active" : "draft",
        review,
      }),
    }
  }

  static ensureTemplateFileExists(template) {
    if (!template?.template_file_path || !fs.existsSync(template.template_file_path)) {
      throw new CashFlowService.CashFlowValidationError(
        "Template source file is missing on disk. Re-upload this template before reanalyzing.",
      )
    }
  }
}

module.exports = TemplateService
