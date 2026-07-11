const mockBulkCreate = jest.fn()

jest.mock("../src/models", () => ({
  ReportLineage: {
    bulkCreate: (...args) => mockBulkCreate(...args),
  },
}))

const ReportLineageService = require("../src/modules/reports/services/reportLineage.service")

describe("ReportLineageService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBulkCreate.mockResolvedValue([])
  })

  test("persists row-level lineage from approved-mapping report rows", async () => {
    await ReportLineageService.persistForReportRows({
      run: { id: "run-1", portfolio_id: "fund-1", template_version_id: "version-1" },
      rows: [
        {
          id: "run-row-1",
          report_run_id: "run-1",
          template_version_id: "version-1",
          template_row_id: "template-row-1",
          semantic_concept_id: "concept-1",
          row_label: "Management Fees",
          resolution_status: "resolved",
          value_source: "approved_mapping",
          metadata_json: {
            approvedMappingId: "mapping-1",
            semanticConceptKey: "management_fees",
            supportingLineCount: 2,
            supportingEntryIds: ["entry-1"],
          },
        },
      ],
    })

    expect(mockBulkCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          report_run_id: "run-1",
          portfolio_id: "fund-1",
          report_run_row_id: "run-row-1",
          source_type: "journal_entries",
          confidence: 1,
          mapping_snapshot_json: expect.objectContaining({ approved_mapping_id: "mapping-1" }),
        }),
      ],
      {},
    )
  })

  test("persists extractor source and assignment lineage without report rows", async () => {
    await ReportLineageService.persistForCashFlowExtractorRun({
      run: { id: "run-2", portfolio_id: "fund-1", template_version_id: "version-1" },
      inputArtifacts: {
        trial_balance: { original_file_name: "tb.xlsx", repository_version_id: "tb-version" },
        general_ledger: { original_file_name: "gl.xlsx", repository_version_id: "gl-version" },
      },
      result: {
        mapping: {
          final_bucket_assignments: [
            {
              normalized_account: "cash",
              direction: "inflow",
              bucket_key: "cash_in",
              confidence: 0.88,
            },
          ],
        },
      },
      templateVersionId: "version-1",
    })

    const payloads = mockBulkCreate.mock.calls[0][0]
    expect(payloads).toHaveLength(3)
    expect(payloads.map((payload) => payload.source_type)).toEqual(
      expect.arrayContaining(["trial_balance", "general_ledger", "cash_flow_mapping_assignment"]),
    )
  })
})
