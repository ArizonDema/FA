const mockIntegrations = []
const mockSyncRuns = []
const mockFundFindByPk = jest.fn()
const mockIntegrationCreate = jest.fn()
const mockIntegrationFindOne = jest.fn()
const mockIntegrationFindAll = jest.fn()
const mockSyncRunCreate = jest.fn()
const mockSyncRunFindOne = jest.fn()
const mockSyncRunFindAll = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: async (callback) => callback({ id: "tx" }),
  },
  Fund: {
    findByPk: (...args) => mockFundFindByPk(...args),
  },
  Portfolio: {
    findByPk: (...args) => mockFundFindByPk(...args),
  },
  ExternalIntegration: {
    create: (...args) => mockIntegrationCreate(...args),
    findOne: (...args) => mockIntegrationFindOne(...args),
    findAll: (...args) => mockIntegrationFindAll(...args),
  },
  ExternalSyncRun: {
    create: (...args) => mockSyncRunCreate(...args),
    findOne: (...args) => mockSyncRunFindOne(...args),
    findAll: (...args) => mockSyncRunFindAll(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const ExternalIntegrationService = require("../src/modules/agent-tools/services/externalIntegration.service")

function withUpdate(record) {
  return {
    ...record,
    async update(values) {
      Object.assign(this, values)
      return this
    },
    toJSON() {
      return { ...this }
    },
  }
}

function makeIntegration(values) {
  return withUpdate({
    id: `integration-${mockIntegrations.length + 1}`,
    status: "active",
    ...values,
  })
}

function makeSyncRun(values) {
  return withUpdate({
    id: `sync-${mockSyncRuns.length + 1}`,
    status: "pending",
    ...values,
  })
}

function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, value]) => record[key] === value)
}

describe("ExternalIntegrationService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIntegrations.length = 0
    mockSyncRuns.length = 0
    mockFundFindByPk.mockResolvedValue({ id: "fund-1" })
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockIntegrationCreate.mockImplementation(async (payload) => {
      const integration = makeIntegration(payload)
      mockIntegrations.push(integration)
      return integration
    })
    mockIntegrationFindOne.mockImplementation(async ({ where }) => mockIntegrations.find((entry) => matchesWhere(entry, where)) || null)
    mockIntegrationFindAll.mockImplementation(async ({ where }) => mockIntegrations.filter((entry) => matchesWhere(entry, where)))
    mockSyncRunCreate.mockImplementation(async (payload) => {
      const syncRun = makeSyncRun(payload)
      mockSyncRuns.push(syncRun)
      return syncRun
    })
    mockSyncRunFindOne.mockImplementation(async ({ where }) => mockSyncRuns.find((entry) => matchesWhere(entry, where)) || null)
    mockSyncRunFindAll.mockImplementation(async ({ where }) => mockSyncRuns.filter((entry) => matchesWhere(entry, where)))
  })

  test("creates a sanitized external integration using secret references only", async () => {
    const integration = await ExternalIntegrationService.createIntegration({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "SharePoint Data Room",
        provider_type: "document_store",
        provider_key: "sharepoint",
        auth_mode: "secret_reference",
        secret_reference: "vault://sharepoint/reporting-agent",
        scopes: ["documents.read"],
        config: { site_id: "site-1" },
      },
    })

    expect(integration.name).toBe("SharePoint Data Room")
    expect(integration.secret_reference).toBeUndefined()
    expect(integration.has_secret_reference).toBe(true)
    expect(integration.config_json).toEqual({ site_id: "site-1" })
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "external_integration_created",
        entityType: "external_integration",
      }),
    )
  })

  test("rejects raw secrets in integration and discovered artifact payloads", async () => {
    await expect(
      ExternalIntegrationService.createIntegration({
        fundId: "fund-1",
        fields: {
          name: "Unsafe",
          provider_type: "erp",
          provider_key: "netsuite",
          auth_mode: "secret_reference",
          api_key: "raw-secret",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    const integration = await ExternalIntegrationService.createIntegration({
      fundId: "fund-1",
      fields: {
        name: "Safe",
        provider_type: "erp",
        provider_key: "netsuite",
        auth_mode: "none",
      },
    })

    await expect(
      ExternalIntegrationService.startSyncRun({
        integrationId: integration.id,
        discoveredArtifacts: [{ external_id: "file-1", title: "TB", token: "raw-secret" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test("creates idempotent sync runs that require human review before repository import", async () => {
    const integration = await ExternalIntegrationService.createIntegration({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "ERP",
        provider_type: "erp",
        provider_key: "generic_erp",
        auth_mode: "none",
      },
    })

    const result = await ExternalIntegrationService.startSyncRun({
      fundId: "fund-1",
      integrationId: integration.id,
      actorId: "admin-1",
      agentPrincipalId: "agent-1",
      idempotencyKey: "sync-idem-1",
      discoveredArtifacts: [
        {
          external_id: "tb-2026",
          title: "Trial Balance 2026",
          kind: "dataset",
          category: "trial_balance",
          sha256: "abc123",
        },
      ],
    })

    expect(result.syncRun.status).toBe("completed")
    expect(result.syncRun.importPlan.requires_human_review).toBe(true)
    expect(result.syncRun.importPlan.automatic_repository_import).toBe(false)
    expect(result.syncRun.discoveredArtifacts[0].import_status).toBe("review_required")
    expect(mockIntegrations[0].last_sync_at).toBeInstanceOf(Date)

    const replay = await ExternalIntegrationService.startSyncRun({
      fundId: "fund-1",
      integrationId: integration.id,
      idempotencyKey: "sync-idem-1",
    })

    expect(replay.idempotentReplay).toBe(true)
    expect(replay.syncRun.id).toBe(result.syncRun.id)
  })

  test("lists and reads integrations and sync runs by fund", async () => {
    const integration = await ExternalIntegrationService.createIntegration({
      fundId: "fund-1",
      fields: {
        name: "Warehouse",
        provider_type: "data_warehouse",
        provider_key: "snowflake",
        auth_mode: "none",
      },
    })
    const sync = await ExternalIntegrationService.startSyncRun({
      fundId: "fund-1",
      integrationId: integration.id,
    })

    const integrations = await ExternalIntegrationService.listIntegrations({ fundId: "fund-1" })
    const syncRuns = await ExternalIntegrationService.listSyncRuns({ fundId: "fund-1" })
    const readSync = await ExternalIntegrationService.getSyncRun({ syncRunId: sync.syncRun.id, fundId: "fund-1" })

    expect(integrations).toHaveLength(1)
    expect(syncRuns).toHaveLength(1)
    expect(readSync.status).toBe("action_required")
    expect(readSync.importPlan.next_actions).toContain("Connect provider worker or submit discovered_artifacts payload")
  })
})
