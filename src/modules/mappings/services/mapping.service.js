const {
  Account,
  AccountSemanticMapping,
  SemanticConcept,
  TemplateRow,
  TemplateRowSemanticMapping,
  TemplateVersion,
} = require("../../../models")
const AuditService = require("../../audit/services/audit.service")

function normalizeAccountName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function normalizeSemanticKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

async function resolveSemanticConcept({ semanticConceptId, semanticConceptKey }) {
  if (semanticConceptId) {
    return await SemanticConcept.findByPk(semanticConceptId)
  }

  if (semanticConceptKey) {
    const normalizedKey = normalizeSemanticKey(semanticConceptKey)
    return await SemanticConcept.findOne({
      where: { stable_key: normalizedKey },
    })
  }

  return null
}

class MappingService {
  static async listAccountMappings({ fundId = null } = {}) {
    const where = {}
    if (fundId) where.portfolio_id = fundId

    return await AccountSemanticMapping.findAll({
      where,
      include: [
        { model: Account, as: "account" },
        { model: SemanticConcept, as: "semanticConcept" },
      ],
      order: [["created_at", "DESC"]],
    })
  }

  static async createAccountMapping({
    fundId = null,
    actorId = null,
    accountId = null,
    account = null,
    semanticConceptId = null,
    semanticConceptKey = null,
    status = "suggested",
    effectiveStart = null,
    effectiveEnd = null,
    confidence = 1,
    source = "manual",
    metadata = null,
  }) {
    let resolvedAccount = null
    if (accountId) {
      resolvedAccount = await Account.findByPk(accountId)
    } else if (account?.name) {
      resolvedAccount = await Account.create({
        portfolio_id: fundId,
        code: account.code || null,
        name: account.name,
        normalized_name: normalizeAccountName(account.name),
        source_system: account.source_system || null,
        source_ref: account.source_ref || null,
        metadata_json: account.metadata_json || null,
        created_by: actorId,
      })
    }

    if (!resolvedAccount) {
      throw new Error("Account is required")
    }

    const concept = await resolveSemanticConcept({ semanticConceptId, semanticConceptKey })
    if (!concept) {
      throw new Error("Semantic concept is required")
    }

    const mapping = await AccountSemanticMapping.create({
      portfolio_id: fundId || resolvedAccount.portfolio_id || null,
      account_id: resolvedAccount.id,
      semantic_concept_id: concept.id,
      status,
      effective_start: effectiveStart,
      effective_end: effectiveEnd,
      confidence,
      source,
      metadata_json: metadata,
      suggested_by: actorId,
      approved_by: status === "approved" ? actorId : null,
      approved_at: status === "approved" ? new Date() : null,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "account_mapping_created",
      entityType: "account_semantic_mapping",
      entityId: mapping.id,
      after: mapping.toJSON(),
      metadata: { fund_id: fundId || resolvedAccount.portfolio_id || null },
    })

    return await AccountSemanticMapping.findByPk(mapping.id, {
      include: [
        { model: Account, as: "account" },
        { model: SemanticConcept, as: "semanticConcept" },
      ],
    })
  }

  static async updateAccountMappingStatus({ mappingId, status, actorId = null }) {
    const mapping = await AccountSemanticMapping.findByPk(mappingId)
    if (!mapping) return null

    const before = mapping.toJSON()
    await mapping.update({
      status,
      approved_by: status === "approved" ? actorId : mapping.approved_by,
      approved_at: status === "approved" ? new Date() : mapping.approved_at,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "account_mapping_status_changed",
      entityType: "account_semantic_mapping",
      entityId: mapping.id,
      before,
      after: mapping.toJSON(),
      metadata: { status },
    })

    return mapping
  }

  static async listTemplateRowMappings({ fundId = null, templateVersionId = null } = {}) {
    const where = {}
    if (fundId) where.portfolio_id = fundId
    if (templateVersionId) where.template_version_id = templateVersionId

    return await TemplateRowSemanticMapping.findAll({
      where,
      include: [
        { model: TemplateRow, as: "templateRow" },
        { model: SemanticConcept, as: "semanticConcept" },
      ],
      order: [["created_at", "DESC"]],
    })
  }

  static async createTemplateRowMapping({
    fundId = null,
    actorId = null,
    templateVersionId,
    templateRowId = null,
    templateRow = null,
    semanticConceptId = null,
    semanticConceptKey = null,
    status = "suggested",
    effectiveStart = null,
    effectiveEnd = null,
    confidence = 1,
    source = "manual",
    metadata = null,
  }) {
    const templateVersion = await TemplateVersion.findByPk(templateVersionId)
    if (!templateVersion) {
      throw new Error("Template version is required")
    }

    let resolvedRow = null
    if (templateRowId) {
      resolvedRow = await TemplateRow.findByPk(templateRowId)
    } else {
      resolvedRow = await TemplateRow.create({
        template_version_id: templateVersion.id,
        sheet_name: templateRow?.sheet_name || null,
        row_index: templateRow?.row_index || null,
        row_key: templateRow?.row_key || null,
        label: templateRow?.label || null,
        row_type: templateRow?.row_type || null,
        indentation_level: templateRow?.indentation_level || 0,
        formula_text: templateRow?.formula_text || null,
        row_order: templateRow?.row_order || null,
        section_name: templateRow?.section_name || null,
        parent_section_name: templateRow?.parent_section_name || null,
        expected_data_type: templateRow?.expected_data_type || null,
        cell_range: templateRow?.cell_range || null,
        is_formula: Boolean(templateRow?.is_formula),
        cell_addresses_json: templateRow?.cell_addresses_json || null,
        raw_json: templateRow?.raw_json || null,
        metadata_json: templateRow?.metadata_json || null,
        created_by: actorId,
      })
    }

    if (!resolvedRow) {
      throw new Error("Template row is required")
    }

    const concept = await resolveSemanticConcept({ semanticConceptId, semanticConceptKey })
    if (!concept) {
      throw new Error("Semantic concept is required")
    }

    const mapping = await TemplateRowSemanticMapping.create({
      portfolio_id: fundId || templateVersion.portfolio_id || null,
      template_version_id: templateVersion.id,
      template_row_id: resolvedRow.id,
      semantic_concept_id: concept.id,
      status,
      effective_start: effectiveStart,
      effective_end: effectiveEnd,
      confidence,
      source,
      metadata_json: metadata,
      suggested_by: actorId,
      approved_by: status === "approved" ? actorId : null,
      approved_at: status === "approved" ? new Date() : null,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_row_mapping_created",
      entityType: "template_row_semantic_mapping",
      entityId: mapping.id,
      after: mapping.toJSON(),
      metadata: {
        fund_id: fundId || templateVersion.portfolio_id || null,
        template_version_id: templateVersion.id,
      },
    })

    return await TemplateRowSemanticMapping.findByPk(mapping.id, {
      include: [
        { model: TemplateRow, as: "templateRow" },
        { model: SemanticConcept, as: "semanticConcept" },
      ],
    })
  }

  static async updateTemplateRowMappingStatus({ mappingId, status, actorId = null }) {
    const mapping = await TemplateRowSemanticMapping.findByPk(mappingId)
    if (!mapping) return null

    const before = mapping.toJSON()
    await mapping.update({
      status,
      approved_by: status === "approved" ? actorId : mapping.approved_by,
      approved_at: status === "approved" ? new Date() : mapping.approved_at,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "template_row_mapping_status_changed",
      entityType: "template_row_semantic_mapping",
      entityId: mapping.id,
      before,
      after: mapping.toJSON(),
      metadata: { status },
    })

    return mapping
  }
}

module.exports = MappingService
