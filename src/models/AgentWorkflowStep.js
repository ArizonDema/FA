const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AgentWorkflowStep extends Model {
    static associate(models) {
      AgentWorkflowStep.belongsTo(models.AgentWorkflowRun, {
        foreignKey: "workflow_run_id",
        as: "workflowRun",
      })

      AgentWorkflowStep.belongsTo(models.AgentToolInvocation, {
        foreignKey: "agent_tool_invocation_id",
        as: "agentToolInvocation",
      })
    }
  }

  AgentWorkflowStep.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workflow_run_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      agent_tool_invocation_id: DataTypes.UUID,
      step_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      step_name: {
        type: DataTypes.STRING(120),
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
      continue_on_error: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      dry_run: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      input_json: DataTypes.JSON,
      resolved_input_json: DataTypes.JSON,
      output_json: DataTypes.JSON,
      error_json: DataTypes.JSON,
      started_at: DataTypes.DATE,
      completed_at: DataTypes.DATE,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "AgentWorkflowStep",
      tableName: "agent_workflow_steps",
      underscored: true,
      timestamps: true,
    },
  )

  return AgentWorkflowStep
}
