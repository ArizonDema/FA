const {
  Account,
  AccountSemanticMapping,
  AuditEvent,
  AuditLog,
  CashFlowTemplate,
  FundRepositoryItem,
  FundRepositoryVersion,
  ReportLineage,
  ReportRun,
  ReportRunRow,
  ReportingProject,
  Template,
  TemplateVersion,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const MappingSuggestionService = require("../../mappings/services/mappingSuggestion.service")
const RepositoryAnalysisService = require("../../repository/services/repositoryAnalysis.service")
const ReviewTaskService = require("../../reviews/services/reviewTask.service")
const ReportExportService = require("../../reports/services/reportExport.service")
const { ReportGenerationService } = require("../../reports/services/reportGeneration.service")
const { ValidationEngineService } = require("../../reports/services/validationEngine.service")
const TemplateParsingService = require("../../templates/services/templateParsing.service")
const ReportingProjectService = require("./reportingProject.service")

const AuditModel = AuditEvent || AuditLog

const TOOL_CATALOG = Object.freeze({
  create_reporting_project: {
    scope: "reporting_project:create",
    mutability: "draft_write",
    description: "Create a draft reporting project shell.",
    required: ["fund_id"],
  },
  upload_source_document: {
    scope: "source:attach",
    mutability: "draft_write",
    description: "Attach an existing repository version or external source reference to a draft reporting project.",
    required: ["fund_id", "project_id", "source_role"],
  },
  list_reporting_inputs: {
    scope: "reporting_project:read",
    mutability: "read_only",
    description: "List public fund reporting inputs, including repository current versions and active templates.",
    required: ["fund_id"],
  },
  analyze_template: {
    scope: "template:analyze",
    mutability: "draft_write",
    description: "Parse a stored template version and optionally attach it to a draft reporting project.",
    required: ["fund_id", "template_version_id"],
  },
  extract_lpa_terms: {
    scope: "source:analyze",
    mutability: "draft_write",
    description: "Run LPA extraction against a stored repository version; extracted terms remain suggestions.",
    required: ["fund_id", "repository_version_id"],
  },
  suggest_tb_mapping: {
    scope: "mapping:suggest",
    mutability: "draft_write",
    description: "Generate suggested account semantic mappings; suggestions are never approved.",
    required: ["fund_id"],
  },
  suggest_gl_mapping: {
    scope: "mapping:suggest",
    mutability: "draft_write",
    description: "Generate suggested GL/account semantic mappings; suggestions are never approved.",
    required: ["fund_id"],
  },
  list_unmapped_accounts: {
    scope: "mapping:read",
    mutability: "read_only",
    description: "List fund accounts that do not have an approved semantic mapping.",
    required: ["fund_id"],
  },
  run_report: {
    scope: "report:run_draft",
    mutability: "draft_write",
    description: "Run a draft report. Use output_format xlsx or engine cash_flow_extractor for workbook output.",
    required: ["fund_id"],
  },
  run_cash_flow_extraction: {
    scope: "report:run_draft",
    mutability: "draft_write",
    description: "Run a draft cash-flow workbook extraction from stored template, trial balance, and general ledger inputs.",
    required: ["fund_id", "project_id"],
  },
  run_validation_checks: {
    scope: "report:validate",
    mutability: "draft_write",
    description: "Run validation checks for a report run; failed/warning checks create review tasks.",
    required: ["run_id"],
  },
  get_exceptions: {
    scope: "report:read",
    mutability: "read_only",
    description: "List unresolved review tasks and validation/export exceptions.",
    required: [],
  },
  explain_report_line: {
    scope: "report:read",
    mutability: "read_only",
    description: "Explain a generated report line using row data and persisted lineage.",
    required: ["run_id"],
  },
  get_audit_trail: {
    scope: "audit:read",
    mutability: "read_only",
    description: "Read audit events for a reporting entity or fund.",
    required: [],
  },
  get_project_readiness: {
    scope: "reporting_project:read",
    mutability: "read_only",
    description: "Read input readiness and approval controls for a reporting project.",
    required: ["fund_id", "project_id"],
  },
  export_report: {
    scope: "report:request_export",
    mutability: "approval_request",
    description: "Request human approval for a final report export; does not download or mark a report final.",
    required: ["run_id"],
  },
  start_agent_workflow: {
    scope: "workflow:start",
    mutability: "draft_write",
    description: "Start a persisted multi-step reporting workflow that invokes only safe agent tools.",
    required: ["workflow_type"],
  },
  get_agent_workflow: {
    scope: "workflow:read",
    mutability: "read_only",
    description: "Read a persisted agent workflow run, including step statuses and monitoring output.",
    required: ["workflow_run_id"],
  },
  list_external_integrations: {
    scope: "integration:read",
    mutability: "read_only",
    description: "List configured fund integrations without exposing secret references.",
    required: ["fund_id"],
  },
  start_external_sync: {
    scope: "integration:sync",
    mutability: "draft_write",
    description: "Create an external sync run and discovered-artifact import plan; does not import files automatically.",
    required: ["integration_id"],
  },
  get_external_sync: {
    scope: "integration:read",
    mutability: "read_only",
    description: "Read an external sync run and its discovered-artifact import plan.",
    required: ["sync_run_id"],
  },
})

const FINALIZING_KEYS = [
  "approved_by",
  "approved_at",
  "approval_id",
  "activate",
  "activation_mode",
  "export",
  "exported_at",
  "is_active",
  "review_status",
  "waiver",
  "waived_by",
]

const FINALIZING_VALUES = [
  "approved",
  "activated",
  "active",
  "exported",
  "final",
  "waived",
]

const PRIVATE_OUTPUT_FIELDS = new Set([
  "filepath",
  "storagepath",
  "sourcefilepath",
  "templatefilepath",
  "tbfilepath",
  "glfilepath",
  "inputfilepath",
  "outputfilepath",
])
const BOOLEAN_ARTIFACT_FIELDS = new Set(["outputpaths", "outputartifactsjson", "outputs"])

function actorIdFromContext(context = {}) {
  return context.delegatedUserId || context.actorId || null
}

function arg(input, snake, camel = null) {
  return input?.[snake] ?? (camel ? input?.[camel] : undefined)
}

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function normalizeLimit(value, fallback = 100, max = 500) {
  const numeric = Number.parseInt(value, 10)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.min(numeric, max)
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

function reportEngineFor(input = {}) {
  const rawEngine = String(input.engine || input.report_engine || input.generation_mode || "").trim().toLowerCase()
  const rawFormat = String(input.output_format || input.outputFormat || input.target_format || "").trim().toLowerCase()
  const workbookEngines = new Set(["cash_flow_extractor", "workbook_extractor", "workbook", "xlsx"])
  if (workbookEngines.has(rawEngine) || rawFormat === "xlsx") return "cash_flow_extractor"
  return "approved_mapping"
}

function firstProjectSource(project, role) {
  return (project?.sources || []).find(
    (source) => source.source_role === role && source.status === "attached",
  ) || null
}

function publicRepositoryVersion(versionRecord) {
  const version = asPlain(versionRecord)
  if (!version) return null
  return {
    id: version.id,
    itemId: version.item_id || null,
    versionNumber: version.version_number || null,
    originalFileName: version.original_file_name || null,
    mimeType: version.mime_type || null,
    extension: version.extension || null,
    fileSize: version.file_size !== undefined && version.file_size !== null ? Number(version.file_size) : null,
    sha256: version.sha256 || null,
    isArchived: Boolean(version.is_archived),
    uploadedAt: version.uploaded_at || null,
    createdAt: version.created_at || version.createdAt || null,
    updatedAt: version.updated_at || version.updatedAt || null,
  }
}

function publicRepositoryInput(itemRecord) {
  const item = asPlain(itemRecord)
  if (!item) return null
  return {
    id: item.id,
    fundId: item.portfolio_id || null,
    kind: item.kind,
    category: item.category,
    title: item.title,
    description: item.description || null,
    periodStart: item.period_start || null,
    periodEnd: item.period_end || null,
    currentVersionId: item.current_version_id || null,
    currentVersion: publicRepositoryVersion(item.currentVersion),
    tags: Array.isArray(item.tags_json) ? item.tags_json : [],
    isArchived: Boolean(item.is_archived),
    createdAt: item.created_at || item.createdAt || null,
    updatedAt: item.updated_at || item.updatedAt || null,
  }
}

function publicTemplateVersionInput(versionRecord) {
  const version = asPlain(versionRecord)
  if (!version) return null
  return {
    id: version.id,
    templateId: version.template_id || null,
    fundId: version.portfolio_id || null,
    versionNumber: version.version_number || null,
    versionLabel: version.version_label || null,
    sourceFileName: version.source_file_name || null,
    sourceFileSha256: version.source_file_sha256 || null,
    schemaHash: version.schema_hash || null,
    parsedAt: version.parsed_at || null,
    createdAt: version.created_at || version.createdAt || null,
    updatedAt: version.updated_at || version.updatedAt || null,
  }
}

function publicTemplateInput(templateRecord) {
  const template = asPlain(templateRecord)
  if (!template) return null
  return {
    id: template.id,
    fundId: template.portfolio_id || null,
    name: template.name,
    version: template.version || null,
    templateKind: template.template_kind || "cash_flow",
    status: template.status || null,
    isActive: Boolean(template.is_active),
    activeVersionId: template.active_version_id || null,
    templateFileName: template.template_file_name || null,
    activeVersion: publicTemplateVersionInput(template.activeVersion),
    createdAt: template.created_at || template.createdAt || null,
    updatedAt: template.updated_at || template.updatedAt || null,
  }
}

function groupRepositoryInputs(items) {
  const byCategory = items.reduce((groups, item) => {
    const category = item.category || "unknown"
    groups[category] = groups[category] || []
    groups[category].push(item)
    return groups
  }, {})

  return {
    items,
    byCategory,
    trialBalances: byCategory.trial_balance || [],
    generalLedgers: byCategory.general_ledger || [],
    lpas: byCategory.lpa || [],
  }
}

function normalizedFieldName(key) {
  return String(key || "")
    .replace(/[_-]/g, "")
    .toLowerCase()
}

function looksLikeFilesystemPath(value) {
  const text = String(value || "")
  return /^[a-z]:[\\/]/i.test(text) || /^\/(?:var|tmp|private|users|uploads)\//i.test(text)
}

function booleanArtifactMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, artifact]) => [key, Boolean(artifact)]))
}

