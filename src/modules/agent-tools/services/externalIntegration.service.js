const {
  ExternalIntegration,
  ExternalSyncRun,
  Fund,
  Portfolio,
  sequelize,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")

const FundModel = Fund || Portfolio

const PROVIDER_TYPES = ["erp", "document_store", "data_warehouse", "file_transfer", "custom"]
const AUTH_MODES = ["secret_reference", "oauth", "service_account", "none"]
const INTEGRATION_STATUSES = ["active", "disabled", "archived"]
const SYNC_TYPES = ["discovery", "metadata_refresh", "artifact_import_request"]
const SYNC_STATUSES = ["pending", "completed", "failed", "action_required"]
const SECRET_FIELD_NAMES = [
  "api_key",
  "apiKey",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "client_secret",
  "clientSecret",
  "password",
  "private_key",
  "privateKey",
  "secret",
  "token",
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

function parseArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (!value) return fallback
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parseArray(parsed, fallback)
    } catch (error) {
      void error
    }
    return value.split(",").map((item) => item.trim()).filter(Boolean)
  }
  return fallback
}

function parseObject(value, fallback = null) {
  if (!value) return fallback
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback
    } catch (error) {
      return { note: value }
    }
  }
  return fallback
}

function assertNoRawSecrets(fields = {}) {
  const serialized = JSON.stringify(fields || {}).toLowerCase()
  const directSecretKey = SECRET_FIELD_NAMES.find((field) => Object.prototype.hasOwnProperty.call(fields, field))
  if (directSecretKey || SECRET_FIELD_NAMES.some((field) => serialized.includes(`"${field.toLowerCase()}"`))) {
    throw new AppError("External integrations must reference secrets by secret_reference; raw credentials are not accepted", 400)
  }
}

function sanitizeConfig(config = {}) {
  assertNoRawSecrets(config)
  return parseObject(config, {})
}

function publicIntegration(record) {
  const integration = asPlain(record)
  if (!integration) return null
  const { secret_reference: ignoredSecretReference, ...safe } = integration
  void ignoredSecretReference
  return {
    ...safe,
    has_secret_reference: Boolean(integration.secret_reference),
  }
}

function publicSyncRun(record) {
  const run = asPlain(record)
  if (!run) return null
  return {
    id: run.id,
    externalIntegrationId: run.external_integration_id,
    fundId: run.portfolio_id,
    agentPrincipalId: run.agent_principal_id || null,
    agentWorkflowRunId: run.agent_workflow_run_id || null,
    syncType: run.sync_type,
    status: run.status,
    triggerType: run.trigger_type,
    idempotencyKey: run.idempotency_key || null,
    externalCorrelationId: run.external_correlation_id || null,
    requestedBy: run.requested_by || null,
    discoveredArtifacts: run.discovered_artifacts_json || [],
    importPlan: run.import_plan_json || null,
    result: run.result_json || null,
    error: run.error_json || null,
    startedAt: run.started_at || null,
    completedAt: run.completed_at || null,
    metadata: run.metadata_json || null,
    createdAt: run.created_at || run.createdAt || null,
    updatedAt: run.updated_at || run.updatedAt || null,
  }
}

function normalizeProviderType(value) {
  const providerType = normalizeKey(value)
  if (!PROVIDER_TYPES.includes(providerType)) {
    throw new AppError("Unsupported external integration provider_type", 400)
  }
  return providerType
}

function normalizeAuthMode(value) {
  const authMode = normalizeKey(value || "secret_reference")
  if (!AUTH_MODES.includes(authMode)) {
    throw new AppError("Unsupported external integration auth_mode", 400)
  }
  return authMode
}

function normalizeStatus(value) {
  const status = normalizeKey(value || "active")
  if (!INTEGRATION_STATUSES.includes(status)) {
    throw new AppError("Unsupported external integration status", 400)
  }
  return status
}

function normalizeSyncType(value) {
  const syncType = normalizeKey(value || "discovery")
  if (!SYNC_TYPES.includes(syncType)) {
    throw new AppError("Unsupported external sync type", 400)
  }
  return syncType
}

function normalizeDiscoveredArtifacts(value) {
  if (!value) return []
  const artifacts = Array.isArray(value) ? value : []
  return artifacts.map((artifact, index) => {
    const payload = parseObject(artifact, {})
    assertNoRawSecrets(payload)
    return {
      external_id: normalizeString(payload.external_id || payload.externalId || `artifact-${index + 1}`),
      title: normalizeString(payload.title || payload.name || payload.file_name || payload.fileName),
      kind: normalizeKey(payload.kind || "document"),
      category: normalizeKey(payload.category || "other_document"),
      source_uri: normalizeString(payload.source_uri || payload.sourceUri || payload.url) || null,
      mime_type: normalizeString(payload.mime_type || payload.mimeType) || null,
      file_size: payload.file_size || payload.fileSize || null,
      sha256: normalizeString(payload.sha256 || payload.checksum) || null,
      period_start: payload.period_start || payload.periodStart || null,
      period_end: payload.period_end || payload.periodEnd || null,
      metadata: parseObject(payload.metadata_json || payload.metadata, null),
      import_status: "review_required",
    }
  })
}

