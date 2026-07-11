const mockProjects = []
const mockSources = []
const mockTemplates = []
const mockTemplateVersions = []
const mockRepositoryItems = []
const mockRepositoryVersions = []
const mockReportRuns = []
const mockAuditLogEvent = jest.fn()
const mockEvaluateReadinessForConfig = jest.fn()

function plain(record) {
  return typeof record?.toJSON === "function" ? record.toJSON() : record
}

function withUpdate(record) {
  return {
    ...record,
    async update(values) {
      Object.assign(this, values)
      return this
    },
  }
}

function makeProject(values) {
  return withUpdate({
    id: `project-${mockProjects.length + 1}`,
    status: "draft",
    ...values,
    toJSON() {
      return {
        ...this,
        sources: mockSources.filter((source) => source.reporting_project_id === this.id).map(plain),
        template: mockTemplates.find((template) => template.id === this.template_id) || null,
        templateVersion: mockTemplateVersions.find((version) => version.id === this.template_version_id) || null,
        currentReportRun: mockReportRuns.find((run) => run.id === this.current_report_run_id) || null,
      }
    },
  })
}

function makeSource(values) {
  const source = {
    id: `source-${mockSources.length + 1}`,
    status: "attached",
    required: true,
    ...values,
    toJSON() {
      return {
        ...this,
        repositoryItem: mockRepositoryItems.find((item) => item.id === this.repository_item_id) || null,
        repositoryVersion: mockRepositoryVersions.find((version) => version.id === this.repository_version_id) || null,
        template: mockTemplates.find((template) => template.id === this.template_id) || null,
        templateVersion: mockTemplateVersions.find((version) => version.id === this.template_version_id) || null,
        reportRun: mockReportRuns.find((run) => run.id === this.report_run_id) || null,
      }
    },
  }
  source.destroy = async () => {
    const index = mockSources.findIndex((entry) => entry.id === source.id)
    if (index >= 0) mockSources.splice(index, 1)
  }
  return source
}

function makeRepositoryVersion(values) {
  return {
    ...values,
    toJSON() {
      return {
        ...this,
        item: mockRepositoryItems.find((item) => item.id === this.item_id) || this.item || null,
      }
    },
  }
}

function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "is_archived") return Boolean(record[key]) === Boolean(value)
    return record[key] === value
  })
}

const mockModels = {
  sequelize: {
    transaction: jest.fn(async (callback) => callback({ id: "transaction" })),
  },
  Fund: {
    findByPk: jest.fn(),
  },
  Portfolio: {
    findByPk: jest.fn(),
  },
  ReportingProject: {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
  },
  ReportingProjectSource: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
  FundRepositoryItem: {},
  FundRepositoryVersion: {
    findOne: jest.fn(),
  },
  CashFlowTemplate: {
    findOne: jest.fn(),
  },
  Template: null,
  TemplateVersion: {
    findOne: jest.fn(),
  },
  ReportRun: {
    findOne: jest.fn(),
  },
}

jest.mock("../src/models", () => mockModels)
jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))
jest.mock("../src/modules/templates/services/template.service", () => ({
  evaluateReadinessForConfig: (...args) => mockEvaluateReadinessForConfig(...args),
}))

const ReportingProjectService = require("../src/modules/reporting-projects/services/reportingProject.service")
const AgentReportingToolService = require("../src/modules/reporting-projects/services/agentReportingTool.service")

