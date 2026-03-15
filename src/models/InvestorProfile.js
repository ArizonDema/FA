const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class InvestorProfile extends Model {
    static associate(models) {
      InvestorProfile.hasMany(models.Commitment, {
        foreignKey: "investor_profile_id",
        as: "commitments",
      })
      InvestorProfile.hasMany(models.InvestorUserLink, {
        foreignKey: "investor_profile_id",
        as: "userLinks",
      })
      InvestorProfile.hasMany(models.FundDocument, {
        foreignKey: "investor_profile_id",
        as: "documents",
      })
    }
  }

  InvestorProfile.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      investor_type: {
        type: DataTypes.ENUM("individual", "corporate"),
        allowNull: false,
        defaultValue: "individual",
      },
      legal_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contact_email: DataTypes.STRING(255),
      contact_phone: DataTypes.STRING(100),
      country: DataTypes.STRING(120),
      tax_id: DataTypes.STRING(120),
      address: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
      },
    },
    {
      sequelize,
      modelName: "InvestorProfile",
      tableName: "investor_profiles",
      underscored: true,
      timestamps: true,
    },
  )

  return InvestorProfile
}
