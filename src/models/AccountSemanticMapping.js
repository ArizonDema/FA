const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AccountSemanticMapping extends Model {
    static associate(models) {
      AccountSemanticMapping.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      AccountSemanticMapping.belongsTo(models.Account, {
        foreignKey: "account_id",
        as: "account",
      })

      AccountSemanticMapping.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })

      AccountSemanticMapping.belongsTo(models.User, {
        foreignKey: "suggested_by",
        as: "suggestedBy",
      })

      AccountSemanticMapping.belongsTo(models.User, {
        foreignKey: "approved_by",
        as: "approvedBy",
      })
    }
  }

  AccountSemanticMapping.init(
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
      account_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      semantic_concept_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("suggested", "approved", "rejected"),
        allowNull: false,
        defaultValue: "suggested",
      },
      effective_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      effective_end: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      confidence: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: DataTypes.STRING(120),
        allowNull: false,
        defaultValue: "manual",
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      suggested_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AccountSemanticMapping",
      tableName: "account_semantic_mappings",
      underscored: true,
      timestamps: true,
    },
  )

  return AccountSemanticMapping
}
