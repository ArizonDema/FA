const express = require("express")
const AgentToolController = require("../controllers/agentTool.controller")
const AgentWorkflowController = require("../controllers/agentWorkflow.controller")
const ExternalIntegrationController = require("../controllers/externalIntegration.controller")
const { authenticate, authorize } = require("../../../middlewares/auth")

const router = express.Router()

router.use(authenticate, authorize("admin"))

router.get("/tools", AgentToolController.listTools)
router.post("/tools/:toolName/invoke", AgentToolController.invokeTool)
router.get("/workflows/runs", AgentWorkflowController.listWorkflowRuns)
router.post("/workflows/runs", AgentWorkflowController.createWorkflowRun)
router.get("/workflows/runs/:id", AgentWorkflowController.getWorkflowRun)
router.post("/workflows/runs/:id/start", AgentWorkflowController.startWorkflowRun)
router.get("/integrations", ExternalIntegrationController.listIntegrations)
router.post("/integrations", ExternalIntegrationController.createIntegration)
router.get("/integrations/:id", ExternalIntegrationController.getIntegration)
router.put("/integrations/:id", ExternalIntegrationController.updateIntegration)
router.post("/integrations/:id/sync-runs", ExternalIntegrationController.startSyncRun)
router.get("/external-sync-runs", ExternalIntegrationController.listSyncRuns)
router.get("/external-sync-runs/:id", ExternalIntegrationController.getSyncRun)
router.get("/principals", AgentToolController.listPrincipals)
router.post("/principals", AgentToolController.createPrincipal)
router.get("/principals/:id", AgentToolController.getPrincipal)

module.exports = router
