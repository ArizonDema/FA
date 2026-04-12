const migration = require("../src/migrations/20260412100000-phase2-template-parsing-foundation")

describe("phase 2 template parsing migration", () => {
  test("adds parsed structure columns and rich template row fields", async () => {
    const addedColumns = []
    const addedIndexes = []

    const queryInterface = {
      describeTable: jest.fn(async (tableName) => {
        if (tableName === "template_versions" || tableName === "template_rows") return {}
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      addColumn: jest.fn(async (tableName, columnName) => {
        addedColumns.push(`${tableName}.${columnName}`)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}`)
      }),
    }

    await migration.up(queryInterface, {
      JSON: "JSON",
      DATE: "DATE",
      STRING: (value) => `STRING(${value})`,
      INTEGER: "INTEGER",
      TEXT: "TEXT",
      BOOLEAN: "BOOLEAN",
    })

    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "template_versions.parsed_structure_json",
        "template_versions.parse_metadata_json",
        "template_versions.parsed_at",
        "template_rows.row_type",
        "template_rows.indentation_level",
        "template_rows.formula_text",
        "template_rows.row_order",
        "template_rows.section_name",
        "template_rows.parent_section_name",
        "template_rows.expected_data_type",
        "template_rows.cell_range",
        "template_rows.is_formula",
        "template_rows.raw_json",
      ]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining(["template_rows.template_rows_version_sheet_order_idx:template_version_id,sheet_name,row_order"]),
    )
  })
})
