const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Stock Asset Model
   * Master data for tradable stocks
   */
  class StockAsset extends Model {
    static associate(models) {
      // Stock has many positions
      StockAsset.hasMany(models.StockPosition, {
        foreignKey: "stock_asset_id",
        as: "positions",
      })

      // Stock has many trade transactions
      StockAsset.hasMany(models.TradeTransaction, {
        foreignKey: "stock_asset_id",
        as: "trades",
      })
    }
  }

  StockAsset.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ticker: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      exchange: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      company_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      sector: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: "USD",
      },
      status: {
        type: DataTypes.ENUM("active", "delisted", "suspended"),
        defaultValue: "active",
      },
    },
    {
      sequelize,
      modelName: "StockAsset",
      tableName: "stock_assets",
      underscored: true,
      timestamps: true,
    },
  )

  return StockAsset
}
