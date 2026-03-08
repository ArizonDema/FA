module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      "portfolios",
      [
        {
          id: "660e8400-e29b-41d4-a716-446655440001",
          name: "Growth Portfolio",
          description: "High-growth technology and innovation focused portfolio",
          strategy_type: "equity_growth",
          management_fee_percent: 2.0,
          performance_fee_percent: 20.0,
          lock_up_period_months: 12,
          early_withdrawal_penalty_percent: 5.0,
          minimum_investment: 1000.0,
          risk_level: "high",
          base_currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "660e8400-e29b-41d4-a716-446655440002",
          name: "Balanced Portfolio",
          description: "Diversified portfolio with moderate risk",
          strategy_type: "balanced",
          management_fee_percent: 1.8,
          performance_fee_percent: 18.0,
          lock_up_period_months: 9,
          early_withdrawal_penalty_percent: 4.0,
          minimum_investment: 750.0,
          risk_level: "medium",
          base_currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "660e8400-e29b-41d4-a716-446655440003",
          name: "Conservative Portfolio",
          description: "Low-risk, income-focused portfolio",
          strategy_type: "income_preservation",
          management_fee_percent: 1.2,
          performance_fee_percent: 12.0,
          lock_up_period_months: 6,
          early_withdrawal_penalty_percent: 2.5,
          minimum_investment: 500.0,
          risk_level: "low",
          base_currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("portfolios", null, {})
  },
}
