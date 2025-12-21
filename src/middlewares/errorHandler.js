// backend/src/middlewares/errorHandler.js
const logger = require("../config/logger")
const AppError = require("../utils/AppError")

/**
 * Global Error Handler Middleware
 * Catches all errors and sends appropriate, detailed responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err }
  error.message = err.message || "Internal Server Error"
  error.statusCode = err.statusCode || 500

  // Log full error for debugging
  logger.error(`[v0] Error Handler:`, {
    message: error.message,
    statusCode: error.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    user: req.user?.id || "unauthenticated",
  })

  // === 1. Sequelize Validation Errors ===
  if (err.name === "SequelizeValidationError") {
    const errors = err.errors.map((e) => ({
      field: e.path || "unknown",
      message: e.message,
    }))
    error = new AppError("Validation failed", 400, errors)
  }

  // === 2. Sequelize Unique Constraint ===
  if (err.name === "SequelizeUniqueConstraintError") {
    const field = err.errors[0]?.path || "unknown"
    error = new AppError(`${field.charAt(0).toUpperCase() + field.slice(1)} already exists`, 409)
  }

  // === 3. Foreign Key Constraint ===
  if (err.name === "SequelizeForeignKeyConstraintError") {
    error = new AppError("Referenced resource does not exist", 400)
  }

  // === 4. JWT Errors ===
  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid token. Please log in again.", 401)
  }

  if (err.name === "TokenExpiredError") {
    error = new AppError("Token has expired. Please log in again.", 401)
  }

  // === 5. CUSTOM VALIDATION ERROR FROM validate() middleware ===
  // This catches AppError("Validation failed", 400, errorsArray)
  if (error.message === "Validation failed" && Array.isArray(error.errors) && error.errors.length > 0) {
    return res.status(400).json({
      status: "fail",
      message: "Validation failed",
      errors: error.errors, // ← Detailed field-by-field errors
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    })
  }

  // === 6. Direct Joi ValidationError (fallback, rare) ===
  if (err.name === "ValidationError" && err.details) {
    const errors = err.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message.replace(/['"]/g, ""),
    }))

    return res.status(400).json({
      status: "fail",
      message: "Validation failed",
      errors,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    })
  }

  // === 7. FINAL GENERIC RESPONSE (for unexpected errors) ===
  res.status(error.statusCode).json({
    status: error.status || "error",
    message: error.message,
    errors: error.errors || null,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
}

module.exports = errorHandler