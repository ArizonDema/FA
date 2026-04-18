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
    if (!(await columnExists(queryInterface, "report_runs", "readiness_status"))) {
      await queryInterface.addColumn("report_runs", "readiness_status", {
        type: Sequelize.STRING(40),
        allowNull: true,
      })
    }

    if (!(await columnExists(queryInterface, "report_runs", "last_validated_at"))) {
      await queryInterface.addColumn("report_runs", "last_validated_at", {
        type: Sequelize.DATE,
        allowNull: true,
      })
    }

    if (!(await tableExists(queryInterface, "validation_results"))) {
      await queryInterface.createTable("validation_results", {
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
        overall_status: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        readiness_status: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        summary_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
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

    if (!(await tableExists(queryInterface, "validation_check_results"))) {
      await queryInterface.createTable("validation_check_results", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        validation_result_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "validation_results", key: "id" },
          onDelete: "CASCADE",
        },
        check_type: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        severity: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        target_type: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        target_id: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        details_json: {
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

    if (!(await indexExists(queryInterface, "validation_results", "validation_results_run_idx"))) {
      await queryInterface.addIndex("validation_results", ["report_run_id"], {
        name: "validation_results_run_idx",
      })
    }

    if (!(await indexExists(queryInterface, "validation_check_results", "validation_check_results_result_idx"))) {
      await queryInterface.addIndex("validation_check_results", ["validation_result_id"], {
        name: "validation_check_results_result_idx",
      })
    }

    if (!(await indexExists(queryInterface, "validation_check_results", "validation_check_results_check_idx"))) {
      await queryInterface.addIndex("validation_check_results", ["check_type"], {
        name: "validation_check_results_check_idx",
      })
    }

    await queryInterface.sequelize.query(`
      UPDATE report_runs
      SET readiness_status = CASE
        WHEN status = 'completed' THEN 'ready'
        WHEN status = 'completed_with_unresolved_rows' THEN 'not_ready'
        ELSE readiness_status
      END
      WHERE readiness_status IS NULL
    `)
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "validation_check_results")) {
      await queryInterface.dropTable("validation_check_results")
    }
    if (await tableExists(queryInterface, "validation_results")) {
      await queryInterface.dropTable("validation_results")
    }
    if (await columnExists(queryInterface, "report_runs", "last_validated_at")) {
      await queryInterface.removeColumn("report_runs", "last_validated_at")
    }
    if (await columnExists(queryInterface, "report_runs", "readiness_status")) {
      await queryInterface.removeColumn("report_runs", "readiness_status")
    }
  },
}
