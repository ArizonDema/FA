module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("trade_transactions", {
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
      trade_type: {
        type: Sequelize.ENUM("buy", "sell"),
        allowNull: false,
      },
      shares: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      price: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      trade_value: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
      },
      commission: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex("trade_transactions", ["portfolio_round_id"])
    await queryInterface.addIndex("trade_transactions", ["stock_asset_id"])
    await queryInterface.addIndex("trade_transactions", ["trade_type"])
    await queryInterface.addIndex("trade_transactions", ["executed_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("trade_transactions")
  },
}
