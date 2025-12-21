// backend/src/models/InvestmentContract.js

const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Investment Contract Model
   * Each entry is a separate legal contract
   * Users can have multiple contracts across different rounds
   */
  class InvestmentContract extends Model {
    static associate(models) {
      // Contract belongs to a user
      InvestmentContract.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      })

      // Contract belongs to a portfolio round
      InvestmentContract.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })

      // Contract has unit ledger entries
      InvestmentContract.hasMany(models.UnitLedger, {
        foreignKey: "investment_contract_id",
        as: "unitEntries",
      })

      // Contract has fee records
      InvestmentContract.hasMany(models.FeeRecord, {
        foreignKey: "investment_contract_id",
        as: "fees",
      })

      // Contract has withdrawal requests
      InvestmentContract.hasMany(models.WithdrawalRequest, {
        foreignKey: "investment_contract_id",
        as: "withdrawals",
      })
    }
  }

  InvestmentContract.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "users",
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
      invested_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        comment: "Initial cash invested",
      },
      units_issued: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Units allocated at entry",
      },
      units_remaining: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Units still held (after withdrawals)",
      },
      entry_nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "NAV at time of investment",
      },
      entry_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lockup_end_date: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "Date when investor can withdraw without penalty",
      },
      status: {
        type: DataTypes.ENUM("active", "partially_exited", "fully_exited", "matured"),
        defaultValue: "active",
      },
      // In InvestmentContract.init()
      units_reserved: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        defaultValue: 0,
        comment: "Units currently reserved in pending withdrawals",
      },
    },
    {
      sequelize,
      modelName: "InvestmentContract",
      tableName: "investment_contracts",
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ["user_id"] },
        { fields: ["portfolio_round_id"] },
        { fields: ["status"] },
        { fields: ["entry_date"] },
        { fields: ["user_id", "status"] } // for queries
      ],
    },
  )

  return InvestmentContract
}
