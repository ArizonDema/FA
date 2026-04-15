const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class Account extends Model {
    static associate(models) {
      Account.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      Account.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      Account.hasMany(models.AccountSemanticMapping, {
        foreignKey: "account_id",
        as: "semanticMappings",
      })

      Account.hasMany(models.AccountMappingSuggestion, {
        foreignKey: "account_id",
        as: "mappingSuggestions",
      })
    }
  }

  Account.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      code: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      normalized_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      source_system: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      source_ref: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Account",
      tableName: "accounts",
      underscored: true,
      timestamps: true,
    },
  )

  return Account
}
