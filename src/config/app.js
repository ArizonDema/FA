require("dotenv").config()

module.exports = {
  // Server Configuration
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 8000,
  apiPrefix: process.env.API_PREFIX || "/api/v1",

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  // Fee Configuration (Annual Percentages)
  fees: {
    managementFeeAnnual: Number.parseFloat(process.env.MANAGEMENT_FEE_ANNUAL) || 2.0,
    performanceFee: Number.parseFloat(process.env.PERFORMANCE_FEE) || 20.0,
    earlyWithdrawalPenalty: Number.parseFloat(process.env.EARLY_WITHDRAWAL_PENALTY) || 5.0,
  },

  // Lock-up Configuration
  lockup: {
    defaultMonths: Number.parseInt(process.env.DEFAULT_LOCKUP_MONTHS) || 12,
  },

  // Background Jobs
  jobs: {
    navCalculationSchedule: process.env.NAV_CALCULATION_SCHEDULE || "0 0 * * *",
    feeAccrualSchedule: process.env.FEE_ACCRUAL_SCHEDULE || "0 1 * * *",
  },

  // CORS
  // cors: {
  //   origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  // },

  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
      : ["http://localhost:3000", "http://localhost:5173"],
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  // Ollama template-ingestion LLM
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "qwen3:14b",
    chatPath: process.env.OLLAMA_CHAT_PATH || "/api/chat",
    timeoutMs: Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || "90000", 10),
    maxAttempts: Number.parseInt(process.env.OLLAMA_MAX_ATTEMPTS || "2", 10),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
    temperature: Number.parseFloat(process.env.OLLAMA_TEMPERATURE || "0.1"),
    numPredict: Number.parseInt(process.env.OLLAMA_NUM_PREDICT || "1200", 10),
    deterministicBypassConfidence: Number.parseFloat(process.env.OLLAMA_DETERMINISTIC_BYPASS_CONFIDENCE || "0.995"),
  },
}
