const config = require("../../../config/app")
const logger = require("../../../config/logger")
const { TemplateRow, TemplateVersion, Template, CashFlowTemplate } = require("../../../models")
const LlmOrchestratorService = require("../../llm/services/llmOrchestrator.service")
const LlmTraceService = require("./llmTrace.service")
const MappingPromptBuilder = require("./mappingPromptBuilder.service")
const MappingReliabilityService = require("./mappingReliability.service")
const MappingResponseParserService = require("./mappingResponseParser.service")
const MappingSuggestionMergeService = require("./mappingSuggestionMerge.service")
const MappingSuggestionPersistenceService = require("./mappingSuggestionPersistence.service")
const MappingSuggestionService = require("./mappingSuggestion.service")
const MappingScoringService = require("./mappingScoring.service")
const SemanticConceptSearchIndexService = require("./semanticConceptSearchIndex.service")
const TemplateRowCandidateGenerator = require("./templateRowCandidateGenerator.service")

const TemplateModel = Template || CashFlowTemplate

function groupByRow(suggestions = []) {
  const groups = new Map()
  suggestions.forEach((suggestion) => {
    const key = suggestion.templateRowId
    if (!groups.has(key)) {
      groups.set(key, {
        templateRow: suggestion.templateRow,
        assessment: suggestion.metadata?.rowAssessment || null,
        suggestions: [],
      })
    }
    const group = groups.get(key)
    if (!group.assessment && suggestion.metadata?.rowAssessment) {
      group.assessment = suggestion.metadata.rowAssessment
    }
    group.suggestions.push(suggestion)
  })
  return Array.from(groups.values())
}

class LlmMappingAssistantService {
  static async getTemplateVersionRecord({ templateId, versionId }) {
    const template = await TemplateModel.findByPk(templateId)
    if (!template) return null

    const version = await TemplateVersion.findOne({
      where: {
        id: versionId,
        template_id: templateId,
      },
    })
    if (!version) return null

    return { template, version }
  }

  static buildNeighborLookup(rows = []) {
    const lookup = new Map()
    rows.forEach((row, index) => {
      lookup.set(row.id, {
        previous: rows[index - 1]?.label || null,
        next: rows[index + 1]?.label || null,
      })
    })
    return lookup
  }

