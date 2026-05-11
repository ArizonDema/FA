const config = require("../../../config/app")
const logger = require("../../../config/logger")
const LlmOrchestratorService = require("../../llm/services/llmOrchestrator.service")
const LlmSkillPackService = require("../../llm/services/llmSkillPack.service")

const RUNTIME_MAPPING_SKILL_VERSION = "cash-flow-mapping.v1"
const DEFAULT_RUNTIME_MAPPING_TIMEOUT_MS = 120000
const DEFAULT_RUNTIME_MAPPING_BATCH_SIZE = 2

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
}

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(1, numeric))
}

function uniqueText(values = [], limit = 6) {
  if (!Array.isArray(values)) return []
  const normalized = []
  const seen = new Set()
  values.forEach((value) => {
    const item = normalizeText(value)
    if (!item) return
    const key = item.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(item)
  })
  return normalized.slice(0, limit)
}

function resolveRuntimeTimeoutMs() {
  const parsed = Number(config.mappingAssistance?.runtimeTimeoutMs)
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
  return DEFAULT_RUNTIME_MAPPING_TIMEOUT_MS
}

function resolveRuntimeMaxAttempts() {
  const parsed = Number(config.mappingAssistance?.runtimeMaxAttempts)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed))
  return 1
}

function resolveRuntimeBatchSize() {
  const parsed = Number(config.mappingAssistance?.runtimeBatchSize)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed))
  return DEFAULT_RUNTIME_MAPPING_BATCH_SIZE
}

function chunkArray(items = [], size = 4) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function runtimeCandidatePriority(candidate = {}) {
  const source = normalizeText(candidate.current_mapping_source || "").toLowerCase()
  const confidence = Number(candidate.current_mapping_confidence || 0)
  const profileScore = Number(candidate.best_profile_score || 0)
  const deterministicScore = Number(candidate.best_deterministic_score || 0)
  const amount = Math.log10(Math.max(1, Number(candidate.total_abs_amount || 0)))
  let score = amount
  if (["fallback", "auto_semantic", "derived_operating"].includes(source)) score += 100
  if (!candidate.best_profile_mapping_key || profileScore < 0.7) score += 50
  if (confidence < 0.7 || deterministicScore < 0.7) score += 25
  if (source === "profile_auto") score += 5
  return score
}

function selectRuntimeCandidates(candidates = [], limit = 6) {
  return (Array.isArray(candidates) ? [...candidates] : [])
    .sort((left, right) => runtimeCandidatePriority(right) - runtimeCandidatePriority(left))
    .slice(0, limit)
}

function compactAccountProfileForPrompt(profile = null) {
  if (!profile || typeof profile !== "object") return null
  return {
    tbClass: profile.tb_account_class || null,
    tbBalance: Number(profile.tb_ending_balance || 0),
    tbDirection: profile.tb_balance_direction || null,
    movementCount: Number(profile.movement_count || 0),
    totalAbsAmount: Number(profile.total_abs_amount || 0),
    netAmount: Number(profile.net_amount || 0),
    activeMonths: uniqueText(profile.active_months, 4),
    descriptions: uniqueText(profile.sample_descriptions, 3),
    journalExamples: uniqueText(profile.sample_je_numbers, 2),
    evidenceTokens: uniqueText(profile.evidence_tokens, 8),
  }
}

function compactAllowedCandidateForPrompt(item = {}) {
  return {
    mappingKey: item.mapping_key,
    label: item.label,
    semanticKey: item.semantic_key || null,
    fallback: Boolean(item.is_fallback),
    deterministicScore: Number(item.deterministic_score || 0),
    profileScore: Number(item.profile_score || 0),
    evidence: uniqueText(item.evidence || item.semantic_evidence, 2),
  }
}

