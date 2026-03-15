const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class InvestorUserLink extends Model {
    static associate(models) {
      InvestorUserLink.belongsTo(models.InvestorProfile, {
        foreignKey: "investor_profile_id",
        as: "investor",
      })
      InvestorUserLink.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      })
    }
  }

  InvestorUserLink.init(
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
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "InvestorUserLink",
      tableName: "investor_user_links",
      underscored: true,
      timestamps: false,
      createdAt: "created_at",
      updatedAt: false,
    },
  )

  return InvestorUserLink
}