function buildImportPlan({ artifacts, syncType }) {
  return {
    sync_type: syncType,
    requires_human_review: true,
    automatic_repository_import: false,
    artifact_count: artifacts.length,
    next_actions: artifacts.length
      ? ["Review discovered artifacts", "Select approved artifacts for repository upload/import"]
      : ["Connect provider worker or submit discovered_artifacts payload"],
  }
}

class ExternalIntegrationService {
  static async requireFund(fundId) {
    const fund = await FundModel.findByPk(fundId)
    if (!fund) throw new AppError("Fund not found", 404)
    return fund
  }

  static async requireIntegration({ fundId = null, integrationId }) {
    const where = { id: integrationId }
    if (fundId) where.portfolio_id = fundId
    const integration = await ExternalIntegration.findOne({ where })
    if (!integration) throw new AppError("External integration not found", 404)
    return integration
  }

  static async createIntegration({ fundId, actorId = null, fields = {} }) {
    await this.requireFund(fundId)
    assertNoRawSecrets(fields)

    const name = normalizeString(fields.name)
    if (!name) throw new AppError("External integration name is required", 400)

    const providerType = normalizeProviderType(fields.provider_type || fields.providerType)
    const providerKey = normalizeKey(fields.provider_key || fields.providerKey || "generic")
    const authMode = normalizeAuthMode(fields.auth_mode || fields.authMode)
    const status = normalizeStatus(fields.status)
    const secretReference = normalizeString(fields.secret_reference || fields.secretReference) || null

    if (authMode !== "none" && !secretReference) {
      throw new AppError("secret_reference is required unless auth_mode is none", 400)
    }

    const integration = await ExternalIntegration.create({
      portfolio_id: fundId,
      name,
      provider_type: providerType,
      provider_key: providerKey,
      status,
      auth_mode: authMode,
      secret_reference: secretReference,
      scopes_json: parseArray(fields.scopes, []),
      config_json: sanitizeConfig(fields.config_json || fields.config || {}),
      sync_policy_json: parseObject(fields.sync_policy_json || fields.sync_policy, null),
      created_by: actorId,
      metadata_json: parseObject(fields.metadata_json || fields.metadata, null),
    })

    await AuditService.logEvent({
      actorId,
      eventType: "external_integration_created",
      entityType: "external_integration",
      entityId: integration.id,
      metadata: {
        fund_id: fundId,
        provider_type: providerType,
        provider_key: providerKey,
      },
      after: publicIntegration(integration),
    })

    return publicIntegration(integration)
  }

  static async updateIntegration({ fundId, integrationId, actorId = null, fields = {} }) {
    assertNoRawSecrets(fields)
    const integration = await this.requireIntegration({ fundId, integrationId })
    const before = publicIntegration(integration)
    const updates = {}

    if (fields.name !== undefined) {
      updates.name = normalizeString(fields.name)
      if (!updates.name) throw new AppError("External integration name is required", 400)
    }
    if (fields.status !== undefined) updates.status = normalizeStatus(fields.status)
    if (fields.secret_reference !== undefined || fields.secretReference !== undefined) {
      updates.secret_reference = normalizeString(fields.secret_reference || fields.secretReference) || null
    }
    if (fields.scopes !== undefined) updates.scopes_json = parseArray(fields.scopes, [])
    if (fields.config_json !== undefined || fields.config !== undefined) {
      updates.config_json = sanitizeConfig(fields.config_json || fields.config || {})
    }
    if (fields.sync_policy_json !== undefined || fields.sync_policy !== undefined) {
      updates.sync_policy_json = parseObject(fields.sync_policy_json || fields.sync_policy, null)
    }
    if (fields.metadata_json !== undefined || fields.metadata !== undefined) {
      updates.metadata_json = parseObject(fields.metadata_json || fields.metadata, null)
    }

    await integration.update(updates)

    await AuditService.logEvent({
      actorId,
      eventType: "external_integration_updated",
      entityType: "external_integration",
      entityId: integration.id,
      metadata: { fund_id: fundId },
      before,
      after: publicIntegration(integration),
    })

    return publicIntegration(integration)
  }

