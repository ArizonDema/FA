const mockFindAll = jest.fn()
const mockFindByPk = jest.fn()
const mockFindOne = jest.fn()
const mockCreate = jest.fn()

jest.mock("../src/models", () => ({
  SemanticConcept: {
    findAll: (...args) => mockFindAll(...args),
    findByPk: (...args) => mockFindByPk(...args),
    findOne: (...args) => mockFindOne(...args),
    create: (...args) => mockCreate(...args),
  },
}))

const SemanticConceptService = require("../src/modules/semantic/services/semanticConcept.service")

function createConcept(overrides = {}) {
  return {
    id: "concept-1",
    stable_key: "opening_cash",
    label: "Opening Cash",
    description: "Opening cash balance.",
    category: "cash_position",
    subcategory: "cash_bridge",
    expected_sign: "positive",
    expected_balance_type: "debit",
    aggregation_behavior: "opening_balance",
    statement_type: "cash_flow",
    dimensions_allowed_json: ["period", "currency"],
    synonyms_json: ["cash at beginning"],
    examples_json: ["Cash at beginning of period"],
    is_active: true,
    sort_order: 10,
    metadata_json: { seeded_family: "fund_accounting" },
    toJSON() {
      return { ...this }
    },
    ...overrides,
  }
}

describe("SemanticConceptService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("lists serialized semantic concepts with filters", async () => {
    mockFindAll.mockResolvedValue([createConcept()])

    const concepts = await SemanticConceptService.list({
      category: "cash_position",
      statementType: "cash_flow",
      activeOnly: true,
      query: "opening",
    })

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: "cash_position",
          statement_type: "cash_flow",
          is_active: true,
        }),
      }),
    )
    expect(concepts[0]).toEqual(
      expect.objectContaining({
        key: "opening_cash",
        active: true,
        aggregationBehavior: "opening_balance",
        statementType: "cash_flow",
      }),
    )
  })

  test("resolves a concept by normalized key", async () => {
    mockFindOne.mockResolvedValue(createConcept())

    const concept = await SemanticConceptService.getByKey("Opening Cash")

    expect(mockFindOne).toHaveBeenCalledWith({
      where: { stable_key: "opening_cash" },
    })
    expect(concept.key).toBe("opening_cash")
  })

  test("creates a validated semantic concept", async () => {
    mockFindOne.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValue(
      createConcept({
        id: "concept-2",
        stable_key: "capital_calls",
        label: "Capital Calls",
      }),
    )

    const concept = await SemanticConceptService.create(
      {
        key: "Capital Calls",
        label: "Capital Calls",
        description: "Capital called from investors.",
        category: "capital_activity",
        statementType: "capital_activity",
        aggregationBehavior: "sum",
        expectedSign: "positive",
        expectedBalanceType: "credit",
        dimensionsAllowed: ["period", "entity", "currency"],
        synonyms: ["drawdowns"],
        examples: ["Capital calls"],
        sortOrder: 50,
      },
      { actorId: "admin-1" },
    )

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stable_key: "capital_calls",
        statement_type: "capital_activity",
        metadata_json: expect.objectContaining({
          created_by_actor_id: "admin-1",
        }),
      }),
    )
    expect(concept.key).toBe("capital_calls")
  })

  test("lists semantic concept categories with counts", async () => {
    mockFindAll.mockResolvedValue([
      createConcept({ category: "cash_position" }),
      createConcept({ id: "concept-2", stable_key: "closing_cash", category: "cash_position" }),
      createConcept({ id: "concept-3", stable_key: "subscriptions", category: "capital_activity" }),
    ])

    const categories = await SemanticConceptService.listCategories({ activeOnly: true })
    const cashPosition = categories.find((item) => item.key === "cash_position")
    const capitalActivity = categories.find((item) => item.key === "capital_activity")

    expect(cashPosition.conceptCount).toBe(2)
    expect(capitalActivity.conceptCount).toBe(1)
  })
})
