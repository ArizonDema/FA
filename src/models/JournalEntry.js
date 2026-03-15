const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class JournalEntry extends Model {
    static associate(models) {
      JournalEntry.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      JournalEntry.belongsTo(models.PortfolioRound, {
        foreignKey: "portfolio_round_id",
        as: "round",
      })
      JournalEntry.belongsTo(models.User, {
        foreignKey: "posted_by",
        as: "postedBy",
      })
      JournalEntry.hasMany(models.JournalLine, {
        foreignKey: "journal_entry_id",
        as: "lines",
      })
    }
  }

  JournalEntry.init(
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
      entry_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      memo: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM("draft", "posted", "void"),
        allowNull: false,
        defaultValue: "posted",
      },
      posted_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "JournalEntry",
      tableName: "journal_entries",
      underscored: true,
      timestamps: true,
    },
  )

  return JournalEntry
}
