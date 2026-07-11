const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportingProjectSource extends Model {
    static associate(models) {
      ReportingProjectSource.belongsTo(models.ReportingProject, {
        foreignKey: "reporting_project_id",
        as: "project",
      })

      ReportingProjectSource.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ReportingProjectSource.belongsTo(models.FundRepositoryItem, {
        foreignKey: "repository_item_id",
        as: "repositoryItem",
      })

      ReportingProjectSource.belongsTo(models.FundRepositoryVersion, {
        foreignKey: "repository_version_id",
        as: "repositoryVersion",
      })

      ReportingProjectSource.belongsTo(models.CashFlowTemplate, {
        foreignKey: "template_id",
        as: "template",
      })

      ReportingProjectSource.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReportingProjectSource.belongsTo(models.ReportRun, {
        foreignKey: "report_run_id",
        as: "reportRun",
      })

      ReportingProjectSource.belongsTo(models.User, {
        foreignKey: "attached_by",
        as: "attachedBy",
      })
    }
  }

  ReportingProjectSource.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      reporting_project_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      source_role: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      source_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      repository_item_id: DataTypes.UUID,
      repository_version_id: DataTypes.UUID,
      template_id: DataTypes.UUID,
      template_version_id: DataTypes.UUID,
      report_run_id: DataTypes.UUID,
      original_file_name: DataTypes.STRING(255),
      sha256: DataTypes.STRING(64),
      required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      status: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "attached",
      },
      attached_by: DataTypes.UUID,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ReportingProjectSource",
      tableName: "reporting_project_sources",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportingProjectSource
}
