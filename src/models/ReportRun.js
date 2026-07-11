const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportRun extends Model {
    static associate(models) {
      ReportRun.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      ReportRun.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      ReportRun.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReportRun.hasMany(models.ReportRunRow, {
        foreignKey: "report_run_id",
        as: "rows",
      })

      ReportRun.hasMany(models.ValidationResult, {
        foreignKey: "report_run_id",
        as: "validationResults",
      })

      ReportRun.hasMany(models.ReportLineage, {
        foreignKey: "report_run_id",
        as: "lineage",
      })

      ReportRun.hasMany(models.ReportExport, {
        foreignKey: "report_run_id",
        as: "exports",
      })
    }
  }

  ReportRun.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      type: {
        type: DataTypes.ENUM("cash_flow", "shareholder_register", "financial_statements"),
        allowNull: false,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      period_start: DataTypes.DATEONLY,
      period_end: DataTypes.DATEONLY,
      inputs_json: DataTypes.JSON,
      output_paths: DataTypes.JSON,
      template_version_id: DataTypes.UUID,
      status: DataTypes.STRING(80),
      readiness_status: DataTypes.STRING(40),
      last_validated_at: DataTypes.DATE,
      summary_json: DataTypes.JSON,
      error_json: DataTypes.JSON,
      completed_at: DataTypes.DATE,
      mapping_snapshot_json: DataTypes.JSON,
      input_artifacts_json: DataTypes.JSON,
      output_artifacts_json: DataTypes.JSON,
      created_by: DataTypes.UUID,
    },
    {
      sequelize,
      modelName: "ReportRun",
      tableName: "report_runs",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportRun
}
