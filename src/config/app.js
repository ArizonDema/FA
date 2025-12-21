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
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000"],
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
}
