const http = require("http")
const https = require("https")
const config = require("../../../config/app")
const logger = require("../../../config/logger")
const CashFlowTemplateIngestionService = require("../../../services/cashFlowTemplateIngestion.service")
const { resolveOllamaThinkForModel } = require("./ollamaCompatibility.service")

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
}

function stripFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim()
}

function parseJsonObject(text) {
  const cleaned = stripFence(text)
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw error
  }
}

function buildOllamaEndpoint(baseUrl, endpointPath = "/api/chat") {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/g, "")
  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`
  return `${normalizedBaseUrl}${normalizedPath}`
}

function requestJsonOverHttp({ endpoint, method = "GET", body = null, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let targetUrl = null
    try {
      targetUrl = new URL(endpoint)
    } catch (error) {
      reject(new Error(`Invalid Ollama endpoint URL: ${endpoint}`))
      return
    }

    const transport = targetUrl.protocol === "https:" ? https : http
    const serializedBody = body === null || body === undefined ? null : JSON.stringify(body)
    const headers = {
      Accept: "application/json",
      ...(serializedBody !== null ? { "Content-Type": "application/json" } : {}),
      ...(serializedBody !== null ? { "Content-Length": Buffer.byteLength(serializedBody) } : {}),
    }

    let settled = false
    let hardTimeout = null
    const settle = (handler, value) => {
      if (settled) return
      settled = true
      if (hardTimeout) clearTimeout(hardTimeout)
      handler(value)
    }

    const request = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method,
        headers,
      },
      (response) => {
        const chunks = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => {
          settle(resolve, {
            statusCode: response.statusCode || 0,
            headers: response.headers,
            bodyText: Buffer.concat(chunks).toString("utf8"),
          })
        })
      },
    )

    request.on("error", (error) => settle(reject, error))
    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Ollama request timed out after ${timeoutMs}ms`)
      error.name = "OllamaTimeoutError"
      request.destroy(error)
      settle(reject, error)
    })

    hardTimeout = setTimeout(() => {
      const error = new Error(`Ollama request timed out after ${timeoutMs}ms`)
      error.name = "OllamaTimeoutError"
      request.destroy(error)
      settle(reject, error)
    }, timeoutMs)

    if (serializedBody !== null) {
      request.write(serializedBody)
    }

    request.end()
  })
}

function estimatePromptChars(messages) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((total, message) => total + String(message?.content || "").length, 0)
}

function truncateForLog(value, maxLength = 400) {
  const normalized = normalizeText(value)
  if (!normalized) return ""
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

function normalizeFailureCode(value, fallback = "llm_error") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || fallback
}

function uniqueModels(primaryModel, candidates = []) {
  const models = []
  ;[primaryModel, ...(Array.isArray(candidates) ? candidates : [])].forEach((model) => {
    const normalized = normalizeText(model)
    if (!normalized) return
    if (!models.includes(normalized)) models.push(normalized)
  })
  return models
}

function classifyOllamaError(error, { timeoutMs }) {
  const rawMessage = normalizeText(error?.failure_reason || error?.message || "Unknown Ollama error")
  const rawCode = String(error?.code || error?.failure_code || "").trim().toUpperCase()
  const statusCode = Number(error?.statusCode || error?.status_code || 0)

  if (String(error?.name || "").includes("Timeout") || /timed out|timeout|aborted/i.test(rawMessage)) {
    return {
      code: "timeout",
      reason: `Ollama request timed out after ${timeoutMs}ms`,
      details: rawMessage,
    }
  }

  if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(rawCode)) {
    return {
      code: "connection_failed",
      reason: "Cannot connect to Ollama. Ensure Ollama is running and MAPPING_LLM_BASE_URL is correct.",
      details: rawMessage,
    }
  }

  if (rawCode === "ETIMEDOUT") {
    return {
      code: "network_timeout",
      reason: "Network timeout while connecting to Ollama.",
      details: rawMessage,
    }
  }

  if (statusCode === 404) {
    return {
      code: "model_not_found",
      reason: `Configured mapping model "${config.mappingAssistance?.model}" is not installed.`,
      details: rawMessage,
    }
  }

  if (statusCode >= 400) {
    return {
      code: "http_error",
      reason: `Ollama returned HTTP ${statusCode}.`,
      details: rawMessage,
    }
  }

  if (/empty message|thinking trace/i.test(rawMessage)) {
    return {
      code: "empty_response",
      reason: "Ollama returned an empty or incomplete response payload.",
      details: rawMessage,
    }
  }

  if (/parse|json/i.test(rawMessage)) {
    return {
      code: "bad_response_json",
      reason: "Failed to parse Ollama JSON response.",
      details: rawMessage,
    }
  }

  return {
    code: normalizeFailureCode(error?.failure_code || rawCode || "llm_error"),
    reason: rawMessage || "Unknown Ollama error",
    details: rawMessage,
  }
}

