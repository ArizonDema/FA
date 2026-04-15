const {
  Account,
  AccountMappingSuggestion,
  SemanticConcept,
  TemplateRow,
  TemplateRowMappingSuggestion,
} = require("../../../models")
const { roundScore } = require("../utils/mappingText.util")

function serializeTemplateRowSuggestion(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  return {
    id: payload.id,
    fundId: payload.portfolio_id || null,
    templateVersionId: payload.template_version_id,
    templateRowId: payload.template_row_id,
    semanticConceptId: payload.semantic_concept_id,
    semanticConceptKey: payload.semanticConcept?.stable_key || null,
    semanticConceptLabel: payload.semanticConcept?.label || null,
    rank: payload.rank,
    confidenceScore: roundScore(payload.confidence_score),
    llmScore: payload.llm_score !== null && payload.llm_score !== undefined ? roundScore(payload.llm_score) : null,
    mergedScore:
      payload.merged_score !== null && payload.merged_score !== undefined ? roundScore(payload.merged_score) : null,
    rationale: payload.rationale || null,
    signalBreakdown: payload.signal_breakdown_json || null,
    source: payload.source,
    status: payload.status,
    needsHumanReview: Boolean(payload.needs_human_review),
    traceId: payload.trace_id || null,
    llmMetadata: payload.llm_metadata_json || null,
    metadata: payload.metadata_json || null,
    templateRow: payload.templateRow
      ? {
          id: payload.templateRow.id,
          label: payload.templateRow.label,
          rowType: payload.templateRow.row_type,
          sectionName: payload.templateRow.section_name,
          rowOrder: payload.templateRow.row_order,
          sheetName: payload.templateRow.sheet_name,
        }
      : null,
  }
}

function serializeAccountSuggestion(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  return {
    id: payload.id,
    accountId: payload.account_id,
    semanticConceptId: payload.semantic_concept_id,
    semanticConceptKey: payload.semanticConcept?.stable_key || null,
    semanticConceptLabel: payload.semanticConcept?.label || null,
    rank: payload.rank,
    confidenceScore: roundScore(payload.confidence_score),
    rationale: payload.rationale || null,
    signalBreakdown: payload.signal_breakdown_json || null,
    source: payload.source,
    status: payload.status,
    metadata: payload.metadata_json || null,
    account: payload.account
      ? {
          id: payload.account.id,
          code: payload.account.code,
          name: payload.account.name,
        }
      : null,
  }
}

class MappingSuggestionPersistenceService {
  static async replaceTemplateRowSuggestions({
    templateVersionId,
    portfolioId = null,
    suggestionsByRow = [],
    actorId = null,
    source = "deterministic_engine",
  }) {
    await TemplateRowMappingSuggestion.update(
      { status: "superseded" },
      {
        where: {
          template_version_id: templateVersionId,
          source,
          status: "suggested",
        },
      },
    )

    const suggestionRows = suggestionsByRow.flatMap((rowEntry) =>
      (rowEntry.suggestions || []).map((suggestion) => ({
        portfolio_id: portfolioId || rowEntry.portfolioId || null,
        template_version_id: templateVersionId,
        template_row_id: rowEntry.templateRowId,
        semantic_concept_id: suggestion.semanticConceptId,
        rank: suggestion.rank,
        confidence_score: suggestion.confidenceScore,
        llm_score: suggestion.llmScore ?? null,
        merged_score: suggestion.mergedScore ?? null,
        rationale: suggestion.rationale,
        signal_breakdown_json: suggestion.signalBreakdown,
        llm_metadata_json: suggestion.llmMetadata || null,
        source,
        status: "suggested",
        needs_human_review: Boolean(suggestion.needsHumanReview),
        metadata_json: {
          target_label: rowEntry.rowLabel || null,
          row_type: rowEntry.rowType || null,
          section_name: rowEntry.sectionName || null,
          ...(suggestion.metadata || {}),
        },
        trace_id: suggestion.traceId || null,
        generated_by: actorId,
      })),
    )

    if (!suggestionRows.length) return []

    await TemplateRowMappingSuggestion.bulkCreate(suggestionRows)

    const templateRowIds = Array.from(new Set(suggestionsByRow.map((item) => item.templateRowId).filter(Boolean)))

    const records = await TemplateRowMappingSuggestion.findAll({
      where: {
        template_version_id: templateVersionId,
        template_row_id: templateRowIds,
        source,
        status: "suggested",
      },
      include: [
        { model: SemanticConcept, as: "semanticConcept" },
        { model: TemplateRow, as: "templateRow" },
      ],
      order: [
        [{ model: TemplateRow, as: "templateRow" }, "row_order", "ASC"],
        ["rank", "ASC"],
      ],
    })

    return records.map((record) => serializeTemplateRowSuggestion(record))
  }

