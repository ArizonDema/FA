const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportRunRow extends Model {
    static associate(models) {
      ReportRunRow.belongsTo(models.ReportRun, {
        foreignKey: "report_run_id",
        as: "reportRun",
      })

      ReportRunRow.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      ReportRunRow.belongsTo(models.TemplateRow, {
        foreignKey: "template_row_id",
        as: "templateRow",
      })

      ReportRunRow.belongsTo(models.SemanticConcept, {
        foreignKey: "semantic_concept_id",
        as: "semanticConcept",
      })

      ReportRunRow.hasMany(models.ReportLineage, {
        foreignKey: "report_run_row_id",
        as: "lineage",
      })
    }
  }

  ReportRunRow.init(
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
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      template_row_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      semantic_concept_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      row_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      row_label: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      row_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      section_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      formula_text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resolved_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      resolution_status: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      value_source: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "none",
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "ReportRunRow",
      tableName: "report_run_rows",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportRunRow
}