class LlmOrchestratorService {
  static computeTemplateHash(templatePath) {
    return CashFlowTemplateIngestionService.computeTemplateHash(templatePath)
  }

  static async analyzeTemplateSchema({ templatePath, sourceFileName, forceLlm = false }) {
    return await CashFlowTemplateIngestionService.ingestTemplateSchema({
      templatePath,
      sourceFileName,
      forceLlm,
    })
  }

  static async getHealth() {
    return await CashFlowTemplateIngestionService.checkOllamaHealth()
  }

  static buildMappingConfig(overrides = {}) {
    return {
      provider: config.mappingAssistance?.provider || "ollama",
      model: overrides.model || config.mappingAssistance?.model || config.ollama?.model,
      modelCandidates: Array.isArray(overrides.modelCandidates)
        ? overrides.modelCandidates
        : config.mappingAssistance?.modelCandidates || config.ollama?.modelCandidates || [],
      baseUrl: overrides.baseUrl || config.mappingAssistance?.baseUrl || config.ollama?.baseUrl,
      chatPath: overrides.chatPath || config.mappingAssistance?.chatPath || config.ollama?.chatPath || "/api/chat",
      timeoutMs: Number(overrides.timeoutMs || config.mappingAssistance?.timeoutMs || config.ollama?.timeoutMs || 120000),
      maxAttempts: Math.max(
        1,
        Number(overrides.maxAttempts || config.mappingAssistance?.maxAttempts || config.ollama?.maxAttempts || 1),
      ),
      keepAlive: overrides.keepAlive || config.mappingAssistance?.keepAlive || config.ollama?.keepAlive || "10m",
      temperature: Number(
        overrides.temperature !== undefined ? overrides.temperature : config.mappingAssistance?.temperature,
      ),
      numPredict: Number(
        overrides.numPredict !== undefined ? overrides.numPredict : config.mappingAssistance?.numPredict,
      ),
      think:
        overrides.think !== undefined
          ? overrides.think
          : config.mappingAssistance?.think !== undefined
            ? config.mappingAssistance.think
            : config.ollama?.think,
      forceJsonOutput:
        overrides.forceJsonOutput !== undefined
          ? Boolean(overrides.forceJsonOutput)
          : Boolean(config.mappingAssistance?.forceJsonOutput),
    }
  }

