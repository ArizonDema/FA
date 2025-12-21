"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log("[MIGRATION] Adding units_reserved column to investment_contracts...")

    // Add units_reserved column
    await queryInterface.addColumn("investment_contracts", "units_reserved", {
      type: Sequelize.DECIMAL(18, 6),
      allowNull: false,
      defaultValue: 0,
      comment: "Units currently reserved in pending withdrawals",
    })

    console.log("[MIGRATION] Adding indexes...")

    // Add index: user_id + status (compound)
    await queryInterface.addIndex("investment_contracts", ["user_id", "status"], {
      name: "idx_investment_contracts_user_id_status",
    })
  },

  async down(queryInterface) {
    console.log("[ROLLBACK] Removing units_reserved column & indexes...")

    await queryInterface.removeIndex(
      "investment_contracts",
      "idx_investment_contracts_user_id_status"
    )

    await queryInterface.removeColumn("investment_contracts", "units_reserved")
  },
}
