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
    if (!(await tableExists(queryInterface, "agent_workflow_runs"))) {
      await queryInterface.createTable("agent_workflow_runs", {
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
        workflow_type: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "pending",
        },
        trigger_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "manual",
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
        initiated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        idempotency_key: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        external_correlation_id: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        workflow_plan_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        policy_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        schedule_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        summary_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        error_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        started_at: {
          type: Sequelize.DATE,
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

    if (!(await tableExists(queryInterface, "agent_workflow_steps"))) {
      await queryInterface.createTable("agent_workflow_steps", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        workflow_run_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "agent_workflow_runs", key: "id" },
          onDelete: "CASCADE",
        },
        agent_tool_invocation_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "agent_tool_invocations", key: "id" },
          onDelete: "SET NULL",
        },
        step_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        step_name: {
          type: Sequelize.STRING(120),
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
        continue_on_error: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        dry_run: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        input_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        resolved_input_json: {
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
        started_at: {
          type: Sequelize.DATE,
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
      ["agent_workflow_runs", ["agent_principal_id", "idempotency_key"], "agent_workflow_runs_idempotency_unique", true],
      ["agent_workflow_runs", ["status", "trigger_type"], "agent_workflow_runs_status_trigger_idx", false],
      ["agent_workflow_runs", ["portfolio_id"], "agent_workflow_runs_portfolio_idx", false],
      ["agent_workflow_runs", ["reporting_project_id"], "agent_workflow_runs_project_idx", false],
      ["agent_workflow_steps", ["workflow_run_id", "step_order"], "agent_workflow_steps_run_order_idx", false],
      ["agent_workflow_steps", ["tool_name", "status"], "agent_workflow_steps_tool_status_idx", false],
    ]

    for (const [tableName, columns, indexName, unique] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName, unique })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "agent_workflow_steps")) {
      await queryInterface.dropTable("agent_workflow_steps")
    }
    if (await tableExists(queryInterface, "agent_workflow_runs")) {
      await queryInterface.dropTable("agent_workflow_runs")
    }
  },
}
