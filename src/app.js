const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const swaggerUi = require("swagger-ui-express")
const fs = require("fs")
const path = require("path")
const config = require("./config/app")
const logger = require("./config/logger")
const swaggerSpec = require("./config/swagger")
const errorHandler = require("./middlewares/errorHandler")
const HealthService = require("./modules/health/services/health.service")

// Import routes
const authRoutes = require("./routes/auth.routes")
const investorRoutes = require("./routes/investor.routes")
const adminRoutes = require("./routes/admin.routes")
const systemRoutes = require("./routes/system.routes")
const fundAdminRoutes = require("./routes/fund-admin.routes")
const cashFlowRoutes = require("./routes/cash-flow.routes")
const semanticRoutes = require("./modules/semantic/routes/semantic.routes")
const mappingRoutes = require("./modules/mappings/routes/mappings.routes")
const auditRoutes = require("./modules/audit/routes/audit.routes")
const reviewRoutes = require("./modules/reviews/routes/review.routes")
const agentToolRoutes = require("./modules/agent-tools/routes/agentTool.routes")
const agentMcpRoutes = require("./modules/agent-tools/routes/agentMcp.routes")

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
  return res.status(200).json(
    HealthService.getRuntimeHealth({
      runtimeStatus: app.locals.runtimeStatus || {},
      environment: config.env,
    }),
  )
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
app.use(`${config.apiPrefix}/mcp`, agentMcpRoutes)
app.use(`${config.apiPrefix}`, fundAdminRoutes)
app.use(`${config.apiPrefix}/cash-flow`, cashFlowRoutes)
app.use(`${config.apiPrefix}/semantic-concepts`, semanticRoutes)
app.use(`${config.apiPrefix}/mappings`, mappingRoutes)
app.use(`${config.apiPrefix}/audit-events`, auditRoutes)
app.use(`${config.apiPrefix}/review-tasks`, reviewRoutes)
app.use(`${config.apiPrefix}/agent-reporting`, agentToolRoutes)
app.use(`${config.apiPrefix}/system`, systemRoutes)

const frontendDistPath = path.resolve(__dirname, "..", "frontend", "dist")
const frontendIndexPath = path.join(frontendDistPath, "index.html")
const frontendBuildAvailable = fs.existsSync(frontendIndexPath)

if (frontendBuildAvailable) {
  app.use(express.static(frontendDistPath, { index: false }))

  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next()
    if (req.path === "/health") return next()
    if (req.path.startsWith("/api/") || req.path === "/api") return next()
    return res.sendFile(frontendIndexPath)
  })
} else if (config.env !== "production") {
  logger.warn(
    `[v0] Frontend build not found at ${frontendIndexPath}. Run "npm run frontend:build" for stable runtime mode.`,
  )
}

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