function buildAllowedMappingsForPrompt(candidate = {}) {
  const currentKey = normalizeText(candidate.current_mapping_key || "")
  const bestProfileKey = normalizeText(candidate.best_profile_mapping_key || "")
  const bestDeterministicKey = normalizeText(candidate.best_deterministic_mapping_key || "")
  const maxMappings = Math.max(2, Number(config.mappingAssistance?.maxCandidates || 5))
  const selected = []
  const seen = new Set()

  const pushCandidate = (item) => {
    const key = normalizeText(item?.mapping_key || "")
    if (!key || seen.has(key)) return
    seen.add(key)
    selected.push(item)
  }

  const allowed = Array.isArray(candidate.allowed_candidates) ? candidate.allowed_candidates : []
  ;[currentKey, bestProfileKey, bestDeterministicKey].forEach((key) => {
    const match = allowed.find((item) => normalizeText(item.mapping_key) === key)
    if (match) pushCandidate(match)
  })

  allowed
    .filter((item) => !item.is_fallback)
    .sort((left, right) => {
      const leftScore = Math.max(Number(left.profile_score || 0), Number(left.deterministic_score || 0))
      const rightScore = Math.max(Number(right.profile_score || 0), Number(right.deterministic_score || 0))
      return rightScore - leftScore
    })
    .forEach((item) => {
      if (selected.length < maxMappings) pushCandidate(item)
    })

  if (selected.length < 2) {
    allowed
      .filter((item) => item.is_fallback)
      .forEach((item) => {
        if (selected.length < maxMappings) pushCandidate(item)
      })
  } else {
    const currentFallback = allowed.find((item) => item.is_fallback && normalizeText(item.mapping_key) === currentKey)
    if (currentFallback) pushCandidate(currentFallback)
  }

  return selected.map(compactAllowedCandidateForPrompt)
}

function compactCandidateForPrompt(candidate = {}) {
  return {
    accountKey: candidate.account_key,
    accountName: candidate.account_name,
    normalizedAccount: candidate.normalized_account,
    direction: candidate.direction,
    movementCount: Number(candidate.movement_count || 0),
    totalAbsAmount: Number(candidate.total_abs_amount || 0),
    sampleDescriptions: uniqueText(candidate.sample_descriptions, 3),
    accountProfile: compactAccountProfileForPrompt(candidate.account_profile),
    bestProfileMappingKey: candidate.best_profile_mapping_key || null,
    bestProfileScore: Number(candidate.best_profile_score || 0),
    bestDeterministicMappingKey: candidate.best_deterministic_mapping_key || null,
    bestDeterministicScore: Number(candidate.best_deterministic_score || 0),
    currentMappingKey: candidate.current_mapping_key || null,
    currentMappingLabel: candidate.current_mapping_label || null,
    currentMappingSource: candidate.current_mapping_source || null,
    currentMappingConfidence: Number(candidate.current_mapping_confidence || 0),
    allowedMappings: buildAllowedMappingsForPrompt(candidate),
  }
}

function buildPrompt({ statementMethod, candidates }) {
  const promptVersion = config.mappingAssistance?.runtimePromptVersion || "runtime.v1"
  const requestPayload = {
    promptVersion,
    statementMethod: normalizeText(statementMethod || "direct").toLowerCase(),
    candidates: candidates.map(compactCandidateForPrompt),
  }

  const systemPrompt = [
    LlmSkillPackService.renderSkillPack(RUNTIME_MAPPING_SKILL_VERSION),
    "Choose or confirm one allowed mapping for each account direction.",
    "Use account profile evidence first: TB class/balance, direction, amount/frequency, GL descriptions, JE examples, and evidence tokens.",
    "Use currentMapping and scores as hints only; choose a different allowed mapping if evidence is stronger.",
    "Use only allowedMappings.mappingKey values. Never invent keys.",
    "Cite concrete evidence from the input. Empty evidence is invalid.",
    "If the mapping is ambiguous, set needsHumanReview true for that recommendation.",
    "Return only strict JSON matching the schema.",
  ].filter(Boolean).join("\n")

  const userPrompt = JSON.stringify(requestPayload)

  return {
    promptVersion,
    skillVersion: RUNTIME_MAPPING_SKILL_VERSION,
    requestPayload,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }
}

function buildRuntimeMappingResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            accountKey: { type: "string" },
            mappingKey: { type: "string" },
            llmScore: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            needsHumanReview: { type: "boolean" },
          },
          required: ["accountKey", "mappingKey", "llmScore", "reasoning", "evidence", "needsHumanReview"],
        },
      },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["recommendations", "notes"],
  }
}

