const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Portfolio Round Model
   * Represents a fund cycle (e.g., yearly)
   * Users can join different rounds of the same portfolio
   */
  class PortfolioRound extends Model {
    static associate(models) {
      // Round belongs to a portfolio
      PortfolioRound.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      // Round has many investment contracts
      PortfolioRound.hasMany(models.InvestmentContract, {
        foreignKey: "portfolio_round_id",
        as: "investments",
      })

      // Round has NAV history
      PortfolioRound.hasMany(models.PortfolioNavHistory, {
        foreignKey: "portfolio_round_id",
        as: "navHistory",
      })

      // Round has trade transactions
      PortfolioRound.hasMany(models.TradeTransaction, {
        foreignKey: "portfolio_round_id",
        as: "trades",
      })

      // Round has cash ledger entries
      PortfolioRound.hasMany(models.CashLedger, {
        foreignKey: "portfolio_round_id",
        as: "cashEntries",
      })
    }
  }

  PortfolioRound.init(
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
      round_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("open", "closed", "settled"),
        defaultValue: "open",
      },
      opening_nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        defaultValue: 1.0,
        comment: "NAV at round opening",
      },
      closing_nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: true,
        comment: "NAV at round closing",
      },
      total_units_issued: {
        type: DataTypes.DECIMAL(18, 6),
        defaultValue: 0,
        comment: "Total units issued in this round",
      },
      total_cash_collected: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
        comment: "Total cash invested in this round",
      },
    },
    {
      sequelize,
      modelName: "PortfolioRound",
      tableName: "portfolio_rounds",
      underscored: true,
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["portfolio_id", "round_number"],
        },
      ],
    },
  )

  return PortfolioRound
}
