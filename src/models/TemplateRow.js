const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class TemplateRow extends Model {
    static associate(models) {
      TemplateRow.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      TemplateRow.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      TemplateRow.hasMany(models.TemplateRowSemanticMapping, {
        foreignKey: "template_row_id",
        as: "semanticMappings",
      })

      TemplateRow.hasMany(models.TemplateRowMappingSuggestion, {
        foreignKey: "template_row_id",
        as: "mappingSuggestions",
      })

      TemplateRow.hasMany(models.LlmMappingTrace, {
        foreignKey: "template_row_id",
        as: "llmMappingTraces",
      })

      TemplateRow.hasMany(models.ReportRunRow, {
        foreignKey: "template_row_id",
        as: "reportRunRows",
      })
    }
  }

  TemplateRow.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      sheet_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      row_index: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      row_key: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      row_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      indentation_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      formula_text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      row_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      section_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      parent_section_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      expected_data_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      cell_range: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      is_formula: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cell_addresses_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      raw_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      metadata_json: {
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
      modelName: "TemplateRow",
      tableName: "template_rows",
      underscored: true,
      timestamps: true,
    },
  )

  return TemplateRow
}
