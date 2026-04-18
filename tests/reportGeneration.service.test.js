const mockTemplateVersionFindByPk = jest.fn()
const mockTemplateFindByPk = jest.fn()
const mockTemplateRowFindAll = jest.fn()
const mockTemplateRowMappingFindAll = jest.fn()
const mockReportRunCreate = jest.fn()
const mockReportRunFindByPk = jest.fn()
const mockReportRunRowBulkCreate = jest.fn()
const mockReportRunRowFindAll = jest.fn()
const mockAccountSemanticMappingFindAll = jest.fn()
const mockJournalLineFindAll = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockValidateReportRun = jest.fn()
const mockGetLatestValidationForRun = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: jest.fn(async (callback) => callback({})),
  },
  TemplateVersion: {
    findByPk: (...args) => mockTemplateVersionFindByPk(...args),
  },
  Template: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
  },
  CashFlowTemplate: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
  },
  TemplateRow: {
    findAll: (...args) => mockTemplateRowFindAll(...args),
  },
  TemplateRowSemanticMapping: {
    findAll: (...args) => mockTemplateRowMappingFindAll(...args),
  },
  ReportRun: {
    create: (...args) => mockReportRunCreate(...args),
    findByPk: (...args) => mockReportRunFindByPk(...args),
  },
  ReportRunRow: {
    bulkCreate: (...args) => mockReportRunRowBulkCreate(...args),
    findAll: (...args) => mockReportRunRowFindAll(...args),
  },
  AccountSemanticMapping: {
    findAll: (...args) => mockAccountSemanticMappingFindAll(...args),
  },
  JournalLine: {
    findAll: (...args) => mockJournalLineFindAll(...args),
  },
  GLAccount: {},
  JournalEntry: {},
  Account: {},
  SemanticConcept: {},
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

jest.mock("../src/modules/reports/services/validationEngine.service", () => ({
  ValidationEngineService: {
    validateReportRun: (...args) => mockValidateReportRun(...args),
  },
}))

jest.mock("../src/modules/reports/services/validationResult.service", () => ({
  getLatestForRun: (...args) => mockGetLatestValidationForRun(...args),
}))

const { ReportGenerationService } = require("../src/modules/reports/services/reportGeneration.service")

function createRunRecord(overrides = {}) {
  return {
    id: "report-run-1",
    type: "cash_flow",
    portfolio_id: "fund-1",
    template_version_id: "template-version-1",
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    status: "pending",
    summary_json: null,
    inputs_json: {},
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        type: this.type,
        portfolio_id: this.portfolio_id,
        template_version_id: this.template_version_id,
        period_start: this.period_start,
        period_end: this.period_end,
        status: this.status,
        summary_json: this.summary_json,
        inputs_json: this.inputs_json,
      }
    },
    ...overrides,
  }
}

