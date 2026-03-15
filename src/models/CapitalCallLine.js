const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class CapitalCallLine extends Model {
    static associate(models) {
      CapitalCallLine.belongsTo(models.CapitalCall, {
        foreignKey: "capital_call_id",
        as: "capitalCall",
      })
      CapitalCallLine.belongsTo(models.Commitment, {
        foreignKey: "commitment_id",
        as: "commitment",
      })
    }
  }

  CapitalCallLine.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      capital_call_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      commitment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      called_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      paid_amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      paid_date: DataTypes.DATEONLY,
    },
    {
      sequelize,
      modelName: "CapitalCallLine",
      tableName: "capital_call_lines",
      underscored: true,
      timestamps: true,
    },
  )

  return CapitalCallLine
}
