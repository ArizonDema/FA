const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportingProject extends Model {
    static associate(models) {
      ReportingProject.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ReportingProject.belongsTo(models.CashFlowTemplate, {
        foreignKey: "template_id",
        as: "template",
      })

      ReportingProject.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReportingProject.belongsTo(models.ReportRun, {
        foreignKey: "current_report_run_id",
        as: "currentReportRun",
      })

      ReportingProject.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      ReportingProject.hasMany(models.ReportingProjectSource, {
        foreignKey: "reporting_project_id",
        as: "sources",
      })

      ReportingProject.hasMany(models.AgentWorkflowRun, {
        foreignKey: "reporting_project_id",
        as: "agentWorkflowRuns",
      })
    }
  }

  ReportingProject.init(
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
      report_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "cash_flow",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      period_start: DataTypes.DATEONLY,
      period_end: DataTypes.DATEONLY,
      status: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "draft",
      },
      template_id: DataTypes.UUID,
      template_version_id: DataTypes.UUID,
      current_report_run_id: DataTypes.UUID,
      requested_by_agent_id: DataTypes.UUID,
      created_by: DataTypes.UUID,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ReportingProject",
      tableName: "reporting_projects",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportingProject
}
