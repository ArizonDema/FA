"use strict"

const crypto = require("crypto")
const {
  SEMANTIC_CONCEPT_TAXONOMY,
  toDatabaseConcept,
} = require("../modules/semantic/semanticConcept.catalog")

function serializeJsonColumn(value) {
  if (value === null || typeof value === "undefined") {
    return null
  }
  return JSON.stringify(value)
}

function toBulkInsertConceptRow(definition, timestamp) {
  const row = toDatabaseConcept({ ...definition, id: crypto.randomUUID() }, timestamp)
  return {
    ...row,
    dimensions_allowed_json: serializeJsonColumn(row.dimensions_allowed_json),
    synonyms_json: serializeJsonColumn(row.synonyms_json),
    examples_json: serializeJsonColumn(row.examples_json),
    metadata_json: serializeJsonColumn(row.metadata_json),
  }
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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "semantic_concepts"))) {
      return
    }

    const columnSpecs = [
      ["subcategory", { type: Sequelize.STRING(120), allowNull: true, after: "category" }],
      [
        "aggregation_behavior",
        { type: Sequelize.STRING(50), allowNull: false, defaultValue: "sum", after: "expected_balance_type" },
      ],
      ["statement_type", { type: Sequelize.STRING(50), allowNull: false, defaultValue: "generic", after: "aggregation_behavior" }],
      ["dimensions_allowed_json", { type: Sequelize.JSON, allowNull: true, after: "statement_type" }],
      ["synonyms_json", { type: Sequelize.JSON, allowNull: true, after: "dimensions_allowed_json" }],
      ["examples_json", { type: Sequelize.JSON, allowNull: true, after: "synonyms_json" }],
      ["sort_order", { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, after: "examples_json" }],
      ["metadata_json", { type: Sequelize.JSON, allowNull: true, after: "sort_order" }],
    ]

    for (const [columnName, definition] of columnSpecs) {
      if (!(await columnExists(queryInterface, "semantic_concepts", columnName))) {
        await queryInterface.addColumn("semantic_concepts", columnName, definition)
      }
    }

    if (!(await indexExists(queryInterface, "semantic_concepts", "semantic_concepts_category_idx"))) {
      await queryInterface.addIndex("semantic_concepts", ["category"], {
        name: "semantic_concepts_category_idx",
      })
    }

    if (!(await indexExists(queryInterface, "semantic_concepts", "semantic_concepts_statement_type_idx"))) {
      await queryInterface.addIndex("semantic_concepts", ["statement_type"], {
        name: "semantic_concepts_statement_type_idx",
      })
    }

    if (!(await indexExists(queryInterface, "semantic_concepts", "semantic_concepts_active_sort_idx"))) {
      await queryInterface.addIndex("semantic_concepts", ["is_active", "sort_order"], {
        name: "semantic_concepts_active_sort_idx",
      })
    }

    const timestamp = new Date()
    const rows = SEMANTIC_CONCEPT_TAXONOMY.map((definition) => toBulkInsertConceptRow(definition, timestamp))

    await queryInterface.bulkInsert("semantic_concepts", rows, {
      updateOnDuplicate: [
        "label",
        "description",
        "category",
        "subcategory",
        "expected_sign",
        "expected_balance_type",
        "aggregation_behavior",
        "statement_type",
        "dimensions_allowed_json",
        "synonyms_json",
        "examples_json",
        "sort_order",
        "metadata_json",
        "is_active",
        "updated_at",
      ],
    })
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, "semantic_concepts"))) {
      return
    }

    const indexes = [
      "semantic_concepts_active_sort_idx",
      "semantic_concepts_statement_type_idx",
      "semantic_concepts_category_idx",
    ]

    for (const indexName of indexes) {
      if (await indexExists(queryInterface, "semantic_concepts", indexName)) {
        await queryInterface.removeIndex("semantic_concepts", indexName)
      }
    }

    const columns = [
      "metadata_json",
      "sort_order",
      "examples_json",
      "synonyms_json",
      "dimensions_allowed_json",
      "statement_type",
      "aggregation_behavior",
      "subcategory",
    ]

    for (const columnName of columns) {
      if (await columnExists(queryInterface, "semantic_concepts", columnName)) {
        await queryInterface.removeColumn("semantic_concepts", columnName)
      }
    }
  },
}
