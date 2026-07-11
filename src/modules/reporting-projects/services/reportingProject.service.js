const { Op } = require("sequelize")
const {
  sequelize,
  Fund,
  Portfolio,
  ReportingProject,
  ReportingProjectSource,
  FundRepositoryItem,
  FundRepositoryVersion,
  CashFlowTemplate,
  Template,
  TemplateVersion,
  ReportRun,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const TemplateService = require("../../templates/services/template.service")

const FundModel = Fund || Portfolio
const TemplateModel = Template || CashFlowTemplate

const REPORT_TYPES = [
  "cash_flow",
  "shareholder_register",
  "financial_statements",
  "management_report",
  "investor_report",
  "lender_report",
  "fund_report",
  "custom",
]

const PROJECT_STATUSES = [
  "draft",
  "inputs_ready",
  "mapping_review",
  "validation_ready",
  "approved",
  "exported",
  "archived",
]

const SOURCE_ROLES = [
  "template",
  "trial_balance",
  "general_ledger",
  "lpa",
  "legal_document",
  "supporting_document",
  "cash_flow_template",
  "validation_source",
  "draft_report",
  "other",
]

const SOURCE_TYPES = [
  "repository_version",
  "template_version",
  "report_run",
  "external_reference",
]

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function normalizeString(value) {
  return String(value || "").trim()
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase()
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return fallback
}

function parseMetadata(value) {
  if (!value) return null
  if (typeof value === "object") return value
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch (error) {
      return { note: value }
    }
  }
  return { value }
}

function publicSource(sourceRecord) {
  const source = asPlain(sourceRecord)
  if (!source) return null
  const repositoryVersion = source.repositoryVersion ? { ...source.repositoryVersion } : null
  if (repositoryVersion) delete repositoryVersion.storage_path
  return {
    ...source,
    repositoryVersion,
  }
}

function publicProject(projectRecord) {
  const project = asPlain(projectRecord)
  if (!project) return null
  return {
    ...project,
    sources: Array.isArray(project.sources) ? project.sources.map(publicSource) : [],
  }
}

function projectInclude() {
  return [
    {
      model: ReportingProjectSource,
      as: "sources",
      separate: true,
      order: [["created_at", "DESC"]],
      include: [
        { model: FundRepositoryItem, as: "repositoryItem" },
        { model: FundRepositoryVersion, as: "repositoryVersion" },
        { model: TemplateModel, as: "template" },
        { model: TemplateVersion, as: "templateVersion" },
        { model: ReportRun, as: "reportRun" },
      ],
    },
    { model: TemplateModel, as: "template" },
    { model: TemplateVersion, as: "templateVersion" },
    { model: ReportRun, as: "currentReportRun" },
  ]
}

function validatePeriod(periodStart, periodEnd) {
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) {
    throw new AppError("Provide both period_start and period_end, or neither", 400)
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new AppError("period_start cannot be after period_end", 400)
  }
}

function validateDateOnly(value, fieldName) {
  if (!value) return null
  const normalized = normalizeString(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new AppError(`${fieldName} must use YYYY-MM-DD format`, 400)
  }
  return normalized
}

function requiredRolesForReportType(reportType) {
  if (reportType === "cash_flow") return ["template", "trial_balance", "general_ledger"]
  return ["template"]
}

function readinessStatus({ failedChecks, warningChecks }) {
  if (failedChecks.length) return "inputs_missing"
  if (warningChecks.length) return "needs_review"
  return "inputs_ready"
}

class ReportingProjectService {
  static constants = {
    REPORT_TYPES,
    PROJECT_STATUSES,
    SOURCE_ROLES,
    SOURCE_TYPES,
  }

