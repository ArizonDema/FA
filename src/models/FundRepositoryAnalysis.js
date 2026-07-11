const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundRepositoryAnalysis extends Model {
    static associate(models) {
      FundRepositoryAnalysis.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      FundRepositoryAnalysis.belongsTo(models.FundRepositoryItem, {
        foreignKey: "item_id",
        as: "item",
      })
      FundRepositoryAnalysis.belongsTo(models.FundRepositoryVersion, {
        foreignKey: "version_id",
        as: "version",
      })
      FundRepositoryAnalysis.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })
      FundRepositoryAnalysis.hasMany(models.FundRepositoryKeyPoint, {
        foreignKey: "analysis_id",
        as: "keyPoints",
      })
    }
  }

  FundRepositoryAnalysis.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: { type: DataTypes.UUID, allowNull: false },
      item_id: { type: DataTypes.UUID, allowNull: false },
      version_id: { type: DataTypes.UUID, allowNull: false },
      reader_key: { type: DataTypes.STRING(80), allowNull: false },
      reader_version: { type: DataTypes.STRING(40), allowNull: false },
      status: { type: DataTypes.STRING(40), allowNull: false },
      trigger_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "manual" },
      source_format: DataTypes.STRING(30),
      extraction_method: DataTypes.STRING(80),
      summary_text: DataTypes.TEXT,
      source_text_excerpt: DataTypes.TEXT,
      structured_data_json: DataTypes.JSON,
      issues_json: DataTypes.JSON,
      confidence: DataTypes.DECIMAL(5, 4),
      created_by: DataTypes.UUID,
    },
    {
      sequelize,
      modelName: "FundRepositoryAnalysis",
      tableName: "fund_repository_analyses",
      underscored: true,
      timestamps: true,
    },
  )

  return FundRepositoryAnalysis
}