function sanitizeAgentOutput(value, fieldName = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAgentOutput(item, fieldName)).filter((item) => item !== undefined)
  }
  if (value && typeof value === "object") {
    if (BOOLEAN_ARTIFACT_FIELDS.has(normalizedFieldName(fieldName))) {
      return booleanArtifactMap(value)
    }
    return Object.entries(value).reduce((safe, [key, nestedValue]) => {
      if (PRIVATE_OUTPUT_FIELDS.has(normalizedFieldName(key))) return safe
      const sanitized = sanitizeAgentOutput(nestedValue, key)
      if (sanitized !== undefined) safe[key] = sanitized
      return safe
    }, {})
  }
  if (typeof value === "string" && looksLikeFilesystemPath(value)) return undefined
  return value
}

function serializeRow(rowRecord) {
  const row = asPlain(rowRecord) || {}
  return {
    id: row.id,
    reportRunId: row.report_run_id,
    templateVersionId: row.template_version_id,
    templateRowId: row.template_row_id || null,
    semanticConceptId: row.semantic_concept_id || null,
    rowOrder: row.row_order || null,
    rowLabel: row.row_label || null,
    rowType: row.row_type || null,
    sectionName: row.section_name || null,
    formulaText: row.formula_text || null,
    value: row.resolved_value !== null && row.resolved_value !== undefined ? Number(row.resolved_value) : null,
    currency: row.currency || null,
    resolutionStatus: row.resolution_status,
    valueSource: row.value_source,
    metadata: row.metadata_json || {},
  }
}

