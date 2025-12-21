const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Stock Position Model
   * Tracks portfolio holdings over time
   * Append-only to maintain historical records
   */
  class StockPosition extends Model {
    static associate(models) {
      // Position belongs to a portfolio
      StockPosition.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      // Position belongs to a portfolio round
      StockPosition.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })

      // Position belongs to a stock asset
      StockPosition.belongsTo(models.StockAsset, {
        foreignKey: "stock_asset_id",
        as: "stock",
      })
    }
  }

  StockPosition.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "portfolios",
          key: "id",
        },
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
      shares: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Number of shares held",
      },
      avg_price: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Average acquisition price",
      },
      current_price: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: true,
        comment: "Latest market price",
      },
      market_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        comment: "Current market value",
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "StockPosition",
      tableName: "stock_positions",
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ["portfolio_id"] },
        { fields: ["portfolio_round_id"] },
        { fields: ["stock_asset_id"] },
        { fields: ["recorded_at"] },
      ],
    },
  )

  return StockPosition
}
