const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const ExcelJS = require("exceljs")
const config = require("../config/app")
const logger = require("../config/logger")
const CashFlowService = require("./cashFlow.service")

const SUPPORTED_TEMPLATE_EXTENSIONS = [".xlsx"]
const MAX_SHEETS = 4
const MAX_ROWS = 60
const MAX_COLS = 24
const MAX_FORMULA_CELLS = 80
const MAX_HEADER_CANDIDATES = 10
const MAX_TABLE_CANDIDATES = 8
const MAX_ISSUES = 12
const INGESTION_PIPELINE_VERSION = "2026-04-06.v4"

function computeTemplateHash(templatePath) {
  const content = fs.readFileSync(templatePath)
  return crypto.createHash("sha256").update(content).digest("hex")
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "object") {
    if (value.formula) {
      return {
        formula: value.formula,
        result: value.result ?? null,
      }
    }
    if (value.result !== undefined) {
      return value.result
    }
    if (typeof value.text === "string") {
      return value.text
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || "").join("")
    }
    if (value.hyperlink && value.text) {
      return value.text
    }
  }
  return String(value)
}

function isCellEmpty(value) {
  if (value === null || value === undefined || value === "") return true
  if (typeof value === "object") {
    if (value.formula || value.result !== undefined) return false
    if (typeof value.text === "string" && value.text.trim()) return false
    if (Array.isArray(value.richText) && value.richText.length) return false
  }
  return false
}

function columnNumberToName(columnNumber) {
  let col = Number(columnNumber || 0)
  if (!col || col < 1) return ""
  let letters = ""
  while (col > 0) {
    const remainder = (col - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    col = Math.floor((col - remainder) / 26)
  }
  return letters
}

function cellAddress(row, col) {
  return `${columnNumberToName(col)}${row}`
}

function detectTableCandidates(rowStats) {
  const candidates = []
  let runStart = null
  let runCount = 0

  rowStats.forEach((stat, index) => {
    const isDense = stat.non_empty_cells >= 2
    if (isDense) {
      if (runStart === null) {
        runStart = stat.row
        runCount = 1
      } else {
        runCount += 1
      }
      return
    }

    if (runStart !== null && runCount >= 3) {
      candidates.push({
        start_row: runStart,
        end_row: rowStats[index - 1].row,
        row_count: runCount,
      })
    }
    runStart = null
    runCount = 0
  })

  if (runStart !== null && runCount >= 3) {
    const tail = rowStats[rowStats.length - 1]
    candidates.push({
      start_row: runStart,
      end_row: tail?.row || runStart,
      row_count: runCount,
    })
  }

  return candidates.slice(0, MAX_TABLE_CANDIDATES)
}

function extractWorksheetStructure(worksheet) {
  const rowCount = Math.min(Math.max(worksheet.rowCount || 0, 1), MAX_ROWS)
  const colCount = Math.min(Math.max(worksheet.columnCount || 0, 1), MAX_COLS)
  const rows = []
  const rowStats = []
  const headerCandidates = []
  const formulaCells = []

  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const cells = []
    let nonEmptyCount = 0
    let textLikeCount = 0

    for (let colIndex = 1; colIndex <= colCount; colIndex += 1) {
      const rawValue = row.getCell(colIndex).value
      if (isCellEmpty(rawValue)) continue

      nonEmptyCount += 1
      const normalizedValue = normalizeCellValue(rawValue)
      const textValue = normalizeText(
        typeof normalizedValue === "object" && normalizedValue?.result !== undefined
          ? normalizedValue.result
          : normalizedValue,
      )
      if (textValue && typeof normalizedValue !== "number") {
        textLikeCount += 1
      }

      const snapshot = {
        address: cellAddress(rowIndex, colIndex),
        row: rowIndex,
        col: colIndex,
        value: normalizedValue,
      }
      cells.push(snapshot)

      if (
        typeof normalizedValue === "object" &&
        normalizedValue &&
        normalizedValue.formula &&
        formulaCells.length < MAX_FORMULA_CELLS
      ) {
        formulaCells.push({
          address: snapshot.address,
          formula: normalizedValue.formula,
        })
      }
    }

    rowStats.push({
      row: rowIndex,
      non_empty_cells: nonEmptyCount,
      text_like_cells: textLikeCount,
    })

    if (cells.length) {
      rows.push({
        row: rowIndex,
        cells,
      })
    }

    if (headerCandidates.length < MAX_HEADER_CANDIDATES && nonEmptyCount >= 2 && textLikeCount >= 2) {
      headerCandidates.push({
        row: rowIndex,
        labels: cells
          .map((cell) => normalizeText(cell.value))
          .filter(Boolean)
          .slice(0, 12),
      })
    }
  }

  return {
    name: worksheet.name,
    row_count: worksheet.rowCount || 0,
    column_count: worksheet.columnCount || 0,
    sampled_rows: rows,
    row_stats: rowStats,
    header_candidates: headerCandidates,
    table_candidates: detectTableCandidates(rowStats),
    formula_cells: formulaCells,
  }
}

