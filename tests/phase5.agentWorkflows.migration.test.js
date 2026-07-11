const migration = require("../src/migrations/20260704110000-phase5-agent-workflows")

describe("phase 5 agent workflow migration", () => {
  test("creates workflow run and step tables with monitoring indexes", async () => {
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
      BOOLEAN: "BOOLEAN",
      INTEGER: "INTEGER",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(expect.arrayContaining(["agent_workflow_runs", "agent_workflow_steps"]))
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "agent_workflow_runs.agent_workflow_runs_idempotency_unique:agent_principal_id,idempotency_key:true",
        "agent_workflow_runs.agent_workflow_runs_status_trigger_idx:status,trigger_type:false",
        "agent_workflow_runs.agent_workflow_runs_portfolio_idx:portfolio_id:false",
        "agent_workflow_runs.agent_workflow_runs_project_idx:reporting_project_id:false",
        "agent_workflow_steps.agent_workflow_steps_run_order_idx:workflow_run_id,step_order:false",
        "agent_workflow_steps.agent_workflow_steps_tool_status_idx:tool_name,status:false",
      ]),
    )
  })
})
