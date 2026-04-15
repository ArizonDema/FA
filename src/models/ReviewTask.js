const { Model } = require("sequelize")
const {
  REVIEW_PRIORITIES,
  REVIEW_TARGET_TYPES,
  REVIEW_TASK_STATUSES,
} = require("../modules/reviews/review.constants")

module.exports = (sequelize, DataTypes) => {
  class ReviewTask extends Model {
    static associate(models) {
      ReviewTask.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ReviewTask.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReviewTask.belongsTo(models.User, {
        foreignKey: "assigned_to",
        as: "assignedTo",
      })

      ReviewTask.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      ReviewTask.hasMany(models.ReviewDecision, {
        foreignKey: "review_task_id",
        as: "decisions",
      })

      ReviewTask.hasMany(models.TemplateRowSemanticMapping, {
        foreignKey: "review_task_id",
        as: "approvedMappings",
      })
    }
  }

  ReviewTask.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      task_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "mapping_review",
      },
      target_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: REVIEW_TARGET_TYPES.TEMPLATE_ROW,
      },
      target_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(...Object.values(REVIEW_TASK_STATUSES)),
        allowNull: false,
        defaultValue: REVIEW_TASK_STATUSES.OPEN,
      },
      priority: {
        type: DataTypes.ENUM(...Object.values(REVIEW_PRIORITIES)),
        allowNull: false,
        defaultValue: REVIEW_PRIORITIES.MEDIUM,
      },
      review_reason: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      assigned_to: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "ReviewTask",
      tableName: "review_tasks",
      underscored: true,
      timestamps: true,
    },
  )

  return ReviewTask
}
