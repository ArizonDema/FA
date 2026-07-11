const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ExternalSyncRun extends Model {
    static associate(models) {
      ExternalSyncRun.belongsTo(models.ExternalIntegration, {
        foreignKey: "external_integration_id",
        as: "externalIntegration",
      })

      ExternalSyncRun.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ExternalSyncRun.belongsTo(models.AgentPrincipal, {
        foreignKey: "agent_principal_id",
        as: "agentPrincipal",
      })

      ExternalSyncRun.belongsTo(models.AgentWorkflowRun, {
        foreignKey: "agent_workflow_run_id",
        as: "agentWorkflowRun",
      })

      ExternalSyncRun.belongsTo(models.User, {
        foreignKey: "requested_by",
        as: "requestedBy",
      })
    }
  }

  ExternalSyncRun.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      external_integration_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      agent_principal_id: DataTypes.UUID,
      agent_workflow_run_id: DataTypes.UUID,
      sync_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "discovery",
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
      idempotency_key: DataTypes.STRING(160),
      external_correlation_id: DataTypes.STRING(160),
      requested_by: DataTypes.UUID,
      discovered_artifacts_json: DataTypes.JSON,
      import_plan_json: DataTypes.JSON,
      result_json: DataTypes.JSON,
      error_json: DataTypes.JSON,
      started_at: DataTypes.DATE,
      completed_at: DataTypes.DATE,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ExternalSyncRun",
      tableName: "external_sync_runs",
      underscored: true,
      timestamps: true,
    },
  )

  return ExternalSyncRun
}
