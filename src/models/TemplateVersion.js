const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class TemplateVersion extends Model {
    static associate(models) {
      TemplateVersion.belongsTo(models.CashFlowTemplate, {
        foreignKey: "template_id",
        as: "template",
      })

      TemplateVersion.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      TemplateVersion.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      TemplateVersion.hasMany(models.TemplateRow, {
        foreignKey: "template_version_id",
        as: "rows",
      })

      TemplateVersion.hasMany(models.CashFlowTemplateAnalysis, {
        foreignKey: "template_version_id",
        as: "analyses",
      })

      TemplateVersion.hasMany(models.ReportRun, {
        foreignKey: "template_version_id",
        as: "reportRuns",
      })
    }
  }

  TemplateVersion.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      version_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      version_label: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      source_file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      source_file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      source_file_sha256: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      config_json: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      schema_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      raw_structure_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      llm_meta_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      parsed_structure_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      parse_metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      parsed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "TemplateVersion",
      tableName: "template_versions",
      underscored: true,
      timestamps: true,
    },
  )

  return TemplateVersion
}
