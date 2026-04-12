const crypto = require("crypto")

function buildAnalysisConfigPayload(analysisResult) {
  if (analysisResult?.suggested_config_json) {
    return analysisResult.suggested_config_json
  }

  return {
    version: "v3",
    sheet_name: "Cash Flow",
    layout_type: "freeform",
    period_granularity: "custom",
    period_axis: {
      orientation: "row",
      labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
      period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
    },
    period_resolution_rules: {
      custom_periods: [
        {
          period_key: "period_1",
          date_start: new Date().toISOString().slice(0, 10),
          date_end: new Date().toISOString().slice(0, 10),
        },
      ],
    },
    opening_binding: null,
    closing_binding: null,
    bucket_bindings: [
      {
        bucket_key: "inflow_bucket",
        label: "Inflow Bucket",
        direction: "inflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "B1" }],
      },
      {
        bucket_key: "outflow_bucket",
        label: "Outflow Bucket",
        direction: "outflow",
        fallback: true,
        rules: [],
        cells: [{ period_key: "period_1", label: "Period 1", cell: "C1" }],
      },
    ],
    writer_policy: {
      preserve_formulas: true,
      full_recalc_on_open: true,
    },
    mapping_policy: {
      auto_create: true,
      high_confidence_threshold: 0.7,
      low_confidence_threshold: 0.35,
    },
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function createSchemaHash(configJson) {
  return crypto.createHash("sha256").update(stableStringify(configJson || null)).digest("hex")
}

function normalizeAnalysisIssues(issues) {
  if (!Array.isArray(issues)) return []
  return issues.map((item) => String(item || "").trim()).filter(Boolean)
}

function normalizeRequiredAnchors(requiredAnchors) {
  if (!Array.isArray(requiredAnchors)) return []
  return requiredAnchors
    .map((item) => String(item || "").trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean)
}

function buildIssuesJson({
  issues,
  requiredAnchors,
  schemaCacheHit,
  analysisSource,
  cacheSourceAnalysisId,
  llmFailureReason,
}) {
  return {
    issues: normalizeAnalysisIssues(issues),
    required_anchors: normalizeRequiredAnchors(requiredAnchors),
    ingestion: {
      schema_cache_hit: Boolean(schemaCacheHit),
      analysis_source: analysisSource || "llm",
      cache_source_analysis_id: cacheSourceAnalysisId || null,
      llm_failure_reason: llmFailureReason || null,
    },
  }
}

function toAnalysisResultPayload(result) {
  return {
    source_file_sha256: result.source_file_sha256 || null,
    detected_layout_type: result.detected_layout_type || "freeform",
    confidence: Number(result.confidence || 0),
    suggested_config_json: buildAnalysisConfigPayload(result),
    issues: normalizeAnalysisIssues(result.issues),
    required_anchors: normalizeRequiredAnchors(result.required_anchors),
    raw_structure_json: result.raw_structure_json || null,
    llm_meta_json: result.llm_meta_json || null,
    llm_failure_reason: result.llm_failure_reason || null,
    needs_human_review: Boolean(result.needs_human_review),
    analysis_source: result.analysis_source || "llm",
  }
}

function deepMerge(target, source) {
  const base = Array.isArray(target) ? [...target] : { ...(target || {}) }
  if (!source || typeof source !== "object") return base

  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      base[key] = value.map((item) => (typeof item === "object" && item ? deepMerge({}, item) : item))
      return
    }
    if (value && typeof value === "object") {
      const current = base[key] && typeof base[key] === "object" ? base[key] : {}
      base[key] = deepMerge(current, value)
      return
    }
    base[key] = value
  })

  return base
}

function extractTemplateRows(rawStructureJson) {
  const worksheets = Array.isArray(rawStructureJson?.worksheets) ? rawStructureJson.worksheets : []
  const rows = []

  worksheets.forEach((worksheet) => {
    const sampledRows = Array.isArray(worksheet.sampled_rows) ? worksheet.sampled_rows : []
    sampledRows.forEach((row) => {
      const cells = Array.isArray(row.cells) ? row.cells : []
      if (!cells.length) return
      const labelCell = cells.find((cell) => typeof cell?.value === "string" && String(cell.value).trim())
      rows.push({
        sheet_name: worksheet.name || null,
        row_index: Number.isInteger(row.row) ? row.row : null,
        row_key: labelCell?.address || `row_${row.row || rows.length + 1}`,
        label: labelCell ? String(labelCell.value).trim() : null,
        cell_addresses_json: cells.map((cell) => cell.address).filter(Boolean),
        metadata_json: {
          worksheet_row_count: worksheet.row_count || null,
          cells,
        },
      })
    })
  })

  return rows
}

module.exports = {
  buildAnalysisConfigPayload,
  stableStringify,
  createSchemaHash,
  normalizeAnalysisIssues,
  normalizeRequiredAnchors,
  buildIssuesJson,
  toAnalysisResultPayload,
  deepMerge,
  extractTemplateRows,
}
