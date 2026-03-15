const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class CapitalCall extends Model {
    static associate(models) {
      CapitalCall.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      CapitalCall.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })
      CapitalCall.hasMany(models.CapitalCallLine, {
        foreignKey: "capital_call_id",
        as: "lines",
      })
    }
  }

  CapitalCall.init(
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
      portfolio_round_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      call_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      due_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      memo: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM("draft", "issued", "closed"),
        allowNull: false,
        defaultValue: "issued",
      },
    },
    {
      sequelize,
      modelName: "CapitalCall",
      tableName: "capital_calls",
      underscored: true,
      timestamps: true,
    },
  )

  return CapitalCall
}
