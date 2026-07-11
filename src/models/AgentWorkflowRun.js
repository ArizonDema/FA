const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AgentWorkflowRun extends Model {
    static associate(models) {
      AgentWorkflowRun.belongsTo(models.AgentPrincipal, {
        foreignKey: "agent_principal_id",
        as: "agentPrincipal",
      })

      AgentWorkflowRun.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      AgentWorkflowRun.belongsTo(models.ReportingProject, {
        foreignKey: "reporting_project_id",
        as: "reportingProject",
      })

      AgentWorkflowRun.belongsTo(models.User, {
        foreignKey: "initiated_by",
        as: "initiatedBy",
      })

      AgentWorkflowRun.hasMany(models.AgentWorkflowStep, {
        foreignKey: "workflow_run_id",
        as: "steps",
      })

      AgentWorkflowRun.hasMany(models.ExternalSyncRun, {
        foreignKey: "agent_workflow_run_id",
        as: "externalSyncRuns",
      })
    }
  }

  AgentWorkflowRun.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      agent_principal_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workflow_type: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "pending",
      },
      trigger_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "manual",
      },
      portfolio_id: DataTypes.UUID,
      reporting_project_id: DataTypes.UUID,
      initiated_by: DataTypes.UUID,
      idempotency_key: DataTypes.STRING(160),
      external_correlation_id: DataTypes.STRING(160),
      workflow_plan_json: DataTypes.JSON,
      policy_json: DataTypes.JSON,
      schedule_json: DataTypes.JSON,
      summary_json: DataTypes.JSON,
      error_json: DataTypes.JSON,
      started_at: DataTypes.DATE,
      completed_at: DataTypes.DATE,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "AgentWorkflowRun",
      tableName: "agent_workflow_runs",
      underscored: true,
      timestamps: true,
    },
  )

  return AgentWorkflowRun
}