async function extractTemplateRawStructure({ templatePath, sourceFileName = null }) {
  const extension = path.extname(sourceFileName || templatePath || "").toLowerCase()
  if (!SUPPORTED_TEMPLATE_EXTENSIONS.includes(extension)) {
    throw new CashFlowService.CashFlowValidationError(
      `Unsupported template extension "${extension || "unknown"}". Supported: ${SUPPORTED_TEMPLATE_EXTENSIONS.join(", ")}`,
    )
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  if (!workbook.worksheets.length) {
    throw new CashFlowService.CashFlowValidationError("Template workbook has no worksheets")
  }

  const stats = fs.statSync(templatePath)
  const worksheets = workbook.worksheets.slice(0, MAX_SHEETS).map((worksheet) => extractWorksheetStructure(worksheet))

  return {
    source_file_name: sourceFileName || path.basename(templatePath),
    extension,
    size_bytes: stats.size,
    worksheet_count: workbook.worksheets.length,
    worksheets,
  }
}

function buildSystemPrompt() {
  return [
    "You are a strict JSON schema extraction engine for accounting report templates.",
    "Return ONLY valid JSON. No markdown, no explanations, no code fences.",
    "Output object shape:",
    "{",
    '  "detected_layout_type": "rows|columns|sectioned|freeform",',
    '  "confidence": number_between_0_and_1,',
    '  "issues": ["..."],',
    '  "required_anchors": ["..."],',
    '  "config_json": { ... }',
    "}",
    "config_json MUST be a cash-flow template v3 config compatible with the validator constraints:",
    'version="v3"; sheet_name; layout_type; period_axis{orientation,row labels + period_bindings with same period_key set};',
    "bucket_bindings each include bucket_key,label,direction(inflow/outflow),fallback,rules,cells for every period_key;",
    "opening_binding/closing_binding optional but if present must include cells for every period_key;",
    "Detect opening/closing targets even when labels vary, including: cash at beginning, beginning cash, opening cash, cash at end, ending cash, closing cash.",
    "period_resolution_rules.custom_periods for custom periods when needed; include writer_policy and mapping_policy.",
    "Every cell address must be A1 notation.",
  ].join("\n")
}

function buildUserPrompt({ rawStructure, deterministicSuggestion, attempt, previousErrors = [] }) {
  const correctionNote =
    attempt > 1
      ? `Previous output failed validation. Fix these exact issues: ${previousErrors.join(" | ")}`
      : "First attempt."

  return [
    "Create an engine-ready v3 cash-flow template config from this extracted workbook structure.",
    correctionNote,
    "Prior deterministic suggestion (reference, improve if needed):",
    JSON.stringify(deterministicSuggestion, null, 2),
    "Extracted workbook structure:",
    JSON.stringify(rawStructure, null, 2),
    "Hard requirements:",
    "1) JSON object only.",
    "2) config_json must pass strict schema validation for v3.",
    "3) Keep issues and required_anchors concise.",
    "4) Confidence should reflect extraction certainty.",
  ].join("\n")
}

function summarizeRawStructureForCompactPrompt(rawStructure) {
  const worksheets = Array.isArray(rawStructure?.worksheets) ? rawStructure.worksheets : []
  return {
    source_file_name: rawStructure?.source_file_name || null,
    worksheet_count: Number(rawStructure?.worksheet_count || worksheets.length || 0),
    worksheets: worksheets.map((worksheet) => {
      const sampledRows = Array.isArray(worksheet?.sampled_rows) ? worksheet.sampled_rows : []
      const rowLabelSamples = sampledRows
        .map((row) => {
          const cells = Array.isArray(row?.cells) ? row.cells : []
          const firstTextCell = cells.find((cell) => typeof cell?.value === "string" && normalizeText(cell.value))
          if (!firstTextCell) return null
          return {
            row: row.row,
            label: normalizeText(firstTextCell.value).slice(0, 120),
          }
        })
        .filter(Boolean)
        .slice(0, 30)

      const periodHeaderRows = sampledRows
        .map((row) => {
          const cells = Array.isArray(row?.cells) ? row.cells : []
          const labels = cells
            .map((cell) => (typeof cell?.value === "string" ? normalizeText(cell.value) : ""))
            .filter(Boolean)
          if (labels.length < 4) return null
          return {
            row: row.row,
            labels: labels.slice(0, 16),
          }
        })
        .filter(Boolean)
        .slice(0, 8)

      return {
        name: worksheet?.name || null,
        row_count: Number(worksheet?.row_count || 0),
        column_count: Number(worksheet?.column_count || 0),
        header_candidates: Array.isArray(worksheet?.header_candidates) ? worksheet.header_candidates.slice(0, 8) : [],
        table_candidates: Array.isArray(worksheet?.table_candidates) ? worksheet.table_candidates.slice(0, 6) : [],
        formula_cells: Array.isArray(worksheet?.formula_cells) ? worksheet.formula_cells.slice(0, 24) : [],
        row_label_samples: rowLabelSamples,
        period_header_rows: periodHeaderRows,
      }
    }),
  }
}

function buildCompactUserPrompt({ rawStructure, deterministicSuggestion, attempt, previousErrors = [] }) {
  const compactSummary = summarizeRawStructureForCompactPrompt(rawStructure)
  const correctionNote =
    attempt > 1
      ? `Previous output failed validation. Fix these exact issues: ${previousErrors.join(" | ")}`
      : "Compact retry."

  return [
    "Create an engine-ready v3 cash-flow template config from this compact workbook summary.",
    correctionNote,
    "Prior deterministic suggestion (reference, improve if needed):",
    JSON.stringify(deterministicSuggestion, null, 2),
    "Compact workbook summary:",
    JSON.stringify(compactSummary, null, 2),
    "Hard requirements:",
    "1) JSON object only.",
    "2) config_json must pass strict schema validation for v3.",
    "3) Detect opening/closing labels using business synonyms (cash at beginning/end, beginning cash, ending cash).",
    "4) Keep issues and required_anchors concise.",
  ].join("\n")
}

function stripFence(text) {
  const trimmed = String(text || "").trim()
  if (!trimmed.startsWith("```")) return trimmed
  const withoutStart = trimmed.replace(/^```[a-zA-Z]*\s*/, "")
  return withoutStart.replace(/\s*```$/, "").trim()
}

function parseJsonObject(text) {
  const cleaned = stripFence(text)
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = cleaned.slice(start, end + 1)
      return JSON.parse(sliced)
    }
    throw error
  }
}

