"use strict"

const crypto = require("crypto")
const {
  SEMANTIC_CONCEPT_TAXONOMY,
  toDatabaseConcept,
} = require("../modules/semantic/semanticConcept.catalog")

module.exports = {
  async up(queryInterface) {
    const timestamp = new Date()
    const rows = SEMANTIC_CONCEPT_TAXONOMY.map((definition) =>
      toDatabaseConcept({ ...definition, id: crypto.randomUUID() }, timestamp),
    )

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