  static async assistTemplateVersionMappings({
    templateId,
    versionId,
    actorId = null,
    deterministicLimit = null,
    deterministicMinConfidence = null,
  }) {
    const startedAt = Date.now()
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const { template, version } = records
    const llmEnabled = Boolean(config.mappingAssistance?.enabled)
    const llmCandidateLimit = Math.max(1, Number(config.mappingAssistance?.maxCandidates || 5))
    const llmAdditionalLimit = Math.max(0, Number(config.mappingAssistance?.maxAdditionalCandidates || 2))
    const maxRowsPerRun = Math.max(1, Number(config.mappingAssistance?.maxRowsPerRun || 25))

    const deterministicResult = await MappingSuggestionService.suggestTemplateVersionMappings({
      templateId,
      versionId,
      actorId,
      limit: Math.max(Number(deterministicLimit || llmCandidateLimit), llmCandidateLimit),
      minConfidence: Number(deterministicMinConfidence || config.mappingAssistance?.minDeterministicConfidence || 0.18),
    })

    const deterministicGroups = deterministicResult?.suggestions || []
    if (!llmEnabled) {
      return {
        template,
        version,
        summary: {
          rowsProcessed: 0,
          rowsSkipped: deterministicGroups.length,
          rowsSucceeded: 0,
          rowsFailed: 0,
          disagreementRate: 0,
          llmEnabled: false,
          fallbackUsed: true,
          durationMs: Date.now() - startedAt,
        },
        suggestions: [],
        deterministicSummary: deterministicResult?.summary || null,
      }
    }

    const allRows = await TemplateRow.findAll({
      where: { template_version_id: version.id },
      order: [
        ["row_order", "ASC"],
        ["row_index", "ASC"],
      ],
    })
    const rowById = new Map(allRows.map((row) => [row.id, row]))
    const neighboringLookup = this.buildNeighborLookup(allRows)
    const concepts = await SemanticConceptSearchIndexService.loadActiveConcepts()
    const conceptLookup = new Map(concepts.map((concept) => [concept.stableKey, concept]))

    const suggestionsByRow = []
    let rowsProcessed = 0
    let rowsSkipped = 0
    let rowsSucceeded = 0
    let rowsFailed = 0
    let disagreementCount = 0
    let totalPromptChars = 0

    for (const group of deterministicGroups.slice(0, maxRowsPerRun)) {
      const row = rowById.get(group.templateRow?.id)
      if (!row) {
        rowsSkipped += 1
        continue
      }

      const candidatePool = TemplateRowCandidateGenerator.buildCandidatePool({
        row,
        concepts,
      })
      if (candidatePool.skipped) {
        rowsSkipped += 1
        continue
      }

      rowsProcessed += 1
      const rankedPool = MappingScoringService.rankTemplateRowCandidates({
        target: candidatePool.target,
        hints: candidatePool.hints,
        concepts: candidatePool.candidates,
        limit: llmCandidateLimit + llmAdditionalLimit,
        minConfidence: Number(config.mappingAssistance?.minDeterministicConfidence || 0.18),
      })

      const deterministicSuggestions = group.suggestions.slice(0, llmCandidateLimit)
      const deterministicKeys = new Set(deterministicSuggestions.map((item) => item.semanticConceptKey))
      const candidateConcepts = deterministicSuggestions
        .map((item) => conceptLookup.get(item.semanticConceptKey))
        .filter(Boolean)
      const additionalConcepts = rankedPool
        .filter((item) => !deterministicKeys.has(item.semanticConceptKey))
        .slice(0, llmAdditionalLimit)
        .map((item) => conceptLookup.get(item.semanticConceptKey))
        .filter(Boolean)

      const prompt = MappingPromptBuilder.buildRowAssistancePrompt({
        row,
        deterministicSuggestions,
        deterministicSummary: deterministicResult.summary,
        candidateConcepts,
        additionalConcepts,
        neighboringLabels: neighboringLookup.get(row.id) || {},
      })

      totalPromptChars += JSON.stringify(prompt.requestPayload).length

      const trace = await LlmTraceService.createPendingTrace({
        fundId: version.portfolio_id,
        templateVersionId: version.id,
        templateRowId: row.id,
        actorId,
        provider: config.mappingAssistance?.provider || "ollama",
        model: config.mappingAssistance?.model || null,
        promptVersion: prompt.promptVersion,
        timeoutMs: Number(config.mappingAssistance?.timeoutMs || null),
        requestPayload: {
          prompt_chars: prompt.messages.reduce((total, item) => total + String(item.content || "").length, 0),
          request_bytes: Buffer.byteLength(JSON.stringify(prompt.messages), "utf8"),
          messages: prompt.messages,
          request_context: prompt.requestPayload,
        },
        metadata: {
          row_label: row.label,
          deterministic_candidate_count: deterministicSuggestions.length,
        },
      })

      try {
        const llmResponse = await LlmOrchestratorService.requestStructuredJson({
          messages: prompt.messages,
          taskType: "mapping_assistance",
          timeoutMs: Number(config.mappingAssistance?.timeoutMs || null),
          maxAttempts: Number(config.mappingAssistance?.maxAttempts || 1),
          model: config.mappingAssistance?.model || null,
          extraMetadata: {
            template_version_id: version.id,
            template_row_id: row.id,
          },
        })

        const allowedKeys = [
          ...candidateConcepts.map((concept) => concept.stableKey),
          ...additionalConcepts.map((concept) => concept.stableKey),
        ]

        const parsedResponse = MappingResponseParserService.parse({
          responseObject: llmResponse.parsed,
          rowId: row.id,
          allowedConceptKeys: allowedKeys,
        })

        const merged = MappingSuggestionMergeService.merge({
          row,
          deterministicSuggestions,
          llmResult: parsedResponse,
          conceptLookup,
        })

        if (merged.assessment.disagreementFlag) {
          disagreementCount += 1
        }

        await LlmTraceService.markSuccess({
          traceId: trace.id,
          responsePayload: {
            rawText: llmResponse.rawText,
            payload: llmResponse.payload,
            meta: llmResponse.meta,
          },
          parsedResponse,
          durationMs: Number(llmResponse.meta?.request_duration_ms || null),
          needsHumanReview: merged.assessment.needsHumanReview,
          disagreementFlag: merged.assessment.disagreementFlag,
          metadata: {
            ambiguities: merged.assessment.ambiguities,
          },
        })

        suggestionsByRow.push({
          templateRowId: row.id,
          portfolioId: version.portfolio_id,
          rowLabel: row.label,
          rowType: row.row_type,
          sectionName: row.section_name,
          suggestions: merged.mergedSuggestions.map((item) => ({
            semanticConceptId: item.semanticConceptId,
            semanticConceptKey: item.semanticConceptKey,
            confidenceScore: item.confidenceScore,
            llmScore: item.llmScore,
            mergedScore: item.mergedScore,
            rank: item.rank,
            rationale: item.rationale,
            signalBreakdown: item.signalBreakdown,
            llmMetadata: {
              reasoning: item.rationale,
              evidence: item.llmEvidence,
              llmRank: item.llmRank,
              deterministicRank: item.deterministicRank,
            },
            needsHumanReview: item.needsHumanReview,
            traceId: trace.id,
            metadata: {
              rowAssessment: merged.assessment,
            },
          })),
        })
        rowsSucceeded += 1
      } catch (error) {
        rowsFailed += 1
        await LlmTraceService.markFailure({
          traceId: trace.id,
          status: "fallback",
          parseStatus: "rejected",
          failureCode: error.failure_code || error.code || "llm_assist_failed",
          failureReason: error.failure_reason || error.message,
          durationMs: Number(error?.request_duration_ms || 0) || null,
          responsePayload: error.failure_details
            ? {
                details: error.failure_details,
              }
            : null,
          metadata: {
            attempts: error.attempts || null,
          },
        })

        logger.warn("[phase5] LLM-assisted mapping fallback used", {
          template_version_id: version.id,
          template_row_id: row.id,
          failure_code: error.failure_code || error.code || "llm_assist_failed",
          failure_reason: error.failure_reason || error.message,
        })
      }
    }

    if (deterministicGroups.length > maxRowsPerRun) {
      rowsSkipped += deterministicGroups.length - maxRowsPerRun
    }

    const persistedSuggestions = await MappingSuggestionPersistenceService.replaceTemplateRowSuggestions({
      templateVersionId: version.id,
      portfolioId: version.portfolio_id,
      suggestionsByRow,
      actorId,
      source: "llm_assisted",
    })

    const summary = {
      rowsProcessed,
      rowsSkipped,
      rowsSucceeded,
      rowsFailed,
      promptCharsAverage: rowsProcessed ? Number((totalPromptChars / rowsProcessed).toFixed(2)) : 0,
      disagreementRate: rowsProcessed ? Number((disagreementCount / rowsProcessed).toFixed(4)) : 0,
      llmEnabled: true,
      fallbackUsed: rowsFailed > 0,
      durationMs: Date.now() - startedAt,
    }

    logger.info("[phase5] LLM-assisted mapping run completed", {
      template_id: template.id,
      template_version_id: version.id,
      model: config.mappingAssistance?.model || null,
      rows_processed: rowsProcessed,
      rows_skipped: rowsSkipped,
      rows_succeeded: rowsSucceeded,
      rows_failed: rowsFailed,
      disagreement_rate: summary.disagreementRate,
      duration_ms: summary.durationMs,
    })

    const groupedSuggestions = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: version.portfolio_id,
      suggestions: persistedSuggestions,
    })

    return {
      template,
      version,
      summary,
      suggestions: groupedSuggestions,
      deterministicSummary: deterministicResult.summary,
    }
  }

  static async getTemplateVersionAssistedSuggestions({ templateId, versionId, status = "suggested" }) {
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const suggestions = await MappingSuggestionPersistenceService.getTemplateVersionSuggestions({
      templateVersionId: versionId,
      status,
      source: "llm_assisted",
    })

    const groupedSuggestions = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: records.version.portfolio_id,
      suggestions,
    })

    return {
      template: records.template,
      version: records.version,
      suggestions: groupedSuggestions,
    }
  }

  static async getTemplateRowAssistedSuggestions({ rowId, status = "suggested" }) {
    const row = await TemplateRow.findByPk(rowId)
    if (!row) return null
    const version = row.template_version_id ? await TemplateVersion.findByPk(row.template_version_id) : null

    const suggestions = await MappingSuggestionPersistenceService.getTemplateRowSuggestions({
      rowId,
      status,
      source: "llm_assisted",
    })

    const grouped = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: version?.portfolio_id || null,
      suggestions,
    })
    return {
      row,
      suggestions: grouped[0]?.suggestions || [],
      assessment: grouped[0]?.assessment || null,
    }
  }
}

module.exports = LlmMappingAssistantService
