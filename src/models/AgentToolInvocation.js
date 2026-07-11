const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AgentToolInvocation extends Model {
    static associate(models) {
      AgentToolInvocation.belongsTo(models.AgentPrincipal, {
        foreignKey: "agent_principal_id",
        as: "agentPrincipal",
      })

      AgentToolInvocation.belongsTo(models.User, {
        foreignKey: "delegated_by",
        as: "delegatedBy",
      })

      AgentToolInvocation.hasMany(models.AgentWorkflowStep, {
        foreignKey: "agent_tool_invocation_id",
        as: "workflowSteps",
      })
    }
  }

  AgentToolInvocation.init(
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
      idempotency_key: DataTypes.STRING(160),
      input_sha256: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      tool_name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "pending",
      },
      dry_run: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      portfolio_id: DataTypes.UUID,
      reporting_project_id: DataTypes.UUID,
      delegated_by: DataTypes.UUID,
      input_json: DataTypes.JSON,
      output_json: DataTypes.JSON,
      error_json: DataTypes.JSON,
      completed_at: DataTypes.DATE,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "AgentToolInvocation",
      tableName: "agent_tool_invocations",
      underscored: true,
      timestamps: true,
    },
  )

  return AgentToolInvocation
}
