const migration = require("../src/migrations/20260415110000-phase4-deterministic-mapping-suggestions")

describe("phase 4 deterministic mapping suggestions migration", () => {
  test("creates dedicated suggestion tables and indexes", async () => {
    const createdTables = []
    const addedIndexes = []

    const queryInterface = {
      describeTable: jest.fn(async () => {
        throw Object.assign(new Error("No description found for table"), {
          original: { code: "ER_NO_SUCH_TABLE" },
        })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (tableName) => {
        createdTables.push(tableName)
      }),
      addIndex: jest.fn(async (tableName, columns, options) => {
        addedIndexes.push(`${tableName}.${options.name}:${columns.join(",")}`)
      }),
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      INTEGER: "INTEGER",
      TEXT: "TEXT",
      JSON: "JSON",
      DATE: "DATE",
      STRING: (value) => `STRING(${value})`,
      DECIMAL: (precision, scale) => `DECIMAL(${precision},${scale})`,
      ENUM: (...values) => `ENUM(${values.join(",")})`,
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(
      expect.arrayContaining(["template_row_mapping_suggestions", "account_mapping_suggestions"]),
    )
    expect(addedIndexes).toEqual(
      expect.arrayContaining([
        "template_row_mapping_suggestions.template_row_mapping_suggestions_version_idx:template_version_id",
        "template_row_mapping_suggestions.template_row_mapping_suggestions_row_idx:template_row_id",
        "account_mapping_suggestions.account_mapping_suggestions_account_idx:account_id",
        "account_mapping_suggestions.account_mapping_suggestions_status_source_idx:status,source",
      ]),
    )
  })
})
