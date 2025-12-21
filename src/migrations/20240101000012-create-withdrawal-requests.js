module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("withdrawal_requests", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
      units_to_redeem: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: false,
      },
      nav_at_request: {
        type: Sequelize.DECIMAL(18, 6),
        allowNull: true,
      },
      gross_amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: true,
      },
      management_fees: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
      },
      performance_fees: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
      },
      penalty_fees: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
      },
      total_fees: {
        type: Sequelize.DECIMAL(18, 2),
        defaultValue: 0,
      },
      net_amount: {
        type: Sequelize.DECIMAL(18, 2),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "approved", "paid", "rejected", "cancelled"),
        defaultValue: "pending",
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      admin_notes: {
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

    await queryInterface.addIndex("withdrawal_requests", ["user_id"])
    await queryInterface.addIndex("withdrawal_requests", ["investment_contract_id"])
    await queryInterface.addIndex("withdrawal_requests", ["status"])
    await queryInterface.addIndex("withdrawal_requests", ["requested_at"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("withdrawal_requests")
  },
}
