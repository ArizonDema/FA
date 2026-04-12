const mockTemplateVersionUpdate = jest.fn()
const mockTemplateRowDestroy = jest.fn()
const mockTemplateRowBulkCreate = jest.fn()

jest.mock("../src/models", () => ({
  TemplateVersion: {
    update: (...args) => mockTemplateVersionUpdate(...args),
  },
  TemplateRow: {
    destroy: (...args) => mockTemplateRowDestroy(...args),
    bulkCreate: (...args) => mockTemplateRowBulkCreate(...args),
  },
}))

const TemplatePersistenceService = require("../src/modules/templates/parsing/templatePersistence.service")

describe("TemplatePersistenceService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTemplateVersionUpdate.mockResolvedValue([1])
    mockTemplateRowDestroy.mockResolvedValue(0)
    mockTemplateRowBulkCreate.mockResolvedValue([])
  })

  test("persists normalized workbook structure and rich template rows", async () => {
    const normalizedStructure = {
      parserVersion: "phase2-test",
      workbookMetadata: {
        worksheetCount: 1,
        sourceFileName: "template.xlsx",
        sourceFileSha256: "sha-123",
      },
      summary: {
        totalRows: 2,
        section_header: 1,
        data_row: 1,
      },
      sheets: [
        {
          name: "Cash Flow",
          order: 0,
          columns: [{ columnKey: "A" }, { columnKey: "B" }],
          rows: [
            {
              rowIndex: 1,
              rowLabel: "Operating Activities",
              rowType: "section_header",
              indentationLevel: 0,
              isFormula: false,
              formulaText: null,
              rawValues: ["Operating Activities", null],
              displayValues: ["Operating Activities", null],
              cellRange: "A1:A1",
              sectionName: "Operating Activities",
              parentSection: null,
              sortOrder: 1,
              expectedDataType: "text",
              metadata: {
                cellAddresses: ["A1"],
                cellSnapshots: [{ address: "A1" }],
              },
            },
          ],
        },
      ],
    }

    const result = await TemplatePersistenceService.persistNormalizedStructure({
      templateVersionId: "version-1",
      normalizedStructure,
      actorId: "admin-1",
    })

    expect(mockTemplateVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed_structure_json: normalizedStructure,
        parse_metadata_json: expect.objectContaining({
          parser_version: "phase2-test",
          total_row_count: 2,
        }),
      }),
      expect.any(Object),
    )
    expect(mockTemplateRowDestroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { template_version_id: "version-1" } }),
    )
    expect(mockTemplateRowBulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          template_version_id: "version-1",
          label: "Operating Activities",
          row_type: "section_header",
          raw_json: expect.objectContaining({
            raw_values: ["Operating Activities", null],
          }),
        }),
      ]),
      expect.any(Object),
    )
    expect(result.persistedRowCount).toBe(1)
  })
})