function publicAuditEvent(record) {
  const event = asPlain(record) || {}
  return {
    id: event.id,
    actorId: event.actor_id || null,
    entityType: event.entity_type,
    entityId: event.entity_id || null,
    eventType: event.event_type || event.action,
    metadata: event.metadata_json || null,
    occurredAt: event.occurred_at || null,
    createdAt: event.created_at || event.createdAt || null,
  }
}

class AgentReportingToolService {
  static getToolCatalog() {
    return TOOL_CATALOG
  }

  static assertDraftOnlyPayload(payload = {}) {
    const keys = Object.keys(payload || {}).map((key) => key.toLowerCase())
    const blockedKey = keys.find((key) => FINALIZING_KEYS.includes(key))
    if (blockedKey) {
      throw new AppError("Agent reporting tools cannot approve, activate, waive, or export reporting work", 403)
    }

    const serialized = JSON.stringify(payload || {}).toLowerCase()
    const blockedValue = FINALIZING_VALUES.find((value) => serialized.includes(`"${value}"`))
    if (blockedValue) {
      throw new AppError("Agent reporting tools can only create draft reporting work", 403)
    }
  }

  static async dispatch(toolName, input = {}, context = {}) {
    const handlers = {
      create_reporting_project: this.createReportingProject,
      upload_source_document: this.attachSource,
      list_reporting_inputs: this.listReportingInputs,
      analyze_template: this.analyzeTemplate,
      extract_lpa_terms: this.extractLpaTerms,
      suggest_tb_mapping: this.suggestTbMapping,
      suggest_gl_mapping: this.suggestGlMapping,
      list_unmapped_accounts: this.listUnmappedAccounts,
      run_report: this.runReport,
      run_cash_flow_extraction: this.runCashFlowExtraction,
      run_validation_checks: this.runValidationChecks,
      get_exceptions: this.getExceptions,
      explain_report_line: this.explainReportLine,
      get_audit_trail: this.getAuditTrail,
      get_project_readiness: this.getProjectReadiness,
      export_report: this.exportReport,
      start_agent_workflow: this.startAgentWorkflow,
      get_agent_workflow: this.getAgentWorkflow,
      list_external_integrations: this.listExternalIntegrations,
      start_external_sync: this.startExternalSync,
      get_external_sync: this.getExternalSync,
    }
    const handler = handlers[toolName]
    if (!handler) throw new AppError("Unsupported agent reporting tool", 404)
    return sanitizeAgentOutput(await handler.call(this, input, context))
  }

