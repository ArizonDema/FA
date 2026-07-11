const ResponseHandler = require("../../../utils/responseHandler")
const AgentWorkflowService = require("../services/agentWorkflow.service")

class AgentWorkflowController {
  static async listWorkflowRuns(req, res, next) {
    try {
      const runs = await AgentWorkflowService.listWorkflowRuns({
        agentPrincipalId: req.query.agent_principal_id || req.query.agentPrincipalId || null,
        fundId: req.query.fund_id || req.query.fundId || null,
        projectId: req.query.project_id || req.query.projectId || null,
        status: req.query.status || null,
      })
      return ResponseHandler.success(res, { workflowRuns: runs }, "Agent workflow runs retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createWorkflowRun(req, res, next) {
    try {
      const result = await AgentWorkflowService.createWorkflowRun({
        agentPrincipalId: req.body.agent_principal_id || req.body.agentPrincipalId,
        actorId: req.user?.id || null,
        workflowType: req.body.workflow_type || req.body.workflowType,
        fundId: req.body.fund_id || req.body.fundId || null,
        projectId: req.body.project_id || req.body.projectId || null,
        runId: req.body.run_id || req.body.runId || null,
        triggerType: req.body.trigger_type || req.body.triggerType || "manual",
        idempotencyKey: req.body.idempotency_key || req.headers["idempotency-key"] || null,
        externalCorrelationId: req.body.external_correlation_id || req.body.externalCorrelationId || null,
        steps: req.body.steps || [],
        policy: req.body.policy || {},
        schedule: req.body.schedule || null,
        metadata: req.body.metadata || req.body.metadata_json || null,
        startImmediately: req.body.start_immediately !== false && req.body.startImmediately !== false,
      })
      return ResponseHandler.created(res, result, "Agent workflow run created")
    } catch (error) {
      return next(error)
    }
  }

  static async getWorkflowRun(req, res, next) {
    try {
      const workflowRun = await AgentWorkflowService.getWorkflowRun({
        workflowRunId: req.params.id,
      })
      return ResponseHandler.success(res, { workflowRun }, "Agent workflow run retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async startWorkflowRun(req, res, next) {
    try {
      const workflowRun = await AgentWorkflowService.startWorkflowRun({
        workflowRunId: req.params.id,
        actorId: req.user?.id || null,
      })
      return ResponseHandler.success(res, { workflowRun }, "Agent workflow run started")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = AgentWorkflowController
