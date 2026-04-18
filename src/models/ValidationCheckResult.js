const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ValidationCheckResult extends Model {
    static associate(models) {
      ValidationCheckResult.belongsTo(models.ValidationResult, {
        foreignKey: "validation_result_id",
        as: "validationResult",
      })
    }
  }

  ValidationCheckResult.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      validation_result_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      check_type: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      severity: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      target_type: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      target_id: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      details_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "ValidationCheckResult",
      tableName: "validation_check_results",
      underscored: true,
      timestamps: true,
    },
  )

  return ValidationCheckResult
}
