const mockReportingProjectUpdate = jest.fn()
const mockGetProject = jest.fn()
const mockAttachSource = jest.fn()
const mockRunCashFlowReport = jest.fn()
const mockValidateReportRun = jest.fn()
const mockGenerateReport = jest.fn()

jest.mock("../src/models", () => ({
  Account: {},
  AccountSemanticMapping: {},
  AuditLog: {},
  ReportLineage: {},
  ReportRun: {},
  ReportRunRow: {},
  ReportingProject: {
    update: (...args) => mockReportingProjectUpdate(...args),
  },
  TemplateVersion: {},
}))

jest.mock("../src/modules/reporting-projects/services/reportingProject.service", () => ({
  getProject: (...args) => mockGetProject(...args),
  attachSource: (...args) => mockAttachSource(...args),
}))

jest.mock("../src/modules/reports/cash-flow/cashFlowReport.service", () => ({
  runReport: (...args) => mockRunCashFlowReport(...args),
}))

jest.mock("../src/modules/reports/services/validationEngine.service", () => ({
  ValidationEngineService: {
    validateReportRun: (...args) => mockValidateReportRun(...args),
  },
}))

jest.mock("../src/modules/reports/services/reportGeneration.service", () => ({
  ReportGenerationService: {
    generateReport: (...args) => mockGenerateReport(...args),
  },
}))

jest.mock("../src/modules/reports/services/reportExport.service", () => ({}))
jest.mock("../src/modules/mappings/services/mappingSuggestion.service", () => ({}))
jest.mock("../src/modules/repository/services/repositoryAnalysis.service", () => ({}))
jest.mock("../src/modules/reviews/services/reviewTask.service", () => ({}))
jest.mock("../src/modules/templates/services/templateParsing.service", () => ({}))

const AgentReportingToolService = require("../src/modules/reporting-projects/services/agentReportingTool.service")

