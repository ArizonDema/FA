const crypto = require("crypto")
const { LlmMappingTrace, TemplateRowMappingSuggestion } = require("../../../models")

class LlmTraceService {
  static hashPayload(payload) {
    return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex")
  }

  static async createPendingTrace({
    fundId = null,
    templateVersionId,
    templateRowId,
    actorId = null,
    provider = "ollama",
    model = null,
    promptVersion,
    timeoutMs = null,
    requestPayload = null,
    metadata = null,
  }) {
    return await LlmMappingTrace.create({
      portfolio_id: fundId,
      template_version_id: templateVersionId,
      template_row_id: templateRowId,
      provider,
      model,
      prompt_version: promptVersion,
      prompt_hash: requestPayload ? this.hashPayload(requestPayload) : null,
      timeout_ms: timeoutMs,
      prompt_chars: requestPayload?.prompt_chars || null,
      request_bytes: requestPayload?.request_bytes || null,
      status: "pending",
      parse_status: "pending",
      request_payload_json: requestPayload,
      metadata_json: metadata,
      created_by: actorId,
    })
  }

  static async markSuccess({
    traceId,
    responsePayload = null,
    parsedResponse = null,
    durationMs = null,
    needsHumanReview = false,
    disagreementFlag = false,
    metadata = null,
  }) {
    const trace = await LlmMappingTrace.findByPk(traceId)
    if (!trace) return null

    await trace.update({
      status: "success",
      parse_status: "parsed",
      response_payload_json: responsePayload,
      parsed_response_json: parsedResponse,
      duration_ms: durationMs,
      needs_human_review: Boolean(needsHumanReview),
      disagreement_flag: Boolean(disagreementFlag),
      metadata_json: metadata ? { ...(trace.metadata_json || {}), ...metadata } : trace.metadata_json,
    })

    return trace
  }

  static async markFailure({
    traceId,
    status = "failed",
    parseStatus = "rejected",
    failureCode = null,
    failureReason = null,
    durationMs = null,
    responsePayload = null,
    metadata = null,
  }) {
    const trace = await LlmMappingTrace.findByPk(traceId)
    if (!trace) return null

    await trace.update({
      status,
      parse_status: parseStatus,
      failure_code: failureCode,
      failure_reason: failureReason,
      duration_ms: durationMs,
      response_payload_json: responsePayload,
      metadata_json: metadata ? { ...(trace.metadata_json || {}), ...metadata } : trace.metadata_json,
    })

    return trace
  }

  static async getTraceBySuggestionId(suggestionId) {
    const suggestion = await TemplateRowMappingSuggestion.findByPk(suggestionId, {
      include: [{ model: LlmMappingTrace, as: "trace" }],
    })
    if (!suggestion || !suggestion.trace) return null

    const payload = suggestion.trace.toJSON()
    return {
      suggestionId: suggestion.id,
      traceId: payload.id,
      provider: payload.provider,
      model: payload.model,
      promptVersion: payload.prompt_version,
      promptHash: payload.prompt_hash,
      timeoutMs: payload.timeout_ms,
      promptChars: payload.prompt_chars,
      requestBytes: payload.request_bytes,
      durationMs: payload.duration_ms,
      status: payload.status,
      parseStatus: payload.parse_status,
      needsHumanReview: Boolean(payload.needs_human_review),
      disagreementFlag: Boolean(payload.disagreement_flag),
      failureCode: payload.failure_code || null,
      failureReason: payload.failure_reason || null,
      requestPayload: payload.request_payload_json || null,
      responsePayload: payload.response_payload_json || null,
      parsedResponse: payload.parsed_response_json || null,
      metadata: payload.metadata_json || null,
    }
  }
}

module.exports = LlmTraceService
