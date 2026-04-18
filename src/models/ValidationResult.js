const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ValidationResult extends Model {
    static associate(models) {
      ValidationResult.belongsTo(models.ReportRun, {
        foreignKey: "report_run_id",
        as: "reportRun",
      })

      ValidationResult.hasMany(models.ValidationCheckResult, {
        foreignKey: "validation_result_id",
        as: "checks",
      })

      ValidationResult.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })
    }
  }

  ValidationResult.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      report_run_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      overall_status: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      readiness_status: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      summary_json: {
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
      modelName: "ValidationResult",
      tableName: "validation_results",
      underscored: true,
      timestamps: true,
    },
  )

  return ValidationResult
}
