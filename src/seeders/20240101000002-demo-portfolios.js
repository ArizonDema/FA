module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      "portfolios",
      [
        {
          id: "660e8400-e29b-41d4-a716-446655440001",
          name: "Growth Portfolio",
          description: "High-growth technology and innovation focused portfolio",
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
