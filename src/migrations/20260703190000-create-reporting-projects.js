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
  if (!(await tableExists(queryInterface, tableName))) return false
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "reporting_projects"))) {
      await queryInterface.createTable("reporting_projects", {
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
        report_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "cash_flow",
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        period_start: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        period_end: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        status: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "draft",
        },
        template_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "cash_flow_templates", key: "id" },
          onDelete: "SET NULL",
        },
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "template_versions", key: "id" },
          onDelete: "SET NULL",
        },
        current_report_run_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "report_runs", key: "id" },
          onDelete: "SET NULL",
        },
        requested_by_agent_id: {
          type: Sequelize.UUID,
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

    if (!(await tableExists(queryInterface, "reporting_project_sources"))) {
      await queryInterface.createTable("reporting_project_sources", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        reporting_project_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "reporting_projects", key: "id" },
          onDelete: "CASCADE",
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "portfolios", key: "id" },
          onDelete: "CASCADE",
        },
        source_role: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        source_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        repository_item_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "fund_repository_items", key: "id" },
          onDelete: "SET NULL",
        },
        repository_version_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "fund_repository_versions", key: "id" },
          onDelete: "SET NULL",
        },
        template_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "cash_flow_templates", key: "id" },
          onDelete: "SET NULL",
        },
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "template_versions", key: "id" },
          onDelete: "SET NULL",
        },
        report_run_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "report_runs", key: "id" },
          onDelete: "SET NULL",
        },
        original_file_name: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        sha256: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        required: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        status: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "attached",
        },
        attached_by: {
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

    const indexes = [
      ["reporting_projects", ["portfolio_id", "status"], "reporting_projects_fund_status_idx"],
      ["reporting_projects", ["portfolio_id", "report_type"], "reporting_projects_fund_type_idx"],
      ["reporting_projects", ["template_version_id"], "reporting_projects_template_version_idx"],
      ["reporting_project_sources", ["reporting_project_id"], "reporting_project_sources_project_idx"],
      ["reporting_project_sources", ["portfolio_id", "source_role"], "reporting_project_sources_fund_role_idx"],
      ["reporting_project_sources", ["repository_version_id"], "reporting_project_sources_repo_version_idx"],
      ["reporting_project_sources", ["template_version_id"], "reporting_project_sources_template_version_idx"],
    ]

    for (const [tableName, columns, indexName] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "reporting_project_sources")) {
      await queryInterface.dropTable("reporting_project_sources")
    }
    if (await tableExists(queryInterface, "reporting_projects")) {
      await queryInterface.dropTable("reporting_projects")
    }
  },
}
