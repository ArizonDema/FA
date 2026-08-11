const migration = require("../src/migrations/20260811220000-separate-template-kinds")

describe("separate template kinds migration", () => {
  test("types analyses and adds a unique generated active scope", async () => {
    const columns = {
      cash_flow_templates: { template_kind: {} },
      cash_flow_template_analyses: {},
    }
    const queryInterface = {
      describeTable: jest.fn(async (table) => columns[table]),
      showIndex: jest.fn(async () => []),
      addColumn: jest.fn(async (table, column) => { columns[table][column] = {} }),
      addIndex: jest.fn(),
      sequelize: { query: jest.fn() },
    }
    const Sequelize = { STRING: (length) => ({ type: "STRING", length }) }

    await migration.up(queryInterface, Sequelize)

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      "cash_flow_template_analyses",
      "template_kind",
      expect.objectContaining({ defaultValue: "cash_flow" }),
    )
    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("GENERATED ALWAYS AS"),
    )
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      "cash_flow_templates",
      ["active_scope_key"],
      expect.objectContaining({ unique: true }),
    )
  })
})
