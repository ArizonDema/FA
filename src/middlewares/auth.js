// backend/src/middlewares/auth.js

const jwt = require("jsonwebtoken")
const config = require("../config/app")
const AppError = require("../utils/AppError")
const { User } = require("../models")
const logger = require("../config/logger")

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("No token provided", 401)
    }

    const token = authHeader.split(" ")[1]

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret)
    logger.info(`[v0] Token decoded for user: ${decoded.userId}`)

    // Get user from database
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ["password"] },
    })

    if (!user) {
      throw new AppError("User not found", 401)
    }

    if (user.status !== "active") {
      throw new AppError("Account is not active", 403)
    }

    // Attach user to request
    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Authorization Middleware
 * Checks if user has required role
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401))
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`[v0] Unauthorized access attempt by user ${req.user.id} to ${req.path}`)
      return next(new AppError("You do not have permission to perform this action", 403))
    }

    next()
  }
}

/**
 * Check KYC Status Middleware
 * Ensures user has completed KYC verification
 */
// const checkKYC = (req, res, next) => {
//   if (req.user.kyc_status !== "verified") {
//     logger.warn(`[v0] KYC verification required for user ${req.user.id}`)
//     return next(new AppError("KYC verification required to perform this action", 403))
//   }
//   next()
// }


/**
 * Check KYC Status Middleware
 * Ensures user has completed KYC verification
 * Returns detailed, consistent error format
 */
const checkKYC = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401))
  }

  if (req.user.kyc_status === "verified") {
    return next() // All good
  }

  let message = "KYC verification required to perform this action"
  let fieldMessage = "Your account is not KYC verified"

  if (req.user.kyc_status === "pending") {
    fieldMessage = "Your KYC verification is still pending. Please wait for approval."
  } else if (req.user.kyc_status === "rejected") {
    fieldMessage = "Your KYC verification was rejected. Please contact support to resolve this."
  }

  logger.warn(`[v0] KYC blocked action for user ${req.user.id} (status: ${req.user.kyc_status})`)

  return next(new AppError(message, 403, [
    {
      field: "kyc_status",
      message: fieldMessage,
    },
  ]))
}

module.exports = {
  authenticate,
  authorize,
  checkKYC,
}
