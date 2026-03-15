const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class ShareClass extends Model {
    static associate(models) {
      ShareClass.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      ShareClass.hasMany(models.Commitment, {
        foreignKey: "share_class_id",
        as: "commitments",
      })
      ShareClass.hasMany(models.ReportTemplate, {
        foreignKey: "assigned_share_class_id",
        as: "templates",
      })
    }
  }

  ShareClass.init(
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
      class_name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      currency: DataTypes.STRING(3),
      management_fee: DataTypes.DECIMAL(6, 2),
      performance_fee: DataTypes.DECIMAL(6, 2),
      hurdle_rate: DataTypes.DECIMAL(6, 2),
      catch_up: DataTypes.DECIMAL(6, 2),
      min_commitment: DataTypes.DECIMAL(18, 2),
    },
    {
      sequelize,
      modelName: "ShareClass",
      tableName: "share_classes",
      underscored: true,
      timestamps: true,
    },
  )

  return ShareClass
}
