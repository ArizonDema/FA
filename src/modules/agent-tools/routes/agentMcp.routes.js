const express = require("express")
const AgentMcpController = require("../controllers/agentMcp.controller")
const {
  validateMcpOrigin,
  authenticateAgentApiKey,
  rateLimitAgentMcp,
} = require("../middlewares/agentMcp.middleware")

const router = express.Router()

router.use(validateMcpOrigin, authenticateAgentApiKey, rateLimitAgentMcp)

router.post("/", AgentMcpController.handlePost)
router.get("/", AgentMcpController.handleUnsupportedStream)
router.delete("/", AgentMcpController.handleUnsupportedStream)

module.exports = router
