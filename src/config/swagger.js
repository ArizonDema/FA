// Import the swagger-jsdoc library, which generates an OpenAPI (Swagger) specification
// from JSDoc comments in your code and a base configuration object.
const swaggerJsdoc = require("swagger-jsdoc")

// Import your application's configuration file (likely containing port, apiPrefix, etc.)
// This allows the Swagger docs to dynamically reflect the current server URL.
const config = require("./app")

// Define the options object required by swagger-jsdoc
const options = {
  // The 'definition' section contains the static part of the OpenAPI 3.0.0 specification
  definition: {
    openapi: "3.0.0", // Specifies that this document follows OpenAPI version 3.0.0
    info: {
      title: "CSS Invest API", // The title of the API that will appear in Swagger UI
      version: "1.0.0", // Current version of the API
      description: "NAV-based Managed Investment Platform API Documentation", // A brief description of what the API does
      contact: {
        name: "CSS Invest Support", // Name of the support contact
        email: "support@cssinvest.com", // Support email address
      },
      license: {
        name: "MIT", // License under which the API is provided
        url: "https://opensource.org/licenses/MIT", // URL to the license details
      },
    },
    // Defines the server(s) on which the API is hosted
    servers: [
      {
        // Dynamically constructs the base URL using the port and apiPrefix from your config
        // Example: http://localhost:8000/api/v1
        url: `http://localhost:${config.port}${config.apiPrefix}`,
        description: "Development server", // Human-readable description of this server environment
      },
    ],
    // Global components that can be reused across the entire API specification
    components: {
      securitySchemes: {
        // Defines a global security scheme called "bearerAuth"
        bearerAuth: {
          type: "http", // HTTP-based authentication
          scheme: "bearer", // Bearer token authentication
          bearerFormat: "JWT", // Specifies that the token format is JSON Web Token (JWT)
        },
      },
    },
    // Applies the bearerAuth security requirement globally to all endpoints
    // Unless overridden in individual routes, every endpoint will require a valid JWT
    security: [
      {
        bearerAuth: [], // References the security scheme defined above
      },
    ],
    // Optional grouping of endpoints in Swagger UI sidebar
    tags: [
      {
        name: "Authentication",
        description: "User authentication endpoints", // e.g., login, register, profile
      },
      {
        name: "Investor",
        description: "Investor-specific operations", // e.g., view portfolios, invest, withdrawals
      },
      {
        name: "Admin",
        description: "Admin-only operations", // e.g., create portfolios, manage rounds, approve withdrawals
      },
      {
        name: "System",
        description: "System health and statistics", // e.g., health check, system stats
      },
    ],
  },
  // Tells swagger-jsdoc where to look for JSDoc comments that describe routes, parameters, responses, etc.
  // It will scan all JavaScript files in these directories for annotations like @route, @param, @response, etc.
  apis: ["./src/routes/*.js", "./src/controllers/*.js"],
}

// Generate the full OpenAPI specification object by combining the base 'definition'
// with the annotations found in the files specified in 'apis'
const swaggerSpec = swaggerJsdoc(options)

// Export the generated specification so it can be used elsewhere (typically in your main server file)
// to set up Swagger UI (e.g., /api-docs endpoint)
module.exports = swaggerSpec