function normalizeIssues(value) {
  if (!Array.isArray(value)) return []
  const unique = []
  const seen = new Set()
  value.forEach((item) => {
    const normalized = normalizeText(item)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    unique.push(normalized)
  })
  return unique.slice(0, MAX_ISSUES)
}

function normalizeRequiredAnchors(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeText(item).toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean)
    .slice(0, MAX_ISSUES)
}

function buildMinimalFallbackConfig(sheetName = "Cash Flow") {
  const today = new Date().toISOString().slice(0, 10)
  return {
    version: "v3",
    sheet_name: sheetName,
    layout_type: "freeform",
    period_granularity: "custom",
    period_axis: {
      orientation: "row",
      labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
      period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
    },
    period_resolution_rules: {
      custom_periods: [{ period_key: "period_1", date_start: today, date_end: today }],
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

async function callOllamaChat({ messages }) {
  const timeoutMs = Number(config.ollama?.timeoutMs || 90000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const numPredict = Number(config.ollama?.numPredict)
  const temperature = Number(config.ollama?.temperature)

  try {
    const response = await fetch(`${config.ollama.baseUrl}${config.ollama.chatPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ollama.model,
        stream: false,
        messages,
        keep_alive: config.ollama?.keepAlive || "10m",
        options: {
          ...(Number.isFinite(numPredict) && numPredict > 0 ? { num_predict: Math.round(numPredict) } : {}),
          ...(Number.isFinite(temperature) ? { temperature: Math.max(0, temperature) } : {}),
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Ollama request failed (${response.status}): ${body}`)
    }

    const payload = await response.json()
    const content = payload?.message?.content || ""
    if (!content) {
      throw new Error("Ollama returned an empty message")
    }
    return {
      content,
      meta: {
        model: payload?.model || config.ollama.model,
        done: payload?.done ?? true,
        eval_count: payload?.eval_count ?? null,
        total_duration: payload?.total_duration ?? null,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function normalizeConfigCandidate({ configCandidate, templatePath }) {
  const normalized = CashFlowService.validateTemplateConfig(configCandidate)
  const v3 = await CashFlowService.ensureV3TemplateConfig({
    templateConfig: normalized,
    templatePath,
  })
  return CashFlowService.validateTemplateConfig(v3)
}

function isTimeoutLikeError(message) {
  const normalized = normalizeText(message).toLowerCase()
  return (
    normalized.includes("operation was aborted") ||
    normalized.includes("request timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("abort")
  )
}

async function ingestTemplateSchema({ templatePath, sourceFileName }) {
  const sourceHash = computeTemplateHash(templatePath)
  const deterministicSuggestion = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
  const rawStructure = await extractTemplateRawStructure({ templatePath, sourceFileName })
  const deterministicConfidence = Number(deterministicSuggestion.confidence || 0)
  const deterministicRequiredAnchors = normalizeRequiredAnchors(deterministicSuggestion.required_anchors)
  const deterministicBypassThreshold = Number(config.ollama?.deterministicBypassConfidence || 0.9)

  if (deterministicRequiredAnchors.length === 0 && deterministicConfidence >= deterministicBypassThreshold) {
    try {
      const normalizedDeterministicConfig = await normalizeConfigCandidate({
        configCandidate:
          deterministicSuggestion.suggested_config_json ||
          buildMinimalFallbackConfig(rawStructure.worksheets?.[0]?.name || "Cash Flow"),
        templatePath,
      })

      return {
        source_file_sha256: sourceHash,
        raw_structure_json: rawStructure,
        detected_layout_type: deterministicSuggestion.detected_layout_type || "freeform",
        confidence: deterministicConfidence,
        issues: normalizeIssues(deterministicSuggestion.issues),
        required_anchors: deterministicRequiredAnchors,
        suggested_config_json: normalizedDeterministicConfig,
        needs_human_review: false,
        llm_meta_json: {
          provider: "ollama",
          endpoint: `${config.ollama.baseUrl}${config.ollama.chatPath}`,
          model: config.ollama.model,
          pipeline_version: INGESTION_PIPELINE_VERSION,
          skipped: true,
          skip_reason: "high_confidence_deterministic",
          attempts: [],
          raw_errors: [],
        },
        analysis_source: "deterministic_bypass",
      }
    } catch (bypassError) {
      logger.warn("[v0] Deterministic bypass normalization failed; falling back to LLM", {
        template_path: templatePath,
        message: bypassError.message,
      })
    }
  }

  const errors = []
  const attempts = []
  const maxAttempts = Math.max(1, Number(config.ollama?.maxAttempts || 2))
  let useCompactPrompt = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const systemPrompt = buildSystemPrompt()
      const userPrompt = useCompactPrompt
        ? buildCompactUserPrompt({
            rawStructure,
            deterministicSuggestion,
            attempt,
            previousErrors: errors,
          })
        : buildUserPrompt({
            rawStructure,
            deterministicSuggestion,
            attempt,
            previousErrors: errors,
          })

      const llmResponse = await callOllamaChat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      })
      const parsed = parseJsonObject(llmResponse.content)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("LLM output must be a JSON object")
      }

      const configCandidate = parsed.config_json || parsed
      const normalizedConfig = await normalizeConfigCandidate({
        configCandidate,
        templatePath,
      })
      const detectedLayout =
        normalizeText(parsed.detected_layout_type || normalizedConfig.layout_type || deterministicSuggestion.detected_layout_type).toLowerCase() ||
        "freeform"
      const confidenceRaw = Number(parsed.confidence)
      const confidence =
        Number.isFinite(confidenceRaw) && confidenceRaw >= 0
          ? Math.min(1, Math.max(0, confidenceRaw))
          : Number(deterministicSuggestion.confidence || 0.6)

      const issues = normalizeIssues(parsed.issues)
      const requiredAnchors = normalizeRequiredAnchors(parsed.required_anchors)
      attempts.push({
        attempt,
        status: "success",
        meta: llmResponse.meta,
      })

      return {
        source_file_sha256: sourceHash,
        raw_structure_json: rawStructure,
        detected_layout_type: ["rows", "columns", "sectioned", "freeform"].includes(detectedLayout)
          ? detectedLayout
          : "freeform",
        confidence,
        issues: issues.length ? issues : normalizeIssues(deterministicSuggestion.issues),
        required_anchors: requiredAnchors.length
          ? requiredAnchors
          : normalizeRequiredAnchors(deterministicSuggestion.required_anchors),
        suggested_config_json: normalizedConfig,
        needs_human_review: false,
        llm_meta_json: {
          provider: "ollama",
          endpoint: `${config.ollama.baseUrl}${config.ollama.chatPath}`,
          model: config.ollama.model,
          pipeline_version: INGESTION_PIPELINE_VERSION,
          attempts,
          raw_errors: errors,
        },
        analysis_source: "llm",
      }
    } catch (error) {
      const message = normalizeText(error.message || "Unknown LLM ingestion error")
      errors.push(message)
      attempts.push({
        attempt,
        status: "failed",
        error: message,
      })
      logger.warn(`[v0] Template LLM analysis attempt ${attempt} failed`, {
        template_path: templatePath,
        message,
      })
      if (isTimeoutLikeError(message) && attempt < maxAttempts) {
        useCompactPrompt = true
      }
    }
  }

  const fallbackCandidate =
    deterministicSuggestion.suggested_config_json || buildMinimalFallbackConfig(rawStructure.worksheets?.[0]?.name || "Cash Flow")
  let normalizedFallback = null
  try {
    normalizedFallback = await normalizeConfigCandidate({
      configCandidate: fallbackCandidate,
      templatePath,
    })
  } catch (fallbackError) {
    logger.warn("[v0] Fallback template config normalization failed, using minimal fallback", {
      message: fallbackError.message,
    })
    normalizedFallback = buildMinimalFallbackConfig(rawStructure.worksheets?.[0]?.name || "Cash Flow")
  }

  const deterministicIssues = normalizeIssues(deterministicSuggestion.issues)
  const normalizedErrors = normalizeIssues(errors)
  const timeoutOnlyFailure = normalizedErrors.length > 0 && normalizedErrors.every((message) => isTimeoutLikeError(message))
  const autoApproveDeterministicFallback =
    timeoutOnlyFailure &&
    deterministicRequiredAnchors.length === 0 &&
    Number(deterministicSuggestion.confidence || 0) >= 0.65
  const fallbackIssues = autoApproveDeterministicFallback
    ? normalizeIssues([
        "LLM step timed out, so deterministic template analysis was used.",
        ...deterministicIssues,
      ])
    : normalizeIssues([
        "LLM output could not be validated after retries. Human review is required before confirming this template.",
        ...deterministicIssues,
        ...normalizedErrors.slice(0, 4),
      ])

  return {
    source_file_sha256: sourceHash,
    raw_structure_json: rawStructure,
    detected_layout_type: deterministicSuggestion.detected_layout_type || "freeform",
    confidence: Number(deterministicSuggestion.confidence || 0.2),
    issues: fallbackIssues,
    required_anchors: deterministicRequiredAnchors,
    suggested_config_json: normalizedFallback,
    needs_human_review: !autoApproveDeterministicFallback,
    llm_meta_json: {
      provider: "ollama",
      endpoint: `${config.ollama.baseUrl}${config.ollama.chatPath}`,
      model: config.ollama.model,
      pipeline_version: INGESTION_PIPELINE_VERSION,
      attempts,
      raw_errors: errors,
    },
    analysis_source: autoApproveDeterministicFallback ? "deterministic_fallback" : "fallback",
  }
}

module.exports = {
  PIPELINE_VERSION: INGESTION_PIPELINE_VERSION,
  computeTemplateHash,
  extractTemplateRawStructure,
  ingestTemplateSchema,
  __test: {
    parseJsonObject,
    buildSystemPrompt,
    buildUserPrompt,
    detectTableCandidates,
    buildMinimalFallbackConfig,
  },
}
