const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class TemplateRowSemanticMapping extends Model {
    static associate(models) {
      TemplateRowSemanticMapping.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      TemplateRowSemanticMapping.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      TemplateRowSemanticMapping.belongsTo(models.TemplateRow, {
        foreignKey: "template_row_id",
        as: "templateRow",
      })

      TemplateRowSemanticMapping.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })

      TemplateRowSemanticMapping.belongsTo(models.ReviewTask, {
        foreignKey: "review_task_id",
        as: "reviewTask",
      })

      TemplateRowSemanticMapping.belongsTo(models.ReviewDecision, {
        foreignKey: "review_decision_id",
        as: "reviewDecision",
      })

      TemplateRowSemanticMapping.belongsTo(models.User, {
        foreignKey: "suggested_by",
        as: "suggestedBy",
      })

      TemplateRowSemanticMapping.belongsTo(models.User, {
        foreignKey: "approved_by",
        as: "approvedBy",
      })
    }
  }

  TemplateRowSemanticMapping.init(
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
      review_task_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      review_decision_id: {
        type: DataTypes.UUID,
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
      modelName: "TemplateRowSemanticMapping",
      tableName: "template_row_semantic_mappings",
      underscored: true,
      timestamps: true,
    },
  )

  return TemplateRowSemanticMapping
}
