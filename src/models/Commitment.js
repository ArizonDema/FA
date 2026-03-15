const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class Commitment extends Model {
    static associate(models) {
      Commitment.belongsTo(models.InvestorProfile, {
        foreignKey: "investor_profile_id",
        as: "investor",
      })
      Commitment.belongsTo(models.ShareClass, {
        foreignKey: "share_class_id",
        as: "shareClass",
      })
      Commitment.hasMany(models.CapitalCallLine, {
        foreignKey: "commitment_id",
        as: "capitalCalls",
      })
      Commitment.hasMany(models.DistributionLine, {
        foreignKey: "commitment_id",
        as: "distributions",
      })
    }
  }

  Commitment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      investor_profile_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      share_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      commitment_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      commitment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "closed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      notes: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "Commitment",
      tableName: "commitments",
      underscored: true,
      timestamps: true,
    },
  )

  return Commitment
}
