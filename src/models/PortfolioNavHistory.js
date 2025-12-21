const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Portfolio NAV History Model
   * Time-series data for NAV tracking
   * APPEND-ONLY - enables historical reconstruction
   */
  class PortfolioNavHistory extends Model {
    static associate(models) {
      // NAV entry belongs to a portfolio round
      PortfolioNavHistory.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })
    }
  }

  PortfolioNavHistory.init(
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
      nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Net Asset Value per unit",
      },
      total_units: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Total outstanding units",
      },
      portfolio_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        comment: "Total portfolio value in base currency",
      },
      cash_balance: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      market_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Total market value of holdings",
      },
      accrued_fees: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "PortfolioNavHistory",
      tableName: "portfolio_nav_history",
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ["portfolio_round_id"] },
        { fields: ["recorded_at"] },
        {
          unique: true,
          fields: ["portfolio_round_id", "recorded_at"],
        },
      ],
    },
  )

  return PortfolioNavHistory
}
