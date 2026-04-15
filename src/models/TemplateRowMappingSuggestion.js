const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class TemplateRowMappingSuggestion extends Model {
    static associate(models) {
      TemplateRowMappingSuggestion.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      TemplateRowMappingSuggestion.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      TemplateRowMappingSuggestion.belongsTo(models.TemplateRow, {
        foreignKey: "template_row_id",
        as: "templateRow",
      })

      TemplateRowMappingSuggestion.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })

      TemplateRowMappingSuggestion.belongsTo(models.LlmMappingTrace, {
        foreignKey: "trace_id",
        as: "trace",
      })

      TemplateRowMappingSuggestion.belongsTo(models.User, {
        foreignKey: "generated_by",
        as: "generatedBy",
      })
    }
  }

  TemplateRowMappingSuggestion.init(
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
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      template_row_id: {
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
      llm_score: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
      },
      merged_score: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
      },
      rationale: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      signal_breakdown_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      llm_metadata_json: {
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
      needs_human_review: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      trace_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      generated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "TemplateRowMappingSuggestion",
      tableName: "template_row_mapping_suggestions",
      underscored: true,
      timestamps: true,
    },
  )

  return TemplateRowMappingSuggestion
}
