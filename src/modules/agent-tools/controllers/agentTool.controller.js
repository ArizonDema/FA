const ResponseHandler = require("../../../utils/responseHandler")
const AgentPrincipalService = require("../services/agentPrincipal.service")
const AgentToolExecutionService = require("../services/agentToolExecution.service")

class AgentToolController {
  static async listTools(req, res, next) {
    try {
      return ResponseHandler.success(
        res,
        { tools: AgentToolExecutionService.getToolCatalog() },
        "Agent reporting tools retrieved",
      )
    } catch (error) {
      return next(error)
    }
  }

  static async listPrincipals(req, res, next) {
    try {
      const principals = await AgentPrincipalService.listPrincipals({
        status: req.query.status || null,
      })
      return ResponseHandler.success(res, { principals }, "Agent principals retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createPrincipal(req, res, next) {
    try {
      const result = await AgentPrincipalService.createPrincipal({
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.created(res, result, "Agent principal created")
    } catch (error) {
      return next(error)
    }
  }

  static async getPrincipal(req, res, next) {
    try {
      const principal = await AgentPrincipalService.getPrincipal({
        principalId: req.params.id,
      })
      if (!principal) return ResponseHandler.notFound(res, "Agent principal not found")
      return ResponseHandler.success(res, { principal }, "Agent principal retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async invokeTool(req, res, next) {
    try {
      const result = await AgentToolExecutionService.executeTool({
        agentPrincipalId: req.body.agent_principal_id || req.body.agentPrincipalId,
        toolName: req.params.toolName,
        input: req.body.arguments || req.body.input || {},
        idempotencyKey: req.body.idempotency_key || req.headers["idempotency-key"] || null,
        dryRun:
          req.body.dry_run === true ||
          String(req.body.dry_run || "").toLowerCase() === "true" ||
          String(req.body.dry_run || "") === "1",
        actorId: req.user?.id || null,
      })
      return ResponseHandler.success(res, result, "Agent reporting tool invoked")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = AgentToolController
