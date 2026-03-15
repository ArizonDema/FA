const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundAccountingPolicy extends Model {
    static associate(models) {
      FundAccountingPolicy.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
    }
  }

  FundAccountingPolicy.init(
    {
      portfolio_id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      revenue_recognition_policy: DataTypes.TEXT,
      valuation_policy: DataTypes.TEXT,
      foreign_currency_policy: DataTypes.TEXT,
      financial_instrument_policy: DataTypes.TEXT,
      impairment_policy: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "FundAccountingPolicy",
      tableName: "fund_accounting_policies",
      underscored: true,
      timestamps: true,
    },
  )

  return FundAccountingPolicy
}
