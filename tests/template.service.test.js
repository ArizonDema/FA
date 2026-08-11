const mockTemplateFindByPk = jest.fn()
const mockTemplateUpdateAll = jest.fn()
const mockTemplateCreate = jest.fn()
const mockTemplateVersionMax = jest.fn()
const mockTemplateVersionCreate = jest.fn()
const mockPersistVersionStructure = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: jest.fn(async (callback) => callback({})),
  },
  Template: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
    update: (...args) => mockTemplateUpdateAll(...args),
    create: (...args) => mockTemplateCreate(...args),
  },
  CashFlowTemplate: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
    update: (...args) => mockTemplateUpdateAll(...args),
    create: (...args) => mockTemplateCreate(...args),
  },
  TemplateVersion: {
    max: (...args) => mockTemplateVersionMax(...args),
    create: (...args) => mockTemplateVersionCreate(...args),
    findByPk: jest.fn(),
  },
  CashFlowTemplateAnalysis: {
    update: jest.fn(),
  },
}))

jest.mock("../src/services/cashFlow.service", () => ({
  CashFlowValidationError: class CashFlowValidationError extends Error {},
  ensureV3TemplateConfig: jest.fn(async ({ templateConfig }) => templateConfig),
  validateTemplateConfig: jest.fn((config) => config),
}))

jest.mock("../src/modules/templates/services/templateAnalysis.service", () => ({
  parseConfigJson: jest.fn((value) => value),
  createAnalysisRecord: jest.fn(),
}))

