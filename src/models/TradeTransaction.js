const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Trade Transaction Model
   * Complete audit trail of buy/sell operations
   * NEVER delete - required for regulatory compliance
   */
  class TradeTransaction extends Model {
    static associate(models) {
      // Trade belongs to a portfolio round
      TradeTransaction.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })

      // Trade belongs to a stock asset
      TradeTransaction.belongsTo(models.StockAsset, {
        foreignKey: "stock_asset_id",
        as: "stock",
      })
    }
  }

  TradeTransaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_round_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "portfolio_rounds",
          key: "id",
        },
      },
      stock_asset_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "stock_assets",
          key: "id",
        },
      },
      trade_type: {
        type: DataTypes.ENUM("buy", "sell"),
        allowNull: false,
      },
      shares: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Price per share",
      },
      trade_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        comment: "Total transaction value",
      },
      commission: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
      executed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "TradeTransaction",
      tableName: "trade_transactions",
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ["portfolio_round_id"] },
        { fields: ["stock_asset_id"] },
        { fields: ["trade_type"] },
        { fields: ["executed_at"] },
      ],
    },
  )

  return TradeTransaction
}
