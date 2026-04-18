const mockReportRunFindByPk = jest.fn()
const mockReportRunRowFindAll = jest.fn()
const mockValidationResultCreate = jest.fn()
const mockValidationCheckResultBulkCreate = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockGetLatestValidationForRun = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: jest.fn(async (callback) => callback({})),
  },
  ReportRun: {
    findByPk: (...args) => mockReportRunFindByPk(...args),
  },
  ReportRunRow: {
    findAll: (...args) => mockReportRunRowFindAll(...args),
  },
  TemplateVersion: {},
  ValidationResult: {
    create: (...args) => mockValidationResultCreate(...args),
  },
  ValidationCheckResult: {
    bulkCreate: (...args) => mockValidationCheckResultBulkCreate(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

jest.mock("../src/modules/reports/services/validationResult.service", () => ({
  getLatestForRun: (...args) => mockGetLatestValidationForRun(...args),
}))

const { ValidationEngineService } = require("../src/modules/reports/services/validationEngine.service")

function createRunRecord(overrides = {}) {
  return {
    id: "report-run-1",
    type: "cash_flow",
    portfolio_id: "fund-1",
    template_version_id: "template-version-1",
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    status: "completed",
    readiness_status: null,
    last_validated_at: null,
    inputs_json: {
      generation_mode: "approved_mapping_report_engine",
    },
    summary_json: {
      totalRows: 2,
      resolvedRows: 1,
      unresolvedRows: 0,
      missingMappingsCount: 0,
      partialGroundingCount: 0,
      formulaNotComputedCount: 0,
      statusBreakdown: {
        resolved: 1,
        section_header: 1,
      },
    },
    mapping_snapshot_json: {
      approved_row_mapping_ids: ["row-mapping-1"],
    },
    templateVersion: {
      id: "template-version-1",
      template_id: "template-1",
      portfolio_id: "fund-1",
      version_label: "v1",
    },
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
        readiness_status: this.readiness_status,
        last_validated_at: this.last_validated_at,
        inputs_json: this.inputs_json,
        summary_json: this.summary_json,
        mapping_snapshot_json: this.mapping_snapshot_json,
      }
    },
    ...overrides,
  }
}

function createPersistedValidationRecord(overrides = {}) {
  return {
    id: "validation-1",
    report_run_id: "report-run-1",
    overall_status: "pass",
    readiness_status: "ready",
    summary_json: {
      totalChecks: 10,
      passedChecks: 8,
      warningChecks: 0,
      failedChecks: 0,
      skippedChecks: 2,
    },
    ...overrides,
  }
}

