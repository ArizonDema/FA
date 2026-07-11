const crypto = require("crypto")
const { AgentPrincipal } = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")

const DEFAULT_READ_ONLY_SCOPES = [
  "reporting_project:read",
  "mapping:read",
  "report:read",
  "audit:read",
]

const REGULAR_USE_REPORTING_SCOPES = [
  "reporting_project:create",
  "reporting_project:read",
  "source:attach",
  "source:analyze",
  "template:analyze",
  "mapping:read",
  "mapping:suggest",
  "report:run_draft",
  "report:validate",
  "report:read",
  "audit:read",
]

const SCOPE_PROFILES = Object.freeze({
  read_only: DEFAULT_READ_ONLY_SCOPES,
  regular_use_reporting: REGULAR_USE_REPORTING_SCOPES,
  no_context_cash_flow_eval: REGULAR_USE_REPORTING_SCOPES,
})

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function parseArray(value, fallback = []) {
  if (value === undefined || value === null || value === "") return [...fallback]
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parseArray(parsed, fallback)
    } catch (error) {
      void error
    }
    return value.split(",").map((item) => item.trim()).filter(Boolean)
  }
  return [...fallback]
}

function scopesForProfile(profile) {
  const key = String(profile || "read_only").trim().toLowerCase()
  return [...(SCOPE_PROFILES[key] || DEFAULT_READ_ONLY_SCOPES)]
}

function publicPrincipal(record) {
  const principal = asPlain(record)
  if (!principal) return null
  const { api_key_hash: ignoredHash, ...safe } = principal
  void ignoredHash
  return safe
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex")
}

function extractApiKeyPrefix(apiKey) {
  const parts = String(apiKey || "").split("_")
  if (parts.length < 3 || parts[0] !== "arp" || !parts[1]) return null
  return `${parts[0]}_${parts[1]}`
}

function safeEqualHex(left, right) {
  if (!left || !right || left.length !== right.length) return false
  const leftBuffer = Buffer.from(left, "hex")
  const rightBuffer = Buffer.from(right, "hex")
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

class AgentPrincipalService {
  static regularUseReportingScopes() {
    return [...REGULAR_USE_REPORTING_SCOPES]
  }

  static scopeProfiles() {
    return Object.fromEntries(Object.entries(SCOPE_PROFILES).map(([name, scopes]) => [name, [...scopes]]))
  }

  static async createPrincipal({ actorId = null, fields = {} }) {
    const name = String(fields.name || "").trim()
    if (!name) throw new AppError("Agent principal name is required", 400)
    const scopeProfile = fields.scope_profile || fields.scopeProfile || "read_only"

    let issuedApiKey = null
    let apiKeyPrefix = null
    let apiKeyHash = null
    const issueApiKey = fields.issue_api_key === true || String(fields.issue_api_key || "").toLowerCase() === "true"
    if (issueApiKey) {
      const secret = crypto.randomBytes(32).toString("base64url")
      apiKeyPrefix = `arp_${crypto.randomBytes(5).toString("hex")}`
      issuedApiKey = `${apiKeyPrefix}_${secret}`
      apiKeyHash = hashSecret(issuedApiKey)
    }

    const principal = await AgentPrincipal.create({
      name,
      description: String(fields.description || "").trim() || null,
      principal_type: String(fields.principal_type || "internal_agent").trim(),
      status: String(fields.status || "active").trim().toLowerCase(),
      scopes_json: parseArray(fields.scopes, scopesForProfile(scopeProfile)),
      allowed_portfolio_ids_json: parseArray(fields.allowed_portfolio_ids, []),
      allowed_reporting_project_ids_json: parseArray(fields.allowed_reporting_project_ids, []),
      api_key_prefix: apiKeyPrefix,
      api_key_hash: apiKeyHash,
      created_by: actorId,
      metadata_json: fields.metadata_json || fields.metadata || null,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "agent_principal_created",
      entityType: "agent_principal",
      entityId: principal.id,
      after: publicPrincipal(principal),
      metadata: {
        scopes: principal.scopes_json || [],
        api_key_issued: Boolean(issuedApiKey),
      },
    })

    return {
      principal: publicPrincipal(principal),
      apiKey: issuedApiKey,
    }
  }

  static async listPrincipals({ status = null } = {}) {
    const where = {}
    if (status) where.status = String(status).trim().toLowerCase()
    const principals = await AgentPrincipal.findAll({
      where,
      order: [["created_at", "DESC"]],
    })
    return principals.map(publicPrincipal)
  }

  static async getPrincipal({ principalId }) {
    const principal = await AgentPrincipal.findByPk(principalId)
    if (!principal) return null
    return publicPrincipal(principal)
  }

  static async requireActivePrincipal({ principalId }) {
    const principal = await AgentPrincipal.findByPk(principalId)
    if (!principal) throw new AppError("Agent principal not found", 404)
    if (principal.status !== "active") {
      throw new AppError("Agent principal is not active", 403)
    }
    return principal
  }

  static async authenticateApiKey({ apiKey }) {
    const rawKey = String(apiKey || "").trim()
    if (!rawKey) throw new AppError("Agent API key is required", 401)

    const apiKeyPrefix = extractApiKeyPrefix(rawKey)
    if (!apiKeyPrefix) throw new AppError("Invalid agent API key", 401)

    const principal = await AgentPrincipal.findOne({
      where: { api_key_prefix: apiKeyPrefix },
    })
    if (!principal || !principal.api_key_hash) {
      throw new AppError("Invalid agent API key", 401)
    }

    if (!safeEqualHex(hashSecret(rawKey), principal.api_key_hash)) {
      throw new AppError("Invalid agent API key", 401)
    }

    if (principal.status !== "active") {
      throw new AppError("Agent principal is not active", 403)
    }

    return principal
  }

  static async touchPrincipal(principal) {
    if (principal && typeof principal.update === "function") {
      await principal.update({ last_used_at: new Date() })
    }
  }
}

module.exports = AgentPrincipalService
