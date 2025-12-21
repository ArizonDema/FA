const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Cash Ledger Model
   * Tracks all money movements
   * No magic money - every transaction is recorded
   */
  class CashLedger extends Model {
    static associate(models) {
      // Cash entry belongs to a portfolio round
      CashLedger.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })
    }
  }

  CashLedger.init(
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
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        comment: "Positive for inflow, negative for outflow",
      },
      type: {
        type: DataTypes.ENUM("deposit", "withdrawal", "fee", "trade", "dividend", "other"),
        allowNull: false,
      },
      reference_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Related entity type",
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Related entity ID",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "CashLedger",
      tableName: "cash_ledger",
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ["portfolio_round_id"] }, { fields: ["type"] }, { fields: ["recorded_at"] }],
    },
  )

  return CashLedger
}
