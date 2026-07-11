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
    if (!(await tableExists(queryInterface, "fund_repository_analyses"))) {
      await queryInterface.createTable("fund_repository_analyses", {
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
        item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_items", key: "id" },
          onDelete: "CASCADE",
        },
        version_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_versions", key: "id" },
          onDelete: "CASCADE",
        },
        reader_key: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        reader_version: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        trigger_type: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: "manual",
        },
        source_format: {
          type: Sequelize.STRING(30),
          allowNull: true,
        },
        extraction_method: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        summary_text: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        source_text_excerpt: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        structured_data_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        issues_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        confidence: {
          type: Sequelize.DECIMAL(5, 4),
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

    if (!(await tableExists(queryInterface, "fund_repository_key_points"))) {
      await queryInterface.createTable("fund_repository_key_points", {
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
        analysis_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_analyses", key: "id" },
          onDelete: "CASCADE",
        },
        item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_items", key: "id" },
          onDelete: "CASCADE",
        },
        version_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_versions", key: "id" },
          onDelete: "CASCADE",
        },
        point_key: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        label: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        value_text: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        value_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        source_reference: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        confidence: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true,
        },
        review_status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: "suggested",
        },
        reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        reviewed_at: {
          type: Sequelize.DATE,
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
      ["fund_repository_analyses", ["portfolio_id", "item_id", "created_at"], "fund_repository_analyses_fund_item_idx", false],
      ["fund_repository_analyses", ["version_id", "reader_key"], "fund_repository_analyses_version_reader_idx", false],
      ["fund_repository_key_points", ["portfolio_id", "item_id"], "fund_repository_key_points_fund_item_idx", false],
      ["fund_repository_key_points", ["analysis_id", "point_key"], "fund_repository_key_points_analysis_key_unique", true],
    ]

    for (const [tableName, columns, indexName, unique] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName, unique })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "fund_repository_key_points")) {
      await queryInterface.dropTable("fund_repository_key_points")
    }
    if (await tableExists(queryInterface, "fund_repository_analyses")) {
      await queryInterface.dropTable("fund_repository_analyses")
    }
  },
}
