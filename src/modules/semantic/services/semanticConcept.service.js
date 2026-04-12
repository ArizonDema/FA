const { Op } = require("sequelize")
const { SemanticConcept } = require("../../../models")
const {
  AGGREGATION_BEHAVIORS,
  EXPECTED_BALANCE_TYPES,
  EXPECTED_SIGNS,
  SEMANTIC_CONCEPT_CATEGORIES,
  STATEMENT_TYPES,
} = require("../semanticConcept.catalog")

const CATEGORY_KEYS = new Set(SEMANTIC_CONCEPT_CATEGORIES.map((item) => item.key))
const EXPECTED_SIGN_KEYS = new Set(EXPECTED_SIGNS)
const EXPECTED_BALANCE_TYPE_KEYS = new Set(EXPECTED_BALANCE_TYPES)
const AGGREGATION_BEHAVIOR_KEYS = new Set(AGGREGATION_BEHAVIORS)
const STATEMENT_TYPE_KEYS = new Set(STATEMENT_TYPES)

class SemanticConceptValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = "SemanticConceptValidationError"
    this.details = details
  }
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeString(value, fieldName, { required = false, maxLength = null } = {}) {
  const normalized = String(value || "").trim()
  if (!normalized) {
    if (required) {
      throw new SemanticConceptValidationError(`${fieldName} is required`)
    }
    return null
  }

  if (maxLength && normalized.length > maxLength) {
    throw new SemanticConceptValidationError(`${fieldName} must be ${maxLength} characters or fewer`)
  }

  return normalized
}

function normalizeArray(value) {
  if (value === null || value === undefined || value === "") return []
  if (!Array.isArray(value)) {
    throw new SemanticConceptValidationError("Expected an array value")
  }

  const unique = []
  const seen = new Set()
  value.forEach((item) => {
    const normalized = String(item || "").trim()
    if (!normalized || seen.has(normalized.toLowerCase())) return
    seen.add(normalized.toLowerCase())
    unique.push(normalized)
  })
  return unique
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return fallback
}

function assertEnum(value, allowedSet, fieldName) {
  if (value === null || value === undefined || value === "") return null
  if (!allowedSet.has(value)) {
    throw new SemanticConceptValidationError(`${fieldName} must be one of: ${Array.from(allowedSet).join(", ")}`)
  }
  return value
}

function serializeConcept(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  if (!payload || !payload.id) return payload

  return {
    ...payload,
    key: payload.stable_key,
    active: Boolean(payload.is_active),
    expectedSign: payload.expected_sign || null,
    expectedBalanceType: payload.expected_balance_type || null,
    aggregationBehavior: payload.aggregation_behavior || null,
    statementType: payload.statement_type || null,
    dimensionsAllowed: payload.dimensions_allowed_json || [],
    synonyms: payload.synonyms_json || [],
    examples: payload.examples_json || [],
    sortOrder: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
    metadata: payload.metadata_json || null,
  }
}

function buildWhereClause({ category = null, statementType = null, activeOnly = null, query = null } = {}) {
  const where = {}

  if (category) {
    where.category = category
  }

  if (statementType) {
    where.statement_type = statementType
  }

  if (activeOnly !== null) {
    where.is_active = Boolean(activeOnly)
  }

  if (query) {
    const likeQuery = `%${String(query).trim()}%`
    where[Op.or] = [
      { stable_key: { [Op.like]: likeQuery } },
      { label: { [Op.like]: likeQuery } },
      { description: { [Op.like]: likeQuery } },
      { subcategory: { [Op.like]: likeQuery } },
    ]
  }

  return where
}