  static async createReportingProject(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const fundId = arg(input, "fund_id", "fundId")
    return await ReportingProjectService.createProject({
      fundId,
      actorId: actorIdFromContext(context),
      fields: {
        ...input,
        requested_by_agent_id: context.agentId || input.requested_by_agent_id || null,
        metadata_json: {
          ...((input.metadata_json && typeof input.metadata_json === "object" && input.metadata_json) || {}),
          agent_context: {
            agent_id: context.agentId || null,
            invocation_id: context.invocationId || null,
            tool_name: "create_reporting_project",
          },
        },
      },
    })
  }

  static async attachSource(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const fundId = arg(input, "fund_id", "fundId")
    const projectId = arg(input, "project_id", "projectId")
    return await ReportingProjectService.attachSource({
      fundId,
      projectId,
      actorId: actorIdFromContext(context),
      fields: {
        ...input,
        metadata_json: {
          ...((input.metadata_json && typeof input.metadata_json === "object" && input.metadata_json) || {}),
          agent_context: {
            agent_id: context.agentId || null,
            invocation_id: context.invocationId || null,
            tool_name: "upload_source_document",
          },
        },
      },
    })
  }

  static async listReportingInputs(input = {}) {
    const fundId = arg(input, "fund_id", "fundId")
    if (!fundId) throw new AppError("fund_id is required", 400)
    if (typeof ReportingProjectService.requireFund === "function") {
      await ReportingProjectService.requireFund(fundId)
    }

    const TemplateModel = Template || CashFlowTemplate
    const [repositoryRecords, templateRecords] = await Promise.all([
      FundRepositoryItem.findAll({
        where: { portfolio_id: fundId, is_archived: false },
        include: [
          {
            model: FundRepositoryVersion,
            as: "currentVersion",
            required: false,
            where: { is_archived: false },
          },
        ],
        order: [
          ["kind", "ASC"],
          ["category", "ASC"],
          ["updated_at", "DESC"],
        ],
      }),
      TemplateModel.findAll({
        where: { portfolio_id: fundId },
        include: [{ model: TemplateVersion, as: "activeVersion" }],
        order: [
          ["is_active", "DESC"],
          ["created_at", "DESC"],
        ],
      }),
    ])

    const repositoryItems = repositoryRecords.map(publicRepositoryInput).filter(Boolean)
    const templates = templateRecords.map(publicTemplateInput).filter(Boolean)
    const activeTemplates = templates.filter((template) => template.isActive)

    return {
      fundId,
      repository: groupRepositoryInputs(repositoryItems),
      templates,
      activeTemplates,
      controls: {
        storagePathsExposed: false,
        finalExportRequiresHumanApproval: true,
      },
    }
  }

