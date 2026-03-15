const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class FundDocument extends Model {
    static associate(models) {
      FundDocument.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })
      FundDocument.belongsTo(models.InvestorProfile, {
        foreignKey: "investor_profile_id",
        as: "investor",
      })
      FundDocument.belongsTo(models.User, {
        foreignKey: "uploaded_by",
        as: "uploadedBy",
      })
    }
  }

  FundDocument.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: DataTypes.UUID,
      investor_profile_id: DataTypes.UUID,
      document_type: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      uploaded_by: DataTypes.UUID,
      uploaded_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "FundDocument",
      tableName: "fund_documents",
      underscored: true,
      timestamps: true,
    },
  )

  return FundDocument
}
