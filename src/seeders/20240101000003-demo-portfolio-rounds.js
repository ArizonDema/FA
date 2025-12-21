module.exports = {
  async up(queryInterface, Sequelize) {
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 6) // Started 6 months ago

    await queryInterface.bulkInsert(
      "portfolio_rounds",
      [
        {
          id: "770e8400-e29b-41d4-a716-446655440001",
          portfolio_id: "660e8400-e29b-41d4-a716-446655440001",
          round_number: 1,
          start_date: startDate,
          end_date: null,
          status: "open",
          opening_nav: 1.0,
          closing_nav: null,
          total_units_issued: 5000.0,
          total_cash_collected: 5000.0,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "770e8400-e29b-41d4-a716-446655440002",
          portfolio_id: "660e8400-e29b-41d4-a716-446655440002",
          round_number: 1,
          start_date: startDate,
          end_date: null,
          status: "open",
          opening_nav: 1.0,
          closing_nav: null,
          total_units_issued: 10000.0,
          total_cash_collected: 10000.0,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("portfolio_rounds", null, {})
  },
}
