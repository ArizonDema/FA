const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundRepositoryVersion extends Model {
    static associate(models) {
      FundRepositoryVersion.belongsTo(models.FundRepositoryItem, {
        foreignKey: "item_id",
        as: "item",
      })
      FundRepositoryVersion.belongsTo(models.User, {
        foreignKey: "uploaded_by",
        as: "uploadedBy",
      })
      FundRepositoryVersion.hasMany(models.FundRepositoryAnalysis, {
        foreignKey: "version_id",
        as: "analyses",
      })
      FundRepositoryVersion.hasMany(models.FundRepositoryKeyPoint, {
        foreignKey: "version_id",
        as: "keyPoints",
      })
    }
  }

  FundRepositoryVersion.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      version_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      original_file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      storage_path: {
        type: DataTypes.STRING(700),
        allowNull: false,
      },
      mime_type: DataTypes.STRING(160),
      extension: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      file_size: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      sha256: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      notes: DataTypes.TEXT,
      is_archived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      uploaded_by: DataTypes.UUID,
      uploaded_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "FundRepositoryVersion",
      tableName: "fund_repository_versions",
      underscored: true,
      timestamps: true,
    },
  )

  return FundRepositoryVersion
}
