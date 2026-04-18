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
    if (!(await columnExists(queryInterface, "report_runs", "status"))) {
      await queryInterface.addColumn("report_runs", "status", {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: "pending",
      })
    }

    if (!(await columnExists(queryInterface, "report_runs", "summary_json"))) {
      await queryInterface.addColumn("report_runs", "summary_json", {
        type: Sequelize.JSON,
        allowNull: true,
      })
    }

    if (!(await columnExists(queryInterface, "report_runs", "error_json"))) {
      await queryInterface.addColumn("report_runs", "error_json", {
        type: Sequelize.JSON,
        allowNull: true,
      })
    }

    if (!(await columnExists(queryInterface, "report_runs", "completed_at"))) {
      await queryInterface.addColumn("report_runs", "completed_at", {
        type: Sequelize.DATE,
        allowNull: true,
      })
    }

    if (!(await tableExists(queryInterface, "report_run_rows"))) {
      await queryInterface.createTable("report_run_rows", {
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
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "template_versions", key: "id" },
          onDelete: "CASCADE",
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
        row_order: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        row_label: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        row_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
        section_name: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        formula_text: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        resolved_value: {
          type: Sequelize.DECIMAL(18, 2),
          allowNull: true,
        },
        currency: {
          type: Sequelize.STRING(10),
          allowNull: true,
        },
        resolution_status: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        value_source: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "none",
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

    if (!(await indexExists(queryInterface, "report_run_rows", "report_run_rows_run_idx"))) {
      await queryInterface.addIndex("report_run_rows", ["report_run_id"], {
        name: "report_run_rows_run_idx",
      })
    }

    if (!(await indexExists(queryInterface, "report_run_rows", "report_run_rows_row_idx"))) {
      await queryInterface.addIndex("report_run_rows", ["template_row_id"], {
        name: "report_run_rows_row_idx",
      })
    }

    if (!(await indexExists(queryInterface, "report_run_rows", "report_run_rows_concept_idx"))) {
      await queryInterface.addIndex("report_run_rows", ["semantic_concept_id"], {
        name: "report_run_rows_concept_idx",
      })
    }

    await queryInterface.sequelize.query(`
      UPDATE report_runs
      SET status = CASE
        WHEN output_paths IS NOT NULL THEN 'completed'
        ELSE 'pending'
      END
      WHERE status IS NULL OR status = ''
    `)
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "report_run_rows")) {
      await queryInterface.dropTable("report_run_rows")
    }

    if (await columnExists(queryInterface, "report_runs", "completed_at")) {
      await queryInterface.removeColumn("report_runs", "completed_at")
    }
    if (await columnExists(queryInterface, "report_runs", "error_json")) {
      await queryInterface.removeColumn("report_runs", "error_json")
    }
    if (await columnExists(queryInterface, "report_runs", "summary_json")) {
      await queryInterface.removeColumn("report_runs", "summary_json")
    }
    if (await columnExists(queryInterface, "report_runs", "status")) {
      await queryInterface.removeColumn("report_runs", "status")
    }
  },
}
