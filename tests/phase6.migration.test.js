const migration = require("../src/migrations/20260415190000-phase6-mapping-review-workflow")

describe("phase 6 mapping review workflow migration", () => {
  test("creates review tables and adds lineage columns to template row mappings", async () => {
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

    expect(createdTables).toEqual(expect.arrayContaining(["review_tasks", "review_decisions"]))
    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "template_row_semantic_mappings.review_task_id",
        "template_row_semantic_mappings.review_decision_id",
      ]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "review_tasks.review_tasks_status_priority_idx:status,priority",
        "review_decisions.review_decisions_task_idx:review_task_id",
        "template_row_semantic_mappings.template_row_semantic_mappings_review_task_idx:review_task_id",
      ]),
    )
    expect(addedConstraints).toEqual(
      expect.arrayContaining([
        "template_row_semantic_mappings.template_row_semantic_mappings_review_task_fk",
        "template_row_semantic_mappings.template_row_semantic_mappings_review_decision_fk",
      ]),
    )
  })
})
