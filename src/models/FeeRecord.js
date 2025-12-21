const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Fee Record Model
   * Full transparency for all fee charges
   * Management fees, performance fees, and penalties
   */
  class FeeRecord extends Model {
    static associate(models) {
      // Fee belongs to an investment contract
      FeeRecord.belongsTo(models.InvestmentContract, {
        foreignKey: "investment_contract_id",
        as: "contract",
      })
    }
  }

  FeeRecord.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      investment_contract_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "investment_contracts",
          key: "id",
        },
      },
      fee_type: {
        type: DataTypes.ENUM("management", "performance", "penalty", "other"),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: true,
        comment: "NAV at time of fee calculation",
      },
      calculation_basis: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        comment: "Base amount used for calculation",
      },
      fee_percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: "Fee rate applied",
      },
      charged_at: {
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
      modelName: "FeeRecord",
      tableName: "fee_records",
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ["investment_contract_id"] }, { fields: ["fee_type"] }, { fields: ["charged_at"] }],
    },
  )

  return FeeRecord
}
