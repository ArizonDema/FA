module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cash_ledger", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      portfolio_round_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "portfolio_rounds",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM("deposit", "withdrawal", "fee", "trade", "dividend", "other"),
        allowNull: false,
      },
      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      recorded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    })

    await queryInterface.addIndex("cash_ledger", ["portfolio_round_id"])
    await queryInterface.addIndex("cash_ledger", ["type"])
    await queryInterface.addIndex("cash_ledger", ["recorded_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("cash_ledger")
  },
}
