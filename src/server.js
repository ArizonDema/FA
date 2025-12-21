require("dotenv").config()
const app = require("./app")
const config = require("./config/app")
const logger = require("./config/logger")
const db = require("./models")
const { startBackgroundJobs } = require("./jobs")

const PORT = config.port

/**
 * Start the server
 */
async function startServer() {
  try {
    // Test database connection
    await db.sequelize.authenticate()
    logger.info("✓ Database connection established successfully")

    // Sync models (use migrations in production)
    if (config.env === "development") {
      logger.info("Development mode: Models are ready")
    }

    // Start background jobs
    startBackgroundJobs()
    logger.info("✓ Background jobs initialized")

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`✓ CSS Invest Backend running on port ${PORT}`)
      logger.info(`✓ Environment: ${config.env}`)
      logger.info(`✓ API Documentation: http://localhost:${PORT}/api/docs`)
      logger.info(`✓ Health Check: http://localhost:${PORT}/health`)
    })
  } catch (error) {
    logger.error("✗ Unable to start server:", error)
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! Shutting down...")
  logger.error(err.name, err.message)
  process.exit(1)
})

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! Shutting down...")
  logger.error(err.name, err.message)
  process.exit(1)
})

startServer()
