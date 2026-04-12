const { Portfolio, User, InvestmentContract, PortfolioRound } = require("../../../models")

class HealthService {
  static getRuntimeHealth({ runtimeStatus = {}, environment = "development" } = {}) {
    const dbConnected = runtimeStatus.database === "connected"
    return {
      status: dbConnected ? "success" : "degraded",
      message: "CSS Invest Backend is running",
      timestamp: new Date().toISOString(),
      environment,
      database: runtimeStatus.database || "unknown",
      bgJobsStarted: Boolean(runtimeStatus.bgJobsStarted),
      lastDbError: runtimeStatus.lastDbError || null,
    }
  }

  static async getSystemHealth() {
    await Portfolio.findOne()
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }
  }

  static async getStats() {
    const [totalUsers, totalInvestments, totalFunds, activeRounds] = await Promise.all([
      User.count(),
      InvestmentContract.count(),
      Portfolio.count(),
      PortfolioRound.count({ where: { status: "open" } }),
    ])

    return {
      totalUsers,
      totalInvestments,
      totalFunds,
      activeRounds,
    }
  }
}

module.exports = HealthService