jest.mock("../src/modules/templates/services/templateParsing.service", () => ({
  persistVersionStructure: (...args) => mockPersistVersionStructure(...args),
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const TemplateService = require("../src/modules/templates/services/template.service")

function createTemplateRecord(overrides = {}) {
  return {
    id: "template-1",
    portfolio_id: "fund-1",
    version: "v1",
    template_file_name: "template.xlsx",
    template_file_path: "C:\\temp\\template.xlsx",
    config_json: {
      sheet_name: "Cash Flow",
      buckets: [{ bucket_key: "ops_inflow", label: "Ops Inflow", direction: "inflow" }],
    },
    is_active: true,
    active_version_id: "version-1",
    activeVersion: {
      id: "version-1",
      source_file_name: "template.xlsx",
      source_file_path: "C:\\temp\\template.xlsx",
      source_file_sha256: "sha-1",
      config_json: {
        sheet_name: "Cash Flow",
        buckets: [{ bucket_key: "ops_inflow", label: "Ops Inflow", direction: "inflow" }],
      },
      raw_structure_json: { worksheets: [] },
      llm_meta_json: { provider: "ollama" },
    },
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        portfolio_id: this.portfolio_id,
        version: this.version,
        active_version_id: this.active_version_id,
      }
    },
    ...overrides,
  }
}

function readyCasConfig() {
  const statementFields = [
    "fund_name", "investor_name", "share_class", "period_start", "period_end",
    "beginning_capital", "contributions", "distributions", "ending_capital",
    "commitment_amount", "called_capital", "paid_capital", "unfunded_commitment",
  ]
  return {
    version: "cas_v1",
    summary: {
      sheet_name: "Summary",
      scalar_bindings: { fund_name: "B1", period_start: "B2", period_end: "B3" },
      table: {
        data_start_row: 5,
        columns: {
          investor_name: "A", share_class: "B", beginning_capital: "C", contributions: "D",
          distributions: "E", ending_capital: "F", unfunded_commitment: "G",
        },
      },
    },
    statement: {
      prototype_sheet_name: "Prototype",
      scalar_bindings: Object.fromEntries(statementFields.map((field, index) => [field, `B${index + 1}`])),
      activity_table: { data_start_row: 20, columns: { date: "A", type: "B", amount: "C" } },
    },
  }
}

describe("TemplateService", () => {
  beforeEach(() => {
    mockTemplateFindByPk.mockReset()
    mockTemplateUpdateAll.mockReset()
    mockTemplateCreate.mockReset()
    mockTemplateVersionMax.mockReset()
    mockTemplateVersionCreate.mockReset()
    mockPersistVersionStructure.mockReset()
    mockAuditLogEvent.mockReset()
  })

  test("creates a new template version when config changes", async () => {
    const template = createTemplateRecord()
    mockTemplateFindByPk.mockResolvedValue(template)
    mockTemplateVersionMax.mockResolvedValue(1)
    mockTemplateVersionCreate.mockResolvedValue({
      id: "version-2",
      version_label: "v2",
      toJSON: () => ({ id: "version-2" }),
    })
    mockTemplateUpdateAll.mockResolvedValue([1])
    mockPersistVersionStructure.mockResolvedValue({
      normalizedStructure: { sheets: [] },
      parseMetadata: {},
      persistedRowCount: 0,
    })
    mockAuditLogEvent.mockResolvedValue(null)

    const updated = await TemplateService.updateTemplate({
      templateId: "template-1",
      updates: {
        version: "v2",
        config_json: {
          sheet_name: "Updated Cash Flow",
          buckets: [{ bucket_key: "ops_inflow", label: "Ops Inflow", direction: "inflow" }],
        },
        is_active: true,
      },
      actorId: "admin-1",
    })

    expect(mockTemplateVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: "template-1",
        version_number: 2,
        version_label: "v2",
      }),
      expect.any(Object),
    )
    expect(template.update).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v2",
        active_version_id: "version-2",
      }),
      expect.any(Object),
    )
    expect(updated.template.active_version_id).toBe("version-2")
    expect(updated.can_activate).toBeUndefined()
    expect(updated.readiness.can_activate).toBe(true)
  })

  test("saves active template edits as a separate draft replacement", async () => {
    const template = createTemplateRecord()
    const draft = createTemplateRecord({
      id: "template-draft",
      is_active: false,
      status: "draft",
    })
    mockTemplateFindByPk.mockResolvedValue(template)
    mockTemplateCreate.mockResolvedValue(draft)
    mockTemplateVersionMax.mockResolvedValue(0)
    mockTemplateVersionCreate.mockResolvedValue({
      id: "version-draft",
      version_label: "draft-v1",
      toJSON: () => ({ id: "version-draft" }),
    })
    mockPersistVersionStructure.mockResolvedValue({
      normalizedStructure: { sheets: [] },
      parseMetadata: {},
      persistedRowCount: 0,
    })
    mockAuditLogEvent.mockResolvedValue(null)

    const updated = await TemplateService.updateTemplate({
      templateId: "template-1",
      updates: {
        version: "draft-v1",
        activation_mode: "draft",
        is_active: false,
        config_json: {
          sheet_name: "Updated Cash Flow",
          buckets: [{ bucket_key: "ops_inflow", label: "Ops Inflow", direction: "inflow" }],
        },
      },
      actorId: "admin-1",
    })

    expect(mockTemplateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        is_active: false,
      }),
      expect.any(Object),
    )
    expect(template.update).not.toHaveBeenCalled()
    expect(updated.template.id).toBe("template-draft")
    expect(updated.savedAsDraft).toBe(true)
  })

  test("activating CAS deactivates only the CAS slot", async () => {
    const casConfig = readyCasConfig()
    const template = createTemplateRecord({
      template_kind: "capital_account_statement",
      is_active: false,
      status: "draft",
      config_json: casConfig,
      activeVersion: {
        id: "cas-version-1",
        config_json: casConfig,
        source_file_name: "cas.xlsx",
        source_file_path: "C:\\temp\\cas.xlsx",
      },
    })
    mockTemplateFindByPk.mockResolvedValue(template)

    await TemplateService.activateTemplate({
      templateId: template.id,
      templateKind: "capital_account_statement",
      actorId: "admin-1",
    })

    expect(mockTemplateUpdateAll).toHaveBeenCalledWith(
      { is_active: false, status: "draft" },
      expect.objectContaining({
        where: {
          portfolio_id: "fund-1",
          template_kind: "capital_account_statement",
          is_active: true,
        },
      }),
    )
    expect(template.update).toHaveBeenCalledWith(
      { is_active: true, status: "active" },
      expect.any(Object),
    )
  })

  test("rejects a template identity requested through the wrong kind", async () => {
    mockTemplateFindByPk.mockResolvedValue(createTemplateRecord({ template_kind: "capital_account_statement" }))
    await expect(TemplateService.getTemplate("template-1", "cash_flow")).resolves.toBeNull()
  })
})
