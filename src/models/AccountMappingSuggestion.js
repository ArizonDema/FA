const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AccountMappingSuggestion extends Model {
    static associate(models) {
      AccountMappingSuggestion.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      AccountMappingSuggestion.belongsTo(models.Account, {
        foreignKey: "account_id",
        as: "account",
      })

      AccountMappingSuggestion.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })

      AccountMappingSuggestion.belongsTo(models.User, {
        foreignKey: "generated_by",
        as: "generatedBy",
      })
    }
  }

  AccountMappingSuggestion.init(
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
      rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      confidence_score: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
      },
      rationale: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      signal_breakdown_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      source: {
        type: DataTypes.STRING(120),
        allowNull: false,
        defaultValue: "deterministic_engine",
      },
      status: {
        type: DataTypes.ENUM("suggested", "superseded"),
        allowNull: false,
        defaultValue: "suggested",
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      generated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AccountMappingSuggestion",
      tableName: "account_mapping_suggestions",
      underscored: true,
      timestamps: true,
    },
  )

  return AccountMappingSuggestion
}
