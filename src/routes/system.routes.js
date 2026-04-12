const express = require("express")
const ResponseHandler = require("../utils/responseHandler")
const HealthService = require("../modules/health/services/health.service")
const LlmOrchestratorService = require("../modules/llm/services/llmOrchestrator.service")

const router = express.Router()

/**
 * @swagger
 * /system/health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy
 */
router.get("/health", async (req, res) => {
  try {
    const payload = await HealthService.getSystemHealth()
    ResponseHandler.success(res, payload, "System is healthy")
  } catch (error) {
    ResponseHandler.serverError(res, "System health check failed")
  }
})

/**
 * @swagger
 * /system/llm/health:
 *   get:
 *     summary: LLM/Ollama health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Ollama reachable and configured model is available
 *       503:
 *         description: Ollama unreachable or configured model missing
 */
router.get("/llm/health", async (req, res, next) => {
  try {
    const payload = await LlmOrchestratorService.getHealth()
    const healthy = payload.status === "ok"
    const statusCode = healthy ? 200 : 503

    return res.status(statusCode).json({
      status: healthy ? "success" : "error",
      message: healthy ? "LLM connectivity is healthy" : "LLM connectivity issue detected",
      data: payload,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return next(error)
  }
})

/**
 * @swagger
 * /system/stats:
 *   get:
 *     summary: System statistics
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get("/stats", async (req, res, next) => {
  try {
    const stats = await HealthService.getStats()
    ResponseHandler.success(res, stats, "Statistics retrieved")
  } catch (error) {
    next(error)
  }
})

module.exports = router
