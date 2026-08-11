const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class CashFlowTemplateAnalysis extends Model {
    static associate(models) {
      CashFlowTemplateAnalysis.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      CashFlowTemplateAnalysis.belongsTo(models.CashFlowTemplate, {
        foreignKey: "template_id",
        as: "template",
      })

      CashFlowTemplateAnalysis.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      CashFlowTemplateAnalysis.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })
    }
  }

  CashFlowTemplateAnalysis.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template_kind: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "cash_flow",
        validate: {
          isIn: [["cash_flow", "capital_account_statement"]],
        },
      },
      source_file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      source_file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      source_file_sha256: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("suggested", "confirmed", "superseded"),
        allowNull: false,
        defaultValue: "suggested",
      },
      detected_layout_type: {
        type: DataTypes.ENUM("rows", "columns", "sectioned", "freeform"),
        allowNull: false,
      },
      confidence: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
      },
      suggested_config_json: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      raw_structure_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      issues_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      llm_meta_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      schema_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      needs_human_review: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CashFlowTemplateAnalysis",
      tableName: "cash_flow_template_analyses",
      underscored: true,
      timestamps: true,
    },
  )

  return CashFlowTemplateAnalysis
}
