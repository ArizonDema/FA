require("dotenv").config()
const app = require("./app")
const config = require("./config/app")
const logger = require("./config/logger")
const db = require("./models")
const { startBackgroundJobs } = require("./jobs")

const PORT = config.port
const DB_RETRY_MS = Number.parseInt(process.env.DB_CONNECT_RETRY_MS || "5000", 10)

let dbConnected = false
let bgJobsStarted = false
let dbPollTimer = null

function updateRuntimeStatus(next) {
  app.locals.runtimeStatus = {
    ...(app.locals.runtimeStatus || {}),
    ...next,
  }
}

async function probeDatabaseConnection() {
  try {
    await db.sequelize.authenticate()

    if (!dbConnected) {
      logger.info("[v0] Database connection established successfully")
    }

    dbConnected = true
    updateRuntimeStatus({
      database: "connected",
      lastDbError: null,
    })

    if (!bgJobsStarted) {
      startBackgroundJobs()
      bgJobsStarted = true
      updateRuntimeStatus({ bgJobsStarted: true })
      logger.info("[v0] Background jobs initialized")
    }
  } catch (error) {
    const wasConnected = dbConnected
    dbConnected = false
    updateRuntimeStatus({
      database: "connecting",
      lastDbError: error?.parent?.code || error.message || "Database connection failed",
      bgJobsStarted,
    })

    if (wasConnected) {
      logger.error("[v0] Database connection lost. API will respond 503 until it recovers.", error)
    } else {
      logger.warn(
        `[v0] Database not reachable yet (${error?.parent?.code || error.name || "UNKNOWN"}). Retrying in ${
          Number.isFinite(DB_RETRY_MS) ? DB_RETRY_MS : 5000
        }ms.`,
      )
    }
  }
}

function startDatabaseWatcher() {
  const retryInterval = Number.isFinite(DB_RETRY_MS) && DB_RETRY_MS > 0 ? DB_RETRY_MS : 5000
  probeDatabaseConnection()
  dbPollTimer = setInterval(() => {
    probeDatabaseConnection()
  }, retryInterval)

  if (typeof dbPollTimer?.unref === "function") {
    dbPollTimer.unref()
  }
}

/**
 * Start server and keep it available even if DB is temporarily offline.
 */
function startServer() {
  updateRuntimeStatus({
    database: "connecting",
    bgJobsStarted: false,
    lastDbError: null,
    startedAt: new Date().toISOString(),
  })

  app.listen(PORT, () => {
    logger.info(`[v0] CSS Invest Backend running on port ${PORT}`)
    logger.info(`[v0] Environment: ${config.env}`)
    logger.info(`[v0] API Documentation: http://localhost:${PORT}/api/docs`)
    logger.info(`[v0] Health Check: http://localhost:${PORT}/health`)
  })

  startDatabaseWatcher()
}

process.on("unhandledRejection", (err) => {
  logger.error("[v0] UNHANDLED REJECTION", {
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  })
})

process.on("uncaughtException", (err) => {
  logger.error("[v0] UNCAUGHT EXCEPTION", {
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  })
})

startServer()
