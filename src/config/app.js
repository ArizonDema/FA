require("dotenv").config()

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

function parseOllamaThink(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["low", "medium", "high"].includes(normalized)) return normalized
  return parseBoolean(value, fallback)
}

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
    healthPath: process.env.OLLAMA_HEALTH_PATH || "/api/tags",
    timeoutMs: Number.parseInt(
      process.env.OLLAMA_TIMEOUT_MS || process.env.OLLAMA_CHAT_TIMEOUT_MS || "600000",
      10,
    ),
    healthTimeoutMs: Number.parseInt(process.env.OLLAMA_HEALTH_TIMEOUT_MS || "10000", 10),
    maxAttempts: Number.parseInt(process.env.OLLAMA_MAX_ATTEMPTS || "2", 10),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
    temperature: Number.parseFloat(process.env.OLLAMA_TEMPERATURE || "0.1"),
    numPredict: Number.parseInt(process.env.OLLAMA_NUM_PREDICT || "800", 10),
    think: parseOllamaThink(process.env.OLLAMA_THINK, false),
    forceJsonOutput: parseBoolean(process.env.OLLAMA_FORCE_JSON_OUTPUT, true),
    compactPromptFirst: parseBoolean(process.env.OLLAMA_COMPACT_PROMPT_FIRST, true),
    compactPromptThresholdChars: Number.parseInt(process.env.OLLAMA_COMPACT_PROMPT_THRESHOLD_CHARS || "22000", 10),
    deterministicBypassConfidence: Number.parseFloat(process.env.OLLAMA_DETERMINISTIC_BYPASS_CONFIDENCE || "0.995"),
  },

  mappingAssistance: {
    enabled: parseBoolean(process.env.MAPPING_LLM_ENABLED, true),
    provider: process.env.MAPPING_LLM_PROVIDER || "ollama",
    model: process.env.MAPPING_LLM_MODEL || process.env.OLLAMA_MODEL || "qwen3:14b",
    baseUrl: process.env.MAPPING_LLM_BASE_URL || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    chatPath: process.env.MAPPING_LLM_CHAT_PATH || process.env.OLLAMA_CHAT_PATH || "/api/chat",
    timeoutMs: Number.parseInt(
      process.env.MAPPING_LLM_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || "120000",
      10,
    ),
    maxAttempts: Number.parseInt(
      process.env.MAPPING_LLM_MAX_ATTEMPTS || process.env.OLLAMA_MAX_ATTEMPTS || "1",
      10,
    ),
    keepAlive: process.env.MAPPING_LLM_KEEP_ALIVE || process.env.OLLAMA_KEEP_ALIVE || "10m",
    temperature: Number.parseFloat(process.env.MAPPING_LLM_TEMPERATURE || "0"),
    numPredict: Number.parseInt(process.env.MAPPING_LLM_NUM_PREDICT || "600", 10),
    think: parseOllamaThink(process.env.MAPPING_LLM_THINK, false),
    forceJsonOutput: parseBoolean(process.env.MAPPING_LLM_FORCE_JSON_OUTPUT, true),
    maxCandidates: Number.parseInt(process.env.MAPPING_LLM_MAX_CANDIDATES || "5", 10),
    maxAdditionalCandidates: Number.parseInt(process.env.MAPPING_LLM_MAX_ADDITIONAL_CANDIDATES || "2", 10),
    maxRowsPerRun: Number.parseInt(process.env.MAPPING_LLM_MAX_ROWS_PER_RUN || "25", 10),
    minDeterministicConfidence: Number.parseFloat(process.env.MAPPING_LLM_MIN_DETERMINISTIC_CONFIDENCE || "0.18"),
    promptVersion: process.env.MAPPING_LLM_PROMPT_VERSION || "phase5.v1",
  },
}
