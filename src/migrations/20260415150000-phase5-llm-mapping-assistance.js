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
  const description = await queryInterface.describeTable(tableName)
  return Object.prototype.hasOwnProperty.call(description, columnName)
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!indexName || !(await tableExists(queryInterface, tableName))) return false
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

async function constraintExists(queryInterface, tableName, constraintName) {
  if (!constraintName || !(await tableExists(queryInterface, tableName))) return false
  const [rows] = await queryInterface.sequelize.query(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND CONSTRAINT_NAME = :constraintName
      LIMIT 1
    `,
    {
      replacements: { tableName, constraintName },
    },
  )
  return rows.length > 0
}

function makeIdempotentSchemaOps(queryInterface) {
  const original = {
    createTable: queryInterface.createTable.bind(queryInterface),
    addColumn: queryInterface.addColumn.bind(queryInterface),
    addIndex: queryInterface.addIndex.bind(queryInterface),
    addConstraint: queryInterface.addConstraint.bind(queryInterface),
  }

  queryInterface.createTable = async (tableName, attributes, options, model) => {
    if (await tableExists(queryInterface, tableName)) return
    return original.createTable(tableName, attributes, options, model)
  }

  queryInterface.addColumn = async (tableName, columnName, definition, options) => {
    if (await columnExists(queryInterface, tableName, columnName)) return
    return original.addColumn(tableName, columnName, definition, options)
  }

  queryInterface.addIndex = async (tableName, attributes, options, rawTableName) => {
    const indexName = options?.name
    if (indexName && (await indexExists(queryInterface, tableName, indexName))) return
    return original.addIndex(tableName, attributes, options, rawTableName)
  }

  queryInterface.addConstraint = async (tableName, options) => {
    const constraintName = options?.name
    if (constraintName && (await constraintExists(queryInterface, tableName, constraintName))) return
    return original.addConstraint(tableName, options)
  }

  return () => {
    queryInterface.createTable = original.createTable
    queryInterface.addColumn = original.addColumn
    queryInterface.addIndex = original.addIndex
    queryInterface.addConstraint = original.addConstraint
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const restoreSchemaOps = makeIdempotentSchemaOps(queryInterface)

    try {
      await queryInterface.createTable("llm_mapping_traces", {
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
        provider: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: "ollama",
        },
        model: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        prompt_version: {
          type: Sequelize.STRING(50),
          allowNull: false,
        },
        prompt_hash: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        timeout_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        prompt_chars: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        request_bytes: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        duration_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM("pending", "success", "failed", "fallback"),
          allowNull: false,
          defaultValue: "pending",
        },
        parse_status: {
          type: Sequelize.ENUM("pending", "parsed", "rejected"),
          allowNull: false,
          defaultValue: "pending",
        },
        needs_human_review: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        disagreement_flag: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        failure_code: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        failure_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        request_payload_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        response_payload_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        parsed_response_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        metadata_json: {
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

      await queryInterface.addIndex("llm_mapping_traces", ["template_version_id"], {
        name: "llm_mapping_traces_version_idx",
      })
      await queryInterface.addIndex("llm_mapping_traces", ["template_row_id"], {
        name: "llm_mapping_traces_row_idx",
      })
      await queryInterface.addIndex("llm_mapping_traces", ["status", "parse_status"], {
        name: "llm_mapping_traces_status_idx",
      })

      await queryInterface.addColumn("template_row_mapping_suggestions", "llm_score", {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
      })
      await queryInterface.addColumn("template_row_mapping_suggestions", "merged_score", {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
      })
      await queryInterface.addColumn("template_row_mapping_suggestions", "llm_metadata_json", {
        type: Sequelize.JSON,
        allowNull: true,
      })
      await queryInterface.addColumn("template_row_mapping_suggestions", "needs_human_review", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      })
      await queryInterface.addColumn("template_row_mapping_suggestions", "trace_id", {
        type: Sequelize.UUID,
        allowNull: true,
      })

      await queryInterface.addConstraint("template_row_mapping_suggestions", {
        fields: ["trace_id"],
        type: "foreign key",
        name: "template_row_mapping_suggestions_trace_fk",
        references: {
          table: "llm_mapping_traces",
          field: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      })

      await queryInterface.addIndex("template_row_mapping_suggestions", ["trace_id"], {
        name: "template_row_mapping_suggestions_trace_idx",
      })
      await queryInterface.addIndex("template_row_mapping_suggestions", ["source", "needs_human_review"], {
        name: "template_row_mapping_suggestions_source_review_idx",
      })
    } finally {
      restoreSchemaOps()
    }
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "template_row_mapping_suggestions",
      "template_row_mapping_suggestions_trace_fk",
    )
    await queryInterface.removeColumn("template_row_mapping_suggestions", "trace_id")
    await queryInterface.removeColumn("template_row_mapping_suggestions", "needs_human_review")
    await queryInterface.removeColumn("template_row_mapping_suggestions", "llm_metadata_json")
    await queryInterface.removeColumn("template_row_mapping_suggestions", "merged_score")
    await queryInterface.removeColumn("template_row_mapping_suggestions", "llm_score")

    await queryInterface.dropTable("llm_mapping_traces")
  },
}
