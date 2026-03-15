"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("cash_ledger", "type", {
      type: Sequelize.ENUM(
        "deposit",
        "withdrawal",
        "fee",
        "trade",
        "dividend",
        "other",
        "capital_call",
        "distribution",
        "investment",
        "expense",
        "bank_fee",
      ),
      allowNull: false,
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("cash_ledger", "type", {
      type: Sequelize.ENUM("deposit", "withdrawal", "fee", "trade", "dividend", "other"),
      allowNull: false,
    })
  },
}
