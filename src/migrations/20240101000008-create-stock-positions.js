module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_positions", {
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
      stock_asset_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "stock_assets",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      shares: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      avg_price: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      current_price: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: true,
      },
      market_value: {
        type: Sequelize.DECIMAL(18, 2),
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

    await queryInterface.addIndex("stock_positions", ["portfolio_id"])
    await queryInterface.addIndex("stock_positions", ["portfolio_round_id"])
    await queryInterface.addIndex("stock_positions", ["stock_asset_id"])
    await queryInterface.addIndex("stock_positions", ["recorded_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("stock_positions")
  },
}
