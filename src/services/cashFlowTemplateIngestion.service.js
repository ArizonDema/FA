const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const http = require("http")
const https = require("https")
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
const DEFAULT_OLLAMA_TIMEOUT_MS = 600000
const DEFAULT_OLLAMA_HEALTH_TIMEOUT_MS = 10000
const MAX_ERROR_DETAILS_LENGTH = 400

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
    '  "config_overrides": { ... }',
    "}",
    "config_overrides is OPTIONAL and should be partial JSON patches applied on top of deterministic baseline config.",
    "Only include fields that must change. Keep it compact.",
    "Allowed config_overrides keys: sheet_name, layout_type, period_axis.orientation.",
    "Do NOT include long arrays or cell matrices (no period_bindings, bucket_bindings, opening_binding, closing_binding).",
    "The final merged config must stay compatible with cash-flow template v3 validator constraints:",
    'version="v3"; sheet_name; layout_type; period_axis{orientation,row labels + period_bindings with same period_key set};',
    "bucket_bindings each include bucket_key,label,direction(inflow/outflow),fallback,rules,cells for every period_key;",
    "opening_binding/closing_binding optional but if present must include cells for every period_key;",
    "Detect opening/closing targets even when labels vary, including: cash at beginning, beginning cash, opening cash, cash at end, ending cash, closing cash.",
    "period_resolution_rules.custom_periods for custom periods when needed; include writer_policy and mapping_policy.",
    "Every cell address must be A1 notation.",
  ].join("\n")
}

function buildUserPrompt({ rawStructure, deterministicSuggestion, attempt, previousErrors = [] }) {
  const deterministicHint = buildDeterministicHint(deterministicSuggestion)
  const correctionNote =
    attempt > 1
      ? `Previous output failed validation. Fix these exact issues: ${previousErrors.join(" | ")}`
      : "First attempt."

  return [
    "Create an engine-ready v3 cash-flow template config from this extracted workbook structure.",
    correctionNote,
    "Deterministic baseline summary (use this as starting point, then improve):",
    JSON.stringify(deterministicHint),
    "Extracted workbook structure:",
    JSON.stringify(rawStructure),
    "Hard requirements:",
    "1) JSON object only.",
    "2) Keep config_overrides minimal; if deterministic baseline already looks right, return config_overrides: {}.",
    "3) Only override sheet_name/layout_type/period_axis.orientation. Never emit long arrays.",
    "4) Keep issues and required_anchors concise.",
    "5) Confidence should reflect extraction certainty.",
  ].join("\n")
}

function buildDeterministicHint(deterministicSuggestion) {
  const configHint = deterministicSuggestion?.suggested_config_json || {}
  const periodLabels = Array.isArray(configHint?.period_axis?.labels)
    ? configHint.period_axis.labels
        .map((item) => normalizeText(item?.label || item?.period_key))
        .filter(Boolean)
        .slice(0, 8)
    : []

  const bucketBindings = Array.isArray(configHint?.bucket_bindings)
    ? configHint.bucket_bindings.slice(0, 8).map((bucket) => ({
        bucket_key: normalizeText(bucket?.bucket_key || null) || null,
        label: normalizeText(bucket?.label || null) || null,
        direction: normalizeText(bucket?.direction || null) || null,
      }))
    : []

  return {
    detected_layout_type: normalizeText(deterministicSuggestion?.detected_layout_type || null) || null,
    confidence: Number(deterministicSuggestion?.confidence || 0),
    issues: normalizeIssues(deterministicSuggestion?.issues).slice(0, 6),
    required_anchors: normalizeRequiredAnchors(deterministicSuggestion?.required_anchors).slice(0, 6),
    config_hint: {
      sheet_name: normalizeText(configHint?.sheet_name || null) || null,
      layout_type: normalizeText(configHint?.layout_type || null) || null,
      period_orientation: normalizeText(configHint?.period_axis?.orientation || null) || null,
      period_labels: periodLabels,
      bucket_bindings: bucketBindings,
      has_opening_binding: Boolean(configHint?.opening_binding),
      has_closing_binding: Boolean(configHint?.closing_binding),
    },
  }
}

