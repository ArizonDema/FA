const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AgentPrincipal extends Model {
    static associate(models) {
      AgentPrincipal.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      AgentPrincipal.hasMany(models.AgentToolInvocation, {
        foreignKey: "agent_principal_id",
        as: "toolInvocations",
      })

      AgentPrincipal.hasMany(models.AgentWorkflowRun, {
        foreignKey: "agent_principal_id",
        as: "workflowRuns",
      })

      AgentPrincipal.hasMany(models.ExternalSyncRun, {
        foreignKey: "agent_principal_id",
        as: "externalSyncRuns",
      })
    }
  }

  AgentPrincipal.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: DataTypes.TEXT,
      principal_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "internal_agent",
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      scopes_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      allowed_portfolio_ids_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      allowed_reporting_project_ids_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      api_key_prefix: DataTypes.STRING(40),
      api_key_hash: DataTypes.STRING(64),
      last_used_at: DataTypes.DATE,
      created_by: DataTypes.UUID,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "AgentPrincipal",
      tableName: "agent_principals",
      underscored: true,
      timestamps: true,
    },
  )

  return AgentPrincipal
}