describe("ValidationEngineService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuditLogEvent.mockResolvedValue(null)
    mockValidationCheckResultBulkCreate.mockResolvedValue([])
    mockValidationResultCreate.mockImplementation(async (payload) =>
      createPersistedValidationRecord({
        report_run_id: payload.report_run_id,
        overall_status: payload.overall_status,
        readiness_status: payload.readiness_status,
        summary_json: payload.summary_json,
      }),
    )
    mockGetLatestValidationForRun.mockImplementation(async () => ({
      validationResult: {
        id: "validation-1",
        reportRunId: "report-run-1",
        overallStatus: "pass",
        readinessStatus: "ready",
      },
      checks: [],
    }))
  })

  test("marks a fully grounded report as ready when deterministic checks pass", async () => {
    const runRecord = createRunRecord()
    mockReportRunFindByPk.mockResolvedValue(runRecord)
    mockReportRunRowFindAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: "run-row-1",
          report_run_id: "report-run-1",
          template_row_id: "row-1",
          semantic_concept_id: "concept-1",
          row_order: 1,
          row_label: "Management Fees",
          row_type: "data_row",
          section_name: "Operating Activities",
          formula_text: null,
          resolved_value: 12345.67,
          currency: "USD",
          resolution_status: "resolved",
          value_source: "approved_mapping",
          metadata_json: {
            semanticConceptKey: "management_fees",
            semanticConceptLabel: "Management Fees",
            approvedMappingId: "row-mapping-1",
          },
        }),
      },
      {
        toJSON: () => ({
          id: "run-row-2",
          report_run_id: "report-run-1",
          template_row_id: "row-2",
          semantic_concept_id: null,
          row_order: 2,
          row_label: "Operating Activities",
          row_type: "section_header",
          section_name: "Operating Activities",
          formula_text: null,
          resolved_value: null,
          currency: null,
          resolution_status: "section_header",
          value_source: "none",
          metadata_json: {},
        }),
      },
    ])
    mockGetLatestValidationForRun.mockResolvedValue({
      validationResult: {
        id: "validation-1",
        reportRunId: "report-run-1",
        overallStatus: "pass",
        readinessStatus: "ready",
      },
      checks: [
        {
          checkType: "missing_approved_mappings",
          status: "pass",
        },
      ],
    })

    const result = await ValidationEngineService.validateReportRun({
      runId: "report-run-1",
      actorId: "admin-1",
    })

    expect(result.validationResult.overallStatus).toBe("pass")
    expect(result.validationResult.readinessStatus).toBe("ready")
    expect(result.reportRun.readinessStatus).toBe("ready")
    expect(runRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        readiness_status: "ready",
        last_validated_at: expect.any(Date),
      }),
      expect.any(Object),
    )
    expect(mockValidationResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        report_run_id: "report-run-1",
        overall_status: "pass",
        readiness_status: "ready",
      }),
      expect.any(Object),
    )
    expect(mockValidationCheckResultBulkCreate).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "report_validated",
      }),
    )
  })

  test("downgrades a report to not_ready when approved mappings are missing", async () => {
    const runRecord = createRunRecord({
      status: "completed_with_unresolved_rows",
      summary_json: {
        totalRows: 2,
        resolvedRows: 0,
        unresolvedRows: 1,
        missingMappingsCount: 1,
        partialGroundingCount: 0,
        formulaNotComputedCount: 0,
        statusBreakdown: {
          unresolved_no_approved_mapping: 1,
        },
      },
      mapping_snapshot_json: {
        approved_row_mapping_ids: [],
      },
    })
    mockReportRunFindByPk.mockResolvedValue(runRecord)
    mockReportRunRowFindAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: "run-row-10",
          report_run_id: "report-run-1",
          template_row_id: "row-10",
          semantic_concept_id: null,
          row_order: 1,
          row_label: "Other Expenses",
          row_type: "data_row",
          section_name: "Operating Activities",
          formula_text: null,
          resolved_value: null,
          currency: null,
          resolution_status: "unresolved_no_approved_mapping",
          value_source: "none",
          metadata_json: {},
        }),
      },
    ])
    mockGetLatestValidationForRun.mockResolvedValue({
      validationResult: {
        id: "validation-1",
        reportRunId: "report-run-1",
        overallStatus: "fail",
        readinessStatus: "not_ready",
      },
      checks: [
        {
          checkType: "missing_approved_mappings",
          severity: "error",
          status: "fail",
        },
      ],
    })

    const result = await ValidationEngineService.validateReportRun({
      runId: "report-run-1",
      actorId: "admin-1",
    })

    expect(result.validationResult.overallStatus).toBe("fail")
    expect(result.validationResult.readinessStatus).toBe("not_ready")
    expect(result.reportRun.readinessStatus).toBe("not_ready")
    expect(mockValidationResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        overall_status: "fail",
        readiness_status: "not_ready",
      }),
      expect.any(Object),
    )
  })

  test("keeps a report at ready_with_warnings when only unsupported formulas remain", async () => {
    const runRecord = createRunRecord({
      status: "completed_with_unresolved_rows",
      summary_json: {
        totalRows: 2,
        resolvedRows: 1,
        unresolvedRows: 1,
        missingMappingsCount: 0,
        partialGroundingCount: 0,
        formulaNotComputedCount: 1,
        statusBreakdown: {
          resolved: 1,
          formula_not_computed: 1,
        },
      },
    })
    mockReportRunFindByPk.mockResolvedValue(runRecord)
    mockReportRunRowFindAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: "run-row-21",
          report_run_id: "report-run-1",
          template_row_id: "row-21",
          semantic_concept_id: "concept-1",
          row_order: 1,
          row_label: "Management Fees",
          row_type: "data_row",
          section_name: "Operating Activities",
          formula_text: null,
          resolved_value: 100,
          currency: "USD",
          resolution_status: "resolved",
          value_source: "approved_mapping",
          metadata_json: {
            semanticConceptKey: "management_fees",
            approvedMappingId: "row-mapping-21",
          },
        }),
      },
      {
        toJSON: () => ({
          id: "run-row-22",
          report_run_id: "report-run-1",
          template_row_id: "row-22",
          semantic_concept_id: null,
          row_order: 2,
          row_label: "Total Expenses",
          row_type: "formula_row",
          section_name: "Operating Activities",
          formula_text: "SUM(B2:B3)",
          resolved_value: null,
          currency: null,
          resolution_status: "formula_not_computed",
          value_source: "formula_metadata_only",
          metadata_json: {},
        }),
      },
    ])
    mockGetLatestValidationForRun.mockResolvedValue({
      validationResult: {
        id: "validation-1",
        reportRunId: "report-run-1",
        overallStatus: "warning",
        readinessStatus: "ready_with_warnings",
      },
      checks: [
        {
          checkType: "formula_support",
          severity: "warning",
          status: "warning",
        },
      ],
    })

    const result = await ValidationEngineService.validateReportRun({
      runId: "report-run-1",
      actorId: "admin-1",
    })

    expect(result.validationResult.overallStatus).toBe("warning")
    expect(result.validationResult.readinessStatus).toBe("ready_with_warnings")
    expect(result.reportRun.readinessStatus).toBe("ready_with_warnings")
    expect(mockValidationResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        overall_status: "warning",
        readiness_status: "ready_with_warnings",
      }),
      expect.any(Object),
    )
  })
})
