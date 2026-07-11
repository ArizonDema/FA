const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundRepositoryItem extends Model {
    static associate(models) {
      FundRepositoryItem.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      FundRepositoryItem.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })
      FundRepositoryItem.hasMany(models.FundRepositoryVersion, {
        foreignKey: "item_id",
        as: "versions",
      })
      FundRepositoryItem.belongsTo(models.FundRepositoryVersion, {
        foreignKey: "current_version_id",
        as: "currentVersion",
        constraints: false,
      })
      FundRepositoryItem.hasMany(models.FundRepositoryAnalysis, {
        foreignKey: "item_id",
        as: "analyses",
      })
      FundRepositoryItem.hasMany(models.FundRepositoryKeyPoint, {
        foreignKey: "item_id",
        as: "keyPoints",
      })
    }
  }

  FundRepositoryItem.init(
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
      kind: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [["document", "dataset"]] },
      },
      category: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: DataTypes.TEXT,
      period_start: DataTypes.DATEONLY,
      period_end: DataTypes.DATEONLY,
      current_version_id: DataTypes.UUID,
      tags_json: DataTypes.JSON,
      is_archived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: DataTypes.UUID,
    },
    {
      sequelize,
      modelName: "FundRepositoryItem",
      tableName: "fund_repository_items",
      underscored: true,
      timestamps: true,
    },
  )

  return FundRepositoryItem
}