  static async requestStructuredJson({
    messages,
    taskType = "mapping_assistance",
    timeoutMs = null,
    maxAttempts = null,
    model = null,
    modelCandidates = null,
    jsonSchema = null,
    skillVersion = null,
    extraMetadata = null,
  }) {
    const llmConfig = this.buildMappingConfig({
      timeoutMs,
      maxAttempts,
      model,
      modelCandidates,
    })
    const endpoint = buildOllamaEndpoint(llmConfig.baseUrl, llmConfig.chatPath)
    const attempts = []
    const models = uniqueModels(llmConfig.model, modelCandidates || llmConfig.modelCandidates)

    for (const modelName of models) {
      for (let attempt = 1; attempt <= llmConfig.maxAttempts; attempt += 1) {
        const requestPayload = {
          model: modelName,
          stream: false,
          think: resolveOllamaThinkForModel(modelName, llmConfig.think),
          ...(jsonSchema ? { format: jsonSchema } : llmConfig.forceJsonOutput ? { format: "json" } : {}),
          messages,
          keep_alive: llmConfig.keepAlive,
          options: {
            ...(Number.isFinite(llmConfig.numPredict) && llmConfig.numPredict > 0
              ? { num_predict: Math.round(llmConfig.numPredict) }
              : {}),
            ...(Number.isFinite(llmConfig.temperature) ? { temperature: Math.max(0, llmConfig.temperature) } : {}),
          },
        }

      const promptChars = estimatePromptChars(messages)
      const requestBytes = Buffer.byteLength(JSON.stringify(requestPayload), "utf8")
      const startedAt = Date.now()

      logger.info("[phase5] LLM structured request started", {
        task_type: taskType,
        attempt,
        model: modelName,
        endpoint,
        timeout_ms: llmConfig.timeoutMs,
        prompt_chars: promptChars,
        request_bytes: requestBytes,
        skill_version: skillVersion || null,
        metadata: extraMetadata || null,
      })

      try {
        const response = await requestJsonOverHttp({
          endpoint,
          method: "POST",
          body: requestPayload,
          timeoutMs: llmConfig.timeoutMs,
        })

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Ollama request failed (${response.statusCode}): ${truncateForLog(response.bodyText)}`)
          error.name = "OllamaHttpError"
          error.statusCode = response.statusCode
          throw error
        }

        let payload = null
        try {
          payload = JSON.parse(response.bodyText)
        } catch (parseError) {
          const error = new Error(`Ollama returned malformed JSON: ${truncateForLog(parseError.message)}`)
          error.name = "OllamaParseError"
          error.failure_code = "bad_response_json"
          throw error
        }

        const rawText = payload?.message?.content || ""
        if (!rawText) {
          const error = new Error("Ollama returned an empty message")
          error.failure_code = "empty_response"
          throw error
        }

        let parsed = null
        try {
          parsed = parseJsonObject(rawText)
        } catch (parseError) {
          parseError.failure_code = "bad_response_json"
          parseError.failure_reason = `Failed to parse LLM JSON output: ${truncateForLog(parseError.message)}`
          parseError.failure_details = truncateForLog(rawText, 800)
          throw parseError
        }

        const meta = {
          provider: llmConfig.provider,
          model: payload?.model || modelName,
          endpoint,
          timeout_ms: llmConfig.timeoutMs,
          request_duration_ms: Date.now() - startedAt,
          prompt_chars: promptChars,
          request_bytes: requestBytes,
          attempt,
          skill_version: skillVersion || null,
          schema_constrained: Boolean(jsonSchema),
        }

        attempts.push({
          attempt,
          status: "success",
          meta,
        })

        logger.info("[phase5] LLM structured request completed", {
          task_type: taskType,
          attempt,
          model: meta.model,
          endpoint,
          duration_ms: meta.request_duration_ms,
          prompt_chars: promptChars,
          skill_version: skillVersion || null,
        })

        return {
          parsed,
          rawText,
          payload,
          meta,
          attempts,
        }
      } catch (error) {
        const failure = classifyOllamaError(error, { timeoutMs: llmConfig.timeoutMs })
        attempts.push({
          attempt,
          status: "failed",
          failure,
        })

        logger.warn("[phase5] LLM structured request failed", {
          task_type: taskType,
          attempt,
          model: modelName,
          endpoint,
          timeout_ms: llmConfig.timeoutMs,
          failure_code: failure.code,
          failure_reason: failure.reason,
          skill_version: skillVersion || null,
        })

        if (attempt >= llmConfig.maxAttempts && modelName === models[models.length - 1]) {
          const wrappedError = new Error(failure.reason)
          wrappedError.name = "LlmRequestError"
          wrappedError.failure_code = failure.code
          wrappedError.failure_reason = failure.reason
          wrappedError.failure_details = failure.details || null
          wrappedError.attempts = attempts
          wrappedError.timeout_ms = llmConfig.timeoutMs
          wrappedError.endpoint = endpoint
          wrappedError.model = modelName
          throw wrappedError
        }
      }
      }
    }

    throw new Error("LLM structured request exhausted without a response")
  }
}

LlmOrchestratorService.__test = {
  buildOllamaEndpoint,
  classifyOllamaError,
  parseJsonObject,
}

module.exports = LlmOrchestratorService
