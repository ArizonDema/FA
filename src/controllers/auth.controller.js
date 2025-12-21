const { User } = require("../models")
const jwt = require("jsonwebtoken")
const config = require("../config/app")
const ResponseHandler = require("../utils/responseHandler")
const logger = require("../config/logger")

/**
 * Authentication Controller
 */
class AuthController {
  /**
   * Register new user
   * @route POST /api/v1/auth/register
   */
  static async register(req, res, next) {
    try {
      const { full_name, email, password, phone_number, country } = req.body

      logger.info(`[v0] Registration attempt for email: ${email}`)

      // Check if user exists
      const existingUser = await User.findOne({ where: { email } })
      if (existingUser) {
        return ResponseHandler.conflict(res, "Email already registered")
      }

      // Create user
      const user = await User.create({
        full_name,
        email,
        password,
        phone_number,
        country,
        role: "investor",
        kyc_status: "pending",
      })

      logger.info(`[v0] User registered: ${user.id}`)

      // Generate token
      const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      })

      ResponseHandler.created(
        res,
        {
          user: user.toSafeObject(),
          token,
        },
        "Registration successful",
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Login user
   * @route POST /api/v1/auth/login
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body

      logger.info(`[v0] Login attempt for email: ${email}`)

      // Find user
      const user = await User.findOne({ where: { email } })
      if (!user) {
        return ResponseHandler.unauthorized(res, "Invalid email or password")
      }

      // Validate password
      const isValidPassword = await user.validatePassword(password)
      if (!isValidPassword) {
        logger.warn(`[v0] Invalid password attempt for user: ${user.id}`)
        return ResponseHandler.unauthorized(res, "Invalid email or password")
      }

      // Check account status
      if (user.status !== "active") {
        return ResponseHandler.forbidden(res, "Account is not active")
      }

      logger.info(`[v0] User logged in: ${user.id}`)

      // Generate token
      const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      })

      ResponseHandler.success(
        res,
        {
          user: user.toSafeObject(),
          token,
        },
        "Login successful",
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get current user profile
   * @route GET /api/v1/auth/me
   */
  static async getProfile(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ["password"] },
      })

      ResponseHandler.success(res, { user }, "Profile retrieved")
    } catch (error) {
      next(error)
    }
  }

  /**
   * Update user profile
   * @route PUT /api/v1/auth/profile
   */
  static async updateProfile(req, res, next) {
    try {
      const allowedFields = [
        "full_name",
        "phone_number",
        "country",
        "state",
        "residential_address",
        "next_of_kin_name",
        "next_of_kin_contact",
        "source_of_funds",
      ]

      const updates = {}
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field]
        }
      }

      await req.user.update(updates)

      logger.info(`[v0] Profile updated for user: ${req.user.id}`)

      ResponseHandler.success(res, { user: req.user.toSafeObject() }, "Profile updated")
    } catch (error) {
      next(error)
    }
  }
}

module.exports = AuthController
