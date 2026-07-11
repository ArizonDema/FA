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
    if (!(await tableExists(queryInterface, "external_integrations"))) {
      await queryInterface.createTable("external_integrations", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "portfolios", key: "id" },
          onDelete: "CASCADE",
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        provider_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        provider_key: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "active",
        },
        auth_mode: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "secret_reference",
        },
        secret_reference: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        scopes_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        config_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        sync_policy_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        last_sync_at: {
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

    if (!(await tableExists(queryInterface, "external_sync_runs"))) {
      await queryInterface.createTable("external_sync_runs", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        external_integration_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "external_integrations", key: "id" },
          onDelete: "CASCADE",
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "portfolios", key: "id" },
          onDelete: "CASCADE",
        },
        agent_principal_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "agent_principals", key: "id" },
          onDelete: "SET NULL",
        },
        agent_workflow_run_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "agent_workflow_runs", key: "id" },
          onDelete: "SET NULL",
        },
        sync_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "discovery",
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
        idempotency_key: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        external_correlation_id: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        requested_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        discovered_artifacts_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        import_plan_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        result_json: {
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
      ["external_integrations", ["portfolio_id", "provider_type"], "external_integrations_fund_provider_idx", false],
      ["external_integrations", ["status"], "external_integrations_status_idx", false],
      ["external_sync_runs", ["external_integration_id", "idempotency_key"], "external_sync_runs_idempotency_unique", true],
      ["external_sync_runs", ["portfolio_id", "status"], "external_sync_runs_fund_status_idx", false],
      ["external_sync_runs", ["agent_principal_id"], "external_sync_runs_agent_idx", false],
      ["external_sync_runs", ["agent_workflow_run_id"], "external_sync_runs_workflow_idx", false],
    ]

    for (const [tableName, columns, indexName, unique] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName, unique })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "external_sync_runs")) {
      await queryInterface.dropTable("external_sync_runs")
    }
    if (await tableExists(queryInterface, "external_integrations")) {
      await queryInterface.dropTable("external_integrations")
    }
  },
}
