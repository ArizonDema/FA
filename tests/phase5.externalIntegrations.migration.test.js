const migration = require("../src/migrations/20260704120000-phase5-external-integrations")

describe("phase 5 external integrations migration", () => {
  test("creates external integration and sync run tables with safety indexes", async () => {
    const createdTables = []
    const addedIndexes = []
    const existingTables = new Set()

    const queryInterface = {
      describeTable: jest.fn(async (tableName) => {
        if (existingTables.has(tableName)) return {}
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (tableName) => {
        existingTables.add(tableName)
        createdTables.push(tableName)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}:${Boolean(options.unique)}`)
      }),
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      UUIDV4: "UUIDV4",
      STRING: (value) => `STRING(${value})`,
      DATE: "DATE",
      JSON: "JSON",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(expect.arrayContaining(["external_integrations", "external_sync_runs"]))
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "external_integrations.external_integrations_fund_provider_idx:portfolio_id,provider_type:false",
        "external_integrations.external_integrations_status_idx:status:false",
        "external_sync_runs.external_sync_runs_idempotency_unique:external_integration_id,idempotency_key:true",
        "external_sync_runs.external_sync_runs_fund_status_idx:portfolio_id,status:false",
        "external_sync_runs.external_sync_runs_agent_idx:agent_principal_id:false",
        "external_sync_runs.external_sync_runs_workflow_idx:agent_workflow_run_id:false",
      ]),
    )
  })
})
