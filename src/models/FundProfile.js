const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundProfile extends Model {
    static associate(models) {
      FundProfile.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
    }
  }

  FundProfile.init(
    {
      portfolio_id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      legal_name: DataTypes.STRING(255),
      domicile: DataTypes.STRING(120),
      regulator: DataTypes.STRING(120),
      fiscal_year_end: DataTypes.STRING(20),
      reporting_currency: DataTypes.STRING(3),
      administrator: DataTypes.STRING(255),
      auditor: DataTypes.STRING(255),
      investment_manager: DataTypes.STRING(255),
      strategy_summary: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "FundProfile",
      tableName: "fund_profiles",
      underscored: true,
      timestamps: true,
    },
  )

  return FundProfile
}
