module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("portfolio_nav_history", {
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
      nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      total_units: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      portfolio_value: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
      },
      cash_balance: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      market_value: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      accrued_fees: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex("portfolio_nav_history", ["portfolio_round_id"])
    await queryInterface.addIndex("portfolio_nav_history", ["recorded_at"])
    await queryInterface.addIndex("portfolio_nav_history", ["portfolio_round_id", "recorded_at"], {
      unique: true,
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("portfolio_nav_history")
  },
}
