"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cash_flow_account_mappings", {
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
      normalized_account: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      direction: {
        type: Sequelize.ENUM("inflow", "outflow"),
        allowNull: false,
      },
      bucket_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      confidence: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: Sequelize.ENUM("manual_rule", "auto_semantic", "fallback", "template_rule", "seeded"),
        allowNull: false,
        defaultValue: "auto_semantic",
      },
      usage_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
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

    await queryInterface.addIndex("cash_flow_account_mappings", ["portfolio_id"])
    await queryInterface.addIndex("cash_flow_account_mappings", ["template_id"])
    await queryInterface.addIndex("cash_flow_account_mappings", ["normalized_account"])
    await queryInterface.addIndex("cash_flow_account_mappings", ["direction"])
    await queryInterface.addIndex("cash_flow_account_mappings", ["bucket_key"])
    await queryInterface.addIndex("cash_flow_account_mappings", ["portfolio_id", "template_id", "normalized_account", "direction"], {
      unique: true,
      name: "cash_flow_account_mappings_unique_scope",
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cash_flow_account_mappings")
  },
}
