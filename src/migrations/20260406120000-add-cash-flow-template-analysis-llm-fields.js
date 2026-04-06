"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("cash_flow_template_analyses", "source_file_sha256", {
      type: Sequelize.STRING(64),
      allowNull: true,
    })

    await queryInterface.addColumn("cash_flow_template_analyses", "needs_human_review", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })

    await queryInterface.addColumn("cash_flow_template_analyses", "raw_structure_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })

    await queryInterface.addColumn("cash_flow_template_analyses", "llm_meta_json", {
      type: Sequelize.JSON,
      allowNull: true,
    })

    await queryInterface.addColumn("cash_flow_template_analyses", "schema_hash", {
      type: Sequelize.STRING(64),
      allowNull: true,
    })

    await queryInterface.addIndex("cash_flow_template_analyses", ["portfolio_id", "source_file_sha256"], {
      name: "cash_flow_template_analyses_portfolio_sha_idx",
    })
    await queryInterface.addIndex("cash_flow_template_analyses", ["needs_human_review"], {
      name: "cash_flow_template_analyses_needs_review_idx",
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("cash_flow_template_analyses", "cash_flow_template_analyses_portfolio_sha_idx")
    await queryInterface.removeIndex("cash_flow_template_analyses", "cash_flow_template_analyses_needs_review_idx")

    await queryInterface.removeColumn("cash_flow_template_analyses", "schema_hash")
    await queryInterface.removeColumn("cash_flow_template_analyses", "llm_meta_json")
    await queryInterface.removeColumn("cash_flow_template_analyses", "raw_structure_json")
    await queryInterface.removeColumn("cash_flow_template_analyses", "needs_human_review")
    await queryInterface.removeColumn("cash_flow_template_analyses", "source_file_sha256")
  },
}
