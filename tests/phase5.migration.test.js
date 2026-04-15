const migration = require("../src/migrations/20260415150000-phase5-llm-mapping-assistance")

describe("phase 5 llm mapping assistance migration", () => {
  test("creates trace storage and llm-specific suggestion columns", async () => {
    const createdTables = []
    const addedColumns = []
    const addedIndexes = []
    const addedConstraints = []

    const queryInterface = {
      sequelize: {
        query: jest.fn(async () => [[]]),
      },
      describeTable: jest.fn(async () => {
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (tableName) => {
        createdTables.push(tableName)
      }),
      addColumn: jest.fn(async (tableName, columnName) => {
        addedColumns.push(`${tableName}.${columnName}`)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}`)
      }),
      addConstraint: jest.fn(async (tableName, options) => {
        addedConstraints.push(`${tableName}.${options.name}`)
      }),
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      INTEGER: "INTEGER",
      TEXT: "TEXT",
      JSON: "JSON",
      DATE: "DATE",
      BOOLEAN: "BOOLEAN",
      STRING: (value) => `STRING(${value})`,
      DECIMAL: (precision, scale) => `DECIMAL(${precision},${scale})`,
      ENUM: (...values) => `ENUM(${values.join(",")})`,
      fn: () => "NOW",
    })

    expect(createdTables).toContain("llm_mapping_traces")
    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "template_row_mapping_suggestions.llm_score",
        "template_row_mapping_suggestions.merged_score",
        "template_row_mapping_suggestions.trace_id",
      ]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "llm_mapping_traces.llm_mapping_traces_row_idx:template_row_id",
        "template_row_mapping_suggestions.template_row_mapping_suggestions_trace_idx:trace_id",
      ]),
    )
    expect(addedConstraints).toContain(
      "template_row_mapping_suggestions.template_row_mapping_suggestions_trace_fk",
    )
  })
})
