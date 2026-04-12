const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class CashFlowAccountMapping extends Model {
    static associate(models) {
      CashFlowAccountMapping.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      CashFlowAccountMapping.belongsTo(models.CashFlowTemplate, {
        foreignKey: "template_id",
        as: "template",
      })

      CashFlowAccountMapping.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })
    }
  }

  CashFlowAccountMapping.init(
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
      normalized_account: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      direction: {
        type: DataTypes.ENUM("inflow", "outflow"),
        allowNull: false,
      },
      bucket_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      confidence: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: DataTypes.ENUM("manual_rule", "auto_semantic", "fallback", "template_rule", "seeded"),
        allowNull: false,
        defaultValue: "auto_semantic",
      },
      status: {
        type: DataTypes.ENUM("suggested", "approved", "rejected"),
        allowNull: false,
        defaultValue: "suggested",
      },
      effective_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      effective_end: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      usage_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CashFlowAccountMapping",
      tableName: "cash_flow_account_mappings",
      underscored: true,
      timestamps: true,
    },
  )

  return CashFlowAccountMapping
}

