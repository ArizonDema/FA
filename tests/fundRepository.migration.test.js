const migration = require("../src/migrations/20260425100000-create-fund-repository")
const analysisMigration = require("../src/migrations/20260524100000-create-fund-repository-analysis")

describe("fund repository migration", () => {
  test("creates repository item/version tables, current-version constraint, and indexes", async () => {
    const createdTables = []
    const indexes = []
    const constraints = []
    const queryInterface = {
      describeTable: jest.fn(async (name) => {
        if (createdTables.includes(name)) return {}
        throw Object.assign(new Error("No description found for table"), { original: { code: "ER_NO_SUCH_TABLE" } })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (name) => createdTables.push(name)),
      addIndex: jest.fn(async (table, columns, options) => indexes.push(`${table}.${options.name}:${columns.join(",")}`)),
      addConstraint: jest.fn(async (table, options) => constraints.push(`${table}.${options.name}`)),
      sequelize: { query: jest.fn(async () => [[]]) },
    }

    await migration.up(queryInterface, {
      UUID: "UUID",
      UUIDV4: "UUIDV4",
      STRING: (size) => `STRING(${size})`,
      TEXT: "TEXT",
      DATEONLY: "DATEONLY",
      JSON: "JSON",
      BOOLEAN: "BOOLEAN",
      INTEGER: "INTEGER",
      BIGINT: "BIGINT",
      DATE: "DATE",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(expect.arrayContaining(["fund_repository_items", "fund_repository_versions"]))
    expect(constraints).toContain("fund_repository_items.fund_repository_items_current_version_fk")
    expect(indexes).toEqual(
      expect.arrayContaining([
        "fund_repository_items.fund_repository_items_fund_kind_category_idx:portfolio_id,kind,category",
        "fund_repository_versions.fund_repository_versions_item_version_unique:item_id,version_number",
        "fund_repository_versions.fund_repository_versions_item_hash_unique:item_id,sha256",
      ]),
    )
  })

  test("creates repository analysis and key point tables with lookup indexes", async () => {
    const createdTables = []
    const indexes = []
    const queryInterface = {
      describeTable: jest.fn(async (name) => {
        if (createdTables.includes(name)) return {}
        throw Object.assign(new Error("No description found for table"), { original: { code: "ER_NO_SUCH_TABLE" } })
      }),
      showIndex: jest.fn(async () => []),
      createTable: jest.fn(async (name) => createdTables.push(name)),
      addIndex: jest.fn(async (table, columns, options) => indexes.push(`${table}.${options.name}:${columns.join(",")}`)),
    }

    await analysisMigration.up(queryInterface, {
      UUID: "UUID",
      UUIDV4: "UUIDV4",
      STRING: (size) => `STRING(${size})`,
      TEXT: "TEXT",
      JSON: "JSON",
      DECIMAL: () => "DECIMAL",
      DATE: "DATE",
      fn: () => "NOW",
    })

    expect(createdTables).toEqual(expect.arrayContaining(["fund_repository_analyses", "fund_repository_key_points"]))
    expect(indexes).toEqual(
      expect.arrayContaining([
        "fund_repository_analyses.fund_repository_analyses_fund_item_idx:portfolio_id,item_id,created_at",
        "fund_repository_key_points.fund_repository_key_points_analysis_key_unique:analysis_id,point_key",
      ]),
    )
  })
})
