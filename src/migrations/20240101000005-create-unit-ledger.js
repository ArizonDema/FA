module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("unit_ledger", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      investment_contract_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "investment_contracts",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      units: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM("issue", "burn"),
        allowNull: false,
      },
      nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      event_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    })

    await queryInterface.addIndex("unit_ledger", ["investment_contract_id"])
    await queryInterface.addIndex("unit_ledger", ["type"])
    await queryInterface.addIndex("unit_ledger", ["event_date"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("unit_ledger")
  },
}
