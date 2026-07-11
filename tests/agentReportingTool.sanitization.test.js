const mockParseTemplateVersion = jest.fn()

jest.mock("../src/models", () => ({
  Account: {},
  AccountSemanticMapping: {},
  AuditLog: {},
  CashFlowTemplate: {},
  FundRepositoryItem: {},
  FundRepositoryVersion: {},
  ReportLineage: {},
  ReportRun: {},
  ReportRunRow: {},
  ReportingProject: {},
  Template: {},
  TemplateVersion: {
    findOne: jest.fn(async () => ({
      id: "template-version-1",
      template_id: "template-1",
      portfolio_id: "fund-1",
    })),
  },
}))

jest.mock("../src/modules/templates/services/templateParsing.service", () => ({
  parseTemplateVersion: (...args) => mockParseTemplateVersion(...args),
}))

jest.mock("../src/modules/reporting-projects/services/reportingProject.service", () => ({}))
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

const AgentReportingToolService = require("../src/modules/reporting-projects/services/agentReportingTool.service")

describe("AgentReportingToolService output sanitization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockParseTemplateVersion.mockResolvedValue({
      template: {
        id: "template-1",
        template_file_path: "C:\\private\\templates\\template.xlsx",
        template_file_name: "template.xlsx",
      },
      version: {
        id: "template-version-1",
        source_file_path: "/var/private/templates/template-version.xlsx",
        source_file_name: "template.xlsx",
      },
      parseMetadata: {
        source_file_name: "template.xlsx",
        source_file_path: "C:\\private\\templates\\template.xlsx",
      },
      persistedRowCount: 3,
    })
  })

  test("redacts template storage paths from agent tool results", async () => {
    const result = await AgentReportingToolService.dispatch(
      "analyze_template",
      {
        fund_id: "fund-1",
        template_version_id: "template-version-1",
      },
      { delegatedUserId: "admin-1" },
    )

    expect(result.template).toEqual({
      id: "template-1",
      template_file_name: "template.xlsx",
    })
    expect(result.version).toEqual({
      id: "template-version-1",
      source_file_name: "template.xlsx",
    })
    expect(result.parseMetadata).toEqual({
      source_file_name: "template.xlsx",
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("template_file_path")
    expect(serialized).not.toContain("source_file_path")
    expect(serialized).not.toContain("C:\\private")
    expect(serialized).not.toContain("/var/private")
  })
})