function parseResponse({ responseObject, candidatesByKey }) {
  if (!responseObject || typeof responseObject !== "object" || Array.isArray(responseObject)) {
    throw new Error("Runtime mapping LLM response must be a JSON object")
  }

  const recommendations = Array.isArray(responseObject.recommendations) ? responseObject.recommendations : []
  const parsed = []
  const seen = new Set()

  recommendations.forEach((item) => {
    const accountKey = normalizeText(item?.accountKey)
    const mappingKey = normalizeText(item?.mappingKey)
    const llmScore = clampScore(item?.llmScore)
    const candidate = candidatesByKey.get(accountKey)
    if (!candidate || !mappingKey || seen.has(accountKey) || llmScore === null) return

    const allowedKeys = new Set((candidate.allowed_candidates || []).map((allowed) => allowed.mapping_key))
    if (!allowedKeys.has(mappingKey)) return

    seen.add(accountKey)
    parsed.push({
      account_key: accountKey,
      mapping_key: mappingKey,
      llm_score: llmScore,
      reasoning: normalizeText(item?.reasoning || null) || null,
      evidence: uniqueText(item?.evidence, 5),
      needs_human_review: Boolean(item?.needsHumanReview),
    })
  })

  return {
    recommendations: parsed,
    notes: uniqueText(responseObject.notes, 6),
  }
}

function shouldAcceptRecommendation({ statementMethod, candidate, recommendation, minAcceptedScore }) {
  if (!candidate || !recommendation) {
    return { accepted: false, reason: "missing_candidate" }
  }
  if (recommendation.needs_human_review) {
    return { accepted: false, reason: "needs_human_review" }
  }
  if (Number(recommendation.llm_score || 0) < Number(minAcceptedScore || 0)) {
    return { accepted: false, reason: "score_below_threshold" }
  }
  if (!Array.isArray(recommendation.evidence) || recommendation.evidence.length === 0) {
    return { accepted: false, reason: "missing_evidence" }
  }

  const currentKey = normalizeText(candidate.current_mapping_key || null) || null
  const currentSource = normalizeText(candidate.current_mapping_source || "").toLowerCase()
  const suggestedKey = normalizeText(recommendation.mapping_key || null) || null
  if (!suggestedKey) {
    return { accepted: false, reason: "missing_mapping_key" }
  }
  const suggestedCandidate = (candidate.allowed_candidates || []).find((item) => normalizeText(item.mapping_key) === suggestedKey)
  if (suggestedCandidate?.is_fallback && suggestedKey !== currentKey) {
    return { accepted: false, reason: "fallback_suggestion_requires_review" }
  }
  if (!suggestedCandidate) {
    return { accepted: false, reason: "invalid_mapping_key" }
  }

  const bestProfileKey = normalizeText(candidate.best_profile_mapping_key || null) || null
  const bestProfileScore = Number(candidate.best_profile_score || 0)
  const llmScore = Number(recommendation.llm_score || 0)
  if (
    bestProfileKey &&
    bestProfileKey !== suggestedKey &&
    bestProfileScore >= Number(minAcceptedScore || 0) &&
    llmScore >= Number(minAcceptedScore || 0) &&
    llmScore - bestProfileScore < 0.12
  ) {
    return { accepted: false, reason: "profile_llm_conflict_requires_review" }
  }

  if (suggestedKey === currentKey) {
    if (statementMethod === "indirect" && suggestedKey === "operating_cash_flow") {
      return { accepted: false, reason: "indirect_operating_noop" }
    }
    if (!["auto_semantic", "fallback", "derived_operating", "suggested", "profile_auto"].includes(currentSource)) {
      return { accepted: false, reason: "same_as_current" }
    }
  }

  return { accepted: true, reason: "accepted" }
}