  static async listIntegrations({ fundId, status = null, providerType = null }) {
    await this.requireFund(fundId)
    const where = { portfolio_id: fundId }
    if (status) where.status = normalizeStatus(status)
    if (providerType) where.provider_type = normalizeProviderType(providerType)
    const integrations = await ExternalIntegration.findAll({
      where,
      order: [["updated_at", "DESC"]],
    })
    return integrations.map(publicIntegration)
  }

  static async getIntegration({ fundId = null, integrationId }) {
    return publicIntegration(await this.requireIntegration({ fundId, integrationId }))
  }

  static async findIdempotentSyncRun({ integrationId, idempotencyKey }) {
    if (!idempotencyKey) return null
    return await ExternalSyncRun.findOne({
      where: {
        external_integration_id: integrationId,
        idempotency_key: idempotencyKey,
      },
    })
  }

  static async startSyncRun({
    fundId = null,
    integrationId,
    actorId = null,
    agentPrincipalId = null,
    agentWorkflowRunId = null,
    syncType = "discovery",
    triggerType = "manual",
    idempotencyKey = null,
    externalCorrelationId = null,
    discoveredArtifacts = [],
    metadata = null,
  }) {
    const integration = await this.requireIntegration({ fundId, integrationId })
    const integrationData = asPlain(integration)
    if (integrationData.status !== "active") {
      throw new AppError("External integration is not active", 403)
    }

    const existing = await this.findIdempotentSyncRun({ integrationId, idempotencyKey })
    if (existing) {
      return {
        syncRun: publicSyncRun(existing),
        idempotentReplay: true,
      }
    }

    const normalizedSyncType = normalizeSyncType(syncType)
    const artifacts = normalizeDiscoveredArtifacts(discoveredArtifacts)
    const importPlan = buildImportPlan({ artifacts, syncType: normalizedSyncType })
    const status = artifacts.length ? "completed" : "action_required"
    const now = new Date()

    const createSync = async (transaction = null) => {
      const syncRun = await ExternalSyncRun.create(
        {
          external_integration_id: integration.id,
          portfolio_id: integrationData.portfolio_id,
          agent_principal_id: agentPrincipalId || null,
          agent_workflow_run_id: agentWorkflowRunId || null,
          sync_type: normalizedSyncType,
          status,
          trigger_type: normalizeString(triggerType || "manual"),
          idempotency_key: idempotencyKey || null,
          external_correlation_id: externalCorrelationId || null,
          requested_by: actorId,
          discovered_artifacts_json: artifacts,
          import_plan_json: importPlan,
          result_json: {
            discovered_artifacts: artifacts.length,
            repository_imported: 0,
            human_review_required: true,
          },
          started_at: now,
          completed_at: now,
          metadata_json: parseObject(metadata, null),
        },
        { transaction },
      )
      await integration.update({ last_sync_at: now }, { transaction })
      return syncRun
    }

    const syncRun =
      sequelize && typeof sequelize.transaction === "function"
        ? await sequelize.transaction((transaction) => createSync(transaction))
        : await createSync()

    await AuditService.logEvent({
      actorId,
      eventType: "external_sync_run_created",
      entityType: "external_sync_run",
      entityId: syncRun.id,
      metadata: {
        fund_id: integrationData.portfolio_id,
        integration_id: integration.id,
        agent_principal_id: agentPrincipalId,
        agent_workflow_run_id: agentWorkflowRunId,
        sync_type: normalizedSyncType,
        status,
      },
      after: publicSyncRun(syncRun),
    })

    return {
      syncRun: publicSyncRun(syncRun),
      idempotentReplay: false,
    }
  }

  static async listSyncRuns({ fundId = null, integrationId = null, status = null }) {
    const where = {}
    if (fundId) where.portfolio_id = fundId
    if (integrationId) where.external_integration_id = integrationId
    if (status) {
      const normalizedStatus = normalizeKey(status)
      if (!SYNC_STATUSES.includes(normalizedStatus)) throw new AppError("Unsupported external sync status", 400)
      where.status = normalizedStatus
    }
    const runs = await ExternalSyncRun.findAll({
      where,
      order: [["created_at", "DESC"]],
    })
    return runs.map(publicSyncRun)
  }

  static async getSyncRun({ syncRunId, fundId = null }) {
    const where = { id: syncRunId }
    if (fundId) where.portfolio_id = fundId
    const run = await ExternalSyncRun.findOne({ where })
    if (!run) throw new AppError("External sync run not found", 404)
    return publicSyncRun(run)
  }
}

ExternalIntegrationService.constants = {
  PROVIDER_TYPES,
  AUTH_MODES,
  INTEGRATION_STATUSES,
  SYNC_TYPES,
  SYNC_STATUSES,
}

module.exports = ExternalIntegrationService
