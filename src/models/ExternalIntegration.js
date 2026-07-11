const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ExternalIntegration extends Model {
    static associate(models) {
      ExternalIntegration.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ExternalIntegration.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      ExternalIntegration.hasMany(models.ExternalSyncRun, {
        foreignKey: "external_integration_id",
        as: "syncRuns",
      })
    }
  }

  ExternalIntegration.init(
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      provider_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      provider_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      auth_mode: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "secret_reference",
      },
      secret_reference: DataTypes.STRING(255),
      scopes_json: DataTypes.JSON,
      config_json: DataTypes.JSON,
      sync_policy_json: DataTypes.JSON,
      last_sync_at: DataTypes.DATE,
      created_by: DataTypes.UUID,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ExternalIntegration",
      tableName: "external_integrations",
      underscored: true,
      timestamps: true,
    },
  )

  return ExternalIntegration
}
