module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("investment_contracts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
      invested_amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
      },
      units_issued: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      units_remaining: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      entry_nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      entry_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      lockup_end_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("active", "partially_exited", "fully_exited", "matured"),
        defaultValue: "active",
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

    await queryInterface.addIndex("investment_contracts", ["user_id"])
    await queryInterface.addIndex("investment_contracts", ["portfolio_round_id"])
    await queryInterface.addIndex("investment_contracts", ["status"])
    await queryInterface.addIndex("investment_contracts", ["entry_date"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("investment_contracts")
  },
}
