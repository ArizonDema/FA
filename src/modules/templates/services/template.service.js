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

const TemplateModel = Template || CashFlowTemplate

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return fallback
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
      const payload = withTemplateIdentity(template)
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
    upload,
    actorId = null,
    analysis = null,
    ingestionResult = null,
    normalizedConfig,
  }) {
    const activeTemplate = await this.getActiveTemplateForFund(fundId)
    const isActive = requestedActive || !activeTemplate

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
          config_json: normalizedConfig,
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
        configJson: normalizedConfig,
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
          config_json: normalizedConfig,
          active_version_id: version.id,
        },
        { transaction },
      )

      if (analysis) {
        await analysis.update(
          {
            status: "confirmed",
            template_id: identity.id,
            template_version_id: version.id,
            schema_hash: createSchemaHash(normalizedConfig),
          },
          { transaction },
        )

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
            suggested_config_json: normalizedConfig,
            needs_human_review: false,
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

    return template
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

    if (updates.name !== undefined) {
      const name = String(updates.name || "").trim()
      if (!name) {
        throw new CashFlowService.CashFlowValidationError("name cannot be empty")
      }
      nextValues.name = name
    }

    const shouldActivate = parseBoolean(updates.is_active, template.is_active)
    const hasVersionedChange = updates.config_json !== undefined || updates.version !== undefined

    await sequelize.transaction(async (transaction) => {
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

        const version = await this.createTemplateVersion({
          templateId: template.id,
          fundId: template.portfolio_id,
          versionLabel,
          sourceFileName: baseVersion?.source_file_name || template.template_file_name,
          sourceFilePath: baseVersion?.source_file_path || template.template_file_path,
          sourceFileSha256: baseVersion?.source_file_sha256 || null,
          configJson: normalizedConfig,
          rawStructureJson: baseVersion?.raw_structure_json || null,
          llmMetaJson: baseVersion?.llm_meta_json || null,
          actorId,
          transaction,
        })

        nextValues.version = version.version_label
        nextValues.config_json = normalizedConfig
        nextValues.active_version_id = version.id
      }

      if (shouldActivate) {
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
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_updated",
      entityType: "template",
      entityId: template.id,
      before,
      after: template.toJSON(),
      metadata: { fund_id: template.portfolio_id },
    })

    return template
  }

  static async activateTemplate({ templateId, actorId = null }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    const before = template.toJSON()

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

    return template
  }

  static async applyReanalysis({
    templateId,
    analysis,
    actorId = null,
  }) {
    const template = await this.getTemplate(templateId)
    if (!template) return null

    if (analysis.needs_human_review) {
      throw new CashFlowService.CashFlowValidationError(
        "Reanalysis is flagged for human review. Resolve required anchors before applying.",
        {
          issues: analysis?.issues_json?.issues || [],
          required_anchors: analysis?.issues_json?.required_anchors || [],
        },
      )
    }

    const normalizedV3 = await CashFlowService.ensureV3TemplateConfig({
      templateConfig: analysis.suggested_config_json,
      templatePath: template.template_file_path,
    })
    const normalizedConfig = CashFlowService.validateTemplateConfig(normalizedV3)

    await sequelize.transaction(async (transaction) => {
      const version = await this.createTemplateVersion({
        templateId: template.id,
        fundId: template.portfolio_id,
        versionLabel: template.version,
        sourceFileName: template.template_file_name,
        sourceFilePath: template.template_file_path,
        sourceFileSha256: analysis.source_file_sha256 || null,
        configJson: normalizedConfig,
        rawStructureJson: analysis.raw_structure_json || null,
        llmMetaJson: analysis.llm_meta_json || null,
        actorId,
        transaction,
      })

      await template.update(
        {
          config_json: normalizedConfig,
          active_version_id: version.id,
        },
        { transaction },
      )

      await analysis.update(
        {
          status: "confirmed",
          template_id: template.id,
          template_version_id: version.id,
          schema_hash: createSchemaHash(normalizedConfig),
          needs_human_review: false,
        },
        { transaction },
      )
    })

    return template
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
