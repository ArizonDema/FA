module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date()
    const lockupEnd = new Date()
    lockupEnd.setMonth(lockupEnd.getMonth() + 12)

    await queryInterface.bulkInsert(
      "investment_contracts",
      [
        {
          id: "990e8400-e29b-41d4-a716-446655440001",
          user_id: "550e8400-e29b-41d4-a716-446655440002",
          portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
          invested_amount: 5000.0,
          units_issued: 5000.0,
          units_remaining: 5000.0,
          entry_nav: 1.0,
          entry_date: now,
          lockup_end_date: lockupEnd,
          status: "active",
          created_at: now,
          updated_at: now,
        },
        {
          id: "990e8400-e29b-41d4-a716-446655440002",
          user_id: "550e8400-e29b-41d4-a716-446655440003",
          portfolio_round_id: "770e8400-e29b-41d4-a716-446655440002",
          invested_amount: 10000.0,
          units_issued: 10000.0,
          units_remaining: 10000.0,
          entry_nav: 1.0,
          entry_date: now,
          lockup_end_date: lockupEnd,
          status: "active",
          created_at: now,
          updated_at: now,
        },
      ],
      {},
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("investment_contracts", null, {})
  },
}
