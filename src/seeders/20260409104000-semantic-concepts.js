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

module.exports = {
  async up(queryInterface) {
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
    await queryInterface.bulkDelete("semantic_concepts", {
      stable_key: SEMANTIC_CONCEPT_TAXONOMY.map((definition) => definition.key),
    })
  },
}
