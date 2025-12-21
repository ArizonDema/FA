// backend/src/middlewares/validation.js

const Joi = require("joi")
const AppError = require("../utils/AppError")

/**
 * Validation Middleware Factory
 * Validates request body, params, or query against Joi schema
 */
const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,      // Collect ALL errors
      stripUnknown: true,     // Remove unknown fields
    })

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message.replace(/['"]/g, ""), // Clean quotes
      }))

      return next(new AppError("Validation failed", 400, errors))
    }

    // Replace with cleaned/validated data
    req[property] = value
    next()
  }
}

module.exports = validate