function summarizeRawStructureForCompactPrompt(rawStructure) {
  const periodTokenPattern = /(^|[^a-z])(q[1-4]|fy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2})([^a-z]|$)/i
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
          return normalizeText(firstTextCell.value).slice(0, 80)
        })
        .filter(Boolean)

      const uniqueRowLabels = Array.from(new Set(rowLabelSamples)).slice(0, 16)

      const periodHeaderRows = sampledRows
        .map((row) => {
          const cells = Array.isArray(row?.cells) ? row.cells : []
          const labels = cells
            .map((cell) => (typeof cell?.value === "string" ? normalizeText(cell.value) : ""))
            .filter(Boolean)
          if (labels.length < 2 || !labels.some((label) => periodTokenPattern.test(label))) return null
          return {
            row: row.row,
            labels: labels.slice(0, 8),
          }
        })
        .filter(Boolean)
        .slice(0, 4)

      return {
        name: worksheet?.name || null,
        row_count: Number(worksheet?.row_count || 0),
        column_count: Number(worksheet?.column_count || 0),
        header_candidates: Array.isArray(worksheet?.header_candidates)
          ? worksheet.header_candidates.slice(0, 4).map((candidate) => ({
              row: candidate?.row || null,
              labels: Array.isArray(candidate?.labels) ? candidate.labels.slice(0, 8) : [],
            }))
          : [],
        table_candidates: Array.isArray(worksheet?.table_candidates) ? worksheet.table_candidates.slice(0, 4) : [],
        formula_examples: Array.isArray(worksheet?.formula_cells) ? worksheet.formula_cells.slice(0, 8) : [],
        row_label_samples: uniqueRowLabels,
        period_header_rows: periodHeaderRows,
      }
    }),
  }
}

function buildCompactUserPrompt({ rawStructure, deterministicSuggestion, attempt, previousErrors = [] }) {
  const compactSummary = summarizeRawStructureForCompactPrompt(rawStructure)
  const deterministicHint = buildDeterministicHint(deterministicSuggestion)
  const correctionNote =
    attempt > 1
      ? `Previous output failed validation. Fix these exact issues: ${previousErrors.join(" | ")}`
      : "Compact retry."

  return [
    "Create an engine-ready v3 cash-flow template config from this compact workbook summary.",
    correctionNote,
    "Deterministic baseline summary (starting point):",
    JSON.stringify(deterministicHint),
    "Compact workbook summary:",
    JSON.stringify(compactSummary),
    "Hard requirements:",
    "1) JSON object only.",
    "2) Keep config_overrides minimal; if baseline looks right, return config_overrides: {}.",
    "3) Only override sheet_name/layout_type/period_axis.orientation. Never emit long arrays.",
    "4) Detect opening/closing labels using business synonyms (cash at beginning/end, beginning cash, ending cash).",
    "5) Keep issues and required_anchors concise.",
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

function deepMergeConfig(base, patch) {
  if (!patch || typeof patch !== "object") return Array.isArray(base) ? [...base] : { ...(base || {}) }
  if (Array.isArray(base) || Array.isArray(patch)) {
    return Array.isArray(patch) ? [...patch] : patch
  }

  const merged = { ...(base || {}) }
  Object.entries(patch).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = [...value]
      return
    }
    if (value && typeof value === "object") {
      merged[key] = deepMergeConfig(merged[key] && typeof merged[key] === "object" ? merged[key] : {}, value)
      return
    }
    merged[key] = value
  })

  return merged
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

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/g, "")
}

function trimLeadingSlash(value) {
  return String(value || "").replace(/^\/+/g, "")
}

function buildOllamaEndpoint(baseUrl, endpointPath = "/api/chat") {
  const normalizedBase = trimTrailingSlash(baseUrl || "http://localhost:11434")
  const normalizedPath = trimLeadingSlash(endpointPath || "/api/chat")
  return `${normalizedBase}/${normalizedPath}`
}

function resolveOllamaTimeoutMs() {
  const parsed = Number(config.ollama?.timeoutMs)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return DEFAULT_OLLAMA_TIMEOUT_MS
}

