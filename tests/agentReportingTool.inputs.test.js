const mockRequireFund = jest.fn()
const mockFindRepositoryItems = jest.fn()
const mockFindTemplates = jest.fn()

jest.mock("../src/models", () => ({
  Account: {},
  AccountSemanticMapping: {},
  AuditLog: {},
  CashFlowTemplate: {
    findAll: (...args) => mockFindTemplates(...args),
  },
  FundRepositoryItem: {
    findAll: (...args) => mockFindRepositoryItems(...args),
  },
  FundRepositoryVersion: {},
  ReportLineage: {},
  ReportRun: {},
  ReportRunRow: {},
  ReportingProject: {},
  Template: {
    findAll: (...args) => mockFindTemplates(...args),
  },
  TemplateVersion: {},
}))

jest.mock("../src/modules/reporting-projects/services/reportingProject.service", () => ({
  requireFund: (...args) => mockRequireFund(...args),
}))

jest.mock("../src/modules/reports/services/reportExport.service", () => ({}))
jest.mock("../src/modules/reports/services/reportGeneration.service", () => ({
  ReportGenerationService: {},
}))
jest.mock("../src/modules/reports/services/validationEngine.service", () => ({
  ValidationEngineService: {},
}))
jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => ({}))
jest.mock("../src/modules/repository/services/repositoryAnalysis.service", () => ({}))
jest.mock("../src/modules/reviews/services/reviewTask.service", () => ({}))
jest.mock("../src/modules/templates/services/templateParsing.service", () => ({}))

const AgentReportingToolService = require("../src/modules/reporting-projects/services/agentReportingTool.service")

function record(payload) {
  return {
    toJSON: () => payload,
  }
}

describe("AgentReportingToolService list_reporting_inputs", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireFund.mockResolvedValue({ id: "fund-1" })
    mockFindRepositoryItems.mockResolvedValue([
      record({
        id: "item-tb",
        portfolio_id: "fund-1",
        kind: "dataset",
        category: "trial_balance",
        title: "2026 Trial Balance",
        description: "Synthetic TB fixture",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        current_version_id: "tb-version-1",
        storage_path: "C:\\private\\uploads\\tb.xlsx",
        tags_json: ["synthetic", "oracle"],
        is_archived: false,
        currentVersion: {
          id: "tb-version-1",
          item_id: "item-tb",
          version_number: 1,
          original_file_name: "trial-balance-2026.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          extension: ".xlsx",
          file_size: 12345,
          storage_path: "C:\\private\\uploads\\tb-v1.xlsx",
          sha256: "tb-sha",
          is_archived: false,
        },
      }),
      record({
        id: "item-gl",
        portfolio_id: "fund-1",
        kind: "dataset",
        category: "general_ledger",
        title: "2026 General Ledger",
        current_version_id: "gl-version-1",
        currentVersion: {
          id: "gl-version-1",
          item_id: "item-gl",
          original_file_name: "general-ledger-2026.xlsx",
          storage_path: "/var/private/gl-v1.xlsx",
          is_archived: false,
        },
      }),
      record({
        id: "item-lpa",
        portfolio_id: "fund-1",
        kind: "document",
        category: "lpa",
        title: "Synthetic LPA",
        current_version_id: "lpa-version-1",
        currentVersion: {
          id: "lpa-version-1",
          item_id: "item-lpa",
          original_file_name: "lpa.pdf",
          storage_path: "/var/private/lpa.pdf",
          is_archived: false,
        },
      }),
    ])
    mockFindTemplates.mockResolvedValue([
      record({
        id: "template-1",
        portfolio_id: "fund-1",
        name: "Direct Cash Flow Template",
        version: "2026.1",
        template_kind: "cash_flow",
        status: "active",
        template_file_name: "cash-flow-template.xlsx",
        template_file_path: "C:\\private\\templates\\cash-flow-template.xlsx",
        is_active: true,
        active_version_id: "template-version-1",
        activeVersion: {
          id: "template-version-1",
          template_id: "template-1",
          portfolio_id: "fund-1",
          version_number: 1,
          version_label: "2026",
          source_file_name: "cash-flow-template.xlsx",
          source_file_path: "/var/private/templates/template-v1.xlsx",
          source_file_sha256: "template-sha",
          schema_hash: "schema-sha",
        },
      }),
    ])
  })

  test("returns public fund inputs without storage paths", async () => {
    const result = await AgentReportingToolService.dispatch("list_reporting_inputs", { fund_id: "fund-1" })

    expect(mockRequireFund).toHaveBeenCalledWith("fund-1")
    expect(mockFindRepositoryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { portfolio_id: "fund-1", is_archived: false },
      }),
    )
    expect(mockFindTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { portfolio_id: "fund-1" },
      }),
    )
    expect(result.repository.trialBalances).toHaveLength(1)
    expect(result.repository.generalLedgers[0]).toEqual(
      expect.objectContaining({
        title: "2026 General Ledger",
        currentVersionId: "gl-version-1",
      }),
    )
    expect(result.repository.lpas[0].currentVersion.id).toBe("lpa-version-1")
    expect(result.activeTemplates).toEqual([
      expect.objectContaining({
        id: "template-1",
        activeVersionId: "template-version-1",
        activeVersion: expect.objectContaining({
          id: "template-version-1",
          sourceFileName: "cash-flow-template.xlsx",
        }),
      }),
    ])
    expect(result.controls).toEqual({
      storagePathsExposed: false,
      finalExportRequiresHumanApproval: true,
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("storage_path")
    expect(serialized).not.toContain("source_file_path")
    expect(serialized).not.toContain("template_file_path")
    expect(serialized).not.toContain("C:\\private")
    expect(serialized).not.toContain("/var/private")
  })
})
