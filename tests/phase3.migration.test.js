const migration = require("../src/migrations/20260412143000-phase3-semantic-concept-framework")

describe("phase 3 semantic concept framework migration", () => {
  test("adds semantic taxonomy columns, indexes, and upserts canonical concepts", async () => {
    const addedColumns = []
    const addedIndexes = []
    const bulkInsertMock = jest.fn().mockResolvedValue(undefined)

    const queryInterface = {
      describeTable: jest.fn(async (tableName) => {
        if (tableName === "semantic_concepts") return {}
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      addColumn: jest.fn(async (tableName, columnName) => {
        addedColumns.push(`${tableName}.${columnName}`)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}`)
      }),
      bulkInsert: bulkInsertMock,
    }

    await migration.up(queryInterface, {
      STRING: (value) => `STRING(${value})`,
      JSON: "JSON",
      INTEGER: "INTEGER",
    })

    expect(addedColumns).toEqual(
      expect.arrayContaining([
        "semantic_concepts.subcategory",
        "semantic_concepts.aggregation_behavior",
        "semantic_concepts.statement_type",
        "semantic_concepts.dimensions_allowed_json",
        "semantic_concepts.synonyms_json",
        "semantic_concepts.examples_json",
        "semantic_concepts.sort_order",
        "semantic_concepts.metadata_json",
      ]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "semantic_concepts.semantic_concepts_category_idx:category",
        "semantic_concepts.semantic_concepts_statement_type_idx:statement_type",
        "semantic_concepts.semantic_concepts_active_sort_idx:is_active,sort_order",
      ]),
    )
    expect(bulkInsertMock).toHaveBeenCalledWith(
      "semantic_concepts",
      expect.arrayContaining([
        expect.objectContaining({
          stable_key: "opening_cash",
          statement_type: "cash_flow",
        }),
      ]),
      expect.objectContaining({
        updateOnDuplicate: expect.arrayContaining(["statement_type", "metadata_json"]),
      }),
    )
  })
})
