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
        type: DataTypes.ENUM("cash_flow", "shareholder_register", "financial_statements"),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      template_body: DataTypes.TEXT,
      version: DataTypes.STRING(50),
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
