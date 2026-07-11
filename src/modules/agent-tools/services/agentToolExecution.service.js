const crypto = require("crypto")
const { AgentToolInvocation } = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const AgentReportingToolService = require("../../reporting-projects/services/agentReportingTool.service")
const AgentPrincipalService = require("./agentPrincipal.service")

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex")
}

function normalizeInput(input = {}) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {}
}

function getFundId(input = {}) {
  return input.fund_id || input.fundId || input.portfolio_id || input.portfolioId || null
}

function getProjectId(input = {}) {
  return input.project_id || input.projectId || input.reporting_project_id || input.reportingProjectId || null
}

function scopesFor(principal) {
  return Array.isArray(principal?.scopes_json) ? principal.scopes_json : []
}

function allowedIds(value) {
  return Array.isArray(value) ? value.map(String) : []
}

function serializeInvocation(record) {
  const payload = asPlain(record) || {}
  return {
    id: payload.id,
    agentPrincipalId: payload.agent_principal_id,
    idempotencyKey: payload.idempotency_key || null,
    toolName: payload.tool_name,
    status: payload.status,
    dryRun: Boolean(payload.dry_run),
    fundId: payload.portfolio_id || null,
    projectId: payload.reporting_project_id || null,
    delegatedBy: payload.delegated_by || null,
    output: payload.output_json || null,
    error: payload.error_json || null,
    completedAt: payload.completed_at || null,
    createdAt: payload.created_at || payload.createdAt || null,
  }
}

class AgentToolExecutionService {
  static getToolCatalog() {
    return AgentReportingToolService.getToolCatalog()
  }

  static getTool(toolName) {
    const tool = this.getToolCatalog()[toolName]
    if (!tool) throw new AppError("Unsupported agent reporting tool", 404)
    return tool
  }

  static assertScope(principal, tool) {
    const scopes = scopesFor(principal)
    if (scopes.includes("*") || scopes.includes(tool.scope)) return
    throw new AppError(`Agent principal lacks required scope: ${tool.scope}`, 403)
  }

  static assertResourceAccess(principal, { fundId = null, projectId = null }) {
    const allowedFunds = allowedIds(principal.allowed_portfolio_ids_json)
    if (fundId && allowedFunds.length && !allowedFunds.includes(String(fundId))) {
      throw new AppError("Agent principal is not allowed to access this fund", 403)
    }

    const allowedProjects = allowedIds(principal.allowed_reporting_project_ids_json)
    if (projectId && allowedProjects.length && !allowedProjects.includes(String(projectId))) {
      throw new AppError("Agent principal is not allowed to access this reporting project", 403)
    }
  }

  static async findIdempotentInvocation({ principalId, idempotencyKey }) {
    if (!idempotencyKey) return null
    return await AgentToolInvocation.findOne({
      where: {
        agent_principal_id: principalId,
        idempotency_key: idempotencyKey,
      },
    })
  }

  static async executeTool({
    agentPrincipalId,
    toolName,
    input = {},
    idempotencyKey = null,
    dryRun = false,
    actorId = null,
  }) {
    const normalizedInput = normalizeInput(input)
    const principal = await AgentPrincipalService.requireActivePrincipal({ principalId: agentPrincipalId })
    const tool = this.getTool(toolName)
    const fundId = getFundId(normalizedInput)
    const projectId = getProjectId(normalizedInput)
    const inputHash = sha256({
      toolName,
      input: normalizedInput,
      dryRun: Boolean(dryRun),
    })

    this.assertScope(principal, tool)
    this.assertResourceAccess(principal, { fundId, projectId })

    const existing = await this.findIdempotentInvocation({
      principalId: principal.id,
      idempotencyKey,
    })
    if (existing) {
      if (existing.input_sha256 !== inputHash) {
        throw new AppError("Idempotency key was already used with a different payload", 409)
      }
      if (existing.status === "completed" || existing.status === "dry_run") {
        return {
          invocation: serializeInvocation(existing),
          result: existing.output_json,
          idempotentReplay: true,
        }
      }
      throw new AppError("Idempotent tool invocation is still in progress or failed", 409)
    }

    const invocation = await AgentToolInvocation.create({
      agent_principal_id: principal.id,
      idempotency_key: idempotencyKey || null,
      input_sha256: inputHash,
      tool_name: toolName,
      status: "pending",
      dry_run: Boolean(dryRun),
      portfolio_id: fundId || null,
      reporting_project_id: projectId || null,
      delegated_by: actorId,
      input_json: normalizedInput,
      metadata_json: {
        required_scope: tool.scope,
        mutability: tool.mutability,
      },
    })

    if (dryRun) {
      const output = {
        dry_run: true,
        tool_name: toolName,
        mutability: tool.mutability,
        required_scope: tool.scope,
        would_execute: true,
        finalizing_actions_allowed: false,
      }
      await invocation.update({
        status: "dry_run",
        output_json: output,
        completed_at: new Date(),
      })
      await AuditService.logEvent({
        actorId,
        eventType: "agent_tool_dry_run",
        entityType: "agent_tool_invocation",
        entityId: invocation.id,
        metadata: {
          agent_principal_id: principal.id,
          tool_name: toolName,
          fund_id: fundId,
          reporting_project_id: projectId,
        },
      })
      return {
        invocation: serializeInvocation(invocation),
        result: output,
        idempotentReplay: false,
      }
    }

    try {
      const result = await AgentReportingToolService.dispatch(toolName, normalizedInput, {
        agentId: principal.id,
        delegatedUserId: actorId,
        actorId,
        invocationId: invocation.id,
      })

      await invocation.update({
        status: "completed",
        output_json: result,
        completed_at: new Date(),
      })
      await AgentPrincipalService.touchPrincipal(principal)
      await AuditService.logEvent({
        actorId,
        eventType: "agent_tool_invoked",
        entityType: "agent_tool_invocation",
        entityId: invocation.id,
        metadata: {
          agent_principal_id: principal.id,
          tool_name: toolName,
          fund_id: fundId,
          reporting_project_id: projectId,
        },
        after: {
          status: "completed",
          tool_name: toolName,
        },
      })

      return {
        invocation: serializeInvocation(invocation),
        result,
        idempotentReplay: false,
      }
    } catch (error) {
      const errorPayload = {
        message: error.message,
        statusCode: error.statusCode || 500,
        code: error.code || null,
        errors: error.errors || null,
      }
      await invocation.update({
        status: "failed",
        error_json: errorPayload,
        completed_at: new Date(),
      })
      await AuditService.logEvent({
        actorId,
        eventType: "agent_tool_failed",
        entityType: "agent_tool_invocation",
        entityId: invocation.id,
        metadata: {
          agent_principal_id: principal.id,
          tool_name: toolName,
          error: errorPayload,
        },
      })
      throw error
    }
  }
}

module.exports = AgentToolExecutionService
