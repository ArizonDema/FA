const { SemanticConcept } = require("../../../models")
const { normalizePhrase, tokenizePhrase, uniqueValues } = require("../utils/mappingText.util")

function serializeConcept(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  return {
    id: payload.id,
    stableKey: payload.stable_key,
    label: payload.label,
    description: payload.description || null,
    category: payload.category,
    subcategory: payload.subcategory || null,
    expectedSign: payload.expected_sign || null,
    expectedBalanceType: payload.expected_balance_type || null,
    aggregationBehavior: payload.aggregation_behavior || "sum",
    statementType: payload.statement_type || "generic",
    dimensionsAllowed: payload.dimensions_allowed_json || [],
    synonyms: payload.synonyms_json || [],
    examples: payload.examples_json || [],
    sortOrder: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
    metadata: payload.metadata_json || null,
  }
}

function buildIndexEntry(record) {
  const concept = serializeConcept(record)
  const keyPhrase = normalizePhrase(String(concept.stableKey || "").replace(/_/g, " "))
  const labelPhrase = normalizePhrase(concept.label)
  const synonymPhrases = uniqueValues(concept.synonyms.map((item) => normalizePhrase(item)))
  const examplePhrases = uniqueValues(concept.examples.map((item) => normalizePhrase(item)))
  const auxiliaryPhrases = uniqueValues(
    [concept.category, concept.subcategory, concept.statementType]
      .filter(Boolean)
      .map((item) => normalizePhrase(String(item).replace(/_/g, " "))),
  )
  const searchablePhrases = uniqueValues([keyPhrase, labelPhrase, ...synonymPhrases, ...examplePhrases])
  const searchableTokens = Array.from(
    new Set(searchablePhrases.flatMap((phrase) => tokenizePhrase(phrase)).filter(Boolean)),
  )

  return {
    ...concept,
    keyPhrase,
    labelPhrase,
    synonymPhrases,
    examplePhrases,
    auxiliaryPhrases,
    searchablePhrases,
    searchableTokens,
  }
}

class SemanticConceptSearchIndexService {
  static async loadActiveConcepts() {
    const concepts = await SemanticConcept.findAll({
      where: { is_active: true },
      order: [
        ["sort_order", "ASC"],
        ["stable_key", "ASC"],
      ],
    })

    return concepts.map((record) => buildIndexEntry(record))
  }
}

module.exports = SemanticConceptSearchIndexService
