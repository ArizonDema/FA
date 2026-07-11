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

async function columnExists(queryInterface, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) return false
  const columns = await queryInterface.describeTable(tableName)
  return Object.prototype.hasOwnProperty.call(columns, columnName)
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!indexName || !(await tableExists(queryInterface, tableName))) return false
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, "review_tasks", "template_version_id")) {
      await queryInterface.changeColumn("review_tasks", "template_version_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "template_versions", key: "id" },
        onDelete: "CASCADE",
      })
    }

    if (!(await tableExists(queryInterface, "report_lineage"))) {
      await queryInterface.createTable("report_lineage", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        report_run_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "report_runs", key: "id" },
          onDelete: "CASCADE",
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "portfolios", key: "id" },
          onDelete: "SET NULL",
        },
        report_run_row_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "report_run_rows", key: "id" },
          onDelete: "SET NULL",
        },
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "template_versions", key: "id" },
          onDelete: "SET NULL",
        },
        template_row_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "template_rows", key: "id" },
          onDelete: "SET NULL",
        },
        semantic_concept_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "semantic_concepts", key: "id" },
          onDelete: "SET NULL",
        },
        source_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        source_id: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        source_reference_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        mapping_snapshot_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        confidence: {
          type: Sequelize.DECIMAL(8, 4),
          allowNull: true,
        },
        evidence_json: {
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

    if (!(await tableExists(queryInterface, "report_exports"))) {
      await queryInterface.createTable("report_exports", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        report_run_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "report_runs", key: "id" },
          onDelete: "CASCADE",
        },
        format: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "xlsx",
        },
        status: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "approval_requested",
        },
        output_path: {
          type: Sequelize.STRING(700),
          allowNull: false,
        },
        checksum_sha256: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        validation_result_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "validation_results", key: "id" },
          onDelete: "SET NULL",
        },
        approval_review_task_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "review_tasks", key: "id" },
          onDelete: "SET NULL",
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        approved_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        approved_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        exported_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        exported_at: {
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
      ["report_lineage", ["report_run_id"], "report_lineage_run_idx"],
      ["report_lineage", ["portfolio_id"], "report_lineage_portfolio_idx"],
      ["report_lineage", ["report_run_row_id"], "report_lineage_run_row_idx"],
      ["report_lineage", ["template_row_id"], "report_lineage_template_row_idx"],
      ["report_lineage", ["semantic_concept_id"], "report_lineage_concept_idx"],
      ["report_exports", ["report_run_id", "format"], "report_exports_run_format_idx"],
      ["report_exports", ["status"], "report_exports_status_idx"],
      ["report_exports", ["approval_review_task_id"], "report_exports_approval_task_idx"],
    ]

    for (const [tableName, columns, indexName] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName })
      }
    }
  },

  async down(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "report_exports")) {
      await queryInterface.dropTable("report_exports")
    }
    if (await tableExists(queryInterface, "report_lineage")) {
      await queryInterface.dropTable("report_lineage")
    }
    if (await columnExists(queryInterface, "review_tasks", "template_version_id")) {
      await queryInterface.changeColumn("review_tasks", "template_version_id", {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "template_versions", key: "id" },
        onDelete: "CASCADE",
      })
    }
  },
}
