"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cash_flow_template_analyses", {
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
      template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "cash_flow_templates", key: "id" },
        onDelete: "SET NULL",
      },
      source_file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      source_file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("suggested", "confirmed", "superseded"),
        allowNull: false,
        defaultValue: "suggested",
      },
      detected_layout_type: {
        type: Sequelize.ENUM("rows", "columns", "sectioned", "freeform"),
        allowNull: false,
      },
      confidence: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
      },
      suggested_config_json: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      issues_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("cash_flow_template_analyses", ["portfolio_id"])
    await queryInterface.addIndex("cash_flow_template_analyses", ["template_id"])
    await queryInterface.addIndex("cash_flow_template_analyses", ["status"])
    await queryInterface.addIndex("cash_flow_template_analyses", ["created_at"])
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cash_flow_template_analyses")
  },
}