  static async analyzeTemplate(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const fundId = arg(input, "fund_id", "fundId")
    const templateVersionId = arg(input, "template_version_id", "templateVersionId")
    if (!templateVersionId) throw new AppError("template_version_id is required", 400)

    const version = await TemplateVersion.findOne({ where: { id: templateVersionId, portfolio_id: fundId } })
    if (!version) throw new AppError("Template version not found for this fund", 404)

    const result = await TemplateParsingService.parseTemplateVersion({
      templateId: version.template_id,
      versionId: version.id,
      actorId: actorIdFromContext(context),
    })

    let attachment = null
    const projectId = arg(input, "project_id", "projectId")
    if (projectId) {
      attachment = await ReportingProjectService.attachSource({
        fundId,
        projectId,
        actorId: actorIdFromContext(context),
        fields: {
          source_role: "template",
          source_type: "template_version",
          template_version_id: version.id,
          metadata_json: {
            agent_context: {
              agent_id: context.agentId || null,
              invocation_id: context.invocationId || null,
              tool_name: "analyze_template",
            },
          },
        },
      })
    }

    return {
      template: result?.template || null,
      version: result?.version || null,
      parseMetadata: result?.parseMetadata || null,
      persistedRowCount: result?.persistedRowCount || 0,
      attachment,
    }
  }

  static async extractLpaTerms(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const fundId = arg(input, "fund_id", "fundId")
    const versionId = arg(input, "repository_version_id", "repositoryVersionId")
    if (!versionId) throw new AppError("repository_version_id is required", 400)
    return await RepositoryAnalysisService.analyzeVersion({
      fundId,
      versionId,
      actorId: actorIdFromContext(context),
      readerKey: input.reader_key || "lpa",
      triggerType: "agent_tool",
    })
  }

  static async suggestTbMapping(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    return await this.suggestAccountMappings(input, context, "trial_balance")
  }

  static async suggestGlMapping(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    return await this.suggestAccountMappings(input, context, "general_ledger")
  }

  static async suggestAccountMappings(input = {}, context = {}, sourceRole = "account_mapping") {
    const fundId = arg(input, "fund_id", "fundId")
    return await MappingSuggestionService.suggestAccountMappings({
      fundId,
      accountIds: Array.isArray(input.account_ids) ? input.account_ids : [],
      actorId: actorIdFromContext(context),
      limit: normalizeLimit(input.limit, 5, 20),
      minConfidence: Number(input.min_confidence || input.minConfidence || 0.18),
      includeApproved: false,
      metadata: {
        source_role: sourceRole,
        agent_id: context.agentId || null,
      },
    })
  }

  static async listUnmappedAccounts(input = {}) {
    const fundId = arg(input, "fund_id", "fundId")
    if (!fundId) throw new AppError("fund_id is required", 400)
    const accounts = await Account.findAll({
      where: { portfolio_id: fundId },
      order: [
        ["name", "ASC"],
        ["code", "ASC"],
      ],
    })
    const approvedMappings = await AccountSemanticMapping.findAll({
      where: { portfolio_id: fundId, status: "approved" },
    })
    const approvedAccountIds = new Set(approvedMappings.map((mapping) => mapping.account_id))
    const unmapped = accounts
      .filter((account) => !approvedAccountIds.has(account.id))
      .map((account) => {
        const payload = asPlain(account)
        return {
          id: payload.id,
          code: payload.code || null,
          name: payload.name,
          normalizedName: payload.normalized_name,
          sourceSystem: payload.source_system || null,
          sourceRef: payload.source_ref || null,
        }
      })

    return {
      fundId,
      totalAccounts: accounts.length,
      approvedMappedAccounts: approvedAccountIds.size,
      unmappedAccounts: unmapped,
    }
  }

