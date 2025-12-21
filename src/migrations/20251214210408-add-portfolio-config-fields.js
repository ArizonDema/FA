module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("portfolios", "strategy_type", {
      type: Sequelize.STRING(100),
      allowNull: false,
    });

    await queryInterface.addColumn("portfolios", "management_fee_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
    });

    await queryInterface.addColumn("portfolios", "performance_fee_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
    });

    await queryInterface.addColumn("portfolios", "lock_up_period_months", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.addColumn("portfolios", "early_withdrawal_penalty_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
    });

    await queryInterface.addColumn("portfolios", "minimum_investment", {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    const columns = [
      "strategy_type",
      "management_fee_percent",
      "performance_fee_percent",
      "lock_up_period_months",
      "early_withdrawal_penalty_percent",
      "minimum_investment",
    ];
    for (const col of columns) {
      await queryInterface.removeColumn("portfolios", col);
    }
  },
};