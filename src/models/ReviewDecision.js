const { Model } = require("sequelize")
const { REVIEW_ACTION_TYPES } = require("../modules/reviews/review.constants")

module.exports = (sequelize, DataTypes) => {
  class ReviewDecision extends Model {
    static associate(models) {
      ReviewDecision.belongsTo(models.ReviewTask, {
        foreignKey: "review_task_id",
        as: "reviewTask",
      })

      ReviewDecision.belongsTo(models.SemanticConcept, {
        foreignKey: "selected_semantic_concept_id",
        as: "selectedSemanticConcept",
      })

      ReviewDecision.belongsTo(models.User, {
        foreignKey: "actor_id",
        as: "actor",
      })

      ReviewDecision.hasMany(models.TemplateRowSemanticMapping, {
        foreignKey: "review_decision_id",
        as: "resultMappings",
      })
    }
  }

  ReviewDecision.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      review_task_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      action_type: {
        type: DataTypes.ENUM(...Object.values(REVIEW_ACTION_TYPES)),
        allowNull: false,
      },
      selected_semantic_concept_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      selected_suggestion_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      result_mapping_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      rationale: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      actor_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "ReviewDecision",
      tableName: "review_decisions",
      underscored: true,
      timestamps: true,
    },
  )

  return ReviewDecision
}
