module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("portfolio_rounds", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "portfolios",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      round_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("open", "closed", "settled"),
        defaultValue: "open",
      },
      opening_nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
        defaultValue: 1.0,
      },
      closing_nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: true,
      },
      total_units_issued: {
        type: Sequelize.DECIMAL(18, 6),
        defaultValue: 0,
      },
      total_cash_collected: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
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

    await queryInterface.addIndex("portfolio_rounds", ["portfolio_id"])
    await queryInterface.addIndex("portfolio_rounds", ["status"])
    await queryInterface.addIndex("portfolio_rounds", ["portfolio_id", "round_number"], {
      unique: true,
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("portfolio_rounds")
  },
}