function acceptRecommendations({ statementMethod, candidates, parsedResponse }) {
  const minAcceptedScore = Number(config.mappingAssistance?.runtimeMinAcceptedScore || 0.7)
  const candidateLookup = new Map((candidates || []).map((candidate) => [candidate.account_key, candidate]))
  const acceptedMappings = []
  const rejectedRecommendations = []

  ;(parsedResponse?.recommendations || []).forEach((recommendation) => {
    const candidate = candidateLookup.get(recommendation.account_key)
    const verdict = shouldAcceptRecommendation({
      statementMethod,
      candidate,
      recommendation,
      minAcceptedScore,
    })

    if (!verdict.accepted) {
      rejectedRecommendations.push({
        account_key: recommendation.account_key,
        mapping_key: recommendation.mapping_key,
        reason: verdict.reason,
        llm_score: recommendation.llm_score,
        best_profile_mapping_key: candidate?.best_profile_mapping_key || null,
        best_profile_score: candidate?.best_profile_score || 0,
      })
      return
    }
    const selectedAllowedCandidate = (candidate.allowed_candidates || []).find(
      (item) => normalizeText(item.mapping_key) === normalizeText(recommendation.mapping_key),
    )

    acceptedMappings.push({
      account_key: recommendation.account_key,
      account_name: candidate.account_name,
      normalized_account: candidate.normalized_account,
      direction: candidate.direction,
      bucket_key: recommendation.mapping_key,
      semantic_key: selectedAllowedCandidate?.semantic_key || null,
      confidence: Number(recommendation.llm_score || 0),
      llm_score: Number(recommendation.llm_score || 0),
      deterministic_score: Number(selectedAllowedCandidate?.deterministic_score || 0),
      profile_score: Number(selectedAllowedCandidate?.profile_score || 0),
      source: "llm_assisted",
      status: "suggested",
      reasoning: recommendation.reasoning,
      evidence: recommendation.evidence,
      account_profile: candidate.account_profile || null,
      previous_bucket_key: candidate.current_mapping_key || null,
      changed: normalizeText(recommendation.mapping_key) !== normalizeText(candidate.current_mapping_key),
    })
  })

  return {
    acceptedMappings,
    rejectedRecommendations,
    minimumAcceptedScore: minAcceptedScore,
  }
}

class RuntimeMappingAssistantService {
  static async assistMappings({ statementMethod, candidates = [] }) {
    const runtimeEnabled =
      Boolean(config.mappingAssistance?.enabled) && Boolean(config.mappingAssistance?.runtimeEnabled)
    const maxAccountsPerRun = Math.max(1, Number(config.mappingAssistance?.runtimeMaxAccountsPerRun || 12))
    const selectedCandidates = selectRuntimeCandidates(candidates, maxAccountsPerRun)

    if (!runtimeEnabled || !selectedCandidates.length) {
      return {
        attempted: false,
        failed: false,
        promptVersion: config.mappingAssistance?.runtimePromptVersion || "runtime.v1",
        acceptedMappings: [],
        rejectedRecommendations: [],
        rawRecommendations: [],
        notes: [],
        summary: {
          enabled: runtimeEnabled,
          statementMethod: normalizeText(statementMethod || "direct").toLowerCase(),
          candidatesConsidered: selectedCandidates.length,
          attempted: false,
          acceptedCount: 0,
          rejectedCount: 0,
          failed: false,
          model: config.mappingAssistance?.model || null,
        },
      }
    }

    const batchSize = resolveRuntimeBatchSize()
    const batches = chunkArray(selectedCandidates, batchSize)
    const acceptedMappings = []
    const rejectedRecommendations = []
    const rawRecommendations = []
    const notes = []
    const promptVersions = []
    const skillVersions = new Set()
    let responseModel = null

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex]
        const prompt = buildPrompt({
          statementMethod,
          candidates: batch,
        })
        promptVersions.push(prompt.promptVersion)
        skillVersions.add(prompt.skillVersion)
        const candidateLookup = new Map(batch.map((candidate) => [candidate.account_key, candidate]))

        const llmResponse = await LlmOrchestratorService.requestStructuredJson({
          messages: prompt.messages,
          taskType: "runtime_mapping_assistance",
          timeoutMs: resolveRuntimeTimeoutMs(),
          maxAttempts: resolveRuntimeMaxAttempts(),
          model: config.mappingAssistance?.model || null,
          modelCandidates: config.mappingAssistance?.modelCandidates || null,
          jsonSchema: buildRuntimeMappingResponseSchema(),
          skillVersion: prompt.skillVersion,
          extraMetadata: {
            statement_method: normalizeText(statementMethod || "direct").toLowerCase(),
            candidate_count: batch.length,
            batch_index: batchIndex + 1,
            batch_count: batches.length,
          },
        })

