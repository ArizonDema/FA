const migration = require("../src/migrations/20260418160000-phase8-validation-controls-layer")

describe("phase 8 validation and controls migration", () => {
  test("adds readiness columns and creates validation persistence tables", async () => {
    const createdTables = []
    const addedColumns = []
    const addedIndexes = []
    const executedQueries = []

    const queryInterface = {
      sequelize: {
        query: jest.fn(async (sql) => {
          executedQueries.push(sql)
          return [[]]
        }),
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
      JSON: "JSON",
      DATE: "DATE",
      STRING: (value) => `STRING(${value})`,
      TEXT: "TEXT",
      UUIDV4: "UUIDV4",
      fn: () => "NOW",
    })

    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "report_runs.readiness_status",
        "report_runs.last_validated_at",
      ]),
    )
    expect(createdTables).toEqual(
      expect.arrayContaining([
        "validation_results",
        "validation_check_results",
      ]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "validation_results.validation_results_run_idx:report_run_id",
        "validation_check_results.validation_check_results_result_idx:validation_result_id",
        "validation_check_results.validation_check_results_check_idx:check_type",
      ]),
    )
    expect(executedQueries.join("\n")).toContain("UPDATE report_runs")
    expect(executedQueries.join("\n")).toContain("readiness_status")
  })
})
