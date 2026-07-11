const { ReportLineage } = require("../../../models")

function asPlainObject(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function confidenceForStatus(status) {
  const normalized = String(status || "").toLowerCase()
  if (normalized === "resolved") return 1
  if (normalized.includes("partial")) return 0.5
  if (normalized.includes("unresolved")) return 0
  return null
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

class ReportLineageService {
  static async bulkCreate(payloads, options = {}) {
    if (!ReportLineage || typeof ReportLineage.bulkCreate !== "function" || !payloads.length) {
      return []
    }
    return await ReportLineage.bulkCreate(payloads, options)
  }

  static buildRowLineagePayload({ run, row }) {
    const runPayload = asPlainObject(run) || {}
    const rowPayload = asPlainObject(row) || {}
    const metadata = rowPayload.metadata_json || {}

    return {
      report_run_id: rowPayload.report_run_id || runPayload.id,
      portfolio_id: runPayload.portfolio_id || null,
      report_run_row_id: rowPayload.id || null,
      template_version_id: rowPayload.template_version_id || runPayload.template_version_id || null,
      template_row_id: rowPayload.template_row_id || null,
      semantic_concept_id: rowPayload.semantic_concept_id || null,
      source_type: metadata.supportingLineCount > 0 ? "journal_entries" : rowPayload.value_source || "none",
      source_id: rowPayload.semantic_concept_id || rowPayload.template_row_id || rowPayload.id || null,
      source_reference_json: {
        row_label: rowPayload.row_label || null,
        row_order: rowPayload.row_order || null,
        value_source: rowPayload.value_source || null,
        supporting_line_count: metadata.supportingLineCount || 0,
        supporting_entry_count: metadata.supportingEntryCount || 0,
        supporting_entry_ids: safeArray(metadata.supportingEntryIds),
        matched_source_accounts: safeArray(metadata.matchedSourceAccounts),
        approved_accounts: safeArray(metadata.approvedAccounts),
      },
      mapping_snapshot_json: {
        approved_mapping_id: metadata.approvedMappingId || null,
        approved_mapping_source: metadata.approvedMappingSource || null,
        semantic_concept_key: metadata.semanticConceptKey || null,
        semantic_concept_label: metadata.semanticConceptLabel || null,
      },
      confidence: confidenceForStatus(rowPayload.resolution_status),
      evidence_json: {
        resolution_status: rowPayload.resolution_status,
        review_required: Boolean(metadata.reviewRequired),
        unresolved_reason: metadata.unresolvedReason || null,
        currencies: safeArray(metadata.currencies),
      },
    }
  }

  static async persistForReportRows({ run, rows = [], transaction = null }) {
    const payloads = rows
      .map((row) => this.buildRowLineagePayload({ run, row }))
      .filter((payload) => payload.report_run_id)
    return await this.bulkCreate(payloads, transaction ? { transaction } : {})
  }

  static buildExtractorLineagePayloads({ run, result = {}, inputArtifacts = {}, templateVersionId = null }) {
    const runPayload = asPlainObject(run) || {}
    const mapping = result.mapping || {}
    const assignments = safeArray(mapping.final_bucket_assignments)
    const lowConfidence = safeArray(mapping.low_confidence_mappings)
    const autoMappings = safeArray(mapping.auto_mappings_created)

    const sourcePayloads = ["trial_balance", "general_ledger"].map((role) => {
      const artifact = inputArtifacts[role] || {}
      return {
        report_run_id: runPayload.id,
        portfolio_id: runPayload.portfolio_id || null,
        template_version_id: templateVersionId || runPayload.template_version_id || null,
        source_type: role,
        source_id: artifact.repository_version_id || artifact.original_file_name || role,
        source_reference_json: {
          source_kind: artifact.source_kind || null,
          original_file_name: artifact.original_file_name || null,
          repository_item_id: artifact.repository_item_id || null,
          repository_version_id: artifact.repository_version_id || null,
          repository_sha256: artifact.repository_sha256 || null,
        },
        mapping_snapshot_json: null,
        confidence: 1,
        evidence_json: { role },
      }
    })

    const assignmentPayloads = assignments.map((assignment) => ({
      report_run_id: runPayload.id,
      portfolio_id: runPayload.portfolio_id || null,
      template_version_id: templateVersionId || runPayload.template_version_id || null,
      source_type: "cash_flow_mapping_assignment",
      source_id: [assignment.normalized_account, assignment.direction].filter(Boolean).join(":") || null,
      source_reference_json: {
        normalized_account: assignment.normalized_account || null,
        account_name: assignment.account_name || null,
        direction: assignment.direction || null,
        bucket_key: assignment.bucket_key || null,
      },
      mapping_snapshot_json: {
        bucket_key: assignment.bucket_key || null,
        source: assignment.source || null,
        previous_bucket_key: assignment.previous_bucket_key || null,
      },
      confidence: Number.isFinite(Number(assignment.confidence)) ? Number(assignment.confidence) : null,
      evidence_json: {
        evidence: safeArray(assignment.evidence),
        reasoning: assignment.reasoning || null,
      },
    }))

    const exceptionPayloads = [...lowConfidence, ...autoMappings.filter((mappingItem) => mappingItem?.needs_human_review)].map(
      (mappingItem) => ({
        report_run_id: runPayload.id,
        portfolio_id: runPayload.portfolio_id || null,
        template_version_id: templateVersionId || runPayload.template_version_id || null,
        source_type: "cash_flow_mapping_exception",
        source_id: [mappingItem.normalized_account, mappingItem.direction].filter(Boolean).join(":") || null,
        source_reference_json: {
          normalized_account: mappingItem.normalized_account || null,
          direction: mappingItem.direction || null,
          bucket_key: mappingItem.bucket_key || null,
        },
        mapping_snapshot_json: {
          source: mappingItem.source || null,
          confidence: mappingItem.confidence || null,
        },
        confidence: Number.isFinite(Number(mappingItem.confidence)) ? Number(mappingItem.confidence) : null,
        evidence_json: {
          evidence: safeArray(mappingItem.evidence),
          reasoning: mappingItem.reasoning || null,
          requires_review: true,
        },
      }),
    )

    return [...sourcePayloads, ...assignmentPayloads, ...exceptionPayloads].filter((payload) => payload.report_run_id)
  }

  static async persistForCashFlowExtractorRun({ run, result, inputArtifacts, templateVersionId = null }) {
    const payloads = this.buildExtractorLineagePayloads({
      run,
      result,
      inputArtifacts,
      templateVersionId,
    })
    return await this.bulkCreate(payloads)
  }

  static async listForRun({ runId }) {
    if (!ReportLineage || typeof ReportLineage.findAll !== "function") return []
    const records = await ReportLineage.findAll({
      where: { report_run_id: runId },
      order: [["created_at", "ASC"]],
    })
    return records.map(asPlainObject)
  }
}

module.exports = ReportLineageService