  static async replaceAccountSuggestions({
    portfolioId = null,
    accountIds = [],
    suggestionsByAccount = [],
    actorId = null,
    source = "deterministic_engine",
  }) {
    if (accountIds.length) {
      await AccountMappingSuggestion.update(
        { status: "superseded" },
        {
          where: {
            account_id: accountIds,
            source,
            status: "suggested",
          },
        },
      )
    }

    const suggestionRows = suggestionsByAccount.flatMap((accountEntry) =>
      (accountEntry.suggestions || []).map((suggestion) => ({
        portfolio_id: portfolioId || accountEntry.portfolioId || null,
        account_id: accountEntry.accountId,
        semantic_concept_id: suggestion.semanticConceptId,
        rank: suggestion.rank,
        confidence_score: suggestion.confidenceScore,
        rationale: suggestion.rationale,
        signal_breakdown_json: suggestion.signalBreakdown,
        source,
        status: "suggested",
        metadata_json: {
          account_name: accountEntry.accountName || null,
          account_code: accountEntry.accountCode || null,
        },
        generated_by: actorId,
      })),
    )

    if (!suggestionRows.length) return []

    await AccountMappingSuggestion.bulkCreate(suggestionRows)

    const records = await AccountMappingSuggestion.findAll({
      where: {
        account_id: Array.from(new Set(accountIds.filter(Boolean))),
        source,
        status: "suggested",
      },
      include: [
        { model: SemanticConcept, as: "semanticConcept" },
        { model: Account, as: "account" },
      ],
      order: [
        ["account_id", "ASC"],
        ["rank", "ASC"],
      ],
    })

    return records.map((record) => serializeAccountSuggestion(record))
  }

  static async getTemplateVersionSuggestions({ templateVersionId, status = "suggested", source = null }) {
    const where = {
      template_version_id: templateVersionId,
      status,
    }
    if (source) where.source = source

    const records = await TemplateRowMappingSuggestion.findAll({
      where,
      include: [
        { model: SemanticConcept, as: "semanticConcept" },
        { model: TemplateRow, as: "templateRow" },
      ],
      order: [
        [{ model: TemplateRow, as: "templateRow" }, "row_order", "ASC"],
        ["rank", "ASC"],
      ],
    })

    return records.map((record) => serializeTemplateRowSuggestion(record))
  }

  static async getTemplateRowSuggestions({ rowId, status = "suggested", source = null }) {
    const where = {
      template_row_id: rowId,
      status,
    }
    if (source) where.source = source

    const records = await TemplateRowMappingSuggestion.findAll({
      where,
      include: [
        { model: SemanticConcept, as: "semanticConcept" },
        { model: TemplateRow, as: "templateRow" },
      ],
      order: [["rank", "ASC"]],
    })

    return records.map((record) => serializeTemplateRowSuggestion(record))
  }

  static async getAccountSuggestions({ accountId, status = "suggested", source = null }) {
    const where = {
      account_id: accountId,
      status,
    }
    if (source) where.source = source

    const records = await AccountMappingSuggestion.findAll({
      where,
      include: [
        { model: SemanticConcept, as: "semanticConcept" },
        { model: Account, as: "account" },
      ],
      order: [["rank", "ASC"]],
    })

    return records.map((record) => serializeAccountSuggestion(record))
  }
}

module.exports = MappingSuggestionPersistenceService