function resolveOllamaHealthTimeoutMs() {
  const parsed = Number(config.ollama?.healthTimeoutMs)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return DEFAULT_OLLAMA_HEALTH_TIMEOUT_MS
}

function estimatePromptChars(messages) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((total, message) => total + String(message?.content || "").length, 0)
}

function truncateForLog(value, maxLength = MAX_ERROR_DETAILS_LENGTH) {
  const text = normalizeText(value)
  if (!text) return ""
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function normalizeFailureCode(value, fallback = "llm_error") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || fallback
}

function resolveCompactPromptThresholdChars() {
  const parsed = Number(config.ollama?.compactPromptThresholdChars)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return 22000
}

function resolveCompactPromptFirst() {
  return Boolean(config.ollama?.compactPromptFirst)
}

function shouldUseCompactPromptInitially({ rawStructure, deterministicSuggestion }) {
  if (resolveCompactPromptFirst()) return true
  const threshold = resolveCompactPromptThresholdChars()
  const rawSize = JSON.stringify(rawStructure || {}).length
  const deterministicSize = JSON.stringify(deterministicSuggestion || {}).length
  return rawSize + deterministicSize >= threshold
}

function requestJsonOverHttp({ endpoint, method = "GET", body = null, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let targetUrl = null
    try {
      targetUrl = new URL(endpoint)
    } catch (error) {
      const urlError = new Error(`Invalid Ollama endpoint URL: ${endpoint}`)
      urlError.name = "InvalidUrlError"
      reject(urlError)
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
          const bodyText = Buffer.concat(chunks).toString("utf8")
          settle(resolve, {
            statusCode: Number(response.statusCode || 0),
            headers: response.headers || {},
            bodyText,
          })
        })
      },
    )

    request.setTimeout(timeoutMs, () => {
      const timeoutError = new Error(`Ollama request timed out after ${timeoutMs}ms`)
      timeoutError.name = "AbortError"
      timeoutError.code = "ETIMEDOUT"
      request.destroy(timeoutError)
    })

    hardTimeout = setTimeout(() => {
      const timeoutError = new Error(`Ollama request timed out after ${timeoutMs}ms`)
      timeoutError.name = "AbortError"
      timeoutError.code = "ETIMEDOUT"
      request.destroy(timeoutError)
    }, timeoutMs)

    request.on("error", (error) => settle(reject, error))

    if (serializedBody !== null) {
      request.write(serializedBody)
    }
    request.end()
  })
}

function classifyOllamaError(error, { timeoutMs }) {
  const rawMessage = normalizeText(error?.failure_reason || error?.message || "Unknown Ollama error")
  const lowerMessage = rawMessage.toLowerCase()
  const causeCode = String(error?.cause?.code || "").trim().toUpperCase()
  const statusCode = Number(error?.statusCode || error?.status || NaN)

  if (error?.name === "AbortError" || isTimeoutLikeError(rawMessage)) {
    return {
      code: "timeout",
      reason: `Ollama request timed out after ${timeoutMs}ms`,
      details: rawMessage,
      isTimeout: true,
    }
  }

  if (causeCode === "ECONNREFUSED" || lowerMessage.includes("econnrefused")) {
    return {
      code: "connection_refused",
      reason: "Cannot connect to Ollama. Ensure Ollama is running and OLLAMA_BASE_URL is correct.",
      details: rawMessage,
      isTimeout: false,
    }
  }

  if (causeCode === "ETIMEDOUT" || causeCode === "EHOSTUNREACH") {
    return {
      code: "network_timeout",
      reason: "Network timeout while connecting to Ollama.",
      details: rawMessage,
      isTimeout: true,
    }
  }

  if (
    lowerMessage.includes("model") &&
    (lowerMessage.includes("not found") || lowerMessage.includes("no such model"))
  ) {
    return {
      code: "model_not_found",
      reason: `Configured Ollama model "${config.ollama.model}" is not installed.`,
      details: truncateForLog(rawMessage),
      isTimeout: false,
    }
  }

  if (Number.isFinite(statusCode)) {
    return {
      code: `http_${statusCode}`,
      reason: `Ollama returned HTTP ${statusCode}.`,
      details: truncateForLog(rawMessage),
      isTimeout: false,
    }
  }

  if (lowerMessage.includes("empty message")) {
    return {
      code: "empty_response",
      reason: "Ollama returned an empty message payload.",
      details: rawMessage,
      isTimeout: false,
    }
  }

  if (lowerMessage.includes("json") || lowerMessage.includes("unexpected token")) {
    return {
      code: "bad_response_json",
      reason: "Failed to parse Ollama JSON response.",
      details: truncateForLog(rawMessage),
      isTimeout: false,
    }
  }

  return {
    code: normalizeFailureCode(error?.failure_code, "llm_error"),
    reason: rawMessage || "Unknown Ollama error",
    details: truncateForLog(rawMessage),
    isTimeout: false,
  }
}

