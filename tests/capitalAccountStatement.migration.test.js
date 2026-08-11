const migration = require("../src/migrations/20260719150000-add-capital-account-statement-report-type")

describe("capital account statement report type migration", () => {
  test("extends both report type enums", async () => {
    const changes = []
    const queryInterface = {
      changeColumn: jest.fn(async (tableName, columnName, definition) => {
        changes.push({ tableName, columnName, definition })
      }),
    }
    const Sequelize = {
      ENUM: (...values) => ({ values }),
    }

    await migration.up(queryInterface, Sequelize)

    expect(changes).toHaveLength(2)
    expect(changes.map((change) => change.tableName)).toEqual(["report_templates", "report_runs"])
    changes.forEach((change) => {
      expect(change.columnName).toBe("type")
      expect(change.definition.type.values).toContain("capital_account_statement")
      expect(change.definition.allowNull).toBe(false)
    })
  })
})
