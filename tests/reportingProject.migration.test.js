const migration = require("../src/migrations/20260703190000-create-reporting-projects")

describe("reporting project foundation migration", () => {
  test("creates project and source-link tables with workflow indexes", async () => {
    const createdTables = []
    const addedIndexes = []

    const queryInterface = {
      describeTable: jest.fn(async () => {
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (tableName) => {
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
      DATE: "DATE",
      DATEONLY: "DATEONLY",
      BOOLEAN: "BOOLEAN",
      JSON: "JSON",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(
      expect.arrayContaining(["reporting_projects", "reporting_project_sources"]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "reporting_projects.reporting_projects_fund_status_idx:portfolio_id,status",
        "reporting_project_sources.reporting_project_sources_project_idx:reporting_project_id",
        "reporting_project_sources.reporting_project_sources_fund_role_idx:portfolio_id,source_role",
      ]),
    )
  })
})
