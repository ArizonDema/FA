const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class DistributionLine extends Model {
    static associate(models) {
      DistributionLine.belongsTo(models.Distribution, {
        foreignKey: "distribution_id",
        as: "distribution",
      })
      DistributionLine.belongsTo(models.Commitment, {
        foreignKey: "commitment_id",
        as: "commitment",
      })
    }
  }

  DistributionLine.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      distribution_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      commitment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      gross_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      withholding: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      net_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      paid_date: DataTypes.DATEONLY,
    },
    {
      sequelize,
      modelName: "DistributionLine",
      tableName: "distribution_lines",
      underscored: true,
      timestamps: true,
    },
  )

  return DistributionLine
}
