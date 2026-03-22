const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const swaggerUi = require("swagger-ui-express")
const config = require("./config/app")
const logger = require("./config/logger")
const swaggerSpec = require("./config/swagger")
const errorHandler = require("./middlewares/errorHandler")

// Import routes
const authRoutes = require("./routes/auth.routes")
const investorRoutes = require("./routes/investor.routes")
const adminRoutes = require("./routes/admin.routes")
const systemRoutes = require("./routes/system.routes")
const fundAdminRoutes = require("./routes/fund-admin.routes")
const cashFlowRoutes = require("./routes/cash-flow.routes")

/**
 * Initialize Express Application
 */
const app = express()

app.locals.runtimeStatus = {
  database: "connected",
  bgJobsStarted: false,
  lastDbError: null,
  startedAt: new Date().toISOString(),
}

// Security middleware
app.use(helmet())

// CORS configuration
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    optionsSuccessStatus: 200, // optional, but good for older browsers
  }),
)

// Body parsing middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// HTTP request logger
if (config.env === "development") {
  app.use(morgan("dev"))
} else {
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    }),
  )
}

// API Documentation
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// Health check endpoint
app.get("/health", (req, res) => {
  const runtimeStatus = app.locals.runtimeStatus || {}
  const dbConnected = runtimeStatus.database === "connected"
  res.status(200).json({
    status: dbConnected ? "success" : "degraded",
    message: "CSS Invest Backend is running",
    timestamp: new Date().toISOString(),
    environment: config.env,
    database: runtimeStatus.database || "unknown",
    bgJobsStarted: Boolean(runtimeStatus.bgJobsStarted),
    lastDbError: runtimeStatus.lastDbError || null,
  })
})

// Graceful startup guard while database is still connecting
app.use((req, res, next) => {
  const runtimeStatus = app.locals.runtimeStatus || {}
  if (
    req.path.startsWith(config.apiPrefix) &&
    runtimeStatus.database !== "connected"
  ) {
    return res.status(503).json({
      status: "error",
      message: "Backend is starting database connection. Please retry in a few seconds.",
      timestamp: new Date().toISOString(),
    })
  }
  return next()
})

// API Routes
app.use(`${config.apiPrefix}/auth`, authRoutes)
app.use(`${config.apiPrefix}/investor`, investorRoutes)
app.use(`${config.apiPrefix}/admin`, adminRoutes)
app.use(`${config.apiPrefix}`, fundAdminRoutes)
app.use(`${config.apiPrefix}/cash-flow`, cashFlowRoutes)
app.use(`${config.apiPrefix}/system`, systemRoutes)

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
  })
})

// Global error handler (must be last)
app.use(errorHandler)

module.exports = app
