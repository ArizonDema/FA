const migration = require("../src/migrations/20260703200000-phase2-lineage-exception-export-controls")

describe("phase 2 lineage, exception, and export controls migration", () => {
  test("creates lineage/export tables and relaxes review task template binding", async () => {
    const createdTables = []
    const changedColumns = []
    const addedIndexes = []
    const existingTables = new Set(["review_tasks"])

    const queryInterface = {
      describeTable: jest.fn(async (tableName) => {
        if (existingTables.has(tableName)) {
          return { template_version_id: {} }
        }
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      changeColumn: jest.fn(async (tableName, columnName, definition) => {
        changedColumns.push(`${tableName}.${columnName}:${definition.allowNull}`)
      }),
      createTable: jest.fn(async (tableName) => {
        existingTables.add(tableName)
        createdTables.push(tableName)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}`)
      }),
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      UUIDV4: "UUIDV4",
      STRING: (value) => `STRING(${value})`,
      DECIMAL: (left, right) => `DECIMAL(${left},${right})`,
      DATE: "DATE",
      JSON: "JSON",
      fn: () => "NOW",
    })

    expect(changedColumns).toContain("review_tasks.template_version_id:true")
    expect(createdTables).toEqual(expect.arrayContaining(["report_lineage", "report_exports"]))
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "report_lineage.report_lineage_run_idx:report_run_id",
        "report_exports.report_exports_run_format_idx:report_run_id,format",
      ]),
    )
  })
})
