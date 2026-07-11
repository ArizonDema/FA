const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportLineage extends Model {
    static associate(models) {
      ReportLineage.belongsTo(models.ReportRun, {
        foreignKey: "report_run_id",
        as: "reportRun",
      })

      ReportLineage.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      ReportLineage.belongsTo(models.ReportRunRow, {
        foreignKey: "report_run_row_id",
        as: "reportRunRow",
      })

      ReportLineage.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReportLineage.belongsTo(models.TemplateRow, {
        foreignKey: "template_row_id",
        as: "templateRow",
      })

      ReportLineage.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })
    }
  }

  ReportLineage.init(
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
      portfolio_id: DataTypes.UUID,
      report_run_row_id: DataTypes.UUID,
      template_version_id: DataTypes.UUID,
      template_row_id: DataTypes.UUID,
      semantic_concept_id: DataTypes.UUID,
      source_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      source_id: DataTypes.STRING(160),
      source_reference_json: DataTypes.JSON,
      mapping_snapshot_json: DataTypes.JSON,
      confidence: DataTypes.DECIMAL(8, 4),
      evidence_json: DataTypes.JSON,
    },
    {
      sequelize,
      modelName: "ReportLineage",
      tableName: "report_lineage",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportLineage
}
