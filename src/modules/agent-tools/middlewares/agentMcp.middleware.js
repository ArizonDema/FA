const config = require("../../../config/app")
const AppError = require("../../../utils/AppError")
const AgentPrincipalService = require("../services/agentPrincipal.service")

const buckets = new Map()

function configuredAllowedOrigins() {
  if (config.agentMcp.allowedOrigins?.length) return config.agentMcp.allowedOrigins
  return Array.isArray(config.cors.origin) ? config.cors.origin : [config.cors.origin].filter(Boolean)
}

function extractApiKey(req) {
  const authorization = req.headers.authorization || ""
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim()
  }
  return req.headers["x-agent-api-key"] || req.headers["x-api-key"] || null
}

function validateMcpOrigin(req, res, next) {
  if (!config.agentMcp.enabled) {
    return next(new AppError("MCP endpoint is disabled", 404))
  }

  const origin = req.headers.origin
  if (!origin) return next()

  const allowedOrigins = configuredAllowedOrigins()
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return next()
  }

  return next(new AppError("Origin is not allowed for MCP access", 403))
}

async function authenticateAgentApiKey(req, res, next) {
  try {
    const principal = await AgentPrincipalService.authenticateApiKey({
      apiKey: extractApiKey(req),
    })
    req.agentPrincipal = principal
    return next()
  } catch (error) {
    return next(error)
  }
}

function rateLimitAgentMcp(req, res, next) {
  const maxRequests = Number.parseInt(config.agentMcp.rateLimitMaxRequests, 10)
  const windowMs = Number.parseInt(config.agentMcp.rateLimitWindowMs, 10)
  if (!Number.isFinite(maxRequests) || maxRequests <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    return next()
  }

  const key = req.agentPrincipal?.id || req.ip || "anonymous"
  const now = Date.now()
  const existing = buckets.get(key)
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs }
  bucket.count += 1
  buckets.set(key, bucket)

  const remaining = Math.max(maxRequests - bucket.count, 0)
  res.set("X-RateLimit-Limit", String(maxRequests))
  res.set("X-RateLimit-Remaining", String(remaining))
  res.set("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)))

  if (bucket.count > maxRequests) {
    return next(new AppError("Agent MCP rate limit exceeded", 429))
  }

  return next()
}

module.exports = {
  validateMcpOrigin,
  authenticateAgentApiKey,
  rateLimitAgentMcp,
}
