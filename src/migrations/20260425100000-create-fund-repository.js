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

async function constraintExists(queryInterface, tableName, constraintName) {
  if (!(await tableExists(queryInterface, tableName))) return false
  const [rows] = await queryInterface.sequelize.query(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND CONSTRAINT_NAME = :constraintName
      LIMIT 1
    `,
    { replacements: { tableName, constraintName } },
  )
  return rows.length > 0
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "fund_repository_items"))) {
      await queryInterface.createTable("fund_repository_items", {
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
        kind: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        category: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        period_start: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        period_end: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        current_version_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        tags_json: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        is_archived: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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

    if (!(await tableExists(queryInterface, "fund_repository_versions"))) {
      await queryInterface.createTable("fund_repository_versions", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4,
        },
        item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "fund_repository_items", key: "id" },
          onDelete: "CASCADE",
        },
        version_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        original_file_name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        storage_path: {
          type: Sequelize.STRING(700),
          allowNull: false,
        },
        mime_type: {
          type: Sequelize.STRING(160),
          allowNull: true,
        },
        extension: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        file_size: {
          type: Sequelize.BIGINT,
          allowNull: false,
        },
        sha256: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        is_archived: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        uploaded_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        uploaded_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn("NOW"),
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

    if (!(await constraintExists(queryInterface, "fund_repository_items", "fund_repository_items_current_version_fk"))) {
      await queryInterface.addConstraint("fund_repository_items", {
        fields: ["current_version_id"],
        type: "foreign key",
        name: "fund_repository_items_current_version_fk",
        references: {
          table: "fund_repository_versions",
          field: "id",
        },
        onDelete: "SET NULL",
      })
    }

    const indexes = [
      ["fund_repository_items", ["portfolio_id", "kind", "category"], "fund_repository_items_fund_kind_category_idx"],
      ["fund_repository_items", ["portfolio_id", "is_archived"], "fund_repository_items_fund_archive_idx"],
      ["fund_repository_versions", ["item_id", "version_number"], "fund_repository_versions_item_version_unique", true],
      ["fund_repository_versions", ["item_id", "sha256"], "fund_repository_versions_item_hash_unique", true],
    ]

    for (const [tableName, columns, indexName, unique = false] of indexes) {
      if (!(await indexExists(queryInterface, tableName, indexName))) {
        await queryInterface.addIndex(tableName, columns, { name: indexName, unique })
      }
    }
  },

  async down(queryInterface) {
    if (await constraintExists(queryInterface, "fund_repository_items", "fund_repository_items_current_version_fk")) {
      await queryInterface.removeConstraint("fund_repository_items", "fund_repository_items_current_version_fk")
    }
    if (await tableExists(queryInterface, "fund_repository_versions")) {
      await queryInterface.dropTable("fund_repository_versions")
    }
    if (await tableExists(queryInterface, "fund_repository_items")) {
      await queryInterface.dropTable("fund_repository_items")
    }
  },
}