describe("ReportGenerationService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTemplateVersionFindByPk.mockResolvedValue({
      id: "template-version-1",
      template_id: "template-1",
      portfolio_id: "fund-1",
      version_label: "v1",
      parsed_structure_json: {
        workbookMetadata: {
          worksheetCount: 1,
        },
      },
    })
    mockTemplateFindByPk.mockResolvedValue({
      id: "template-1",
      portfolio_id: "fund-1",
      name: "Cash Flow Template",
    })
    mockReportRunCreate.mockResolvedValue(createRunRecord())
    mockReportRunFindByPk.mockResolvedValue(createRunRecord({ readiness_status: "ready_with_warnings" }))
    mockReportRunRowBulkCreate.mockResolvedValue([])
    mockAuditLogEvent.mockResolvedValue(null)
    mockValidateReportRun.mockResolvedValue({
      reportRun: {
        id: "report-run-1",
        status: "completed_with_unresolved_rows",
        readinessStatus: "ready_with_warnings",
      },
      validationResult: {
        id: "validation-1",
        overallStatus: "warning",
        readinessStatus: "ready_with_warnings",
      },
      checks: [],
    })
    mockGetLatestValidationForRun.mockResolvedValue(null)
  })

  test("generates a deterministic report from approved mappings while preserving row order and structure", async () => {
    mockTemplateRowFindAll.mockResolvedValue([
      {
        id: "row-1",
        template_version_id: "template-version-1",
        row_order: 1,
        row_index: 1,
        row_type: "section_header",
        label: "Operating Activities",
        section_name: "Operating Activities",
      },
      {
        id: "row-2",
        template_version_id: "template-version-1",
        row_order: 2,
        row_index: 2,
        row_type: "data_row",
        label: "Management Fees",
        section_name: "Operating Activities",
      },
      {
        id: "row-3",
        template_version_id: "template-version-1",
        row_order: 3,
        row_index: 3,
        row_type: "data_row",
        label: "Other Expenses",
        section_name: "Operating Activities",
      },
      {
        id: "row-4",
        template_version_id: "template-version-1",
        row_order: 4,
        row_index: 4,
        row_type: "formula_row",
        label: "Total Expenses",
        section_name: "Operating Activities",
        is_formula: true,
        formula_text: "SUM(B2:B3)",
      },
    ])

    mockTemplateRowMappingFindAll.mockResolvedValue([
      {
        id: "row-mapping-1",
        template_version_id: "template-version-1",
        template_row_id: "row-2",
        semantic_concept_id: "concept-management-fees",
        status: "approved",
        source: "review_approved",
        approved_at: "2026-04-15T00:00:00.000Z",
        semanticConcept: {
          stable_key: "management_fees",
          label: "Management Fees",
        },
      },
    ])

    mockAccountSemanticMappingFindAll.mockResolvedValue([
      {
        id: "account-mapping-1",
        semantic_concept_id: "concept-management-fees",
        account: {
          id: "account-1",
          code: "6100",
          name: "Management Fees",
          normalized_name: "management fees",
        },
        semanticConcept: {
          stable_key: "management_fees",
          label: "Management Fees",
        },
      },
    ])

    mockJournalLineFindAll.mockResolvedValue([
      {
        id: "line-1",
        debit: 12345.67,
        credit: 0,
        currency: "USD",
        entry: {
          id: "entry-1",
        },
        account: {
          id: "gl-1",
          code: "6100",
          name: "Management Fees",
          type: "expense",
        },
      },
    ])

    const result = await ReportGenerationService.generateReport({
      templateVersionId: "template-version-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      actorId: "admin-1",
    })

    expect(result.reportRun.status).toBe("completed_with_unresolved_rows")
    expect(result.reportRun.readinessStatus).toBe("ready_with_warnings")
    expect(result.validationResult.overallStatus).toBe("warning")
    expect(result.rows.map((row) => row.templateRowId)).toEqual(["row-1", "row-2", "row-3", "row-4"])
    expect(result.rows[0].resolutionStatus).toBe("section_header")
    expect(result.rows[1].resolutionStatus).toBe("resolved")
    expect(result.rows[1].semanticConceptKey).toBe("management_fees")
    expect(result.rows[1].value).toBe(12345.67)
    expect(result.rows[2].resolutionStatus).toBe("unresolved_no_approved_mapping")
    expect(result.rows[3].resolutionStatus).toBe("formula_not_computed")
    expect(result.summary.resolvedRows).toBe(1)
    expect(result.summary.unresolvedRows).toBe(2)
    expect(mockReportRunCreate).toHaveBeenCalled()
    expect(mockValidateReportRun).toHaveBeenCalledWith({
      runId: "report-run-1",
      actorId: "admin-1",
    })
    expect(mockReportRunRowBulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          template_row_id: "row-2",
          resolution_status: "resolved",
          value_source: "approved_mapping",
        }),
      ]),
      expect.any(Object),
    )
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "report_generation_requested" }))
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "report_generated" }))
  })

  test("marks rows as partially grounded when approved source mappings are incomplete", async () => {
    mockTemplateRowFindAll.mockResolvedValue([
      {
        id: "row-10",
        template_version_id: "template-version-1",
        row_order: 1,
        row_index: 1,
        row_type: "data_row",
        label: "Subscriptions",
        section_name: "Financing Activities",
      },
    ])

    mockTemplateRowMappingFindAll.mockResolvedValue([
      {
        id: "row-mapping-10",
        template_version_id: "template-version-1",
        template_row_id: "row-10",
        semantic_concept_id: "concept-subscriptions",
        status: "approved",
        source: "review_approved",
        approved_at: "2026-04-15T00:00:00.000Z",
        semanticConcept: {
          stable_key: "subscriptions",
          label: "Subscriptions",
        },
      },
    ])

    mockAccountSemanticMappingFindAll.mockResolvedValue([
      {
        id: "account-mapping-10",
        semantic_concept_id: "concept-subscriptions",
        account: {
          id: "account-10",
          code: "3000",
          name: "Investor Subscriptions",
          normalized_name: "investor subscriptions",
        },
        semanticConcept: {
          stable_key: "subscriptions",
          label: "Subscriptions",
        },
      },
      {
        id: "account-mapping-11",
        semantic_concept_id: "concept-subscriptions",
        account: {
          id: "account-11",
          code: "3001",
          name: "Additional Subscriptions",
          normalized_name: "additional subscriptions",
        },
        semanticConcept: {
          stable_key: "subscriptions",
          label: "Subscriptions",
        },
      },
    ])

    mockJournalLineFindAll.mockResolvedValue([
      {
        id: "line-10",
        debit: 0,
        credit: 5000,
        currency: "USD",
        entry: {
          id: "entry-10",
        },
        account: {
          id: "gl-10",
          code: "3000",
          name: "Investor Subscriptions",
          type: "equity",
        },
      },
    ])

    const result = await ReportGenerationService.generateReport({
      templateVersionId: "template-version-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      actorId: "admin-1",
    })

    expect(result.rows[0].resolutionStatus).toBe("unresolved_partial_grounding")
    expect(result.rows[0].value).toBe(5000)
    expect(result.rows[0].metadata.reviewRequired).toBe(true)
    expect(result.summary.partialGroundingCount).toBe(1)
  })
})