        responseModel = responseModel || llmResponse.meta?.model || null
        const parsedResponse = parseResponse({
          responseObject: llmResponse.parsed,
          candidatesByKey: candidateLookup,
        })
        const accepted = acceptRecommendations({
          statementMethod,
          candidates: batch,
          parsedResponse,
        })
        acceptedMappings.push(...accepted.acceptedMappings)
        rejectedRecommendations.push(...accepted.rejectedRecommendations)
        rawRecommendations.push(...parsedResponse.recommendations)
        notes.push(...parsedResponse.notes)
      }

      logger.info("[runtime-mapping] LLM runtime assistance completed", {
        statement_method: normalizeText(statementMethod || "direct").toLowerCase(),
        candidate_count: selectedCandidates.length,
        batch_count: batches.length,
        recommendation_count: rawRecommendations.length,
        accepted_count: acceptedMappings.length,
        rejected_count: rejectedRecommendations.length,
        model: responseModel || config.mappingAssistance?.model || null,
      })

      return {
        attempted: true,
        failed: false,
        promptVersion: promptVersions[0] || config.mappingAssistance?.runtimePromptVersion || "runtime.v1",
        acceptedMappings,
        rejectedRecommendations,
        rawRecommendations,
        notes: uniqueText(notes, 8),
        summary: {
          enabled: true,
          statementMethod: normalizeText(statementMethod || "direct").toLowerCase(),
          candidatesConsidered: selectedCandidates.length,
          attempted: true,
          acceptedCount: acceptedMappings.length,
          rejectedCount: rejectedRecommendations.length,
          failed: false,
          model: responseModel || config.mappingAssistance?.model || null,
          minimumAcceptedScore: Number(config.mappingAssistance?.runtimeMinAcceptedScore || 0.7),
          promptVersion: promptVersions[0] || config.mappingAssistance?.runtimePromptVersion || "runtime.v1",
          skillVersion: Array.from(skillVersions)[0] || RUNTIME_MAPPING_SKILL_VERSION,
          batchSize,
          batchCount: batches.length,
        },
      }
    } catch (error) {
      logger.warn("[runtime-mapping] LLM runtime assistance fallback used", {
        statement_method: normalizeText(statementMethod || "direct").toLowerCase(),
        candidate_count: selectedCandidates.length,
        failure_code: error.failure_code || error.code || "llm_runtime_mapping_failed",
        failure_reason: error.failure_reason || error.message,
      })

      return {
        attempted: true,
        failed: true,
        promptVersion: promptVersions[0] || config.mappingAssistance?.runtimePromptVersion || "runtime.v1",
        acceptedMappings: [],
        rejectedRecommendations: [],
        rawRecommendations: [],
        notes: [],
        summary: {
          enabled: true,
          statementMethod: normalizeText(statementMethod || "direct").toLowerCase(),
          candidatesConsidered: selectedCandidates.length,
          attempted: true,
          acceptedCount: 0,
          rejectedCount: 0,
          failed: true,
          failureCode: error.failure_code || error.code || "llm_runtime_mapping_failed",
          failureReason: error.failure_reason || error.message,
          model: config.mappingAssistance?.model || null,
          promptVersion: promptVersions[0] || config.mappingAssistance?.runtimePromptVersion || "runtime.v1",
          skillVersion: Array.from(skillVersions)[0] || RUNTIME_MAPPING_SKILL_VERSION,
          batchSize,
          batchCount: batches.length,
        },
      }
    }
  }
}

RuntimeMappingAssistantService.__test = {
  buildPrompt,
  buildRuntimeMappingResponseSchema,
  resolveRuntimeTimeoutMs,
  resolveRuntimeMaxAttempts,
  resolveRuntimeBatchSize,
  chunkArray,
  selectRuntimeCandidates,
  parseResponse,
  acceptRecommendations,
}

module.exports = RuntimeMappingAssistantService
