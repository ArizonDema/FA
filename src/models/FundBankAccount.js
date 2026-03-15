const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundBankAccount extends Model {
    static associate(models) {
      FundBankAccount.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
    }
  }

  FundBankAccount.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      bank_name: DataTypes.STRING(255),
      account_number: DataTypes.STRING(120),
      iban: DataTypes.STRING(120),
      currency: DataTypes.STRING(3),
      swift: DataTypes.STRING(50),
      notes: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "FundBankAccount",
      tableName: "fund_bank_accounts",
      underscored: true,
      timestamps: true,
    },
  )

  return FundBankAccount
}
