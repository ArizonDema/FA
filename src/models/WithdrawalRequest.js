const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Withdrawal Request Model
   * Tracks investor exit requests and their processing
   */
  class WithdrawalRequest extends Model {
    static associate(models) {
      // Withdrawal belongs to a user
      WithdrawalRequest.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      })

      // Withdrawal belongs to an investment contract
      WithdrawalRequest.belongsTo(models.InvestmentContract, {
        foreignKey: "investment_contract_id",
        as: "contract",
      })
    }
  }

  WithdrawalRequest.init(
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
      investment_contract_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "investment_contracts",
          key: "id",
        },
      },
      units_to_redeem: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Units investor wants to redeem",
      },
      nav_at_request: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: true,
        comment: "NAV when request was made",
      },
      gross_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        comment: "Value before fees",
      },
      management_fees: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
      performance_fees: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
      penalty_fees: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
      total_fees: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
      net_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        comment: "Amount after all fees",
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "paid", "rejected", "cancelled"),
        defaultValue: "pending",
      },
      requested_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      processed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "WithdrawalRequest",
      tableName: "withdrawal_requests",
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ["user_id"] },
        { fields: ["investment_contract_id"] },
        { fields: ["status"] },
        { fields: ["requested_at"] },
      ],
    },
  )

  return WithdrawalRequest
}
