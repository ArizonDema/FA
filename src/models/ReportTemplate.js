const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ReportTemplate extends Model {
    static associate(models) {
      ReportTemplate.belongsTo(models.ShareClass, {
        foreignKey: "assigned_share_class_id",
        as: "shareClass",
      })
    }
  }

  ReportTemplate.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      type: {
        type: DataTypes.ENUM(
          "cash_flow",
          "shareholder_register",
          "financial_statements",
          "capital_account_statement",
        ),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      template_body: DataTypes.TEXT,
      definition_json: DataTypes.JSON,
      version: DataTypes.STRING(50),
      status: {
        type: DataTypes.ENUM("draft", "active", "archived"),
        allowNull: false,
        defaultValue: "draft",
      },
      published_at: DataTypes.DATE,
      assigned_share_class_id: DataTypes.UUID,
    },
    {
      sequelize,
      modelName: "ReportTemplate",
      tableName: "report_templates",
      underscored: true,
      timestamps: true,
    },
  )

  return ReportTemplate
}