describe("AgentReportingToolService workbook run_report", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProject.mockResolvedValue({
      id: "project-1",
      portfolio_id: "fund-1",
      template_id: "template-1",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      sources: [
        {
          id: "source-tb",
          source_role: "trial_balance",
          status: "attached",
          repository_version_id: "tb-version-1",
        },
        {
          id: "source-gl",
          source_role: "general_ledger",
          status: "attached",
          repository_version_id: "gl-version-1",
        },
      ],
    })
    mockRunCashFlowReport.mockResolvedValue({
      run: {
        id: "run-1",
        output_paths: { xlsx: true },
      },
      outputs: { xlsx: true },
      preview: { rows: [] },
    })
    mockValidateReportRun.mockResolvedValue({
      validationResult: { id: "validation-1", readinessStatus: "ready" },
      checks: [],
    })
    mockAttachSource.mockResolvedValue({ source: { id: "draft-source" } })
    mockReportingProjectUpdate.mockResolvedValue([1])
    mockGenerateReport.mockResolvedValue({
      reportRun: { id: "row-run-1", status: "completed" },
    })
  })

  test("routes run_report to the cash-flow workbook extractor when xlsx output is requested", async () => {
    const result = await AgentReportingToolService.dispatch(
      "run_report",
      {
        fund_id: "fund-1",
        project_id: "project-1",
        output_format: "xlsx",
      },
      { agentId: "agent-1", delegatedUserId: "admin-1", invocationId: "invocation-1" },
    )

    expect(result.generationMode).toBe("cash_flow_extractor")
    expect(result.draftWorkbook).toEqual({
      xlsxAvailable: true,
      finalExportRequiresHumanApproval: true,
    })
    expect(result.validationResult.readinessStatus).toBe("ready")
    expect(mockRunCashFlowReport).toHaveBeenCalledWith({
      fundId: "fund-1",
      templateId: "template-1",
      actorId: "admin-1",
      rangeInput: {
        dateStart: "2026-01-01",
        dateEnd: "2026-03-31",
        preset: null,
        fiscalYear: null,
      },
      tbRepositoryVersionId: "tb-version-1",
      glRepositoryVersionId: "gl-version-1",
      saveUploadsToRepository: false,
    })
    expect(mockValidateReportRun).toHaveBeenCalledWith({ runId: "run-1", actorId: "admin-1" })
    expect(mockReportingProjectUpdate).toHaveBeenCalledWith(
      { current_report_run_id: "run-1" },
      { where: { id: "project-1", portfolio_id: "fund-1" } },
    )
    expect(mockAttachSource).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        projectId: "project-1",
        actorId: "admin-1",
        fields: expect.objectContaining({
          source_role: "draft_report",
          source_type: "report_run",
          report_run_id: "run-1",
        }),
      }),
    )
  })

  test("supports direct repository version inputs without a reporting project", async () => {
    await AgentReportingToolService.dispatch(
      "run_report",
      {
        fund_id: "fund-1",
        engine: "cash_flow_extractor",
        date_start: "2026-01-01",
        date_end: "2026-03-31",
        template_id: "template-1",
        tb_repository_version_id: "tb-version-1",
        gl_repository_version_id: "gl-version-1",
        run_validation: false,
      },
      { delegatedUserId: "admin-1" },
    )

    expect(mockGetProject).not.toHaveBeenCalled()
    expect(mockRunCashFlowReport).toHaveBeenCalledWith(
      expect.objectContaining({
        tbRepositoryVersionId: "tb-version-1",
        glRepositoryVersionId: "gl-version-1",
      }),
    )
    expect(mockValidateReportRun).not.toHaveBeenCalled()
  })

  test("runs the dedicated draft cash-flow extraction tool with tool-specific lineage metadata", async () => {
    const result = await AgentReportingToolService.dispatch(
      "run_cash_flow_extraction",
      {
        fund_id: "fund-1",
        project_id: "project-1",
      },
      { agentId: "agent-1", delegatedUserId: "admin-1", invocationId: "invocation-1" },
    )

    expect(result.generationMode).toBe("cash_flow_extractor")
    expect(result.outputFormat).toBe("xlsx")
    expect(result.draftWorkbook.finalExportRequiresHumanApproval).toBe(true)
    expect(mockRunCashFlowReport).toHaveBeenCalledWith({
      fundId: "fund-1",
      templateId: "template-1",
      actorId: "admin-1",
      rangeInput: {
        dateStart: "2026-01-01",
        dateEnd: "2026-03-31",
        preset: null,
        fiscalYear: null,
      },
      tbRepositoryVersionId: "tb-version-1",
      glRepositoryVersionId: "gl-version-1",
      saveUploadsToRepository: false,
    })
    expect(mockAttachSource).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({
          metadata_json: expect.objectContaining({
            agent_context: expect.objectContaining({
              tool_name: "run_cash_flow_extraction",
              generation_mode: "cash_flow_extractor",
            }),
          }),
        }),
      }),
    )
  })

  test("redacts extractor filesystem paths from dedicated MCP tool output", async () => {
    mockRunCashFlowReport.mockResolvedValueOnce({
      run: {
        id: "run-1",
        output_paths: { xlsx: "C:\\private\\runs\\cash_flow_output.xlsx" },
        output_artifacts_json: { xlsx: "/var/private/runs/cash_flow_output.xlsx" },
        input_artifacts_json: {
          trial_balance: {
            file_path: "C:\\private\\inputs\\tb.xlsx",
            original_file_name: "trial_balance.xlsx",
          },
          general_ledger: {
            storage_path: "/var/private/inputs/gl.xlsx",
            original_file_name: "general_ledger.xlsx",
          },
        },
      },
      outputs: { xlsx: "C:\\private\\runs\\cash_flow_output.xlsx" },
      outputFilePath: "C:\\private\\runs\\cash_flow_output.xlsx",
      preview: { totals: { net_cash_flow: 42 } },
    })

    const result = await AgentReportingToolService.dispatch(
      "run_cash_flow_extraction",
      {
        fund_id: "fund-1",
        template_id: "template-1",
        date_start: "2026-01-01",
        date_end: "2026-03-31",
        tb_repository_version_id: "tb-version-1",
        gl_repository_version_id: "gl-version-1",
        run_validation: false,
      },
      { delegatedUserId: "admin-1" },
    )

    expect(result.outputs).toEqual({ xlsx: true })
    expect(result.run.output_paths).toEqual({ xlsx: true })
    expect(result.run.output_artifacts_json).toEqual({ xlsx: true })
    expect(result.run.input_artifacts_json.trial_balance).toEqual({
      original_file_name: "trial_balance.xlsx",
    })
    expect(result.run.input_artifacts_json.general_ledger).toEqual({
      original_file_name: "general_ledger.xlsx",
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("outputFilePath")
    expect(serialized).not.toContain("file_path")
    expect(serialized).not.toContain("storage_path")
    expect(serialized).not.toContain("C:\\private")
    expect(serialized).not.toContain("/var/private")
  })

  test("keeps the approved-mapping engine as the default run_report path", async () => {
    await AgentReportingToolService.dispatch(
      "run_report",
      {
        fund_id: "fund-1",
        template_version_id: "template-version-1",
        period_start: "2026-01-01",
        period_end: "2026-03-31",
      },
      { delegatedUserId: "admin-1" },
    )

    expect(mockGenerateReport).toHaveBeenCalledWith({
      templateVersionId: "template-version-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      actorId: "admin-1",
    })
    expect(mockRunCashFlowReport).not.toHaveBeenCalled()
  })

  test("requires TB and GL repository versions for workbook reports", async () => {
    mockGetProject.mockResolvedValueOnce({
      id: "project-1",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      sources: [],
    })

    await expect(
      AgentReportingToolService.dispatch(
        "run_report",
        { fund_id: "fund-1", project_id: "project-1", output_format: "xlsx" },
        { delegatedUserId: "admin-1" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRunCashFlowReport).not.toHaveBeenCalled()
  })
})
