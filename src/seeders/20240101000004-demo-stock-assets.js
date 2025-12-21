module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      "stock_assets",
      [
        {
          id: "880e8400-e29b-41d4-a716-446655440001",
          ticker: "AAPL",
          exchange: "NASDAQ",
          company_name: "Apple Inc.",
          sector: "Technology",
          currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "880e8400-e29b-41d4-a716-446655440002",
          ticker: "MSFT",
          exchange: "NASDAQ",
          company_name: "Microsoft Corporation",
          sector: "Technology",
          currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "880e8400-e29b-41d4-a716-446655440003",
          ticker: "GOOGL",
          exchange: "NASDAQ",
          company_name: "Alphabet Inc.",
          sector: "Technology",
          currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "880e8400-e29b-41d4-a716-446655440004",
          ticker: "AMZN",
          exchange: "NASDAQ",
          company_name: "Amazon.com Inc.",
          sector: "Consumer Cyclical",
          currency: "USD",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("stock_assets", null, {})
  },
}
