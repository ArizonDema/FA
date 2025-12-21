const express = require("express")
const { Portfolio, User, InvestmentContract, PortfolioRound } = require("../models")
const ResponseHandler = require("../utils/responseHandler")

const router = express.Router()

/**
 * @swagger
 * /system/health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy
 */
router.get("/health", async (req, res) => {
  try {
    // Test database connection
    await Portfolio.findOne()

    ResponseHandler.success(
      res,
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      "System is healthy",
    )
  } catch (error) {
    ResponseHandler.serverError(res, "System health check failed")
  }
})

/**
 * @swagger
 * /system/stats:
 *   get:
 *     summary: System statistics
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get("/stats", async (req, res, next) => {
  try {
    const [totalUsers, totalInvestments, totalPortfolios, activeRounds] = await Promise.all([
      User.count(),
      InvestmentContract.count(),
      Portfolio.count(),
      PortfolioRound.count({ where: { status: "open" } }),
    ])

    ResponseHandler.success(
      res,
      {
        totalUsers,
        totalInvestments,
        totalPortfolios,
        activeRounds,
      },
      "Statistics retrieved",
    )
  } catch (error) {
    next(error)
  }
})

module.exports = router