  static async requireFund(fundId) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) throw new AppError("Fund not found", 404)
    return fund
  }

  static normalizeReportType(value) {
    const reportType = normalizeKey(value || "cash_flow")
    if (!REPORT_TYPES.includes(reportType)) {
      throw new AppError("Unsupported reporting project type", 400)
    }
    return reportType
  }

  static normalizeProjectStatus(value) {
    const status = normalizeKey(value || "draft")
    if (!PROJECT_STATUSES.includes(status)) {
      throw new AppError("Unsupported reporting project status", 400)
    }
    if (status !== "draft") {
      throw new AppError("New reporting projects must start as drafts", 400)
    }
    return status
  }

  static normalizeExistingProjectStatus(value) {
    const status = normalizeKey(value)
    if (!PROJECT_STATUSES.includes(status)) {
      throw new AppError("Unsupported reporting project status", 400)
    }
    return status
  }

  static normalizeSourceRole(value) {
    const role = normalizeKey(value || "")
    if (!SOURCE_ROLES.includes(role)) {
      throw new AppError("Unsupported reporting project source role", 400)
    }
    return role
  }

  static normalizeSourceType(value) {
    const type = normalizeKey(value || "")
    if (!SOURCE_TYPES.includes(type)) {
      throw new AppError("Unsupported reporting project source type", 400)
    }
    return type
  }

  static async resolveTemplate({ fundId, templateId }) {
    if (!templateId) return null
    const template = await TemplateModel.findOne({
      where: { id: templateId, portfolio_id: fundId },
      include: [{ model: TemplateVersion, as: "activeVersion" }],
    })
    if (!template) throw new AppError("Template not found for this fund", 404)
    return template
  }

  static async resolveTemplateVersion({ fundId, templateVersionId }) {
    if (!templateVersionId) return null
    const version = await TemplateVersion.findOne({
      where: { id: templateVersionId, portfolio_id: fundId },
      include: [{ model: TemplateModel, as: "template" }],
    })
    if (!version) throw new AppError("Template version not found for this fund", 404)
    return version
  }

  static async resolveRepositoryVersion({ fundId, versionId }) {
    const version = await FundRepositoryVersion.findOne({
      where: { id: versionId, is_archived: false },
      include: [
        {
          model: FundRepositoryItem,
          as: "item",
          where: { portfolio_id: fundId, is_archived: false },
        },
      ],
    })
    if (!version) throw new AppError("Repository version not found for this fund", 404)
    return version
  }

  static async resolveReportRun({ fundId, reportRunId }) {
    const run = await ReportRun.findOne({ where: { id: reportRunId, portfolio_id: fundId } })
    if (!run) throw new AppError("Report run not found for this fund", 404)
    return run
  }

  static async createProject({ fundId, actorId = null, fields = {} }) {
    await this.requireFund(fundId)
    const reportType = this.normalizeReportType(fields.report_type)
    const periodStart = fields.period_start || null
    const periodEnd = fields.period_end || null
    validatePeriod(periodStart, periodEnd)

    let templateId = fields.template_id || null
    let templateVersionId = fields.template_version_id || null
    if (templateVersionId) {
      const version = await this.resolveTemplateVersion({ fundId, templateVersionId })
      const versionData = asPlain(version)
      templateId = versionData.template_id
    } else if (templateId) {
      const template = await this.resolveTemplate({ fundId, templateId })
      const templateData = asPlain(template)
      templateVersionId = templateData.active_version_id || null
    }

    const name =
      normalizeString(fields.name) ||
      `${reportType.replace(/_/g, " ")}${periodEnd ? ` ${periodEnd}` : ""}`

    const project = await ReportingProject.create({
      portfolio_id: fundId,
      report_type: reportType,
      name,
      period_start: periodStart,
      period_end: periodEnd,
      status: this.normalizeProjectStatus(fields.status),
      template_id: templateId,
      template_version_id: templateVersionId,
      requested_by_agent_id: fields.requested_by_agent_id || null,
      created_by: actorId,
      metadata_json: parseMetadata(fields.metadata_json || fields.metadata),
    })

    await AuditService.logEvent({
      actorId,
      eventType: "reporting_project_created",
      entityType: "reporting_project",
      entityId: project.id,
      metadata: { fund_id: fundId, report_type: reportType },
      after: asPlain(project),
    })

    if (templateVersionId) {
      const attached = await this.attachSource({
        fundId,
        projectId: project.id,
        actorId,
        fields: {
          source_role: "template",
          source_type: "template_version",
          template_version_id: templateVersionId,
          required: true,
          metadata_json: { attached_during_project_creation: true },
        },
      })
      return attached.project
    }

    return publicProject(await this.getProject({ fundId, projectId: project.id }))
  }

  static async listProjects({ fundId, filters = {} }) {
    await this.requireFund(fundId)
    const where = { portfolio_id: fundId }
    if (filters.status) where.status = normalizeKey(filters.status)
    if (filters.report_type) where.report_type = this.normalizeReportType(filters.report_type)
    if (filters.search) {
      const like = `%${normalizeString(filters.search)}%`
      where[Op.or] = [{ name: { [Op.like]: like } }, { report_type: { [Op.like]: like } }]
    }
    const projects = await ReportingProject.findAll({
      where,
      include: projectInclude(),
      order: [["updated_at", "DESC"]],
    })
    return projects.map(publicProject)
  }

  static async getProject({ fundId, projectId }) {
    const project = await ReportingProject.findOne({
      where: { id: projectId, portfolio_id: fundId },
      include: projectInclude(),
    })
    if (!project) throw new AppError("Reporting project not found", 404)
    return publicProject(project)
  }

  static async updateProject({ fundId, projectId, actorId = null, fields = {} }) {
    const project = await ReportingProject.findOne({
      where: { id: projectId, portfolio_id: fundId },
      include: projectInclude(),
    })
    if (!project) throw new AppError("Reporting project not found", 404)

    const current = asPlain(project)
    const updates = {}

    if (Object.prototype.hasOwnProperty.call(fields, "name")) {
      const name = normalizeString(fields.name)
      if (!name) throw new AppError("Reporting project name is required", 400)
      updates.name = name
    }
    if (Object.prototype.hasOwnProperty.call(fields, "report_type")) {
      updates.report_type = this.normalizeReportType(fields.report_type)
    }
    if (Object.prototype.hasOwnProperty.call(fields, "status")) {
      updates.status = this.normalizeExistingProjectStatus(fields.status)
    }

    const periodStart = Object.prototype.hasOwnProperty.call(fields, "period_start")
      ? fields.period_start || null
      : current.period_start
    const periodEnd = Object.prototype.hasOwnProperty.call(fields, "period_end")
      ? fields.period_end || null
      : current.period_end
    validatePeriod(periodStart, periodEnd)
    if (Object.prototype.hasOwnProperty.call(fields, "period_start")) updates.period_start = periodStart
    if (Object.prototype.hasOwnProperty.call(fields, "period_end")) updates.period_end = periodEnd

    if (Object.prototype.hasOwnProperty.call(fields, "template_version_id")) {
      const templateVersionId = fields.template_version_id || null
      if (templateVersionId) {
        const version = asPlain(await this.resolveTemplateVersion({ fundId, templateVersionId }))
        updates.template_id = version.template_id
        updates.template_version_id = version.id
      } else {
        updates.template_id = null
        updates.template_version_id = null
      }
    } else if (Object.prototype.hasOwnProperty.call(fields, "template_id")) {
      const templateId = fields.template_id || null
      if (templateId) {
        const template = asPlain(await this.resolveTemplate({ fundId, templateId }))
        updates.template_id = template.id
        updates.template_version_id = template.active_version_id || null
      } else {
        updates.template_id = null
        updates.template_version_id = null
      }
    }

    if (Object.prototype.hasOwnProperty.call(fields, "current_report_run_id")) {
      const runId = fields.current_report_run_id || null
      if (runId) await this.resolveReportRun({ fundId, reportRunId: runId })
      updates.current_report_run_id = runId
    }

    const metadataPatch = parseMetadata(fields.metadata_json || fields.metadata) || {}
    if (Object.prototype.hasOwnProperty.call(fields, "owner_name")) {
      metadataPatch.owner_name = normalizeString(fields.owner_name) || null
    }
    if (Object.prototype.hasOwnProperty.call(fields, "owner_id")) {
      metadataPatch.owner_id = fields.owner_id || null
    }
    if (Object.prototype.hasOwnProperty.call(fields, "due_date")) {
      metadataPatch.due_date = validateDateOnly(fields.due_date, "due_date")
    }
    if (Object.keys(metadataPatch).length) {
      updates.metadata_json = {
        ...(current.metadata_json && typeof current.metadata_json === "object" ? current.metadata_json : {}),
        ...metadataPatch,
      }
    }

    if (!Object.keys(updates).length) return publicProject(project)

    const before = publicProject(project)
    await project.update(updates)

    await AuditService.logEvent({
      actorId,
      eventType: "reporting_project_updated",
      entityType: "reporting_project",
      entityId: project.id,
      metadata: { fund_id: fundId, changed_fields: Object.keys(updates) },
      before,
      after: asPlain(project),
    })

    return publicProject(await this.getProject({ fundId, projectId: project.id }))
  }

  static inferSourceType(fields) {
    if (fields.source_type) return this.normalizeSourceType(fields.source_type)
    if (fields.repository_version_id) return "repository_version"
    if (fields.template_version_id) return "template_version"
    if (fields.report_run_id) return "report_run"
    return "external_reference"
  }

  static assertDraftSafeSourcePayload(fields) {
    const status = normalizeKey(fields.status || "attached")
    if (status !== "attached") {
      throw new AppError("Project sources can only be attached as draft inputs", 400)
    }
    const forbiddenValues = ["approved", "activated", "final", "exported"]
    const serialized = JSON.stringify(fields || {}).toLowerCase()
    if (forbiddenValues.some((value) => serialized.includes(`"${value}"`))) {
      throw new AppError("Project source payload cannot approve or finalize reporting work", 400)
    }
  }

  static async attachSource({ fundId, projectId, actorId = null, fields = {} }) {
    this.assertDraftSafeSourcePayload(fields)
    const project = await this.getProject({ fundId, projectId })
    const sourceRole = this.normalizeSourceRole(fields.source_role || fields.role)
    const sourceType = this.inferSourceType(fields)
    const required = parseBoolean(fields.required, true)

    const payload = {
      reporting_project_id: project.id,
      portfolio_id: fundId,
      source_role: sourceRole,
      source_type: sourceType,
      required,
      status: "attached",
      attached_by: actorId,
      metadata_json: parseMetadata(fields.metadata_json || fields.metadata),
    }

    if (sourceType === "repository_version") {
      if (!fields.repository_version_id) {
        throw new AppError("repository_version_id is required for repository sources", 400)
      }
      const version = await this.resolveRepositoryVersion({
        fundId,
        versionId: fields.repository_version_id,
      })
      const versionData = asPlain(version)
      const itemData = asPlain(versionData.item)
      payload.repository_item_id = itemData.id
      payload.repository_version_id = versionData.id
      payload.original_file_name = versionData.original_file_name
      payload.sha256 = versionData.sha256
    }

    if (sourceType === "template_version") {
      if (!fields.template_version_id) {
        throw new AppError("template_version_id is required for template sources", 400)
      }
      const version = await this.resolveTemplateVersion({
        fundId,
        templateVersionId: fields.template_version_id,
      })
      const versionData = asPlain(version)
      payload.template_id = versionData.template_id
      payload.template_version_id = versionData.id
      payload.original_file_name = versionData.source_file_name
      payload.sha256 = versionData.source_file_sha256 || null
    }

    if (sourceType === "report_run") {
      if (!fields.report_run_id) {
        throw new AppError("report_run_id is required for report run sources", 400)
      }
      const run = await this.resolveReportRun({ fundId, reportRunId: fields.report_run_id })
      payload.report_run_id = run.id
    }

    if (sourceType === "external_reference") {
      payload.original_file_name = normalizeString(fields.original_file_name) || null
      payload.sha256 = normalizeString(fields.sha256) || null
      if (!payload.original_file_name && !payload.sha256) {
        throw new AppError("External source references require original_file_name or sha256", 400)
      }
    }

    const createAndUpdateProject = async (transaction = null) => {
      const source = await ReportingProjectSource.create(payload, { transaction })
      if (sourceRole === "template" || sourceRole === "cash_flow_template") {
        await ReportingProject.update(
          {
            template_id: payload.template_id || project.template_id || null,
            template_version_id: payload.template_version_id || project.template_version_id || null,
          },
          { where: { id: project.id }, transaction },
        )
      }
      return source
    }

    const source =
      sequelize && typeof sequelize.transaction === "function"
        ? await sequelize.transaction((transaction) => createAndUpdateProject(transaction))
        : await createAndUpdateProject()

    await AuditService.logEvent({
      actorId,
      eventType: "reporting_project_source_attached",
      entityType: "reporting_project",
      entityId: project.id,
      metadata: {
        fund_id: fundId,
        source_role: sourceRole,
        source_type: sourceType,
        source_id: source.id,
      },
      after: publicSource(source),
    })

    return {
      source: publicSource(source),
      project: publicProject(await this.getProject({ fundId, projectId: project.id })),
    }
  }

  static async removeSource({ fundId, projectId, sourceId, actorId = null }) {
    const project = await this.getProject({ fundId, projectId })
    const source = await ReportingProjectSource.findOne({
      where: {
        id: sourceId,
        reporting_project_id: project.id,
        portfolio_id: fundId,
      },
    })
    if (!source) throw new AppError("Reporting project source not found", 404)

    const before = publicSource(source)
    await source.destroy()

    if (
      ["template", "cash_flow_template"].includes(before.source_role) &&
      before.template_version_id &&
      before.template_version_id === project.template_version_id
    ) {
      const replacement = (project.sources || []).find(
        (entry) =>
          entry.id !== sourceId &&
          ["template", "cash_flow_template"].includes(entry.source_role) &&
          entry.status === "attached",
      )
      await ReportingProject.update(
        {
          template_id: replacement?.template_id || null,
          template_version_id: replacement?.template_version_id || null,
        },
        { where: { id: project.id, portfolio_id: fundId } },
      )
    }

    await AuditService.logEvent({
      actorId,
      eventType: "reporting_project_source_removed",
      entityType: "reporting_project",
      entityId: project.id,
      metadata: {
        fund_id: fundId,
        source_id: sourceId,
        source_role: before.source_role,
      },
      before,
    })

    return publicProject(await this.getProject({ fundId, projectId: project.id }))
  }

  static buildTemplateReadinessCheck(project) {
    if (!project.template_version_id) {
      return {
        check_type: "template_selected",
        status: "fail",
        severity: "error",
        message: "Select a template version before running this reporting project.",
      }
    }

    const config = project.templateVersion?.config_json || project.template?.config_json || null
    if (!config) {
      return {
        check_type: "template_readiness",
        status: "warning",
        severity: "warning",
        message: "Template version is selected but no parsed configuration was available for readiness review.",
      }
    }

    const review = TemplateService.evaluateReadinessForConfig({ config })
    if (!review.can_activate) {
      return {
        check_type: "template_readiness",
        status: "warning",
        severity: "warning",
        message: review.activation_block_reason || "Template needs human review before final reporting.",
        details: {
          review_state: review.review_state,
          required_anchors: review.required_anchors || [],
        },
      }
    }

    return {
      check_type: "template_readiness",
      status: "pass",
      severity: "info",
      message: "Template is selected and passes readiness checks.",
    }
  }

  static async getProjectReadiness({ fundId, projectId }) {
    const project = await this.getProject({ fundId, projectId })
    const requiredRoles = requiredRolesForReportType(project.report_type)
    const attachedRoles = new Set(
      (project.sources || [])
        .filter((source) => source.status === "attached")
        .map((source) => source.source_role),
    )
    if (project.template_version_id) attachedRoles.add("template")

    const checks = []
    if (!project.period_start || !project.period_end) {
      checks.push({
        check_type: "period_defined",
        status: "fail",
        severity: "error",
        message: "Reporting period must be defined before report generation.",
      })
    } else {
      checks.push({
        check_type: "period_defined",
        status: "pass",
        severity: "info",
        message: "Reporting period is defined.",
      })
    }

    checks.push(this.buildTemplateReadinessCheck(project))

    for (const role of requiredRoles.filter((role) => role !== "template")) {
      checks.push({
        check_type: "required_source_attached",
        target_role: role,
        status: attachedRoles.has(role) ? "pass" : "fail",
        severity: attachedRoles.has(role) ? "info" : "error",
        message: attachedRoles.has(role)
          ? `${role.replace(/_/g, " ")} source is attached.`
          : `${role.replace(/_/g, " ")} source is required before report generation.`,
      })
    }

    const failedChecks = checks.filter((check) => check.status === "fail")
    const warningChecks = checks.filter((check) => check.status === "warning")
    const passedChecks = checks.filter((check) => check.status === "pass")
    const status = readinessStatus({ failedChecks, warningChecks })
    const readinessScore = checks.length
      ? Math.round(((passedChecks.length + warningChecks.length * 0.5) / checks.length) * 100)
      : 0

    return {
      project_id: project.id,
      fund_id: fundId,
      report_type: project.report_type,
      status,
      readiness_score: readinessScore,
      check_counts: {
        passed: passedChecks.length,
        warnings: warningChecks.length,
        failed: failedChecks.length,
        total: checks.length,
      },
      can_run_draft_report: failedChecks.length === 0,
      can_export_final_report: false,
      export_block_reason: "Final report export requires human approval and validation gates.",
      required_source_roles: requiredRoles,
      attached_source_roles: Array.from(attachedRoles).sort(),
      missing_source_roles: requiredRoles.filter((role) => !attachedRoles.has(role)),
      checks,
      controls: {
        agent_actions_are_draft_only: true,
        final_export_requires_human_approval: true,
        approvals_are_not_exposed_to_agent_tools: true,
      },
    }
  }
}

module.exports = ReportingProjectService