describe("ReportingProjectService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockProjects.length = 0
    mockSources.length = 0
    mockTemplates.length = 0
    mockTemplateVersions.length = 0
    mockRepositoryItems.length = 0
    mockRepositoryVersions.length = 0
    mockReportRuns.length = 0

    mockModels.Fund.findByPk.mockResolvedValue({ id: "fund-1" })
    mockModels.ReportingProject.create.mockImplementation(async (values) => {
      const project = makeProject(values)
      mockProjects.push(project)
      return project
    })
    mockModels.ReportingProject.findOne.mockImplementation(async ({ where }) => {
      return mockProjects.find((project) => matchesWhere(project, where)) || null
    })
    mockModels.ReportingProject.findAll.mockImplementation(async ({ where }) => {
      return mockProjects.filter((project) => matchesWhere(project, where))
    })
    mockModels.ReportingProject.update.mockImplementation(async (values, { where }) => {
      mockProjects.filter((project) => matchesWhere(project, where)).forEach((project) => Object.assign(project, values))
      return [1]
    })
    mockModels.ReportingProjectSource.create.mockImplementation(async (values) => {
      const source = makeSource(values)
      mockSources.push(source)
      return source
    })
    mockModels.ReportingProjectSource.findOne.mockImplementation(async ({ where }) => {
      return mockSources.find((source) => matchesWhere(source, where)) || null
    })
    mockModels.CashFlowTemplate.findOne.mockImplementation(async ({ where }) => {
      return mockTemplates.find((template) => matchesWhere(template, where)) || null
    })
    mockModels.TemplateVersion.findOne.mockImplementation(async ({ where }) => {
      return mockTemplateVersions.find((version) => matchesWhere(version, where)) || null
    })
    mockModels.FundRepositoryVersion.findOne.mockImplementation(async ({ where, include }) => {
      const version = mockRepositoryVersions.find((entry) => matchesWhere(entry, where))
      if (!version) return null
      const item = mockRepositoryItems.find((entry) => entry.id === version.item_id)
      const expectedItem = include?.[0]?.where || {}
      if (!item || !matchesWhere(item, expectedItem)) return null
      return makeRepositoryVersion({ ...plain(version), item: plain(item) })
    })
    mockModels.ReportRun.findOne.mockImplementation(async ({ where }) => {
      return mockReportRuns.find((run) => matchesWhere(run, where)) || null
    })
    mockAuditLogEvent.mockResolvedValue({ id: "audit-1" })
    mockEvaluateReadinessForConfig.mockReturnValue({ can_activate: true, review_state: "ready", required_anchors: [] })
  })

  test("creates a draft reporting project and records audit context", async () => {
    const project = await ReportingProjectService.createProject({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "Q1 Cash Flow",
        report_type: "cash_flow",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
      },
    })

    expect(project.id).toBe("project-1")
    expect(project.status).toBe("draft")
    expect(project.report_type).toBe("cash_flow")
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "reporting_project_created",
        entityType: "reporting_project",
      }),
    )
  })

  test("records a selected template as a project source during creation", async () => {
    mockTemplates.push({
      id: "template-1",
      portfolio_id: "fund-1",
      active_version_id: "template-version-1",
      config_json: { version: 3 },
    })
    mockTemplateVersions.push({
      id: "template-version-1",
      template_id: "template-1",
      portfolio_id: "fund-1",
      source_file_name: "cash-flow.xlsx",
      source_file_sha256: "templatehash",
      config_json: { version: 3 },
    })

    const project = await ReportingProjectService.createProject({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "Template-backed project",
        template_id: "template-1",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
      },
    })

    expect(project.sources).toHaveLength(1)
    expect(project.sources[0]).toEqual(
      expect.objectContaining({ source_role: "template", template_version_id: "template-version-1" }),
    )
  })

  test("rejects non-draft creation and partial periods", async () => {
    await expect(
      ReportingProjectService.createProject({
        fundId: "fund-1",
        fields: { name: "Final report", status: "approved" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    await expect(
      ReportingProjectService.createProject({
        fundId: "fund-1",
        fields: { name: "Partial period", period_start: "2026-01-01" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test("attaches fund-owned repository versions without exposing storage paths", async () => {
    const project = await ReportingProjectService.createProject({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: { name: "Q1 Cash Flow", period_start: "2026-01-01", period_end: "2026-03-31" },
    })
    mockRepositoryItems.push({
      id: "item-tb",
      portfolio_id: "fund-1",
      kind: "dataset",
      category: "trial_balance",
      is_archived: false,
    })
    mockRepositoryVersions.push({
      id: "version-tb",
      item_id: "item-tb",
      original_file_name: "tb.xlsx",
      sha256: "abc123",
      storage_path: "/private/tb.xlsx",
      is_archived: false,
    })

    const result = await ReportingProjectService.attachSource({
      fundId: "fund-1",
      projectId: project.id,
      actorId: "admin-1",
      fields: {
        source_role: "trial_balance",
        repository_version_id: "version-tb",
      },
    })

    expect(result.source.repository_version_id).toBe("version-tb")
    expect(result.source.repositoryVersion.storage_path).toBeUndefined()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "reporting_project_source_attached" }),
    )
  })

  test("attaches a template version and reflects readiness requirements", async () => {
    mockTemplates.push({ id: "template-1", portfolio_id: "fund-1", config_json: { version: 3 } })
    mockTemplateVersions.push({
      id: "template-version-1",
      template_id: "template-1",
      portfolio_id: "fund-1",
      source_file_name: "cash-flow.xlsx",
      source_file_sha256: "templatehash",
      config_json: { version: 3 },
    })
    const project = await ReportingProjectService.createProject({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "Q1 Cash Flow",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
      },
    })

    await ReportingProjectService.attachSource({
      fundId: "fund-1",
      projectId: project.id,
      actorId: "admin-1",
      fields: {
        source_role: "template",
        template_version_id: "template-version-1",
      },
    })

    const readiness = await ReportingProjectService.getProjectReadiness({
      fundId: "fund-1",
      projectId: project.id,
    })

    expect(mockProjects[0].template_version_id).toBe("template-version-1")
    expect(readiness.status).toBe("inputs_missing")
    expect(readiness.missing_source_roles).toEqual(expect.arrayContaining(["trial_balance", "general_ledger"]))
    expect(readiness.readiness_score).toBeGreaterThanOrEqual(0)
    expect(readiness.check_counts.total).toBe(readiness.checks.length)
  })

  test("updates accountability fields and removes an attached source", async () => {
    const project = await ReportingProjectService.createProject({
      fundId: "fund-1",
      actorId: "admin-1",
      fields: {
        name: "Q2 Close",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
      },
    })
    mockSources.push(
      makeSource({
        reporting_project_id: project.id,
        portfolio_id: "fund-1",
        source_role: "supporting_document",
        source_type: "external_reference",
        original_file_name: "support.pdf",
      }),
    )

    const updated = await ReportingProjectService.updateProject({
      fundId: "fund-1",
      projectId: project.id,
      actorId: "admin-1",
      fields: {
        owner_name: "Avery Chen",
        due_date: "2026-07-15",
        status: "inputs_ready",
      },
    })

    expect(updated.status).toBe("inputs_ready")
    expect(updated.metadata_json).toEqual(
      expect.objectContaining({ owner_name: "Avery Chen", due_date: "2026-07-15" }),
    )

    const removed = await ReportingProjectService.removeSource({
      fundId: "fund-1",
      projectId: project.id,
      sourceId: mockSources[0].id,
      actorId: "admin-1",
    })

    expect(removed.sources).toHaveLength(0)
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "reporting_project_source_removed" }),
    )
  })

  test("agent facade blocks approval-shaped payloads", async () => {
    await expect(
      AgentReportingToolService.attachSource(
        {
          fund_id: "fund-1",
          project_id: "project-1",
          source_role: "trial_balance",
          repository_version_id: "version-1",
          status: "approved",
        },
        { agentId: "agent-1", delegatedUserId: "admin-1" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
