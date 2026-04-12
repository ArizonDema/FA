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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, "template_versions")) {
      if (!(await columnExists(queryInterface, "template_versions", "parsed_structure_json"))) {
        await queryInterface.addColumn("template_versions", "parsed_structure_json", {
          type: Sequelize.JSON,
          allowNull: true,
          after: "llm_meta_json",
        })
      }

      if (!(await columnExists(queryInterface, "template_versions", "parse_metadata_json"))) {
        await queryInterface.addColumn("template_versions", "parse_metadata_json", {
          type: Sequelize.JSON,
          allowNull: true,
          after: "parsed_structure_json",
        })
      }

      if (!(await columnExists(queryInterface, "template_versions", "parsed_at"))) {
        await queryInterface.addColumn("template_versions", "parsed_at", {
          type: Sequelize.DATE,
          allowNull: true,
          after: "parse_metadata_json",
        })
      }
    }

    if (await tableExists(queryInterface, "template_rows")) {
      const rowColumns = [
        ["row_type", { type: Sequelize.STRING(50), allowNull: true, after: "label" }],
        ["indentation_level", { type: Sequelize.INTEGER, allowNull: true, after: "row_type" }],
        ["formula_text", { type: Sequelize.TEXT, allowNull: true, after: "indentation_level" }],
        ["row_order", { type: Sequelize.INTEGER, allowNull: true, after: "formula_text" }],
        ["section_name", { type: Sequelize.STRING(255), allowNull: true, after: "row_order" }],
        ["parent_section_name", { type: Sequelize.STRING(255), allowNull: true, after: "section_name" }],
        ["expected_data_type", { type: Sequelize.STRING(50), allowNull: true, after: "parent_section_name" }],
        ["cell_range", { type: Sequelize.STRING(100), allowNull: true, after: "expected_data_type" }],
        ["is_formula", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, after: "cell_range" }],
        ["raw_json", { type: Sequelize.JSON, allowNull: true, after: "cell_addresses_json" }],
      ]

      for (const [columnName, definition] of rowColumns) {
        if (!(await columnExists(queryInterface, "template_rows", columnName))) {
          await queryInterface.addColumn("template_rows", columnName, definition)
        }
      }

      if (!(await indexExists(queryInterface, "template_rows", "template_rows_version_sheet_order_idx"))) {
        await queryInterface.addIndex("template_rows", ["template_version_id", "sheet_name", "row_order"], {
          name: "template_rows_version_sheet_order_idx",
        })
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, "template_rows")) {
      if (await indexExists(queryInterface, "template_rows", "template_rows_version_sheet_order_idx")) {
        await queryInterface.removeIndex("template_rows", "template_rows_version_sheet_order_idx")
      }

      const rowColumns = [
        "raw_json",
        "is_formula",
        "cell_range",
        "expected_data_type",
        "parent_section_name",
        "section_name",
        "row_order",
        "formula_text",
        "indentation_level",
        "row_type",
      ]

      for (const columnName of rowColumns) {
        if (await columnExists(queryInterface, "template_rows", columnName)) {
          await queryInterface.removeColumn("template_rows", columnName)
        }
      }
    }

    if (await tableExists(queryInterface, "template_versions")) {
      const versionColumns = ["parsed_at", "parse_metadata_json", "parsed_structure_json"]
      for (const columnName of versionColumns) {
        if (await columnExists(queryInterface, "template_versions", columnName)) {
          await queryInterface.removeColumn("template_versions", columnName)
        }
      }
    }
  },
}
