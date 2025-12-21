module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("fee_records", {
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
      fee_type: {
        type: Sequelize.ENUM("management", "performance", "penalty", "other"),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: false,
      },
      nav: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: true,
      },
      calculation_basis: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: true,
      },
      fee_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      charged_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
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

    await queryInterface.addIndex("fee_records", ["investment_contract_id"])
    await queryInterface.addIndex("fee_records", ["fee_type"])
    await queryInterface.addIndex("fee_records", ["charged_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("fee_records")
  },
}
