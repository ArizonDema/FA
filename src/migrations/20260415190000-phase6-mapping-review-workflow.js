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
      await queryInterface.createTable("review_tasks", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },
        task_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "mapping_review",
        },
        target_type: {
          type: Sequelize.STRING(80),
          allowNull: false,
          defaultValue: "template_row",
        },
        target_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        template_version_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "template_versions", key: "id" },
          onDelete: "CASCADE",
        },
        portfolio_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "portfolios", key: "id" },
          onDelete: "SET NULL",
        },
        status: {
          type: Sequelize.ENUM("open", "in_review", "approved", "rejected", "overridden", "deferred"),
          allowNull: false,
          defaultValue: "open",
        },
        priority: {
          type: Sequelize.ENUM("low", "medium", "high"),
          allowNull: false,
          defaultValue: "medium",
        },
        review_reason: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        assigned_to: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        completed_at: {
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

      await queryInterface.addIndex("review_tasks", ["template_version_id"], {
        name: "review_tasks_version_idx",
      })
      await queryInterface.addIndex("review_tasks", ["portfolio_id"], {
        name: "review_tasks_portfolio_idx",
      })
      await queryInterface.addIndex("review_tasks", ["target_type", "target_id"], {
        name: "review_tasks_target_idx",
      })
      await queryInterface.addIndex("review_tasks", ["status", "priority"], {
        name: "review_tasks_status_priority_idx",
      })

      await queryInterface.createTable("review_decisions", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },
        review_task_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "review_tasks", key: "id" },
          onDelete: "CASCADE",
        },
        action_type: {
          type: Sequelize.ENUM("approve", "reject", "override", "defer"),
          allowNull: false,
        },
        selected_semantic_concept_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "semantic_concepts", key: "id" },
          onDelete: "SET NULL",
        },
        selected_suggestion_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        result_mapping_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        rationale: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        actor_id: {
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

      await queryInterface.addIndex("review_decisions", ["review_task_id"], {
        name: "review_decisions_task_idx",
      })
      await queryInterface.addIndex("review_decisions", ["actor_id"], {
        name: "review_decisions_actor_idx",
      })
      await queryInterface.addIndex("review_decisions", ["action_type"], {
        name: "review_decisions_action_idx",
      })

      await queryInterface.addColumn("template_row_semantic_mappings", "review_task_id", {
        type: Sequelize.UUID,
        allowNull: true,
      })
      await queryInterface.addColumn("template_row_semantic_mappings", "review_decision_id", {
        type: Sequelize.UUID,
        allowNull: true,
      })

      await queryInterface.addConstraint("template_row_semantic_mappings", {
        fields: ["review_task_id"],
        type: "foreign key",
        name: "template_row_semantic_mappings_review_task_fk",
        references: {
          table: "review_tasks",
          field: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      })

      await queryInterface.addConstraint("template_row_semantic_mappings", {
        fields: ["review_decision_id"],
        type: "foreign key",
        name: "template_row_semantic_mappings_review_decision_fk",
        references: {
          table: "review_decisions",
          field: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      })

      await queryInterface.addIndex("template_row_semantic_mappings", ["review_task_id"], {
        name: "template_row_semantic_mappings_review_task_idx",
      })
      await queryInterface.addIndex("template_row_semantic_mappings", ["review_decision_id"], {
        name: "template_row_semantic_mappings_review_decision_idx",
      })
    } finally {
      restoreSchemaOps()
    }
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "template_row_semantic_mappings",
      "template_row_semantic_mappings_review_decision_fk",
    )
    await queryInterface.removeConstraint(
      "template_row_semantic_mappings",
      "template_row_semantic_mappings_review_task_fk",
    )
    await queryInterface.removeColumn("template_row_semantic_mappings", "review_decision_id")
    await queryInterface.removeColumn("template_row_semantic_mappings", "review_task_id")
    await queryInterface.dropTable("review_decisions")
    await queryInterface.dropTable("review_tasks")
  },
}
