module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    await queryInterface.bulkInsert(
      "cash_ledger",
      [
        {
          id: "aa0e8400-e29b-41d4-a716-446655440001",
          portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
          amount: 5000.0,
          type: "deposit",
          reference_type: "seed_investment",
          reference_id: null,
          description: "Seed cash for Growth Portfolio round 1",
          recorded_at: sixMonthsAgo,
          created_at: now,
          updated_at: now,
        },
        {
          id: "aa0e8400-e29b-41d4-a716-446655440002",
          portfolio_round_id: "770e8400-e29b-41d4-a716-446655440002",
          amount: 10000.0,
          type: "deposit",
          reference_type: "seed_investment",
          reference_id: null,
          description: "Seed cash for Balanced Portfolio round 1",
          recorded_at: sixMonthsAgo,
          created_at: now,
          updated_at: now,
        },
      ],
      {},
    )
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("cash_ledger", {
      id: [
        "aa0e8400-e29b-41d4-a716-446655440001",
        "aa0e8400-e29b-41d4-a716-446655440002",
      ],
    })
  },
}
