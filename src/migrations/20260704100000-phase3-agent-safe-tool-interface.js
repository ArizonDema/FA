"use strict"

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName)
    return true
  } catch (error) {
    const message = String(error?.message || "")
    const code = error?.original?.code
    if (code === "ER_NO_SUCH_TABLE" || message.includes("No description found for")) {
      return false
    }
    throw error
  }
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!indexName || !(await tableExists(queryInterface, tableName))) return false
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "agent_principals"))) {
      await queryInterface.createTable("agent_principals", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        principal_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "internal_agent",
        },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "active",
        },
        scopes_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        allowed_portfolio_ids_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        allowed_reporting_project_ids_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        api_key_prefix: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        api_key_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        last_used_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW"),
        },
      })
    }

    if (!(await tableExists(queryInterface, "agent_tool_invocations"))) {
      await queryInterface.createTable("agent_tool_invocations", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        agent_principal_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "agent_principals", key: "id" },
          onDelete: "CASCADE",
        },
        idempotency_key: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        input_sha256: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        tool_name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "pending",
        },
        dry_run: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "portfolios", key: "id" },
          onDelete: "SET NULL",
        },
        reporting_project_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "reporting_projects", key: "id" },
          onDelete: "SET NULL",
        },
        delegated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        input_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        output_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        error_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW"),
        },
      })
    }

    const indexes = [
      ["agent_principals", ["status"], "agent_principals_status_idx", false],
      ["agent_principals", ["api_key_prefix"], "agent_principals_api_key_prefix_unique", true],
      ["agent_tool_invocations", ["agent_principal_id", "idempotency_key"], "agent_tool_invocations_idempotency_unique", true],
      ["agent_tool_invocations", ["tool_name", "status"], "agent_tool_invocations_tool_status_idx", false],
      ["agent_tool_invocations", ["portfolio_id"], "agent_tool_invocations_portfolio_idx", false],
      ["agent_tool_invocations", ["reporting_project_id"], "agent_tool_invocations_project_idx", false],
    ]

    for (const [tableName, columns, indexName, unique] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName, unique })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "agent_tool_invocations")) {
      await queryInterface.dropTable("agent_tool_invocations")
    }
    if (await tableExists(queryInterface, "agent_principals")) {
      await queryInterface.dropTable("agent_principals")
    }
  },
}
