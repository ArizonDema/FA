const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportExport extends Model {
    static associate(models) {
      ReportExport.belongsTo(models.ReportRun, {
        foreignKey: "report_run_id",
        as: "reportRun",
      })

      ReportExport.belongsTo(models.ValidationResult, {
        foreignKey: "validation_result_id",
        as: "validationResult",
      })

      ReportExport.belongsTo(models.ReviewTask, {
        foreignKey: "approval_review_task_id",
        as: "approvalReviewTask",
      })

      ReportExport.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      ReportExport.belongsTo(models.User, {
        foreignKey: "approved_by",
        as: "approvedBy",
      })

      ReportExport.belongsTo(models.User, {
        foreignKey: "exported_by",
        as: "exportedBy",
      })
    }
  }

  ReportExport.init(
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
      format: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "xlsx",
      },
      status: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "approval_requested",
      },
      output_path: {
        type: DataTypes.STRING(700),
        allowNull: false,
      },
      checksum_sha256: DataTypes.STRING(64),
      validation_result_id: DataTypes.UUID,
      approval_review_task_id: DataTypes.UUID,
      created_by: DataTypes.UUID,
      approved_by: DataTypes.UUID,
      approved_at: DataTypes.DATE,
      exported_by: DataTypes.UUID,
      exported_at: DataTypes.DATE,
      metadata_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ReportExport",
      tableName: "report_exports",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportExport
}
