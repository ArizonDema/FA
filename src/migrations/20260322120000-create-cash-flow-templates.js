"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cash_flow_templates", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      template_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      template_file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      config_json: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    })

    await queryInterface.addIndex("cash_flow_templates", ["portfolio_id"])
    await queryInterface.addIndex("cash_flow_templates", ["portfolio_id", "is_active"])
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cash_flow_templates")
  },
}
