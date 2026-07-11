const config = require("../../../config/app")
const AgentToolExecutionService = require("./agentToolExecution.service")

const JSONRPC_VERSION = "2.0"
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
}

const TOOL_INPUT_SCHEMAS = {
  create_reporting_project: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string", description: "Fund/portfolio identifier." },
      name: { type: "string" },
      report_type: { type: "string" },
      period_start: { type: "string", format: "date" },
      period_end: { type: "string", format: "date" },
      template_version_id: { type: "string" },
      metadata_json: { type: "object" },
    },
    required: ["fund_id"],
  },
  upload_source_document: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      project_id: { type: "string" },
      source_role: { type: "string" },
      repository_version_id: { type: "string" },
      repository_item_id: { type: "string" },
      template_version_id: { type: "string" },
      report_run_id: { type: "string" },
      source_type: { type: "string" },
      required: { type: "boolean" },
      metadata_json: { type: "object" },
    },
    required: ["fund_id", "project_id", "source_role"],
  },
  list_reporting_inputs: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string", description: "Fund/portfolio identifier." },
    },
    required: ["fund_id"],
  },
  analyze_template: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      template_version_id: { type: "string" },
      project_id: { type: "string" },
    },
    required: ["fund_id", "template_version_id"],
  },
  extract_lpa_terms: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      repository_version_id: { type: "string" },
      reader_key: { type: "string", default: "lpa" },
    },
    required: ["fund_id", "repository_version_id"],
  },
  suggest_tb_mapping: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      account_ids: { type: "array", items: { type: "string" } },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      min_confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["fund_id"],
  },
  suggest_gl_mapping: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      account_ids: { type: "array", items: { type: "string" } },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      min_confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["fund_id"],
  },
  list_unmapped_accounts: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
    },
    required: ["fund_id"],
  },
  run_report: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      project_id: { type: "string" },
      engine: { type: "string", enum: ["approved_mapping", "cash_flow_extractor", "workbook_extractor", "workbook"] },
      output_format: { type: "string", enum: ["rows", "xlsx"] },
      template_version_id: { type: "string" },
      template_id: { type: "string" },
      period_start: { type: "string", format: "date" },
      period_end: { type: "string", format: "date" },
      date_start: { type: "string", format: "date" },
      date_end: { type: "string", format: "date" },
      tb_repository_version_id: { type: "string" },
      gl_repository_version_id: { type: "string" },
      trial_balance_repository_version_id: { type: "string" },
      general_ledger_repository_version_id: { type: "string" },
      run_validation: { type: "boolean" },
    },
    required: ["fund_id"],
  },
  run_cash_flow_extraction: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      project_id: { type: "string" },
      template_id: { type: "string" },
      period_start: { type: "string", format: "date" },
      period_end: { type: "string", format: "date" },
      date_start: { type: "string", format: "date" },
      date_end: { type: "string", format: "date" },
      tb_repository_version_id: { type: "string" },
      gl_repository_version_id: { type: "string" },
      trial_balance_repository_version_id: { type: "string" },
      general_ledger_repository_version_id: { type: "string" },
      run_validation: { type: "boolean" },
    },
    required: ["fund_id", "project_id"],
  },
  run_validation_checks: {
    type: "object",
    additionalProperties: false,
    properties: {
      run_id: { type: "string" },
    },
    required: ["run_id"],
  },
  get_exceptions: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
      run_id: { type: "string" },
      status: { type: "string" },
    },
  },
  explain_report_line: {
    type: "object",
    additionalProperties: false,
    properties: {
      run_id: { type: "string" },
      report_run_row_id: { type: "string" },
      row_id: { type: "string" },
      template_row_id: { type: "string" },
    },
    required: ["run_id"],
  },
  get_audit_trail: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
      entity_type: { type: "string" },
      entity_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
  get_project_readiness: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
      project_id: { type: "string" },
    },
    required: ["fund_id", "project_id"],
  },
  export_report: {
    type: "object",
    additionalProperties: false,
    properties: {
      run_id: { type: "string" },
      format: { type: "string", enum: ["xlsx", "pdf", "csv"] },
    },
    required: ["run_id"],
  },
  start_agent_workflow: {
    type: "object",
    additionalProperties: true,
    properties: {
      workflow_type: {
        type: "string",
        enum: ["reporting_draft_validation", "validation_and_exception_review", "custom_tool_sequence"],
      },
      fund_id: { type: "string" },
      project_id: { type: "string" },
      run_id: { type: "string" },
      trigger_type: { type: "string" },
      idempotency_key: { type: "string" },
      external_correlation_id: { type: "string" },
      steps: { type: "array", items: { type: "object" } },
      policy: { type: "object" },
      schedule: { type: "object" },
      metadata: { type: "object" },
      start_immediately: { type: "boolean" },
    },
    required: ["workflow_type"],
  },
  get_agent_workflow: {
    type: "object",
    additionalProperties: false,
    properties: {
      workflow_run_id: { type: "string" },
    },
    required: ["workflow_run_id"],
  },
  list_external_integrations: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
      status: { type: "string", enum: ["active", "disabled", "archived"] },
      provider_type: {
        type: "string",
        enum: ["erp", "document_store", "data_warehouse", "file_transfer", "custom"],
      },
    },
    required: ["fund_id"],
  },
  start_external_sync: {
    type: "object",
    additionalProperties: true,
    properties: {
      fund_id: { type: "string" },
      integration_id: { type: "string" },
      workflow_run_id: { type: "string" },
      sync_type: {
        type: "string",
        enum: ["discovery", "metadata_refresh", "artifact_import_request"],
      },
      trigger_type: { type: "string" },
      idempotency_key: { type: "string" },
      external_correlation_id: { type: "string" },
      discovered_artifacts: { type: "array", items: { type: "object" } },
      metadata: { type: "object" },
    },
    required: ["integration_id"],
  },
  get_external_sync: {
    type: "object",
    additionalProperties: false,
    properties: {
      fund_id: { type: "string" },
      sync_run_id: { type: "string" },
    },
    required: ["sync_run_id"],
  },
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function response(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result }
}