  static async runReport(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    if (reportEngineFor(input) === "cash_flow_extractor") {
      return await this.runWorkbookReport(input, context)
    }

    const fundId = arg(input, "fund_id", "fundId")
    const projectId = arg(input, "project_id", "projectId")
    let templateVersionId = arg(input, "template_version_id", "templateVersionId")
    let periodStart = input.period_start || input.periodStart || null
    let periodEnd = input.period_end || input.periodEnd || null

    if (projectId) {
      const project = await ReportingProjectService.getProject({ fundId, projectId })
      templateVersionId = templateVersionId || project.template_version_id
      periodStart = periodStart || project.period_start
      periodEnd = periodEnd || project.period_end
    }

    if (!templateVersionId) throw new AppError("template_version_id is required", 400)
    if (!periodStart || !periodEnd) throw new AppError("period_start and period_end are required", 400)

    const result = await ReportGenerationService.generateReport({
      templateVersionId,
      fundId,
      periodStart,
      periodEnd,
      actorId: actorIdFromContext(context),
    })

    if (projectId && result?.reportRun?.id) {
      await ReportingProject.update(
        { current_report_run_id: result.reportRun.id },
        { where: { id: projectId, portfolio_id: fundId } },
      )
      await ReportingProjectService.attachSource({
        fundId,
        projectId,
        actorId: actorIdFromContext(context),
        fields: {
          source_role: "draft_report",
          source_type: "report_run",
          report_run_id: result.reportRun.id,
          required: false,
          metadata_json: {
            agent_context: {
              agent_id: context.agentId || null,
              invocation_id: context.invocationId || null,
              tool_name: "run_report",
            },
          },
        },
      })
    }

    return result
  }

  static async runCashFlowExtraction(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    return await this.runWorkbookReport(input, {
      ...context,
      toolName: "run_cash_flow_extraction",
    })
  }

  static async runWorkbookReport(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const CashFlowReportService = require("../../reports/cash-flow/cashFlowReport.service")
    const fundId = arg(input, "fund_id", "fundId")
    const projectId = arg(input, "project_id", "projectId")
    let project = null
    let templateId = input.template_id || input.templateId || null
    let dateStart = input.date_start || input.dateStart || input.period_start || input.periodStart || null
    let dateEnd = input.date_end || input.dateEnd || input.period_end || input.periodEnd || null
    let tbRepositoryVersionId =
      input.tb_repository_version_id ||
      input.tbRepositoryVersionId ||
      input.trial_balance_repository_version_id ||
      input.trialBalanceRepositoryVersionId ||
      null
    let glRepositoryVersionId =
      input.gl_repository_version_id ||
      input.glRepositoryVersionId ||
      input.general_ledger_repository_version_id ||
      input.generalLedgerRepositoryVersionId ||
      null

    if (projectId) {
      project = await ReportingProjectService.getProject({ fundId, projectId })
      templateId = templateId || project.template_id || project.template?.id || null
      dateStart = dateStart || project.period_start || null
      dateEnd = dateEnd || project.period_end || null

      const tbSource = firstProjectSource(project, "trial_balance")
      const glSource = firstProjectSource(project, "general_ledger")
      tbRepositoryVersionId = tbRepositoryVersionId || tbSource?.repository_version_id || null
      glRepositoryVersionId = glRepositoryVersionId || glSource?.repository_version_id || null
    }

    if (!fundId) throw new AppError("fund_id is required", 400)
    if (!dateStart || !dateEnd) {
      throw new AppError("date_start/date_end or project period_start/period_end are required for workbook reports", 400)
    }
    if (!tbRepositoryVersionId || !glRepositoryVersionId) {
      throw new AppError("Workbook report generation requires trial balance and general ledger repository versions", 400)
    }

    const fiscalYear =
      input.fiscal_year === undefined || input.fiscal_year === null || input.fiscal_year === ""
        ? null
        : Number.parseInt(input.fiscal_year, 10)
    const result = sanitizeAgentOutput(await CashFlowReportService.runReport({
      fundId,
      templateId,
      actorId: actorIdFromContext(context),
      rangeInput: {
        dateStart,
        dateEnd,
        preset: input.preset || null,
        fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
      },
      tbRepositoryVersionId,
      glRepositoryVersionId,
      saveUploadsToRepository: false,
    }))

    if (projectId && result?.run?.id) {
      await ReportingProject.update(
        { current_report_run_id: result.run.id },
        { where: { id: projectId, portfolio_id: fundId } },
      )
      await ReportingProjectService.attachSource({
        fundId,
        projectId,
        actorId: actorIdFromContext(context),
        fields: {
          source_role: "draft_report",
          source_type: "report_run",
          report_run_id: result.run.id,
          required: false,
          metadata_json: {
            agent_context: {
              agent_id: context.agentId || null,
              invocation_id: context.invocationId || null,
              tool_name: context.toolName || "run_report",
              generation_mode: "cash_flow_extractor",
            },
          },
        },
      })
    }

    let validation = null
    let validationError = null
    if (parseBoolean(input.run_validation ?? input.runValidation, true) && result?.run?.id) {
      try {
        validation = await ValidationEngineService.validateReportRun({
          runId: result.run.id,
          actorId: actorIdFromContext(context),
        })
      } catch (error) {
        validationError = {
          code: error.code || "report_validation_failed",
          message: error.message,
          details: error.details || null,
        }
      }
    }

    return {
      ...result,
      generationMode: "cash_flow_extractor",
      outputFormat: "xlsx",
      draftWorkbook: {
        xlsxAvailable: Boolean(result?.outputs?.xlsx || result?.run?.output_paths?.xlsx),
        finalExportRequiresHumanApproval: true,
      },
      validationResult: validation?.validationResult || null,
      validationChecks: validation?.checks || [],
      validationError,
    }
  }

