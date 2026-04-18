const migration = require("../src/migrations/20260418110000-phase7-deterministic-report-generation")

describe("phase 7 deterministic report generation migration", () => {
  test("adds run status columns and creates report run row persistence", async () => {
    const createdTables = []
    const addedColumns = []
    const addedIndexes = []

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
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      INTEGER: "INTEGER",
      JSON: "JSON",
      DATE: "DATE",
      DATEONLY: "DATEONLY",
      TEXT: "TEXT",
      DECIMAL: (precision, scale) => `DECIMAL(${precision},${scale})`,
      STRING: (value) => `STRING(${value})`,
      UUIDV4: "UUIDV4",
      fn: () => "NOW",
    })

    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "report_runs.status",
        "report_runs.summary_json",
        "report_runs.error_json",
        "report_runs.completed_at",
      ]),
    )
    expect(createdTables).toEqual(expect.arrayContaining(["report_run_rows"]))
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "report_run_rows.report_run_rows_run_idx:report_run_id",
        "report_run_rows.report_run_rows_row_idx:template_row_id",
        "report_run_rows.report_run_rows_concept_idx:semantic_concept_id",
      ]),
    )
  })
})