function normalizeCreatePayload(payload = {}) {
  const key = normalizeKey(payload.key || payload.stable_key)
  if (!key) {
    throw new SemanticConceptValidationError("key is required")
  }

  const category = normalizeString(payload.category, "category", { required: true, maxLength: 120 })
  assertEnum(category, CATEGORY_KEYS, "category")

  const statementType = normalizeString(payload.statement_type || payload.statementType, "statement_type", {
    required: false,
    maxLength: 50,
  })
  const aggregationBehavior = normalizeString(
    payload.aggregation_behavior || payload.aggregationBehavior,
    "aggregation_behavior",
    { required: false, maxLength: 50 },
  )
  const expectedSign = normalizeString(payload.expected_sign || payload.expectedSign, "expected_sign", {
    required: false,
    maxLength: 20,
  })
  const expectedBalanceType = normalizeString(
    payload.expected_balance_type || payload.expectedBalanceType,
    "expected_balance_type",
    { required: false, maxLength: 50 },
  )

  assertEnum(statementType || "generic", STATEMENT_TYPE_KEYS, "statement_type")
  assertEnum(aggregationBehavior || "sum", AGGREGATION_BEHAVIOR_KEYS, "aggregation_behavior")
  if (expectedSign) assertEnum(expectedSign, EXPECTED_SIGN_KEYS, "expected_sign")
  if (expectedBalanceType) assertEnum(expectedBalanceType, EXPECTED_BALANCE_TYPE_KEYS, "expected_balance_type")

  const label = normalizeString(payload.label, "label", { required: true, maxLength: 255 })
  const description = normalizeString(payload.description, "description", { required: false })
  const subcategory = normalizeString(payload.subcategory, "subcategory", { required: false, maxLength: 120 })

  let dimensionsAllowed = []
  let synonyms = []
  let examples = []

  try {
    dimensionsAllowed = normalizeArray(payload.dimensions_allowed_json || payload.dimensionsAllowed)
    synonyms = normalizeArray(payload.synonyms_json || payload.synonyms)
    examples = normalizeArray(payload.examples_json || payload.examples)
  } catch (error) {
    if (error instanceof SemanticConceptValidationError) {
      throw error
    }
    throw new SemanticConceptValidationError("Array fields must be arrays of strings")
  }

  const sortOrderValue =
    payload.sort_order !== undefined && payload.sort_order !== null && payload.sort_order !== ""
      ? Number(payload.sort_order)
      : payload.sortOrder !== undefined && payload.sortOrder !== null && payload.sortOrder !== ""
        ? Number(payload.sortOrder)
        : 0

  if (!Number.isInteger(sortOrderValue) || sortOrderValue < 0) {
    throw new SemanticConceptValidationError("sort_order must be a non-negative integer")
  }

  const metadata = payload.metadata_json || payload.metadata || null
  if (metadata !== null && metadata !== undefined && typeof metadata !== "object") {
    throw new SemanticConceptValidationError("metadata must be a JSON object when provided")
  }

  return {
    stable_key: key,
    label,
    description,
    category,
    subcategory,
    expected_sign: expectedSign || "either",
    expected_balance_type: expectedBalanceType || "either",
    aggregation_behavior: aggregationBehavior || "sum",
    statement_type: statementType || "generic",
    dimensions_allowed_json: dimensionsAllowed,
    synonyms_json: synonyms,
    examples_json: examples,
    is_active: normalizeBoolean(payload.is_active ?? payload.active, true),
    sort_order: sortOrderValue,
    metadata_json: metadata,
  }
}

class SemanticConceptService {
  static serialize(record) {
    return serializeConcept(record)
  }

  static async list({ category = null, statementType = null, activeOnly = null, query = null } = {}) {
    const concepts = await SemanticConcept.findAll({
      where: buildWhereClause({ category, statementType, activeOnly, query }),
      order: [
        ["category", "ASC"],
        ["sort_order", "ASC"],
        ["stable_key", "ASC"],
      ],
    })

    return concepts.map((record) => serializeConcept(record))
  }

  static async getById(id) {
    const concept = await SemanticConcept.findByPk(id)
    return concept ? serializeConcept(concept) : null
  }

  static async getByKey(key) {
    const normalizedKey = normalizeKey(key)
    if (!normalizedKey) return null

    const concept = await SemanticConcept.findOne({
      where: { stable_key: normalizedKey },
    })

    return concept ? serializeConcept(concept) : null
  }

  static async listCategories({ activeOnly = null, statementType = null } = {}) {
    const concepts = await SemanticConcept.findAll({
      where: buildWhereClause({ activeOnly, statementType }),
      order: [["category", "ASC"]],
    })

    const counts = new Map()
    concepts.forEach((concept) => {
      const category = concept.category
      counts.set(category, (counts.get(category) || 0) + 1)
    })

    return SEMANTIC_CONCEPT_CATEGORIES.map((definition, index) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      conceptCount: counts.get(definition.key) || 0,
      sortOrder: index,
    }))
  }

  static async create(payload, { actorId = null } = {}) {
    const attributes = normalizeCreatePayload(payload)

    const existing = await SemanticConcept.findOne({
      where: { stable_key: attributes.stable_key },
    })

    if (existing) {
      throw new SemanticConceptValidationError(`Semantic concept key "${attributes.stable_key}" already exists`)
    }

    const concept = await SemanticConcept.create({
      ...attributes,
      metadata_json: {
        ...(attributes.metadata_json || {}),
        created_by_actor_id: actorId || null,
      },
    })

    return serializeConcept(concept)
  }
}

SemanticConceptService.ValidationError = SemanticConceptValidationError

module.exports = SemanticConceptService
