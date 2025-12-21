// backend/src/models/Portfolio.js
const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Portfolio Model
   * Represents long-lived investment portfolios
   * Portfolios never reset - they have multiple rounds
   */
  class Portfolio extends Model {
    static associate(models) {
      // Portfolio has many rounds
      Portfolio.hasMany(models.PortfolioRound, {
        foreignKey: "portfolio_id",
        as: "rounds",
      })

      // Portfolio has many stock positions
      Portfolio.hasMany(models.StockPosition, {
        foreignKey: "portfolio_id",
        as: "positions",
      })
    }
  }

  Portfolio.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      risk_level: {
        type: DataTypes.ENUM("low", "medium", "high"),
        allowNull: false,
        defaultValue: "medium",
      },
      base_currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "USD",
      },
      status: {
        type: DataTypes.ENUM("active", "closed", "archived"),
        defaultValue: "active",
      },

      // Add these inside Portfolio.init()
strategy_type: {
  type: DataTypes.STRING(100),
  allowNull: false,
},
management_fee_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
performance_fee_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
lock_up_period_months: {
  type: DataTypes.INTEGER,
  allowNull: false,
},
early_withdrawal_penalty_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
minimum_investment: {
  type: DataTypes.DECIMAL(15, 2),
  allowNull: false,
},

    },
    {
      sequelize,
      modelName: "Portfolio",
      tableName: "portfolios",
      underscored: true,
      timestamps: true,
    },
  )

  return Portfolio
}
