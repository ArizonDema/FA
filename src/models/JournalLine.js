const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class JournalLine extends Model {
    static associate(models) {
      JournalLine.belongsTo(models.JournalEntry, {
        foreignKey: "journal_entry_id",
        as: "entry",
      })
      JournalLine.belongsTo(models.GLAccount, {
        foreignKey: "gl_account_id",
        as: "account",
      })
    }
  }

  JournalLine.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      journal_entry_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      gl_account_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      debit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      credit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: DataTypes.STRING(3),
      fx_rate: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      sequelize,
      modelName: "JournalLine",
      tableName: "journal_lines",
      underscored: true,
      timestamps: true,
    },
  )

  return JournalLine
}
