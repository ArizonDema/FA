"use strict"

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName)
    return true
  } catch (error) {
    const message = String(error?.message || "")
    const code = error?.original?.code
    if (code === "ER_NO_SUCH_TABLE" || message.includes("No description found for")) return false
    throw error
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "cash_flow_account_mappings"))) return

    await queryInterface.changeColumn("cash_flow_account_mappings", "source", {
      type: Sequelize.ENUM(
        "manual_rule",
        "auto_semantic",
        "fallback",
        "template_rule",
        "seeded",
        "profile_auto",
        "llm_assisted",
      ),
      allowNull: false,
      defaultValue: "auto_semantic",
    })
  },

  async down(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "cash_flow_account_mappings"))) return

    await queryInterface.sequelize.query(`
      UPDATE cash_flow_account_mappings
      SET source = 'auto_semantic'
      WHERE source IN ('profile_auto', 'llm_assisted')
    `)

    await queryInterface.changeColumn("cash_flow_account_mappings", "source", {
      type: Sequelize.ENUM("manual_rule", "auto_semantic", "fallback", "template_rule", "seeded"),
      allowNull: false,
      defaultValue: "auto_semantic",
    })
  },
}
