"use strict"

const crypto = require("crypto")

function uuid() {
  return crypto.randomUUID()
}

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
  if (!(await tableExists(queryInterface, tableName))) {
    return false
  }
  const columns = await queryInterface.describeTable(tableName)
  return Object.prototype.hasOwnProperty.call(columns, columnName)
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!indexName || !(await tableExists(queryInterface, tableName))) {
    return false
  }
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

async function constraintExists(queryInterface, tableName, constraintName) {
  if (!constraintName || !(await tableExists(queryInterface, tableName))) {
    return false
  }
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
    addColumn: queryInterface.addColumn.bind(queryInterface),
    createTable: queryInterface.createTable.bind(queryInterface),
    addIndex: queryInterface.addIndex.bind(queryInterface),
    addConstraint: queryInterface.addConstraint.bind(queryInterface),
  }

  queryInterface.addColumn = async (tableName, columnName, definition, options) => {
    if (await columnExists(queryInterface, tableName, columnName)) {
      return
    }
    return original.addColumn(tableName, columnName, definition, options)
  }

  queryInterface.createTable = async (tableName, attributes, options, model) => {
    if (await tableExists(queryInterface, tableName)) {
      return
    }
    return original.createTable(tableName, attributes, options, model)
  }

  queryInterface.addIndex = async (tableName, attributes, options, rawTablename) => {
    const indexName = options?.name
    if (indexName && (await indexExists(queryInterface, tableName, indexName))) {
      return
    }
    return original.addIndex(tableName, attributes, options, rawTablename)
  }

  queryInterface.addConstraint = async (tableName, options) => {
    const constraintName = options?.name
    if (constraintName && (await constraintExists(queryInterface, tableName, constraintName))) {
      return
    }
    return original.addConstraint(tableName, options)
  }

  return () => {
    queryInterface.addColumn = original.addColumn
    queryInterface.createTable = original.createTable
    queryInterface.addIndex = original.addIndex
    queryInterface.addConstraint = original.addConstraint
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const restoreSchemaOps = makeIdempotentSchemaOps(queryInterface)
    try {
    await queryInterface.addColumn("cash_flow_templates", "template_kind", {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: "cash_flow",
    })

    await queryInterface.addColumn("cash_flow_templates", "status", {
      type: Sequelize.ENUM("draft", "active", "archived"),
      allowNull: false,
      defaultValue: "active",
    })

    await queryInterface.addColumn("cash_flow_templates", "active_version_id", {
      type: Sequelize.UUID,
      allowNull: true,
    })

    await queryInterface.createTable("template_versions", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "cash_flow_templates", key: "id" },
        onDelete: "CASCADE",
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      version_label: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      source_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      source_file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      source_file_sha256: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      config_json: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      schema_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      raw_structure_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      llm_meta_json: {
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

    await queryInterface.addIndex("template_versions", ["template_id"], { name: "template_versions_template_idx" })
    await queryInterface.addIndex("template_versions", ["portfolio_id"], { name: "template_versions_portfolio_idx" })
    await queryInterface.addIndex("template_versions", ["template_id", "version_number"], {
      unique: true,
      name: "template_versions_unique_number",
    })

    await queryInterface.createTable("template_rows", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      template_version_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "template_versions", key: "id" },
        onDelete: "CASCADE",
      },
      sheet_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      row_index: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      row_key: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      cell_addresses_json: {
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

    await queryInterface.addIndex("template_rows", ["template_version_id"], { name: "template_rows_version_idx" })

    await queryInterface.addColumn("cash_flow_template_analyses", "template_version_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "template_versions", key: "id" },
      onDelete: "SET NULL",
    })

    await queryInterface.createTable("semantic_concepts", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      stable_key: {
        type: Sequelize.STRING(120),
        allowNull: false,
        unique: true,
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      expected_sign: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      expected_balance_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.createTable("accounts", {
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
      code: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      normalized_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      source_system: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      source_ref: {
        type: Sequelize.STRING(255),
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

    await queryInterface.addIndex("accounts", ["portfolio_id"], { name: "accounts_portfolio_idx" })
    await queryInterface.addIndex("accounts", ["normalized_name"], { name: "accounts_normalized_name_idx" })

    await queryInterface.createTable("account_semantic_mappings", {
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
      status: {
        type: Sequelize.ENUM("suggested", "approved", "rejected"),
        allowNull: false,
        defaultValue: "suggested",
      },
      effective_start: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      effective_end: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      confidence: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: "manual",
      },
      metadata_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      suggested_by: {
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

    await queryInterface.addIndex("account_semantic_mappings", ["account_id"], {
      name: "account_semantic_mappings_account_idx",
    })
    await queryInterface.addIndex("account_semantic_mappings", ["semantic_concept_id"], {
      name: "account_semantic_mappings_concept_idx",
    })

    await queryInterface.createTable("template_row_semantic_mappings", {
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
      status: {
        type: Sequelize.ENUM("suggested", "approved", "rejected"),
        allowNull: false,
        defaultValue: "suggested",
      },
      effective_start: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      effective_end: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      confidence: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: Sequelize.STRING(120),
        allowNull: false,
        defaultValue: "manual",
      },
      metadata_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      suggested_by: {
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

    await queryInterface.addIndex("template_row_semantic_mappings", ["template_row_id"], {
      name: "template_row_semantic_mappings_row_idx",
    })
    await queryInterface.addIndex("template_row_semantic_mappings", ["semantic_concept_id"], {
      name: "template_row_semantic_mappings_concept_idx",
    })

    await queryInterface.addColumn("cash_flow_account_mappings", "status", {
      type: Sequelize.ENUM("suggested", "approved", "rejected"),
      allowNull: false,
      defaultValue: "suggested",
    })
    await queryInterface.addColumn("cash_flow_account_mappings", "effective_start", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    })
    await queryInterface.addColumn("cash_flow_account_mappings", "effective_end", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    })
    await queryInterface.addColumn("cash_flow_account_mappings", "metadata_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })

    await queryInterface.addColumn("report_templates", "definition_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })
    await queryInterface.addColumn("report_templates", "status", {
      type: Sequelize.ENUM("draft", "active", "archived"),
      allowNull: false,
      defaultValue: "draft",
    })
    await queryInterface.addColumn("report_templates", "published_at", {
      type: Sequelize.DATE,
      allowNull: true,
    })

    await queryInterface.addColumn("report_runs", "template_version_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "template_versions", key: "id" },
      onDelete: "SET NULL",
    })
    await queryInterface.addColumn("report_runs", "mapping_snapshot_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })
    await queryInterface.addColumn("report_runs", "input_artifacts_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })
    await queryInterface.addColumn("report_runs", "output_artifacts_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })

    await queryInterface.addColumn("audit_logs", "event_type", {
      type: Sequelize.STRING(120),
      allowNull: true,
    })
    await queryInterface.addColumn("audit_logs", "metadata_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })
    await queryInterface.addColumn("audit_logs", "occurred_at", {
      type: Sequelize.DATE,
      allowNull: true,
    })

    const [templates] = await queryInterface.sequelize.query(`
      SELECT id, portfolio_id, version, template_file_name, template_file_path, config_json, uploaded_by, created_at, updated_at
      FROM cash_flow_templates
    `)

    for (const template of templates) {
      const [existingVersion] = await queryInterface.sequelize.query(
        `
          SELECT id
          FROM template_versions
          WHERE template_id = :templateId
            AND version_number = 1
          LIMIT 1
        `,
        {
          replacements: { templateId: template.id },
        },
      )

      const versionId = existingVersion?.[0]?.id || uuid()
      if (!existingVersion?.[0]?.id) {
        let normalizedConfigJson = template.config_json
        if (typeof normalizedConfigJson === "string") {
          try {
            normalizedConfigJson = JSON.parse(normalizedConfigJson)
          } catch (error) {
            normalizedConfigJson = {}
          }
        }
        if (!normalizedConfigJson || typeof normalizedConfigJson !== "object") {
          normalizedConfigJson = {}
        }

        await queryInterface.bulkInsert("template_versions", [
          {
            id: versionId,
            template_id: template.id,
            portfolio_id: template.portfolio_id,
            version_number: 1,
            version_label: template.version || "v1",
            source_file_name: template.template_file_name,
            source_file_path: template.template_file_path,
            source_file_sha256: null,
            config_json: JSON.stringify(normalizedConfigJson),
            schema_hash: null,
            raw_structure_json: null,
            llm_meta_json: null,
            created_by: template.uploaded_by || null,
            created_at: template.created_at || new Date(),
            updated_at: template.updated_at || new Date(),
          },
        ])
      }

      await queryInterface.sequelize.query(
        `
          UPDATE cash_flow_templates
          SET active_version_id = :versionId,
              template_kind = 'cash_flow',
              status = CASE WHEN is_active = 1 THEN 'active' ELSE 'draft' END
          WHERE id = :templateId
        `,
        {
          replacements: {
            versionId,
            templateId: template.id,
          },
        },
      )
    }

    await queryInterface.sequelize.query(`
      UPDATE cash_flow_templates t
      LEFT JOIN template_versions tv ON tv.id = t.active_version_id
      SET t.active_version_id = NULL
      WHERE t.active_version_id IS NOT NULL
        AND tv.id IS NULL
    `)

    await queryInterface.addConstraint("cash_flow_templates", {
      fields: ["active_version_id"],
      type: "foreign key",
      name: "cash_flow_templates_active_version_fk",
      references: {
        table: "template_versions",
        field: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    })

    await queryInterface.sequelize.query(`
      UPDATE cash_flow_template_analyses a
      JOIN cash_flow_templates t ON a.template_id = t.id
      SET a.template_version_id = t.active_version_id
      WHERE a.template_id IS NOT NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE cash_flow_account_mappings
      SET status = 'approved'
      WHERE status IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE report_templates
      SET definition_json = JSON_OBJECT(
        'type', type,
        'name', name,
        'template_body', template_body
      ),
      status = 'active',
      published_at = created_at
      WHERE definition_json IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE report_runs
      SET input_artifacts_json = inputs_json,
          output_artifacts_json = output_paths
      WHERE input_artifacts_json IS NULL OR output_artifacts_json IS NULL
    `)

    await queryInterface.sequelize.query(`
      UPDATE audit_logs
      SET event_type = action,
          occurred_at = created_at
      WHERE event_type IS NULL OR occurred_at IS NULL
    `)
    } finally {
      restoreSchemaOps()
    }
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("cash_flow_templates", "cash_flow_templates_active_version_fk")

    await queryInterface.removeColumn("audit_logs", "occurred_at")
    await queryInterface.removeColumn("audit_logs", "metadata_json")
    await queryInterface.removeColumn("audit_logs", "event_type")

    await queryInterface.removeColumn("report_runs", "output_artifacts_json")
    await queryInterface.removeColumn("report_runs", "input_artifacts_json")
    await queryInterface.removeColumn("report_runs", "mapping_snapshot_json")
    await queryInterface.removeColumn("report_runs", "template_version_id")

    await queryInterface.removeColumn("report_templates", "published_at")
    await queryInterface.removeColumn("report_templates", "status")
    await queryInterface.removeColumn("report_templates", "definition_json")

    await queryInterface.removeColumn("cash_flow_account_mappings", "metadata_json")
    await queryInterface.removeColumn("cash_flow_account_mappings", "effective_end")
    await queryInterface.removeColumn("cash_flow_account_mappings", "effective_start")
    await queryInterface.removeColumn("cash_flow_account_mappings", "status")

    await queryInterface.dropTable("template_row_semantic_mappings")
    await queryInterface.dropTable("account_semantic_mappings")
    await queryInterface.dropTable("accounts")
    await queryInterface.dropTable("semantic_concepts")

    await queryInterface.removeColumn("cash_flow_template_analyses", "template_version_id")

    await queryInterface.dropTable("template_rows")
    await queryInterface.dropTable("template_versions")

    await queryInterface.removeColumn("cash_flow_templates", "active_version_id")
    await queryInterface.removeColumn("cash_flow_templates", "status")
    await queryInterface.removeColumn("cash_flow_templates", "template_kind")
  },
}