  static async runValidationChecks(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const runId = input.run_id || input.runId
    if (!runId) throw new AppError("run_id is required", 400)
    return await ValidationEngineService.validateReportRun({
      runId,
      actorId: actorIdFromContext(context),
    })
  }

  static async getExceptions(input = {}) {
    const fundId = arg(input, "fund_id", "fundId")
    const status = input.status || null
    const runId = input.run_id || input.runId || null
    const result = await ReviewTaskService.listReviewTasks({ fundId, status })
    const tasks = runId
      ? result.tasks.filter((task) => task.metadata?.report_run_id === runId || task.targetId === runId)
      : result.tasks
    return {
      total: tasks.length,
      review_tasks: tasks,
    }
  }

  static async explainReportLine(input = {}) {
    const runId = input.run_id || input.runId
    const rowId = input.report_run_row_id || input.reportRunRowId || input.row_id || input.rowId || null
    const templateRowId = input.template_row_id || input.templateRowId || null
    if (!runId) throw new AppError("run_id is required", 400)
    if (!rowId && !templateRowId) throw new AppError("report_run_row_id or template_row_id is required", 400)

    const row = rowId
      ? await ReportRunRow.findOne({ where: { id: rowId, report_run_id: runId } })
      : await ReportRunRow.findOne({ where: { report_run_id: runId, template_row_id: templateRowId } })
    if (!row) throw new AppError("Report line not found", 404)

    const lineage = await ReportLineage.findAll({
      where: { report_run_id: runId, report_run_row_id: row.id },
      order: [["created_at", "ASC"]],
    })
    const run = await ReportRun.findByPk(runId)

    return {
      reportRun: run
        ? {
            id: run.id,
            type: run.type,
            fundId: run.portfolio_id,
            templateVersionId: run.template_version_id,
            readinessStatus: run.readiness_status || null,
          }
        : null,
      row: serializeRow(row),
      lineage: lineage.map(asPlain),
    }
  }

