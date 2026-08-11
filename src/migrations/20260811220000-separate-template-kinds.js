"use strict"

const ACTIVE_SCOPE_COLUMN = "active_scope_key"
const ACTIVE_SCOPE_INDEX = "cash_flow_templates_unique_active_kind"

async function columnExists(queryInterface, tableName, columnName) {
  const columns = await queryInterface.describeTable(tableName)
  return Object.prototype.hasOwnProperty.call(columns, columnName)
}

async function indexExists(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some((index) => index?.name === indexName)
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "cash_flow_template_analyses", "template_kind"))) {
      await queryInterface.addColumn("cash_flow_template_analyses", "template_kind", {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "cash_flow",
      })
    }

    await queryInterface.sequelize.query(
      "UPDATE cash_flow_templates SET template_kind = 'cash_flow' WHERE template_kind IS NULL OR template_kind = ''",
    )
    await queryInterface.sequelize.query(
      "UPDATE cash_flow_template_analyses SET template_kind = 'cash_flow' WHERE template_kind IS NULL OR template_kind = ''",
    )

    // Retain the newest active identity in each fund/kind before adding the hard uniqueness guard.
    await queryInterface.sequelize.query(`
      UPDATE cash_flow_templates older
      JOIN cash_flow_templates newer
        ON newer.portfolio_id = older.portfolio_id
       AND newer.template_kind = older.template_kind
       AND newer.is_active = 1
       AND older.is_active = 1
       AND (
         newer.created_at > older.created_at
         OR (newer.created_at = older.created_at AND newer.id > older.id)
       )
      SET older.is_active = 0, older.status = 'draft'
    `)

    if (!(await columnExists(queryInterface, "cash_flow_templates", ACTIVE_SCOPE_COLUMN))) {
      // VIRTUAL avoids a MySQL table rebuild, which is not possible here because
      // cash_flow_templates and template_versions intentionally reference each other.
      await queryInterface.sequelize.query(`
        ALTER TABLE cash_flow_templates
        ADD COLUMN ${ACTIVE_SCOPE_COLUMN} VARCHAR(100)
        GENERATED ALWAYS AS (
          CASE
            WHEN is_active = 1 THEN CONCAT(portfolio_id, ':', template_kind)
            ELSE NULL
          END
        ) VIRTUAL
      `)
    }

    if (!(await indexExists(queryInterface, "cash_flow_templates", ACTIVE_SCOPE_INDEX))) {
      await queryInterface.addIndex("cash_flow_templates", [ACTIVE_SCOPE_COLUMN], {
        name: ACTIVE_SCOPE_INDEX,
        unique: true,
      })
    }

    if (!(await indexExists(queryInterface, "cash_flow_templates", "cash_flow_templates_fund_kind_idx"))) {
      await queryInterface.addIndex("cash_flow_templates", ["portfolio_id", "template_kind"], {
        name: "cash_flow_templates_fund_kind_idx",
      })
    }

    if (!(await indexExists(queryInterface, "cash_flow_template_analyses", "cash_flow_template_analyses_kind_idx"))) {
      await queryInterface.addIndex("cash_flow_template_analyses", ["portfolio_id", "template_kind"], {
        name: "cash_flow_template_analyses_kind_idx",
      })
    }
  },

  async down(queryInterface) {
    if (await indexExists(queryInterface, "cash_flow_template_analyses", "cash_flow_template_analyses_kind_idx")) {
      await queryInterface.removeIndex("cash_flow_template_analyses", "cash_flow_template_analyses_kind_idx")
    }
    if (await indexExists(queryInterface, "cash_flow_templates", "cash_flow_templates_fund_kind_idx")) {
      await queryInterface.removeIndex("cash_flow_templates", "cash_flow_templates_fund_kind_idx")
    }
    if (await indexExists(queryInterface, "cash_flow_templates", ACTIVE_SCOPE_INDEX)) {
      await queryInterface.removeIndex("cash_flow_templates", ACTIVE_SCOPE_INDEX)
    }
    if (await columnExists(queryInterface, "cash_flow_templates", ACTIVE_SCOPE_COLUMN)) {
      await queryInterface.removeColumn("cash_flow_templates", ACTIVE_SCOPE_COLUMN)
    }
    if (await columnExists(queryInterface, "cash_flow_template_analyses", "template_kind")) {
      await queryInterface.removeColumn("cash_flow_template_analyses", "template_kind")
    }
  },
}
