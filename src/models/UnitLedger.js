const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Unit Ledger Model
   * APPEND-ONLY ledger for unit issuance and burning
   * Never delete entries - this is the single source of truth
   */
  class UnitLedger extends Model {
    static associate(models) {
      // Unit entry belongs to an investment contract
      UnitLedger.belongsTo(models.InvestmentContract, {
        foreignKey: "investment_contract_id",
        as: "contract",
      })
    }
  }

  UnitLedger.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      investment_contract_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "investment_contracts",
          key: "id",
        },
      },
      units: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "Positive for issue, negative for burn",
      },
      type: {
        type: DataTypes.ENUM("issue", "burn"),
        allowNull: false,
      },
      nav: {
        type: DataTypes.DECIMAL(18, 6),
        allowNull: false,
        comment: "NAV at time of transaction",
      },
      event_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      reference_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Type of event: investment, withdrawal, etc.",
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "ID of related entity",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "UnitLedger",
      tableName: "unit_ledger",
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ["investment_contract_id"] }, { fields: ["type"] }, { fields: ["event_date"] }],
    },
  )

  return UnitLedger
}
