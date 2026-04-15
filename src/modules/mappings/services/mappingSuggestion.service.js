const logger = require("../../../config/logger")
const {
  Account,
  AccountSemanticMapping,
  CashFlowTemplate,
  Template,
  TemplateRow,
  TemplateRowSemanticMapping,
  TemplateVersion,
} = require("../../../models")
const AccountCandidateGenerator = require("./accountCandidateGenerator.service")
const MappingReliabilityService = require("./mappingReliability.service")
const MappingScoringService = require("./mappingScoring.service")
const MappingSuggestionPersistenceService = require("./mappingSuggestionPersistence.service")
const SemanticConceptSearchIndexService = require("./semanticConceptSearchIndex.service")
const TemplateRowCandidateGenerator = require("./templateRowCandidateGenerator.service")

const TemplateModel = Template || CashFlowTemplate

function groupTemplateSuggestions(suggestions = []) {
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

class MappingSuggestionService {
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

  static async suggestTemplateVersionMappings({
    templateId,
    versionId,
    actorId = null,
    limit = 5,
    minConfidence = 0.18,
    includeApproved = false,
  }) {
    const startedAt = Date.now()
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const { template, version } = records
    const rows = await TemplateRow.findAll({
      where: { template_version_id: version.id },
      order: [
        ["row_order", "ASC"],
        ["row_index", "ASC"],
      ],
    })

    const concepts = await SemanticConceptSearchIndexService.loadActiveConcepts()
    const approvedMappings = includeApproved
      ? []
      : await TemplateRowSemanticMapping.findAll({
          where: {
            template_version_id: version.id,
            status: "approved",
          },
        })
    const approvedRowIds = new Set(approvedMappings.map((mapping) => mapping.template_row_id))

    const suggestionsByRow = []
    let rowsProcessed = 0
    let rowsSkipped = 0
    let suggestionsGenerated = 0
    let candidateCountTotal = 0

    rows.forEach((row) => {
      if (approvedRowIds.has(row.id)) {
        rowsSkipped += 1
        return
      }

      const candidateResult = TemplateRowCandidateGenerator.buildCandidatePool({
        row,
        concepts,
      })

      if (candidateResult.skipped) {
        rowsSkipped += 1
        return
      }

      rowsProcessed += 1
      candidateCountTotal += candidateResult.candidates.length

      const rankedSuggestions = MappingScoringService.rankTemplateRowCandidates({
        target: candidateResult.target,
        hints: candidateResult.hints,
        concepts: candidateResult.candidates,
        limit,
        minConfidence,
      })

      if (!rankedSuggestions.length) {
        rowsSkipped += 1
        return
      }

      suggestionsGenerated += rankedSuggestions.length
      suggestionsByRow.push({
        templateRowId: row.id,
        portfolioId: version.portfolio_id,
        rowLabel: row.label,
        rowType: row.row_type,
        sectionName: row.section_name,
        suggestions: rankedSuggestions,
      })
    })

    const persistedSuggestions = await MappingSuggestionPersistenceService.replaceTemplateRowSuggestions({
      templateVersionId: version.id,
      portfolioId: version.portfolio_id,
      suggestionsByRow,
      actorId,
    })

    const durationMs = Date.now() - startedAt
    const summary = {
      rowsProcessed,
      rowsSkipped,
      suggestionsGenerated,
      averageCandidateCount: rowsProcessed ? Number((candidateCountTotal / rowsProcessed).toFixed(2)) : 0,
      durationMs,
    }

    logger.info("[phase4] Deterministic template-row mapping suggestions generated", {
      template_id: template.id,
      template_version_id: version.id,
      rows_processed: rowsProcessed,
      rows_skipped: rowsSkipped,
      suggestions_generated: suggestionsGenerated,
      average_candidate_count: summary.averageCandidateCount,
      duration_ms: durationMs,
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
    }
  }

  static async getTemplateVersionSuggestions({ templateId, versionId, status = "suggested" }) {
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const suggestions = await MappingSuggestionPersistenceService.getTemplateVersionSuggestions({
      templateVersionId: versionId,
      status,
      source: "deterministic_engine",
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

  static async getTemplateRowSuggestions({ rowId, status = "suggested" }) {
    const row = await TemplateRow.findByPk(rowId)
    if (!row) return null
    const version = row.template_version_id ? await TemplateVersion.findByPk(row.template_version_id) : null

    const suggestions = await MappingSuggestionPersistenceService.getTemplateRowSuggestions({
      rowId,
      status,
      source: "deterministic_engine",
    })

    const groupedSuggestions = await MappingReliabilityService.groupTemplateRowSuggestions({
      fundId: version?.portfolio_id || null,
      suggestions,
    })
    const assessment = groupedSuggestions[0]?.assessment || null

    return {
      row,
      assessment,
      suggestions: groupedSuggestions[0]?.suggestions || [],
    }
  }

  static async suggestAccountMappings({
    fundId = null,
    accountIds = [],
    actorId = null,
    limit = 5,
    minConfidence = 0.18,
    includeApproved = false,
  }) {
    const startedAt = Date.now()
    const where = {}
    if (fundId) where.portfolio_id = fundId
    if (accountIds.length) where.id = accountIds

    const accounts = await Account.findAll({
      where,
      order: [
        ["name", "ASC"],
        ["code", "ASC"],
      ],
    })

    const concepts = await SemanticConceptSearchIndexService.loadActiveConcepts()
    const approvedMappings = includeApproved
      ? []
      : await AccountSemanticMapping.findAll({
          where: {
            ...(fundId ? { portfolio_id: fundId } : {}),
            status: "approved",
          },
        })
    const approvedAccountIds = new Set(approvedMappings.map((mapping) => mapping.account_id))

    const suggestionsByAccount = []
    let accountsProcessed = 0
    let accountsSkipped = 0
    let suggestionsGenerated = 0
    let candidateCountTotal = 0

    accounts.forEach((account) => {
      if (approvedAccountIds.has(account.id)) {
        accountsSkipped += 1
        return
      }

      const candidateResult = AccountCandidateGenerator.buildCandidatePool({
        account,
        concepts,
      })

      if (candidateResult.skipped) {
        accountsSkipped += 1
        return
      }

      accountsProcessed += 1
      candidateCountTotal += candidateResult.candidates.length

      const rankedSuggestions = MappingScoringService.rankAccountCandidates({
        target: candidateResult.target,
        concepts: candidateResult.candidates,
        limit,
        minConfidence,
      })

      if (!rankedSuggestions.length) {
        accountsSkipped += 1
        return
      }

      suggestionsGenerated += rankedSuggestions.length
      suggestionsByAccount.push({
        accountId: account.id,
        portfolioId: account.portfolio_id || fundId || null,
        accountName: account.name,
        accountCode: account.code,
        suggestions: rankedSuggestions,
      })
    })

    const persistedSuggestions = await MappingSuggestionPersistenceService.replaceAccountSuggestions({
      portfolioId: fundId || null,
      accountIds: accounts.map((account) => account.id),
      suggestionsByAccount,
      actorId,
    })

    const durationMs = Date.now() - startedAt
    const summary = {
      accountsProcessed,
      accountsSkipped,
      suggestionsGenerated,
      averageCandidateCount: accountsProcessed ? Number((candidateCountTotal / accountsProcessed).toFixed(2)) : 0,
      durationMs,
    }

    logger.info("[phase4] Deterministic account mapping suggestions generated", {
      fund_id: fundId,
      accounts_processed: accountsProcessed,
      accounts_skipped: accountsSkipped,
      suggestions_generated: suggestionsGenerated,
      average_candidate_count: summary.averageCandidateCount,
      duration_ms: durationMs,
    })

    return {
      summary,
      suggestions: persistedSuggestions,
    }
  }

  static async getAccountSuggestions({ accountId, status = "suggested" }) {
    const account = await Account.findByPk(accountId)
    if (!account) return null

    const suggestions = await MappingSuggestionPersistenceService.getAccountSuggestions({
      accountId,
      status,
      source: "deterministic_engine",
    })

    return {
      account,
      suggestions,
    }
  }
}

module.exports = MappingSuggestionService
