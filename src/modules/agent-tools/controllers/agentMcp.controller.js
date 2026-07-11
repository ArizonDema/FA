const config = require("../../../config/app")
const AgentMcpService = require("../services/agentMcp.service")

class AgentMcpController {
  static async handlePost(req, res, next) {
    try {
      const result = await AgentMcpService.handlePayload(req.body, {
        agentPrincipal: req.agentPrincipal,
        idempotencyKey: req.headers["idempotency-key"] || null,
      })

      res.set("Mcp-Protocol-Version", config.agentMcp.protocolVersion)
      if (result.statusCode === 202) {
        return res.status(202).end()
      }
      return res.status(result.statusCode).type("application/json").json(result.body)
    } catch (error) {
      return next(error)
    }
  }

  static async handleUnsupportedStream(req, res) {
    res.set("Allow", "POST")
    return res.status(405).json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: "This MCP endpoint supports stateless JSON-RPC POST requests only.",
      },
    })
  }
}

module.exports = AgentMcpController
