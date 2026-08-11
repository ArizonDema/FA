"use strict"

const REPORT_TYPES = [
  "cash_flow",
  "shareholder_register",
  "financial_statements",
  "capital_account_statement",
]
const LEGACY_REPORT_TYPES = ["cash_flow", "shareholder_register", "financial_statements"]

async function changeReportType(queryInterface, Sequelize, tableName, values) {
  await queryInterface.changeColumn(tableName, "type", {
    type: Sequelize.ENUM(...values),
    allowNull: false,
  })
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await changeReportType(queryInterface, Sequelize, "report_templates", REPORT_TYPES)
    await changeReportType(queryInterface, Sequelize, "report_runs", REPORT_TYPES)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE report_templates SET type = 'financial_statements' WHERE type = 'capital_account_statement'",
    )
    await queryInterface.sequelize.query(
      "UPDATE report_runs SET type = 'financial_statements' WHERE type = 'capital_account_statement'",
    )
    await changeReportType(queryInterface, Sequelize, "report_templates", LEGACY_REPORT_TYPES)
    await changeReportType(queryInterface, Sequelize, "report_runs", LEGACY_REPORT_TYPES)
  },
}
