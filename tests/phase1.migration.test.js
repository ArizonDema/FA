const migration = require("../src/migrations/20260409103000-phase1-reporting-foundation")

describe("phase 1 reporting foundation migration", () => {
  test("registers the new foundation tables and backfill steps", async () => {
    const addColumnMock = jest.fn().mockResolvedValue(undefined)
    const createTableMock = jest.fn().mockResolvedValue(undefined)
    const addIndexMock = jest.fn().mockResolvedValue(undefined)
    const addConstraintMock = jest.fn().mockResolvedValue(undefined)
    const queryInterface = {
      describeTable: jest.fn(async (tableName) => {
        const knownTables = new Set([
          "cash_flow_templates",
          "cash_flow_template_analyses",
          "report_templates",
          "report_runs",
          "audit_logs",
        ])
        if (knownTables.has(tableName)) return {}
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      addColumn: addColumnMock,
      createTable: createTableMock,
      addIndex: addIndexMock,
      addConstraint: addConstraintMock,
      bulkInsert: jest.fn().mockResolvedValue(undefined),
      sequelize: {
        query: jest.fn(async (sql) => {
          const statement = String(sql || "")
          if (statement.includes("SELECT")) {
            return [[]]
          }
          return undefined
        }),
      },
    }

    await migration.up(queryInterface, {
      STRING: (len) => ({ type: "STRING", len }),
      ENUM: (...values) => ({ type: "ENUM", values }),
      UUID: "UUID",
      BOOLEAN: "BOOLEAN",
      INTEGER: "INTEGER",
      JSON: "JSON",
      DATE: "DATE",
      DATEONLY: "DATEONLY",
      TEXT: "TEXT",
      DECIMAL: () => ({ type: "DECIMAL" }),
      fn: (name) => ({ fn: name }),
    })

    const createdTables = createTableMock.mock.calls.map((call) => call[0])
    expect(createdTables).toEqual(
      expect.arrayContaining(["template_versions", "semantic_concepts", "account_semantic_mappings"]),
    )
    expect(queryInterface.sequelize.query).toHaveBeenCalled()
  })
})
