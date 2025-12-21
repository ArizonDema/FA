const logger = require("../config/logger")

/**
 * Standardized API response handler
 */
class ResponseHandler {
  /**
   * Success response
   * @param {Object} res - Express response object
   * @param {Object} data - Response data
   * @param {String} message - Success message
   * @param {Number} statusCode - HTTP status code
   */
  static success(res, data = null, message = "Success", statusCode = 200) {
    logger.info(`[v0] API Success: ${message}`)
    return res.status(statusCode).json({
      status: "success",
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Error response
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code
   * @param {Object} errors - Validation errors
   */
  static error(res, message = "An error occurred", statusCode = 500, errors = null) {
    logger.error(`[v0] API Error: ${message}`, { errors })
    return res.status(statusCode).json({
      status: "error",
      message,
      errors,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Created response (201)
   */
  static created(res, data, message = "Resource created successfully") {
    return this.success(res, data, message, 201)
  }

  /**
   * Bad request response (400)
   */
  static badRequest(res, message = "Bad request", errors = null) {
    return this.error(res, message, 400, errors)
  }

  /**
   * Unauthorized response (401)
   */
  static unauthorized(res, message = "Unauthorized access") {
    return this.error(res, message, 401)
  }

  /**
   * Forbidden response (403)
   */
  static forbidden(res, message = "Forbidden") {
    return this.error(res, message, 403)
  }

  /**
   * Not found response (404)
   */
  static notFound(res, message = "Resource not found") {
    return this.error(res, message, 404)
  }

  /**
   * Conflict response (409)
   */
  static conflict(res, message = "Resource conflict") {
    return this.error(res, message, 409)
  }

  /**
   * Server error response (500)
   */
  static serverError(res, message = "Internal server error") {
    return this.error(res, message, 500)
  }
}

module.exports = ResponseHandler
