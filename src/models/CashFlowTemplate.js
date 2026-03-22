const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class CashFlowTemplate extends Model {
    static associate(models) {
      CashFlowTemplate.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      CashFlowTemplate.belongsTo(models.User, {
        foreignKey: "uploaded_by",
        as: "uploadedBy",
      })
    }
  }

  CashFlowTemplate.init(
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      version: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      template_file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      template_file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      config_json: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CashFlowTemplate",
      tableName: "cash_flow_templates",
      underscored: true,
      timestamps: true,
    },
  )

  return CashFlowTemplate
}
