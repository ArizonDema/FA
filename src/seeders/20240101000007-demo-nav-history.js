module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const base = new Date(now)
    base.setDate(base.getDate() - 35)

    const growthPoints = [1.02, 1.04, 1.07, 1.09, 1.13, 1.16]
    const balancedPoints = [1.01, 1.025, 1.04, 1.055, 1.075, 1.09]

    const growthRows = growthPoints.map((nav, index) => {
      const recordedAt = new Date(base)
      recordedAt.setDate(recordedAt.getDate() + index * 7)

      const totalUnits = 5000
      const portfolioValue = totalUnits * nav
      const marketValue = portfolioValue * 0.62
      const cashBalance = portfolioValue - marketValue

      return {
        id: `bb0e8400-e29b-41d4-a716-44665544000${index + 1}`,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
        nav: nav.toFixed(6),
        total_units: totalUnits.toFixed(6),
        portfolio_value: portfolioValue.toFixed(2),
        cash_balance: cashBalance.toFixed(2),
        market_value: marketValue.toFixed(2),
        accrued_fees: 0.0,
        recorded_at: recordedAt,
        created_at: now,
        updated_at: now,
      }
    })

    const balancedRows = balancedPoints.map((nav, index) => {
      const recordedAt = new Date(base)
      recordedAt.setDate(recordedAt.getDate() + index * 7)

      const totalUnits = 10000
      const portfolioValue = totalUnits * nav
      const marketValue = portfolioValue * 0.48
      const cashBalance = portfolioValue - marketValue

      return {
        id: `cc0e8400-e29b-41d4-a716-44665544000${index + 1}`,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440002",
        nav: nav.toFixed(6),
        total_units: totalUnits.toFixed(6),
        portfolio_value: portfolioValue.toFixed(2),
        cash_balance: cashBalance.toFixed(2),
        market_value: marketValue.toFixed(2),
        accrued_fees: 0.0,
        recorded_at: recordedAt,
        created_at: now,
        updated_at: now,
      }
    })

    await queryInterface.bulkInsert("portfolio_nav_history", [...growthRows, ...balancedRows], {})
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("portfolio_nav_history", {
      id: [
        "bb0e8400-e29b-41d4-a716-446655440001",
        "bb0e8400-e29b-41d4-a716-446655440002",
        "bb0e8400-e29b-41d4-a716-446655440003",
        "bb0e8400-e29b-41d4-a716-446655440004",
        "bb0e8400-e29b-41d4-a716-446655440005",
        "bb0e8400-e29b-41d4-a716-446655440006",
        "cc0e8400-e29b-41d4-a716-446655440001",
        "cc0e8400-e29b-41d4-a716-446655440002",
        "cc0e8400-e29b-41d4-a716-446655440003",
        "cc0e8400-e29b-41d4-a716-446655440004",
        "cc0e8400-e29b-41d4-a716-446655440005",
        "cc0e8400-e29b-41d4-a716-446655440006",
      ],
    })
  },
}
