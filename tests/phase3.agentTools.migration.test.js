const migration = require("../src/migrations/20260704100000-phase3-agent-safe-tool-interface")

describe("phase 3 agent-safe tool interface migration", () => {
  test("creates agent principal and tool invocation tables with safety indexes", async () => {
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
      TEXT: "TEXT",
      DATE: "DATE",
      JSON: "JSON",
      BOOLEAN: "BOOLEAN",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(expect.arrayContaining(["agent_principals", "agent_tool_invocations"]))
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "agent_principals.agent_principals_status_idx:status:false",
        "agent_principals.agent_principals_api_key_prefix_unique:api_key_prefix:true",
        "agent_tool_invocations.agent_tool_invocations_idempotency_unique:agent_principal_id,idempotency_key:true",
        "agent_tool_invocations.agent_tool_invocations_tool_status_idx:tool_name,status:false",
        "agent_tool_invocations.agent_tool_invocations_portfolio_idx:portfolio_id:false",
        "agent_tool_invocations.agent_tool_invocations_project_idx:reporting_project_id:false",
      ]),
    )
  })
})
