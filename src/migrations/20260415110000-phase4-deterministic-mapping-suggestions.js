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
  if (!indexName || !(await tableExists(queryInterface, tableName))) {
    return false
  }

  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

function makeIdempotentSchemaOps(queryInterface) {
  const original = {
    createTable: queryInterface.createTable.bind(queryInterface),
    addIndex: queryInterface.addIndex.bind(queryInterface),
  }

  queryInterface.createTable = async (tableName, attributes, options, model) => {
    if (await tableExists(queryInterface, tableName)) {
      return
    }
    return original.createTable(tableName, attributes, options, model)
  }

  queryInterface.addIndex = async (tableName, attributes, options, rawTableName) => {
    const indexName = options?.name
    if (indexName && (await indexExists(queryInterface, tableName, indexName))) {
      return
    }
    return original.addIndex(tableName, attributes, options, rawTableName)
  }

  return () => {
    queryInterface.createTable = original.createTable
    queryInterface.addIndex = original.addIndex
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const restoreSchemaOps = makeIdempotentSchemaOps(queryInterface)

    try {
      await queryInterface.createTable("template_row_mapping_suggestions", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "portfolios", key: "id" },
          onDelete: "SET NULL",
        },
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "template_versions", key: "id" },
          onDelete: "CASCADE",
        },
        template_row_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "template_rows", key: "id" },
          onDelete: "CASCADE",
        },
        semantic_concept_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "semantic_concepts", key: "id" },
          onDelete: "CASCADE",
        },
        rank: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        confidence_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: false,
          defaultValue: 0,
        },
        rationale: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        signal_breakdown_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        source: {
          type: Sequelize.STRING(120),
          allowNull: false,
          defaultValue: "deterministic_engine",
        },
        status: {
          type: Sequelize.ENUM("suggested", "superseded"),
          allowNull: false,
          defaultValue: "suggested",
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        generated_by: {
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

      await queryInterface.addIndex("template_row_mapping_suggestions", ["template_version_id"], {
        name: "template_row_mapping_suggestions_version_idx",
      })
      await queryInterface.addIndex("template_row_mapping_suggestions", ["template_row_id"], {
        name: "template_row_mapping_suggestions_row_idx",
      })
      await queryInterface.addIndex("template_row_mapping_suggestions", ["semantic_concept_id"], {
        name: "template_row_mapping_suggestions_concept_idx",
      })
      await queryInterface.addIndex("template_row_mapping_suggestions", ["status", "source"], {
        name: "template_row_mapping_suggestions_status_source_idx",
      })

      await queryInterface.createTable("account_mapping_suggestions", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "portfolios", key: "id" },
          onDelete: "SET NULL",
        },
        account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "accounts", key: "id" },
          onDelete: "CASCADE",
        },
        semantic_concept_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "semantic_concepts", key: "id" },
          onDelete: "CASCADE",
        },
        rank: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        confidence_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: false,
          defaultValue: 0,
        },
        rationale: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        signal_breakdown_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        source: {
          type: Sequelize.STRING(120),
          allowNull: false,
          defaultValue: "deterministic_engine",
        },
        status: {
          type: Sequelize.ENUM("suggested", "superseded"),
          allowNull: false,
          defaultValue: "suggested",
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        generated_by: {
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

      await queryInterface.addIndex("account_mapping_suggestions", ["account_id"], {
        name: "account_mapping_suggestions_account_idx",
      })
      await queryInterface.addIndex("account_mapping_suggestions", ["semantic_concept_id"], {
        name: "account_mapping_suggestions_concept_idx",
      })
      await queryInterface.addIndex("account_mapping_suggestions", ["portfolio_id"], {
        name: "account_mapping_suggestions_portfolio_idx",
      })
      await queryInterface.addIndex("account_mapping_suggestions", ["status", "source"], {
        name: "account_mapping_suggestions_status_source_idx",
      })
    } finally {
      restoreSchemaOps()
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("account_mapping_suggestions")
    await queryInterface.dropTable("template_row_mapping_suggestions")
  },
}