function buildFallbackFailureReason({ attempts, errors, autoApproveDeterministicFallback }) {
  const failedAttempts = Array.isArray(attempts)
    ? attempts.filter((attempt) => String(attempt?.status || "").toLowerCase() === "failed")
    : []

  if (!failedAttempts.length) return null

  const allTimeouts = failedAttempts.every((attempt) => String(attempt?.error_code || "") === "timeout")
  const timeoutMs = Number(failedAttempts[failedAttempts.length - 1]?.timeout_ms || resolveOllamaTimeoutMs())
  if (allTimeouts) {
    const baseReason = `Ollama timed out after ${failedAttempts.length} attempt(s) at ${timeoutMs}ms timeout.`
    return autoApproveDeterministicFallback
      ? `${baseReason} Deterministic fallback was auto-approved.`
      : `${baseReason} Human review is required.`
  }

  const lastAttempt = failedAttempts[failedAttempts.length - 1]
  const lastReason =
    normalizeText(lastAttempt?.error_reason) ||
    normalizeText(errors?.[errors.length - 1]) ||
    "Unknown LLM failure"
  const lastCode = normalizeFailureCode(lastAttempt?.error_code, "llm_error")
  return `LLM analysis failed after ${failedAttempts.length} attempt(s). Last failure [${lastCode}]: ${lastReason}`
}

