const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class Distribution extends Model {
    static associate(models) {
      Distribution.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      Distribution.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })
      Distribution.hasMany(models.DistributionLine, {
        foreignKey: "distribution_id",
        as: "lines",
      })
    }
  }

  Distribution.init(
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
      distribution_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      distribution_type: {
        type: DataTypes.ENUM("return_of_capital", "profit", "other"),
        allowNull: false,
        defaultValue: "return_of_capital",
      },
      status: {
        type: DataTypes.ENUM("draft", "paid", "closed"),
        allowNull: false,
        defaultValue: "paid",
      },
      memo: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "Distribution",
      tableName: "distributions",
      underscored: true,
      timestamps: true,
    },
  )

  return Distribution
}