function errorResponse(id, code, message, data = null) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function isRequest(message) {
  return isObject(message) && message.jsonrpc === JSONRPC_VERSION && typeof message.method === "string"
}

function isResponseOnlyMessage(message) {
  return (
    isObject(message) &&
    message.jsonrpc === JSONRPC_VERSION &&
    !hasOwn(message, "method") &&
    hasOwn(message, "id") &&
    (hasOwn(message, "result") || hasOwn(message, "error"))
  )
}

function hasResponseId(message) {
  return isObject(message) && hasOwn(message, "id")
}

function scopesFor(principal) {
  return Array.isArray(principal?.scopes_json) ? principal.scopes_json : []
}

function principalCanUseTool(principal, tool) {
  const scopes = scopesFor(principal)
  return scopes.includes("*") || scopes.includes(tool.scope)
}

function schemaForTool(name, tool) {
  const schema = TOOL_INPUT_SCHEMAS[name] || {
    type: "object",
    additionalProperties: true,
    properties: {},
    required: tool.required || [],
  }
  return {
    ...schema,
    required: schema.required || tool.required || [],
  }
}

function toolAnnotations(tool) {
  return {
    readOnlyHint: tool.mutability === "read_only",
    destructiveHint: false,
    idempotentHint: tool.mutability === "read_only",
    openWorldHint: false,
  }
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function toolResult(payload, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: safeJson(payload),
      },
    ],
    isError,
  }
}

function parseBoolean(value) {
  if (value === true) return true
  if (value === false || value === undefined || value === null) return false
  return ["true", "1", "yes", "y"].includes(String(value).trim().toLowerCase())
}

