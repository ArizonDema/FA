// backend/src/utils/AppError.js

/**
 * Custom Application Error Class
 * Used for operational errors that are expected
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message)

    this.name = "AppError"                    // Helpful for debugging
    this.statusCode = statusCode
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error"
    this.isOperational = true
    this.errors = errors                              // Array of { field, message }

    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = AppError