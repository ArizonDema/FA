const mockFindOne = jest.fn()
const mockUserCount = jest.fn()
const mockInvestmentCount = jest.fn()
const mockPortfolioCount = jest.fn()
const mockRoundCount = jest.fn()

jest.mock("../src/models", () => ({
  Portfolio: {
    findOne: (...args) => mockFindOne(...args),
    count: (...args) => mockPortfolioCount(...args),
  },
  User: {
    count: (...args) => mockUserCount(...args),
  },
  InvestmentContract: {
    count: (...args) => mockInvestmentCount(...args),
  },
  PortfolioRound: {
    count: (...args) => mockRoundCount(...args),
  },
}))

const HealthService = require("../src/modules/health/services/health.service")

describe("HealthService", () => {
  beforeEach(() => {
    mockFindOne.mockResolvedValue({ id: "fund-1" })
    mockUserCount.mockResolvedValue(2)
    mockInvestmentCount.mockResolvedValue(3)
    mockPortfolioCount.mockResolvedValue(4)
    mockRoundCount.mockResolvedValue(1)
  })

  test("builds runtime health payload without probing the database", () => {
    const payload = HealthService.getRuntimeHealth({
      runtimeStatus: { database: "connected", bgJobsStarted: true, lastDbError: null },
      environment: "test",
    })

    expect(payload).toEqual(
      expect.objectContaining({
        status: "success",
        environment: "test",
        database: "connected",
        bgJobsStarted: true,
      }),
    )
  })

  test("returns system stats from models", async () => {
    const stats = await HealthService.getStats()
    expect(stats).toEqual({
      totalUsers: 2,
      totalInvestments: 3,
      totalFunds: 4,
      activeRounds: 1,
    })
  })
})
