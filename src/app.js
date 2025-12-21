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

/**
 * Initialize Express Application
 */
const app = express()

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
  res.status(200).json({
    status: "success",
    message: "CSS Invest Backend is running",
    timestamp: new Date().toISOString(),
    environment: config.env,
  })
})

// API Routes
app.use(`${config.apiPrefix}/auth`, authRoutes)
app.use(`${config.apiPrefix}/investor`, investorRoutes)
app.use(`${config.apiPrefix}/admin`, adminRoutes)
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
