const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundGovernance extends Model {
    static associate(models) {
      FundGovernance.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
    }
  }

  FundGovernance.init(
    {
      portfolio_id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      board_members: DataTypes.TEXT,
      general_partner: DataTypes.STRING(255),
      investment_manager: DataTypes.STRING(255),
      administrator: DataTypes.STRING(255),
      auditor: DataTypes.STRING(255),
      depositary: DataTypes.STRING(255),
      legal_advisor: DataTypes.STRING(255),
    },
    {
      sequelize,
      modelName: "FundGovernance",
      tableName: "fund_governance",
      underscored: true,
      timestamps: true,
    },
  )

  return FundGovernance
}