class AgentMcpService {
  static initialize(params = {}) {
    const requestedVersion = params.protocolVersion
    const protocolVersion =
      requestedVersion === config.agentMcp.protocolVersion ? requestedVersion : config.agentMcp.protocolVersion

    return {
      protocolVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "css-invest-agent-reporting",
        version: "1.0.0",
      },
      instructions:
        "Use these tools only for draft financial reporting workflows. Final exports, approvals, waivers, and activation remain human-controlled.",
    }
  }

  static listTools(principal) {
    const catalog = AgentToolExecutionService.getToolCatalog()
    const tools = Object.entries(catalog)
      .filter(([, tool]) => principalCanUseTool(principal, tool))
      .map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: schemaForTool(name, tool),
        annotations: toolAnnotations(tool),
      }))

    return { tools }
  }

  static async callTool(params = {}, context = {}) {
    if (!isObject(params) || !params.name) {
      throw Object.assign(new Error("tools/call requires params.name"), {
        jsonRpcCode: ERROR_CODES.INVALID_PARAMS,
      })
    }

    const toolName = params.name
    const catalog = AgentToolExecutionService.getToolCatalog()
    if (!catalog[toolName]) {
      throw Object.assign(new Error(`Unknown tool: ${toolName}`), {
        jsonRpcCode: ERROR_CODES.INVALID_PARAMS,
      })
    }

    const toolArguments = isObject(params.arguments) ? params.arguments : {}
    const idempotencyKey =
      params.idempotency_key ||
      params.idempotencyKey ||
      params._meta?.idempotency_key ||
      params._meta?.idempotencyKey ||
      context.idempotencyKey ||
      null
    const dryRun =
      parseBoolean(params.dry_run) ||
      parseBoolean(params.dryRun) ||
      parseBoolean(params._meta?.dry_run) ||
      parseBoolean(params._meta?.dryRun)

    try {
      const execution = await AgentToolExecutionService.executeTool({
        agentPrincipalId: context.agentPrincipal.id,
        toolName,
        input: toolArguments,
        idempotencyKey,
        dryRun,
        actorId: context.agentPrincipal.created_by || null,
      })

      return toolResult({
        invocation: execution.invocation,
        result: execution.result,
        idempotentReplay: execution.idempotentReplay,
      })
    } catch (error) {
      return toolResult(
        {
          error: {
            message: error.message,
            statusCode: error.statusCode || 500,
            code: error.code || null,
            errors: error.errors || null,
          },
        },
        true,
      )
    }
  }

  static async handleMessage(message, context = {}) {
    if (isResponseOnlyMessage(message)) {
      return null
    }

    if (!isRequest(message)) {
      return errorResponse(null, ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request")
    }

    if (!hasResponseId(message)) {
      return null
    }

    try {
      switch (message.method) {
        case "initialize":
          return response(message.id, this.initialize(message.params || {}))
        case "ping":
          return response(message.id, {})
        case "tools/list":
          return response(message.id, this.listTools(context.agentPrincipal))
        case "tools/call":
          return response(message.id, await this.callTool(message.params || {}, context))
        default:
          return errorResponse(message.id, ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${message.method}`)
      }
    } catch (error) {
      return errorResponse(
        message.id,
        error.jsonRpcCode || ERROR_CODES.INTERNAL_ERROR,
        error.message || "Internal MCP error",
      )
    }
  }

  static async handlePayload(payload, context = {}) {
    if (Array.isArray(payload) && payload.length === 0) {
      return {
        statusCode: 200,
        body: errorResponse(null, ERROR_CODES.INVALID_REQUEST, "JSON-RPC batch cannot be empty"),
      }
    }

    const messages = Array.isArray(payload) ? payload : [payload]
    const responses = []
    for (const message of messages) {
      const result = await this.handleMessage(message, context)
      if (result) responses.push(result)
    }

    if (!responses.length) {
      return { statusCode: 202, body: null }
    }

    return {
      statusCode: 200,
      body: Array.isArray(payload) ? responses : responses[0],
    }
  }
}

module.exports = AgentMcpService