async function callOllamaChat({ messages }) {
  const endpoint = buildOllamaEndpoint(config.ollama?.baseUrl, config.ollama?.chatPath || "/api/chat")
  const timeoutMs = resolveOllamaTimeoutMs()
  const numPredict = Number(config.ollama?.numPredict)
  const temperature = Number(config.ollama?.temperature)
  const options = {
    ...(Number.isFinite(numPredict) && numPredict > 0 ? { num_predict: Math.round(numPredict) } : {}),
    ...(Number.isFinite(temperature) ? { temperature: Math.max(0, temperature) } : {}),
  }
  const requestPayload = {
    model: config.ollama.model,
    stream: false,
    think: config.ollama?.think,
    ...(config.ollama?.forceJsonOutput ? { format: "json" } : {}),
    messages,
    keep_alive: config.ollama?.keepAlive || "10m",
    options,
  }
  const startedAt = Date.now()
  const promptChars = estimatePromptChars(messages)
  const requestBytes = Buffer.byteLength(JSON.stringify(requestPayload), "utf8")

  logger.info("[v0] Ollama chat request started", {
    ollama_base_url: config.ollama?.baseUrl || null,
    ollama_endpoint: endpoint,
    ollama_model: config.ollama?.model || null,
    ollama_timeout_ms: timeoutMs,
    ollama_num_predict: options.num_predict || null,
    ollama_temperature: Number.isFinite(options.temperature) ? options.temperature : null,
    ollama_think: requestPayload.think,
    ollama_force_json_output: Boolean(config.ollama?.forceJsonOutput),
    prompt_chars: promptChars,
    request_bytes: requestBytes,
    message_count: Array.isArray(messages) ? messages.length : 0,
  })

  try {
    const response = await requestJsonOverHttp({
      endpoint,
      method: "POST",
      body: requestPayload,
      timeoutMs,
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = new Error(`Ollama request failed (${response.statusCode}): ${truncateForLog(response.bodyText)}`)
      error.name = "OllamaHttpError"
      error.statusCode = response.statusCode
      error.responseBody = response.bodyText
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

    const content = payload?.message?.content || ""
    if (!content) {
      const thinking = normalizeText(payload?.message?.thinking || "")
      if (thinking) {
        const error = new Error(
          "Ollama returned thinking trace without final answer. Set OLLAMA_THINK=false or raise OLLAMA_NUM_PREDICT.",
        )
        error.failure_code = "thinking_only_response"
        throw error
      }
      throw new Error("Ollama returned an empty message")
    }

    const durationMs = Date.now() - startedAt
    logger.info("[v0] Ollama chat request completed", {
      ollama_base_url: config.ollama?.baseUrl || null,
      ollama_endpoint: endpoint,
      ollama_model: payload?.model || config.ollama?.model || null,
      ollama_timeout_ms: timeoutMs,
      ollama_think: requestPayload.think,
      ollama_force_json_output: Boolean(config.ollama?.forceJsonOutput),
      request_duration_ms: durationMs,
      prompt_chars: promptChars,
      request_bytes: requestBytes,
    })

    return {
      content,
      meta: {
        model: payload?.model || config.ollama.model,
        done: payload?.done ?? true,
        eval_count: payload?.eval_count ?? null,
        total_duration: payload?.total_duration ?? null,
        endpoint,
        timeout_ms: timeoutMs,
        request_duration_ms: durationMs,
        prompt_chars: promptChars,
        request_bytes: requestBytes,
        think: requestPayload.think,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const failure = classifyOllamaError(error, { timeoutMs })
    logger.warn("[v0] Ollama chat request failed", {
      ollama_base_url: config.ollama?.baseUrl || null,
      ollama_endpoint: endpoint,
      ollama_model: config.ollama?.model || null,
      ollama_timeout_ms: timeoutMs,
      ollama_think: requestPayload.think,
      ollama_force_json_output: Boolean(config.ollama?.forceJsonOutput),
      request_duration_ms: durationMs,
      prompt_chars: promptChars,
      request_bytes: requestBytes,
      failure_code: failure.code,
      failure_reason: failure.reason,
      failure_details: failure.details || null,
    })

    const wrappedError = new Error(failure.reason)
    wrappedError.name = "OllamaRequestError"
    wrappedError.failure_code = failure.code
    wrappedError.failure_reason = failure.reason
    wrappedError.failure_details = failure.details || null
    wrappedError.request_duration_ms = durationMs
    wrappedError.timeout_ms = timeoutMs
    wrappedError.endpoint = endpoint
    wrappedError.model = config.ollama?.model || null
    wrappedError.prompt_chars = promptChars
    wrappedError.request_bytes = requestBytes
    wrappedError.is_timeout = Boolean(failure.isTimeout)
    throw wrappedError
  }
}

async function checkOllamaHealth() {
  const endpoint = buildOllamaEndpoint(config.ollama?.baseUrl, config.ollama?.healthPath || "/api/tags")
  const timeoutMs = resolveOllamaHealthTimeoutMs()
  const startedAt = Date.now()

  try {
    const response = await requestJsonOverHttp({
      endpoint,
      method: "GET",
      timeoutMs,
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = new Error(`Ollama health check failed (${response.statusCode}): ${truncateForLog(response.bodyText)}`)
      error.name = "OllamaHttpError"
      error.statusCode = response.statusCode
      throw error
    }

    let payload = null
    try {
      payload = JSON.parse(response.bodyText || "{}")
    } catch (parseError) {
      const error = new Error(`Ollama health payload is not valid JSON: ${truncateForLog(parseError.message)}`)
      error.name = "OllamaParseError"
      error.failure_code = "bad_response_json"
      throw error
    }

    const availableModels = Array.isArray(payload?.models)
      ? payload.models
          .map((item) => normalizeText(item?.name || item?.model).toLowerCase())
          .filter(Boolean)
      : []
    const configuredModel = normalizeText(config.ollama?.model).toLowerCase()
    const modelAvailable = availableModels.includes(configuredModel)
    const durationMs = Date.now() - startedAt

    return {
      provider: "ollama",
      status: modelAvailable ? "ok" : "degraded",
      reachable: true,
      model_available: modelAvailable,
      model: config.ollama?.model || null,
      think: config.ollama?.think,
      force_json_output: Boolean(config.ollama?.forceJsonOutput),
      base_url: config.ollama?.baseUrl || null,
      chat_path: config.ollama?.chatPath || null,
      health_path: config.ollama?.healthPath || null,
      timeout_ms: timeoutMs,
      request_duration_ms: durationMs,
      available_models: availableModels.slice(0, 20),
      failure_reason: modelAvailable ? null : `Configured model "${config.ollama?.model}" was not found in local Ollama`,
    }
  } catch (error) {
    const failure = classifyOllamaError(error, { timeoutMs })
    return {
      provider: "ollama",
      status: "unhealthy",
      reachable: false,
      model_available: false,
      model: config.ollama?.model || null,
      think: config.ollama?.think,
      force_json_output: Boolean(config.ollama?.forceJsonOutput),
      base_url: config.ollama?.baseUrl || null,
      chat_path: config.ollama?.chatPath || null,
      health_path: config.ollama?.healthPath || null,
      timeout_ms: timeoutMs,
      request_duration_ms: Date.now() - startedAt,
      available_models: [],
      failure_code: failure.code,
      failure_reason: failure.reason,
      failure_details: failure.details || null,
    }
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
  const ollamaEndpoint = buildOllamaEndpoint(config.ollama?.baseUrl, config.ollama?.chatPath || "/api/chat")
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
          endpoint: ollamaEndpoint,
          model: config.ollama.model,
          timeout_ms: resolveOllamaTimeoutMs(),
          pipeline_version: INGESTION_PIPELINE_VERSION,
          skipped: true,
          skip_reason: "high_confidence_deterministic",
          attempts: [],
          raw_errors: [],
          failure_reason: null,
        },
        llm_failure_reason: null,
        analysis_source: "deterministic_bypass",
      }
    } catch (bypassError) {
      logger.warn("[v0] Deterministic bypass normalization failed; falling back to LLM", {
        template_path: templatePath,
        error_reason: bypassError.message,
      })
    }
  }

  const errors = []
  const attempts = []
  const maxAttempts = Math.max(1, Number(config.ollama?.maxAttempts || 2))
  const compactPromptThresholdChars = resolveCompactPromptThresholdChars()
  let useCompactPrompt = shouldUseCompactPromptInitially({
    rawStructure,
    deterministicSuggestion,
  })

  logger.info("[v0] Template LLM prompt strategy selected", {
    template_path: templatePath,
    ollama_model: config.ollama?.model || null,
    ollama_think: config.ollama?.think,
    compact_prompt_first_config: resolveCompactPromptFirst(),
    compact_prompt_threshold_chars: compactPromptThresholdChars,
    use_compact_prompt_initially: useCompactPrompt,
    raw_structure_chars: JSON.stringify(rawStructure || {}).length,
    deterministic_hint_chars: JSON.stringify(deterministicSuggestion || {}).length,
  })

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
      let parsed = null
      try {
        parsed = parseJsonObject(llmResponse.content)
      } catch (parseError) {
        parseError.failure_code = "bad_response_json"
        parseError.failure_reason = `Failed to parse LLM JSON output: ${truncateForLog(parseError.message)}`
        parseError.failure_details = truncateForLog(llmResponse.content, 800)
        parseError.request_duration_ms = Number(llmResponse?.meta?.request_duration_ms || null)
        parseError.timeout_ms = Number(llmResponse?.meta?.timeout_ms || resolveOllamaTimeoutMs())
        parseError.endpoint = llmResponse?.meta?.endpoint || ollamaEndpoint
        parseError.model = llmResponse?.meta?.model || config.ollama.model
        parseError.prompt_chars = Number(llmResponse?.meta?.prompt_chars || null)
        parseError.request_bytes = Number(llmResponse?.meta?.request_bytes || null)
        throw parseError
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("LLM output must be a JSON object")
      }

      const deterministicBaseConfig =
        deterministicSuggestion.suggested_config_json ||
        buildMinimalFallbackConfig(rawStructure.worksheets?.[0]?.name || "Cash Flow")

      let configCandidate = deterministicBaseConfig
      if (parsed.config_json && typeof parsed.config_json === "object" && !Array.isArray(parsed.config_json)) {
        configCandidate = parsed.config_json
      } else if (
        parsed.config_overrides &&
        typeof parsed.config_overrides === "object" &&
        !Array.isArray(parsed.config_overrides)
      ) {
        configCandidate = deepMergeConfig(deterministicBaseConfig, parsed.config_overrides)
      } else if (
        parsed.version ||
        parsed.layout_type ||
        parsed.sheet_name ||
        parsed.period_axis ||
        parsed.bucket_bindings
      ) {
        configCandidate = deepMergeConfig(deterministicBaseConfig, parsed)
      }

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
          endpoint: ollamaEndpoint,
          model: config.ollama.model,
          timeout_ms: resolveOllamaTimeoutMs(),
          pipeline_version: INGESTION_PIPELINE_VERSION,
          attempts,
          raw_errors: errors,
          failure_reason: null,
        },
        llm_failure_reason: null,
        analysis_source: "llm",
      }
    } catch (error) {
      const failureCode = normalizeFailureCode(error?.failure_code, "llm_error")
      const failureReason = normalizeText(error?.failure_reason || error?.message || "Unknown LLM ingestion error")
      errors.push(failureReason)
      attempts.push({
        attempt,
        status: "failed",
        error_code: failureCode,
        error_reason: failureReason,
        error_details: normalizeText(error?.failure_details || null) || null,
        timeout_ms: Number(error?.timeout_ms || resolveOllamaTimeoutMs()),
        request_duration_ms: Number(error?.request_duration_ms || null),
        request_bytes: Number(error?.request_bytes || null),
        endpoint: error?.endpoint || ollamaEndpoint,
        model: error?.model || config.ollama.model,
      })
      logger.warn(`[v0] Template LLM analysis attempt ${attempt} failed`, {
        template_path: templatePath,
        failure_code: failureCode,
        failure_reason: failureReason,
        ollama_endpoint: error?.endpoint || ollamaEndpoint,
        ollama_model: error?.model || config.ollama.model,
        ollama_timeout_ms: Number(error?.timeout_ms || resolveOllamaTimeoutMs()),
        request_duration_ms: Number(error?.request_duration_ms || null),
        request_bytes: Number(error?.request_bytes || null),
        failure_details: normalizeText(error?.failure_details || null) || null,
      })
      if ((Boolean(error?.is_timeout) || isTimeoutLikeError(failureReason)) && attempt < maxAttempts) {
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
      error_reason: fallbackError.message,
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
  const fallbackFailureReason = buildFallbackFailureReason({
    attempts,
    errors: normalizedErrors,
    autoApproveDeterministicFallback: autoApproveDeterministicFallback,
  })
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
      endpoint: ollamaEndpoint,
      model: config.ollama.model,
      timeout_ms: resolveOllamaTimeoutMs(),
      pipeline_version: INGESTION_PIPELINE_VERSION,
      attempts,
      raw_errors: errors,
      failure_reason: fallbackFailureReason,
    },
    llm_failure_reason: fallbackFailureReason,
    analysis_source: autoApproveDeterministicFallback ? "deterministic_fallback" : "fallback",
  }
}

module.exports = {
  PIPELINE_VERSION: INGESTION_PIPELINE_VERSION,
  computeTemplateHash,
  extractTemplateRawStructure,
  ingestTemplateSchema,
  checkOllamaHealth,
  __test: {
    buildOllamaEndpoint,
    classifyOllamaError,
    parseJsonObject,
    buildSystemPrompt,
    buildUserPrompt,
    detectTableCandidates,
    buildMinimalFallbackConfig,
  },
}
