const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class GLAccount extends Model {
    static associate(models) {
      GLAccount.hasMany(models.JournalLine, {
        foreignKey: "gl_account_id",
        as: "journalLines",
      })
    }
  }

  GLAccount.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("asset", "liability", "equity", "income", "expense"),
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "GLAccount",
      tableName: "gl_accounts",
      underscored: true,
      timestamps: true,
    },
  )

  return GLAccount
}