  static async getAuditTrail(input = {}) {
    const where = {}
    if (input.entity_type || input.entityType) where.entity_type = input.entity_type || input.entityType
    if (input.entity_id || input.entityId) where.entity_id = input.entity_id || input.entityId
    const fundId = arg(input, "fund_id", "fundId")
    if (fundId && !where.entity_id) where.entity_id = fundId

    const events = await AuditModel.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: normalizeLimit(input.limit, 100, 500),
    })
    return {
      events: events.map(publicAuditEvent),
    }
  }

  static async getProjectReadiness(input = {}) {
    const fundId = arg(input, "fund_id", "fundId")
    const projectId = arg(input, "project_id", "projectId")
    return await ReportingProjectService.getProjectReadiness({ fundId, projectId })
  }

  static async exportReport(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const runId = input.run_id || input.runId
    if (!runId) throw new AppError("run_id is required", 400)
    return await ReportExportService.requestFinalExport({
      runId,
      format: input.format || "xlsx",
      actorId: actorIdFromContext(context),
    })
  }

  static async startAgentWorkflow(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const AgentWorkflowService = require("../../agent-tools/services/agentWorkflow.service")
    return await AgentWorkflowService.createWorkflowRun({
      agentPrincipalId: context.agentId || input.agent_principal_id || input.agentPrincipalId,
      actorId: actorIdFromContext(context),
      workflowType: input.workflow_type || input.workflowType,
      fundId: arg(input, "fund_id", "fundId") || null,
      projectId: arg(input, "project_id", "projectId") || null,
      runId: input.run_id || input.runId || null,
      triggerType: input.trigger_type || input.triggerType || "agent_tool",
      idempotencyKey: input.idempotency_key || input.idempotencyKey || null,
      externalCorrelationId: input.external_correlation_id || input.externalCorrelationId || null,
      steps: Array.isArray(input.steps) ? input.steps : [],
      policy: input.policy || {},
      schedule: input.schedule || null,
      metadata: {
        ...(input.metadata_json || input.metadata || {}),
        parent_invocation_id: context.invocationId || null,
      },
      startImmediately: input.start_immediately !== false && input.startImmediately !== false,
    })
  }

  static async getAgentWorkflow(input = {}, context = {}) {
    const workflowRunId = input.workflow_run_id || input.workflowRunId || input.id
    if (!workflowRunId) throw new AppError("workflow_run_id is required", 400)
    const AgentWorkflowService = require("../../agent-tools/services/agentWorkflow.service")
    return await AgentWorkflowService.getWorkflowRun({
      workflowRunId,
      agentPrincipalId: context.agentId || input.agent_principal_id || input.agentPrincipalId || null,
    })
  }

  static async listExternalIntegrations(input = {}) {
    const ExternalIntegrationService = require("../../agent-tools/services/externalIntegration.service")
    return await ExternalIntegrationService.listIntegrations({
      fundId: arg(input, "fund_id", "fundId"),
      status: input.status || null,
      providerType: input.provider_type || input.providerType || null,
    })
  }

  static async startExternalSync(input = {}, context = {}) {
    this.assertDraftOnlyPayload(input)
    const ExternalIntegrationService = require("../../agent-tools/services/externalIntegration.service")
    return await ExternalIntegrationService.startSyncRun({
      fundId: arg(input, "fund_id", "fundId") || null,
      integrationId: input.integration_id || input.integrationId,
      actorId: actorIdFromContext(context),
      agentPrincipalId: context.agentId || input.agent_principal_id || input.agentPrincipalId || null,
      agentWorkflowRunId: input.workflow_run_id || input.workflowRunId || null,
      syncType: input.sync_type || input.syncType || "discovery",
      triggerType: input.trigger_type || input.triggerType || "agent_tool",
      idempotencyKey: input.idempotency_key || input.idempotencyKey || null,
      externalCorrelationId: input.external_correlation_id || input.externalCorrelationId || null,
      discoveredArtifacts: input.discovered_artifacts || input.discoveredArtifacts || [],
      metadata: {
        ...(input.metadata_json || input.metadata || {}),
        invocation_id: context.invocationId || null,
      },
    })
  }

  static async getExternalSync(input = {}) {
    const syncRunId = input.sync_run_id || input.syncRunId || input.id
    if (!syncRunId) throw new AppError("sync_run_id is required", 400)
    const ExternalIntegrationService = require("../../agent-tools/services/externalIntegration.service")
    return await ExternalIntegrationService.getSyncRun({
      syncRunId,
      fundId: arg(input, "fund_id", "fundId") || null,
    })
  }
}

module.exports = AgentReportingToolService
