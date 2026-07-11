const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundRepositoryKeyPoint extends Model {
    static associate(models) {
      FundRepositoryKeyPoint.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      FundRepositoryKeyPoint.belongsTo(models.FundRepositoryAnalysis, {
        foreignKey: "analysis_id",
        as: "analysis",
      })
      FundRepositoryKeyPoint.belongsTo(models.FundRepositoryItem, {
        foreignKey: "item_id",
        as: "item",
      })
      FundRepositoryKeyPoint.belongsTo(models.FundRepositoryVersion, {
        foreignKey: "version_id",
        as: "version",
      })
      FundRepositoryKeyPoint.belongsTo(models.User, {
        foreignKey: "reviewed_by",
        as: "reviewedBy",
      })
    }
  }

  FundRepositoryKeyPoint.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: { type: DataTypes.UUID, allowNull: false },
      analysis_id: { type: DataTypes.UUID, allowNull: false },
      item_id: { type: DataTypes.UUID, allowNull: false },
      version_id: { type: DataTypes.UUID, allowNull: false },
      point_key: { type: DataTypes.STRING(120), allowNull: false },
      label: { type: DataTypes.STRING(255), allowNull: false },
      value_text: DataTypes.TEXT,
      value_json: DataTypes.JSON,
      source_reference: DataTypes.TEXT,
      confidence: DataTypes.DECIMAL(5, 4),
      review_status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "suggested" },
      reviewed_by: DataTypes.UUID,
      reviewed_at: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "FundRepositoryKeyPoint",
      tableName: "fund_repository_key_points",
      underscored: true,
      timestamps: true,
    },
  )

  return FundRepositoryKeyPoint
}
