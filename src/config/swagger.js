const swaggerJsdoc = require("swagger-jsdoc")
const config = require("./app")

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CSS Invest API",
      version: "1.0.0",
      description: "NAV-based Managed Investment Platform API Documentation",
      contact: {
        name: "CSS Invest Support",
        email: "support@cssinvest.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}${config.apiPrefix}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: "Authentication",
        description: "User authentication endpoints",
      },
      {
        name: "Investor",
        description: "Investor-specific operations",
      },
      {
        name: "Admin",
        description: "Admin-only operations",
      },
      {
        name: "System",
        description: "System health and statistics",
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"],
}

const swaggerSpec = swaggerJsdoc(options)

module.exports = swaggerSpec
