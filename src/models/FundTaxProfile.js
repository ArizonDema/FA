const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundTaxProfile extends Model {
    static associate(models) {
      FundTaxProfile.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
    }
  }

  FundTaxProfile.init(
    {
      portfolio_id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      tax_residency: DataTypes.STRING(120),
      tax_identification_number: DataTypes.STRING(120),
      vat_number: DataTypes.STRING(120),
      tax_advisor: DataTypes.STRING(255),
    },
    {
      sequelize,
      modelName: "FundTaxProfile",
      tableName: "fund_tax_profiles",
      underscored: true,
      timestamps: true,
    },
  )

  return FundTaxProfile
}
