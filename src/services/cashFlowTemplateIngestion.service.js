const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const http = require("http")
const https = require("https")
const config = require("../config/app")
const logger = require("../config/logger")
const CashFlowService = require("./cashFlow.service")
const CashFlowConcepts = require("./cashFlowConcepts.service")
const { readWorkbookFromFile } = require("../utils/excelWorkbook.util")
const LlmSkillPackService = require("../modules/llm/services/llmSkillPack.service")
const { resolveOllamaThinkForModel: resolveCompatibleOllamaThink } = require("../modules/llm/services/ollamaCompatibility.service")

const SUPPORTED_TEMPLATE_EXTENSIONS = [".xlsx"]
const MAX_SHEETS = 4
const MAX_ROWS = 60
const MAX_COLS = 24
const MAX_FORMULA_CELLS = 80
const MAX_HEADER_CANDIDATES = 10
const MAX_TABLE_CANDIDATES = 8
const MAX_ISSUES = 12
const INGESTION_PIPELINE_VERSION = "2026-04-25.layout-decision.v1"
const TEMPLATE_READING_SKILL_VERSION = "cash-flow-template-reading.v1"
const DEFAULT_OLLAMA_TIMEOUT_MS = 600000
const DEFAULT_OLLAMA_HEALTH_TIMEOUT_MS = 10000
const DEFAULT_TEMPLATE_ANALYSIS_TIMEOUT_MS = 120000
const DEFAULT_TEMPLATE_NUM_PREDICT = 600
const DEFAULT_TEMPLATE_NUM_CTX = 8192
const MAX_ERROR_DETAILS_LENGTH = 400
const SEMANTIC_REPAIR_MIN_SCORE = 0.78
const DEFAULT_INDIRECT_ROW_DEFINITIONS = [
  { semantic_key: "net_income", label: "Net Income", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "depreciation_amortization", label: "Depreciation & Amortization", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "change_in_receivables", label: "Change in Receivables", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "change_in_inventory", label: "Change in Inventory", role: "input", cash_direction: "neutral", required: false },
  { semantic_key: "change_in_payables", label: "Change in Payables", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "other_working_capital_changes", label: "Other Working Capital Changes", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations", role: "summary", cash_direction: "mixed", required: true },
  { semantic_key: "capital_expenditures", label: "Capital Expenditures", role: "input", cash_direction: "outflow", required: true },
  { semantic_key: "asset_sales", label: "Asset Sales", role: "input", cash_direction: "inflow", required: false },
  { semantic_key: "investing_cash_flow", label: "Cash Flow from Investing", role: "summary", cash_direction: "mixed", required: true },
  { semantic_key: "capital_contributions", label: "Capital Contributions", role: "input", cash_direction: "inflow", required: true },
  { semantic_key: "debt_issued", label: "Debt Issued", role: "input", cash_direction: "inflow", required: false },
  { semantic_key: "debt_repaid", label: "Debt Repaid", role: "input", cash_direction: "outflow", required: false },
  { semantic_key: "interest_paid", label: "Interest Paid", role: "input", cash_direction: "outflow", required: false },
  { semantic_key: "dividends_paid", label: "Dividends Paid", role: "input", cash_direction: "outflow", required: false },
  { semantic_key: "financing_cash_flow", label: "Cash Flow from Financing", role: "summary", cash_direction: "mixed", required: true },
  { semantic_key: "net_change_in_cash", label: "Net Change in Cash", role: "summary", cash_direction: "mixed", required: true },
  { semantic_key: "opening_cash", label: "Cash at Beginning", role: "input", cash_direction: "neutral", required: true },
  { semantic_key: "closing_cash", label: "Cash at End", role: "summary", cash_direction: "neutral", required: true },
]
const MONTH_LOOKUP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

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

function columnNameToNumber(columnName) {
  const letters = normalizeText(columnName).toUpperCase()
  if (!/^[A-Z]+$/.test(letters)) return null
  let column = 0
  for (let index = 0; index < letters.length; index += 1) {
    column = column * 26 + (letters.charCodeAt(index) - 64)
  }
  return column || null
}

function parseCellAddress(address) {
  const match = normalizeText(address).toUpperCase().match(/^([A-Z]+)([1-9][0-9]*)$/)
  if (!match) return null
  const column = columnNameToNumber(match[1])
  const row = Number.parseInt(match[2], 10)
  if (!column || !Number.isInteger(row)) return null
  return { row, column }
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

  const workbook = await readWorkbookFromFile({
    filePath: templatePath,
    label: "Cash flow template",
    ValidationErrorCtor: CashFlowService.CashFlowValidationError,
  })
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
    '  "config_overrides": { ... },',
    '  "config_json": { ... }',
    "}",
    "config_overrides is OPTIONAL and should be a compact JSON patch applied on top of the deterministic baseline config.",
    "config_json is OPTIONAL and should only be used when the deterministic baseline is materially wrong or missing required structure.",
    "Prefer config_overrides when a small correction is enough. Use config_json when row bindings, bucket bindings, statement method, or formula-safe write targets need a full replacement.",
    "Allowed config_overrides keys: sheet_name, layout_type, period_axis.orientation, statement_method.",
    "Do NOT include long arrays inside config_overrides (no period_bindings, bucket_bindings, row_bindings, opening_binding, closing_binding).",
    "config_json may include the full validated v3 payload, including indirect row_bindings when needed.",
    "The final merged config must stay compatible with cash-flow template v3 validator constraints:",
    'version="v3"; sheet_name; layout_type; statement_method("direct"|"indirect"); period_axis{orientation,row labels + period_bindings with same period_key set};',
    "bucket_bindings each include bucket_key,label,direction(inflow/outflow),fallback,rules,cells for every period_key;",
    "row_bindings each include semantic_key,label,role(input|summary),required,cells for every period_key;",
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
    "2) If deterministic baseline already looks right, return config_overrides: {} and omit config_json.",
    "3) Use config_overrides for small fixes. Use full config_json only when the baseline is materially wrong or incomplete.",
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
  const periodBindingCells = Array.isArray(configHint?.period_axis?.period_bindings)
    ? configHint.period_axis.period_bindings
        .map((item) => normalizeText(item?.cell || null))
        .filter(Boolean)
        .slice(0, 12)
    : []
  const openingCells = Array.isArray(configHint?.opening_binding?.cells)
    ? configHint.opening_binding.cells
        .map((item) => normalizeText(item?.cell || null))
        .filter(Boolean)
        .slice(0, 12)
    : []
  const closingCells = Array.isArray(configHint?.closing_binding?.cells)
    ? configHint.closing_binding.cells
        .map((item) => normalizeText(item?.cell || null))
        .filter(Boolean)
        .slice(0, 12)
    : []

  const bucketBindings = Array.isArray(configHint?.bucket_bindings)
    ? configHint.bucket_bindings.slice(0, 8).map((bucket) => ({
        bucket_key: normalizeText(bucket?.bucket_key || null) || null,
        label: normalizeText(bucket?.label || null) || null,
        direction: normalizeText(bucket?.direction || null) || null,
      }))
    : []
  const rowBindings = Array.isArray(configHint?.row_bindings)
    ? configHint.row_bindings.slice(0, 10).map((row) => ({
        semantic_key: normalizeText(row?.semantic_key || null) || null,
        label: normalizeText(row?.label || null) || null,
        role: normalizeText(row?.role || null) || null,
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
      statement_method: normalizeText(configHint?.statement_method || null) || null,
      period_orientation: normalizeText(configHint?.period_axis?.orientation || null) || null,
      period_labels: periodLabels,
      period_binding_cells: periodBindingCells,
      bucket_bindings: bucketBindings,
      row_bindings: rowBindings,
      has_opening_binding: Boolean(configHint?.opening_binding),
      has_closing_binding: Boolean(configHint?.closing_binding),
      opening_cells: openingCells,
      closing_cells: closingCells,
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
    "2) If baseline looks right, return config_overrides: {} and omit config_json.",
    "3) Use config_overrides for compact fixes; use config_json only when the baseline is materially wrong or incomplete.",
    "4) Detect opening/closing labels using business synonyms (cash at beginning/end, beginning cash, ending cash).",
    "5) Keep issues and required_anchors concise.",
  ].join("\n")
}

function buildLayoutDecisionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      detected_layout_type: { type: "string", enum: ["rows", "columns", "sectioned", "freeform"] },
      statement_method: { type: "string", enum: ["direct", "indirect"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      sheet_name: { type: "string" },
      period_orientation: { type: "string", enum: ["row", "column"] },
      period_header_row: { type: ["integer", "null"], minimum: 1 },
      period_label_column: { type: ["integer", "null"], minimum: 1 },
      first_period_column: { type: ["integer", "null"], minimum: 1 },
      last_period_column: { type: ["integer", "null"], minimum: 1 },
      opening_row: { type: ["integer", "null"], minimum: 1 },
      closing_row: { type: ["integer", "null"], minimum: 1 },
      issues: { type: "array", items: { type: "string" } },
      required_anchors: { type: "array", items: { type: "string" } },
    },
    required: [
      "detected_layout_type",
      "statement_method",
      "confidence",
      "sheet_name",
      "period_orientation",
      "period_header_row",
      "period_label_column",
      "first_period_column",
      "last_period_column",
      "opening_row",
      "closing_row",
      "issues",
      "required_anchors",
    ],
  }
}

function buildLayoutDecisionSystemPrompt() {
  return [
    LlmSkillPackService.renderSkillPack(TEMPLATE_READING_SKILL_VERSION),
    "You are a strict accounting workbook layout classifier.",
    "Return only the requested JSON layout decision.",
    "Do not return a full template config.",
    "Use null for unknown row or column indexes.",
  ].filter(Boolean).join("\n")
}

function buildLayoutDecisionUserPrompt({ rawStructure, deterministicSuggestion, previousErrors = [], compact = true }) {
  const workbookSectionTitle = compact ? "Compact workbook summary:" : "Extracted workbook structure:"
  const workbookPayload = compact ? summarizeRawStructureForCompactPrompt(rawStructure) : rawStructure
  return [
    "Choose the smallest layout decision needed for deterministic code to build a v3 cash-flow template config.",
    previousErrors.length ? `Avoid these previous failures: ${previousErrors.join(" | ")}` : "First layout decision attempt.",
    "Deterministic baseline summary:",
    JSON.stringify(buildDeterministicHint(deterministicSuggestion)),
    workbookSectionTitle,
    JSON.stringify(workbookPayload),
    "Decision hints:",
    "1) If the deterministic baseline has high confidence and concrete period_binding_cells, preserve those period cells unless a previous failure proves they are wrong.",
    "2) For Jan-Dec across columns, set period_orientation=column, period_header_row to that header row, first_period_column to Jan/M1, and last_period_column to Dec/M12.",
    "3) Do not include row label columns such as Section, Description, or Line Item in first_period_column/last_period_column.",
    "4) Do not include Total/YTD columns as period columns.",
    "5) period_label_column should point at the row label or line-item column, not the section/category column.",
    "6) Use opening_row and closing_row only when the row label clearly means opening or ending cash.",
    "7) Return JSON matching the provided schema exactly.",
  ].join("\n")
}

function buildLayoutDecisionMessages({ rawStructure, deterministicSuggestion, previousErrors = [], promptMode = "compact" }) {
  const compact = promptMode !== "full"
  return [
    { role: "system", content: buildLayoutDecisionSystemPrompt() },
    {
      role: "user",
      content: buildLayoutDecisionUserPrompt({
        rawStructure,
        deterministicSuggestion,
        previousErrors,
        compact,
      }),
    },
  ]
}

function normalizeLayoutDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Layout decision must be a JSON object")
  }
  const detectedLayout = normalizeText(value.detected_layout_type).toLowerCase()
  const statementMethod = normalizeText(value.statement_method || "direct").toLowerCase()
  const orientation = normalizeText(value.period_orientation).toLowerCase()
  const confidence = Number(value.confidence)

  return {
    detected_layout_type: ["rows", "columns", "sectioned", "freeform"].includes(detectedLayout)
      ? detectedLayout
      : "freeform",
    statement_method: statementMethod === "indirect" ? "indirect" : "direct",
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    sheet_name: normalizeText(value.sheet_name || null) || null,
    period_orientation: orientation === "row" ? "row" : "column",
    period_header_row: positiveIntegerOrNull(value.period_header_row),
    period_label_column: positiveIntegerOrNull(value.period_label_column),
    first_period_column: positiveIntegerOrNull(value.first_period_column),
    last_period_column: positiveIntegerOrNull(value.last_period_column),
    opening_row: positiveIntegerOrNull(value.opening_row),
    closing_row: positiveIntegerOrNull(value.closing_row),
    issues: normalizeIssues(value.issues),
    required_anchors: normalizeRequiredAnchors(value.required_anchors),
  }
}

function deriveDeterministicColumnPeriodRange(deterministicSuggestion) {
  const configHint = deterministicSuggestion?.suggested_config_json || {}
  // Overall template confidence can be lowered by weak row semantics, but the
  // period axis may still be structurally obvious. Keep that evidence available
  // so an LLM layout decision cannot silently truncate a full-year template.
  if (Number(deterministicSuggestion?.confidence || 0) < 0.55) return null
  if (normalizeText(configHint?.period_axis?.orientation).toLowerCase() !== "column") return null

  const parsedBindings = Array.isArray(configHint?.period_axis?.period_bindings)
    ? configHint.period_axis.period_bindings
        .map((binding) => parseCellAddress(binding?.cell))
        .filter(Boolean)
    : []
  if (parsedBindings.length < 2) return null

  const rowCounts = parsedBindings.reduce((counts, binding) => {
    counts.set(binding.row, (counts.get(binding.row) || 0) + 1)
    return counts
  }, new Map())
  const [headerRow, countOnHeaderRow] = Array.from(rowCounts.entries()).sort((a, b) => b[1] - a[1])[0] || []
  if (!headerRow || countOnHeaderRow < 2) return null

  const columns = parsedBindings
    .filter((binding) => binding.row === headerRow)
    .map((binding) => binding.column)
    .sort((a, b) => a - b)
  if (columns.length < 2) return null

  return {
    sheet_name: normalizeText(configHint?.sheet_name || null) || null,
    period_header_row: headerRow,
    first_period_column: columns[0],
    last_period_column: columns[columns.length - 1],
    period_count: columns.length,
  }
}

function reconcileLayoutDecisionWithDeterministicBaseline({ layoutDecision, deterministicSuggestion }) {
  const deterministicRange = deriveDeterministicColumnPeriodRange(deterministicSuggestion)
  if (!deterministicRange) return layoutDecision
  if (layoutDecision.period_orientation !== "column") return layoutDecision
  if (
    deterministicRange.sheet_name &&
    layoutDecision.sheet_name &&
    normalizeText(layoutDecision.sheet_name) !== normalizeText(deterministicRange.sheet_name)
  ) {
    return layoutDecision
  }

  const llmFirst = Number(layoutDecision.first_period_column || 0)
  const llmLast = Number(layoutDecision.last_period_column || 0)
  const llmCount = llmFirst > 0 && llmLast >= llmFirst ? llmLast - llmFirst + 1 : 0
  if (llmCount >= deterministicRange.period_count) return layoutDecision

  return {
    ...layoutDecision,
    sheet_name: deterministicRange.sheet_name || layoutDecision.sheet_name,
    period_header_row: deterministicRange.period_header_row || layoutDecision.period_header_row,
    first_period_column: deterministicRange.first_period_column,
    last_period_column: deterministicRange.last_period_column,
  }
}

function positiveIntegerOrNull(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < 1) return null
  return numeric
}

function cellFromRow(row, column) {
  return (Array.isArray(row?.cells) ? row.cells : []).find((cell) => Number(cell?.col) === Number(column)) || null
}

function textFromRawCell(cell) {
  const value = cell?.value
  if (value === null || value === undefined) return ""
  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) return normalizeText(value.result)
    if (typeof value.text === "string") return normalizeText(value.text)
    if (value.formula) return normalizeText(value.result)
  }
  return normalizeText(value)
}

function isSummaryPeriodLabelText(value) {
  const text = normalizeText(value)
  if (!text) return false
  return /\b(total|ytd|annual)\b/i.test(text)
}

function isFormulaRawCell(cell) {
  return Boolean(cell?.value && typeof cell.value === "object" && cell.value.formula)
}

function isNumericRawCell(cell) {
  if (!cell || isFormulaRawCell(cell)) return false
  const value = cell.value
  if (typeof value === "number") return Number.isFinite(value)
  const text = textFromRawCell(cell).replace(/,/g, "")
  if (!text) return false
  return Number.isFinite(Number.parseFloat(text))
}

function parseLayoutPeriodLabel(label) {
  const text = normalizeText(label)
  if (!text || isSummaryPeriodLabelText(text)) return null
  const compact = text.toLowerCase().replace(/\./g, "").replace(/\s+/g, "")
  const monthIndexMatch = compact.match(/^(?:m|month)(0?[1-9]|1[0-2])$/)
  if (monthIndexMatch) {
    const month = Number.parseInt(monthIndexMatch[1], 10)
    return {
      label: text,
      period_key: `m${String(month).padStart(2, "0")}`,
      period_type: "monthly",
      month,
      quarter: Math.floor((month - 1) / 3) + 1,
      year: null,
    }
  }

  const monthToken = text.toLowerCase().split(/[^a-z0-9]+/).find((token) => MONTH_LOOKUP[token])
  if (monthToken) {
    const month = MONTH_LOOKUP[monthToken]
    const yearMatch = text.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : null
    return {
      label: text,
      period_key: `m${String(month).padStart(2, "0")}${year ? `_${year}` : ""}`,
      period_type: "monthly",
      month,
      quarter: Math.floor((month - 1) / 3) + 1,
      year,
    }
  }

  const quarterMatch = text.match(/\bq([1-4])\b/i)
  if (quarterMatch) {
    const quarter = Number.parseInt(quarterMatch[1], 10)
    return {
      label: text,
      period_key: `q${quarter}`,
      period_type: "quarterly",
      quarter,
      month: null,
      year: null,
    }
  }

  const yearMatch = text.match(/^(19|20)\d{2}$/)
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[0], 10)
    return {
      label: text,
      period_key: `y_${year}`,
      period_type: "yearly",
      month: null,
      quarter: null,
      year,
    }
  }

  return null
}

function isOpeningLabelText(value) {
  const text = normalizeText(value).toLowerCase()
  return (
    text.includes("opening balance") ||
    text.includes("opening cash") ||
    text.includes("cash at beginning") ||
    text.includes("beginning cash") ||
    text.includes("cash at start")
  )
}

function isClosingLabelText(value) {
  const text = normalizeText(value).toLowerCase()
  return (
    text.includes("closing balance") ||
    text.includes("closing cash") ||
    text.includes("cash at end") ||
    text.includes("ending cash") ||
    text.includes("cash ending")
  )
}

function shouldIgnoreLayoutBucketLabel(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return true
  return (
    text === "summary" ||
    text.includes("net cash") ||
    text.includes("free cash flow") ||
    text.includes("total") ||
    text.includes("balance") ||
    isOpeningLabelText(text) ||
    isClosingLabelText(text)
  )
}

function detectLayoutBucketDirection({ label, sectionLabel, cells }) {
  const text = normalizeText(`${sectionLabel || ""} ${label || ""}`).toLowerCase()
  if (
    text.includes("payment") ||
    text.includes("paid") ||
    text.includes("expense") ||
    text.includes("repayment") ||
    text.includes("dividend") ||
    text.includes("distribution") ||
    text.includes("capex") ||
    text.includes("expenditure") ||
    text.includes("purchase")
  ) {
    return "outflow"
  }
  const numericValues = (cells || [])
    .map((cell) => Number(String(textFromRawCell(cell)).replace(/,/g, "")))
    .filter(Number.isFinite)
  const negativeCount = numericValues.filter((value) => value < 0).length
  const positiveCount = numericValues.filter((value) => value > 0).length
  return negativeCount > positiveCount ? "outflow" : "inflow"
}

function normalizeConfigKey(value, fallback) {
  const key = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return key || fallback
}

function findLayoutWorksheet(rawStructure, layoutDecision) {
  const worksheets = Array.isArray(rawStructure?.worksheets) ? rawStructure.worksheets : []
  return (
    worksheets.find((item) => item.name === layoutDecision.sheet_name) ||
    worksheets.find((item) => normalizeText(item.name) === normalizeText(layoutDecision.sheet_name)) ||
    worksheets[0] ||
    null
  )
}

function findSampledRow(rows, rowNumber) {
  return (Array.isArray(rows) ? rows : []).find((row) => Number(row.row) === Number(rowNumber)) || null
}

function assertColumnWithinWorksheet(worksheet, column, label) {
  const columnCount = Number(worksheet?.column_count || 0)
  if (!Number.isInteger(Number(column)) || Number(column) < 1) {
    throw new Error(`Layout decision ${label} is not a positive column number`)
  }
  if (columnCount > 0 && Number(column) > columnCount) {
    throw new Error(`Layout decision ${label} ${column} is outside parsed worksheet column_count ${columnCount}`)
  }
}

function assertLayoutRowLabel({ rows, rowNumber, labelColumn, predicate, fieldName, expectedDescription }) {
  if (!rowNumber) return null
  const row = findSampledRow(rows, rowNumber)
  if (!row) {
    throw new Error(`Layout decision ${fieldName} ${rowNumber} was not present in parsed workbook rows`)
  }
  const labelText = textFromRawCell(cellFromRow(row, labelColumn))
  if (!predicate(labelText)) {
    throw new Error(
      `Layout decision ${fieldName} ${rowNumber} label "${labelText || "blank"}" does not look like ${expectedDescription}`,
    )
  }
  return row
}

function resolveEffectivePeriodLabelColumn({ headerRow, requestedLabelColumn, firstPeriodColumn }) {
  const requested = Number(requestedLabelColumn)
  const firstPeriod = Number(firstPeriodColumn)
  if (!Number.isInteger(firstPeriod) || firstPeriod <= 2) return requested

  const nearestPrePeriodColumn = firstPeriod - 1
  const nearestPrePeriodLabel = textFromRawCell(cellFromRow(headerRow, nearestPrePeriodColumn))
  if (!nearestPrePeriodLabel) return requested

  const requestedLabel = textFromRawCell(cellFromRow(headerRow, requested)).toLowerCase()
  const nearestLabel = nearestPrePeriodLabel.toLowerCase()
  const requestedLooksLikeSection = /\b(section|category|group|type)\b/i.test(requestedLabel)
  const nearestLooksLikeLineItem = /\b(line|item|description|account|name|label)\b/i.test(nearestLabel)

  if (requested < nearestPrePeriodColumn && (requestedLooksLikeSection || nearestLooksLikeLineItem)) {
    return nearestPrePeriodColumn
  }
  return requested
}

function validateLayoutDecisionPeriodRange({ worksheet, headerRow, firstColumn, lastColumn }) {
  assertColumnWithinWorksheet(worksheet, firstColumn, "first_period_column")
  assertColumnWithinWorksheet(worksheet, lastColumn, "last_period_column")
  if (firstColumn > lastColumn) {
    throw new Error("Layout decision first_period_column cannot be after last_period_column")
  }

  const scannedColumns = []
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const cell = cellFromRow(headerRow, column)
    const label = textFromRawCell(cell)
    if (!cell || !label) {
      scannedColumns.push({
        column,
        cell,
        label: "",
        parsed: null,
        address: cellAddress(headerRow.row, column),
      })
      continue
    }
    if (isSummaryPeriodLabelText(label)) {
      throw new Error(`Layout decision included summary period column ${cell.address || cellAddress(headerRow.row, column)} (${label})`)
    }
    const parsed = parseLayoutPeriodLabel(label)
    scannedColumns.push({
      column,
      cell,
      label,
      parsed,
      address: cell.address || cellAddress(headerRow.row, column),
    })
  }

  const firstParsedIndex = scannedColumns.findIndex((entry) => entry.parsed)
  const lastParsedIndex = scannedColumns.reduce((lastIndex, entry, index) => (entry.parsed ? index : lastIndex), -1)
  if (firstParsedIndex === -1) throw new Error("Layout decision did not identify any usable period labels")

  const invalidInteriorColumns = scannedColumns
    .slice(firstParsedIndex, lastParsedIndex + 1)
    .filter((entry) => !entry.parsed)
  if (invalidInteriorColumns.length) {
    const details = invalidInteriorColumns
      .map((entry) => `${entry.address} (${entry.label || "blank"})`)
      .join(", ")
    throw new Error(`Layout decision period range contains non-period columns between period labels: ${details}`)
  }

  const periodEntries = scannedColumns
    .slice(firstParsedIndex, lastParsedIndex + 1)
    .filter((entry) => entry.parsed)
    .map((entry) => ({
      ...entry.parsed,
      column: entry.column,
    }))
  if (!periodEntries.length) throw new Error("Layout decision did not identify any usable period labels")
  return periodEntries
}

function buildDirectColumnConfigFromLayoutDecision({ rawStructure, layoutDecision }) {
  if (layoutDecision.period_orientation !== "column") {
    throw new Error("Layout decision config builder currently supports column-oriented period axes")
  }
  if (layoutDecision.statement_method !== "direct") {
    throw new Error("Layout decision config builder currently supports direct statement layouts")
  }
  if (!layoutDecision.period_header_row || !layoutDecision.period_label_column) {
    throw new Error("Layout decision is missing period_header_row or period_label_column")
  }

  const worksheet = findLayoutWorksheet(rawStructure, layoutDecision)
  if (!worksheet) throw new Error("Layout decision did not match a workbook sheet")

  const rows = Array.isArray(worksheet.sampled_rows) ? worksheet.sampled_rows : []
  const headerRow = findSampledRow(rows, layoutDecision.period_header_row)
  if (!headerRow) throw new Error("Layout decision period_header_row was not present in sampled rows")
  assertColumnWithinWorksheet(worksheet, layoutDecision.period_label_column, "period_label_column")

  const firstColumn = layoutDecision.first_period_column || layoutDecision.period_label_column + 1
  const lastColumn = layoutDecision.last_period_column || firstColumn
  const periodEntries = validateLayoutDecisionPeriodRange({ worksheet, headerRow, firstColumn, lastColumn })
  const effectiveLabelColumn = resolveEffectivePeriodLabelColumn({
    headerRow,
    requestedLabelColumn: layoutDecision.period_label_column,
    firstPeriodColumn: periodEntries[0]?.column || firstColumn,
  })
  assertColumnWithinWorksheet(worksheet, effectiveLabelColumn, "effective_period_label_column")

  const periodLabels = periodEntries.map((entry, index) => ({
    period_key: normalizeConfigKey(entry.period_key, `period_${index + 1}`),
    label: entry.label || `Period ${index + 1}`,
    period_type: entry.period_type || "custom",
    month: entry.month || null,
    quarter: entry.quarter || null,
    year: entry.year || null,
  }))
  const periodBindings = periodEntries.map((entry, index) => ({
    period_key: periodLabels[index].period_key,
    label: periodLabels[index].label,
    cell: cellAddress(layoutDecision.period_header_row, entry.column),
  }))

  const rowsAfterHeader = rows.filter((row) => Number(row.row) > Number(layoutDecision.period_header_row))
  assertLayoutRowLabel({
    rows,
    rowNumber: layoutDecision.opening_row,
    labelColumn: effectiveLabelColumn,
    predicate: isOpeningLabelText,
    fieldName: "opening_row",
    expectedDescription: "opening cash",
  })
  assertLayoutRowLabel({
    rows,
    rowNumber: layoutDecision.closing_row,
    labelColumn: effectiveLabelColumn,
    predicate: isClosingLabelText,
    fieldName: "closing_row",
    expectedDescription: "closing cash",
  })
  const openingRow =
    layoutDecision.opening_row ||
    rowsAfterHeader.find((row) => isOpeningLabelText(textFromRawCell(cellFromRow(row, effectiveLabelColumn))))?.row ||
    null
  const closingRow =
    layoutDecision.closing_row ||
    rowsAfterHeader.find((row) => isClosingLabelText(textFromRawCell(cellFromRow(row, effectiveLabelColumn))))?.row ||
    null

  const openingCells = openingRow
    ? periodEntries.map((entry, index) => ({
        period_key: periodLabels[index].period_key,
        label: periodLabels[index].label,
        cell: cellAddress(openingRow, entry.column),
      }))
    : []
  const closingCells = closingRow
    ? periodEntries.map((entry, index) => ({
        period_key: periodLabels[index].period_key,
        label: periodLabels[index].label,
        cell: cellAddress(closingRow, entry.column),
      }))
    : []

  const seenBucketKeys = new Set()
  const bucketBindings = []
  rowsAfterHeader.forEach((row) => {
    if (row.row === openingRow || row.row === closingRow) return
    const label = textFromRawCell(cellFromRow(row, effectiveLabelColumn))
    if (shouldIgnoreLayoutBucketLabel(label)) return
    const periodCells = periodEntries.map((entry) => cellFromRow(row, entry.column))
    if (!periodCells.some((cell) => isNumericRawCell(cell))) return

    const sectionLabel =
      effectiveLabelColumn > 1
        ? textFromRawCell(cellFromRow(row, effectiveLabelColumn - 1))
        : null
    const bucketKeyBase = normalizeConfigKey(label, `bucket_${bucketBindings.length + 1}`)
    const duplicateCount = Array.from(seenBucketKeys).filter((key) => key === bucketKeyBase || key.startsWith(`${bucketKeyBase}_`)).length
    const bucketKey = duplicateCount ? `${bucketKeyBase}_${duplicateCount + 1}` : bucketKeyBase
    seenBucketKeys.add(bucketKey)

    bucketBindings.push({
      bucket_key: bucketKey,
      label,
      direction: detectLayoutBucketDirection({ label, sectionLabel, cells: periodCells }),
      fallback: /other|misc|uncategorized|remaining/i.test(label),
      rules: [],
      cells: periodEntries.map((entry, index) => ({
        period_key: periodLabels[index].period_key,
        label: periodLabels[index].label,
        cell: cellAddress(row.row, entry.column),
      })),
    })
  })
  if (!bucketBindings.length) throw new Error("Layout decision did not produce writable bucket rows")

  return {
    version: "v3",
    sheet_name: worksheet.name,
    layout_type: layoutDecision.detected_layout_type === "freeform" ? "columns" : layoutDecision.detected_layout_type,
    statement_method: "direct",
    period_granularity: inferLayoutGranularity(periodLabels),
    period_axis: {
      orientation: "column",
      labels: periodLabels,
      period_bindings: periodBindings,
    },
    period_resolution_rules: { custom_periods: [] },
    opening_binding: openingCells.length ? { cells: openingCells } : null,
    closing_binding: closingCells.length ? { cells: closingCells } : null,
    bucket_bindings: bucketBindings,
    row_bindings: [],
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

function inferLayoutGranularity(periodLabels) {
  const types = new Set((periodLabels || []).map((label) => label.period_type).filter(Boolean))
  if (types.size === 1) return Array.from(types)[0]
  if (types.has("custom")) return "custom"
  if (types.has("monthly")) return "monthly"
  if (types.has("quarterly")) return "quarterly"
  if (types.has("yearly")) return "yearly"
  return "custom"
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

function deepCollectChangedPaths(left, right, prefix = "", changed = []) {
  const leftIsObject = left && typeof left === "object"
  const rightIsObject = right && typeof right === "object"

  if (!leftIsObject || !rightIsObject) {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changed.push(prefix || "(root)")
    }
    return changed
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changed.push(prefix || "(root)")
    }
    return changed
  }

  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})])
  Array.from(keys)
    .sort()
    .forEach((key) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      deepCollectChangedPaths(left?.[key], right?.[key], nextPrefix, changed)
    })
  return changed
}

function summarizeLlmConfigContribution({ deterministicBaseConfig, finalConfig, parsedResponse }) {
  const returnedConfigJson =
    parsedResponse?.config_json && typeof parsedResponse.config_json === "object" && !Array.isArray(parsedResponse.config_json)
  const returnedConfigOverrides =
    parsedResponse?.config_overrides &&
    typeof parsedResponse.config_overrides === "object" &&
    !Array.isArray(parsedResponse.config_overrides)

  const changedPaths = deepCollectChangedPaths(deterministicBaseConfig || {}, finalConfig || {}).slice(0, 40)
  let appliedMode = "deterministic_passthrough"
  if (returnedConfigJson) {
    appliedMode = "config_json"
  } else if (returnedConfigOverrides) {
    appliedMode = "config_overrides"
  } else if (parsedResponse?.version || parsedResponse?.period_axis || parsedResponse?.bucket_bindings || parsedResponse?.row_bindings) {
    appliedMode = "legacy_full_payload"
  }

  return {
    applied_mode: appliedMode,
    config_changed: changedPaths.length > 0,
    changed_paths: changedPaths,
    returned_keys: Object.keys(parsedResponse || {}).sort(),
  }
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

function getIndirectRowDefinitions() {
  if (typeof CashFlowService.getIndirectRowDefinitions === "function") {
    const definitions = CashFlowService.getIndirectRowDefinitions()
    if (Array.isArray(definitions) && definitions.length) return definitions
  }
  return DEFAULT_INDIRECT_ROW_DEFINITIONS
}

function getIndirectDefinitionLookup() {
  return new Map(getIndirectRowDefinitions().map((definition) => [definition.semantic_key, definition]))
}

function getStatementMethodFromConfigCandidate(configCandidate) {
  return normalizeText(configCandidate?.statement_method || "direct").toLowerCase() === "indirect" ? "indirect" : "direct"
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null))
}

function buildConfigCandidateFromLayoutDecision({ rawStructure, layoutDecision, deterministicSuggestion }) {
  if (layoutDecision.statement_method === "direct") {
    return buildDirectColumnConfigFromLayoutDecision({
      rawStructure,
      layoutDecision,
    })
  }

  const deterministicConfig = deterministicSuggestion?.suggested_config_json || null
  if (getStatementMethodFromConfigCandidate(deterministicConfig) === "indirect") {
    return cloneJson(deterministicConfig)
  }

  throw new Error("Layout decision identified an indirect statement but no indirect template config was available")
}

function getConfigPeriodColumns(configCandidate) {
  return (configCandidate?.period_axis?.period_bindings || [])
    .map((binding) => {
      const parsed = parseCellAddress(binding?.cell)
      if (!parsed) return null
      return {
        period_key: binding.period_key,
        label: binding.label || binding.period_key,
        column: parsed.column,
      }
    })
    .filter(Boolean)
}

function rowLabelFromRawRow(row) {
  const cells = Array.isArray(row?.cells) ? row.cells : []
  const textCell = cells.find((cell) => {
    const text = textFromRawCell(cell)
    return text && !parseLayoutPeriodLabel(text)
  })
  return textFromRawCell(textCell || cells[0])
}

function summarizeRawRowsForSemanticRepair(rawStructure, configCandidate) {
  const worksheetName = configCandidate?.sheet_name || null
  const worksheets = Array.isArray(rawStructure?.worksheets) ? rawStructure.worksheets : []
  const worksheet =
    worksheets.find((item) => normalizeText(item?.name) === normalizeText(worksheetName)) ||
    worksheets[0] ||
    null
  const periodColumns = getConfigPeriodColumns(configCandidate)
  const rows = Array.isArray(worksheet?.sampled_rows) ? worksheet.sampled_rows : []

  return rows
    .map((row) => {
      const label = rowLabelFromRawRow(row)
      if (!label) return null
      const periodCells = periodColumns.map((period) => cellFromRow(row, period.column)).filter(Boolean)
      return {
        rowIndex: row.row,
        label,
        cellAddresses: (Array.isArray(row.cells) ? row.cells : []).map((cell) => cell.address).filter(Boolean).slice(0, 16),
        periodCells: periodCells.map((cell) => ({
          address: cell.address,
          value: textFromRawCell(cell),
          isFormula: isFormulaRawCell(cell),
        })),
        formulaCount: periodCells.filter((cell) => isFormulaRawCell(cell)).length,
        writableTargetCount: periodCells.filter((cell) => !isFormulaRawCell(cell)).length,
      }
    })
    .filter(Boolean)
    .slice(0, 80)
}

function findRawWorksheetForConfig(rawStructure, configCandidate) {
  const worksheetName = configCandidate?.sheet_name || null
  const worksheets = Array.isArray(rawStructure?.worksheets) ? rawStructure.worksheets : []
  return (
    worksheets.find((item) => normalizeText(item?.name) === normalizeText(worksheetName)) ||
    worksheets[0] ||
    null
  )
}

function findRawRowByNumber(worksheet, rowNumber) {
  return (Array.isArray(worksheet?.sampled_rows) ? worksheet.sampled_rows : []).find(
    (row) => Number(row.row) === Number(rowNumber),
  ) || null
}

function summarizeRawNumericDirection(cells = []) {
  const values = (Array.isArray(cells) ? cells : [])
    .map((cell) => Number(String(textFromRawCell(cell)).replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value !== 0)
  if (!values.length) return null
  const negativeCount = values.filter((value) => value < 0).length
  const positiveCount = values.filter((value) => value > 0).length
  if (negativeCount > positiveCount) return "outflow"
  if (positiveCount > negativeCount) return "inflow"
  return values.reduce((sum, value) => sum + value, 0) < 0 ? "outflow" : "inflow"
}

function summarizeConfigForSemanticRepair(configCandidate, rawStructure = null) {
  const worksheet = rawStructure ? findRawWorksheetForConfig(rawStructure, configCandidate) : null
  return {
    statement_method: configCandidate?.statement_method || null,
    sheet_name: configCandidate?.sheet_name || null,
    layout_type: configCandidate?.layout_type || null,
    period_count: Array.isArray(configCandidate?.period_axis?.labels) ? configCandidate.period_axis.labels.length : 0,
    period_bindings: (configCandidate?.period_axis?.period_bindings || []).map((binding) => ({
      period_key: binding.period_key,
      label: binding.label,
      cell: binding.cell,
    })),
    bucket_bindings: (configCandidate?.bucket_bindings || []).map((bucket) => ({
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      direction: bucket.direction,
      fallback: Boolean(bucket.fallback),
      semantic_key: bucket.semantic_key || null,
      semantic_confidence: Number(bucket.semantic_confidence || 0),
      semantic_source: bucket.semantic_source || null,
      first_cell: bucket.cells?.[0]?.cell || null,
      section_label: (() => {
        const firstCell = parseCellAddress(bucket.cells?.[0]?.cell)
        const row = firstCell ? findRawRowByNumber(worksheet, firstCell.row) : null
        if (!row || firstCell.column <= 1) return null
        return textFromRawCell(cellFromRow(row, firstCell.column - 2)) || textFromRawCell(cellFromRow(row, firstCell.column - 1)) || null
      })(),
      numeric_direction: (() => {
        const periodColumns = getConfigPeriodColumns(configCandidate).map((period) => period.column)
        const firstCell = parseCellAddress(bucket.cells?.[0]?.cell)
        const row = firstCell ? findRawRowByNumber(worksheet, firstCell.row) : null
        return row ? summarizeRawNumericDirection(periodColumns.map((column) => cellFromRow(row, column)).filter(Boolean)) : null
      })(),
    })),
    row_bindings: (configCandidate?.row_bindings || []).map((binding) => ({
      semantic_key: binding.semantic_key,
      label: binding.label,
      role: binding.role,
      required: Boolean(binding.required),
      first_cell: binding.cells?.[0]?.cell || null,
    })),
  }
}

function buildDirectSemanticRepairSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      bucketDecisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            bucketKey: { type: "string" },
            semanticKey: { type: "string" },
            direction: { type: "string", enum: ["inflow", "outflow"] },
            fallback: { type: "boolean" },
            llmScore: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            needsHumanReview: { type: "boolean" },
          },
          required: [
            "bucketKey",
            "semanticKey",
            "direction",
            "fallback",
            "llmScore",
            "reasoning",
            "evidence",
            "needsHumanReview",
          ],
        },
      },
      issues: { type: "array", items: { type: "string" } },
      requiredAnchors: { type: "array", items: { type: "string" } },
      needsHumanReview: { type: "boolean" },
    },
    required: ["bucketDecisions", "issues", "requiredAnchors", "needsHumanReview"],
  }
}

function buildSemanticRepairSchema(statementMethod = null) {
  if (normalizeText(statementMethod).toLowerCase() === "direct") return buildDirectSemanticRepairSchema()
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      bucketDecisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            bucketKey: { type: "string" },
            semanticKey: { type: "string" },
            direction: { type: "string", enum: ["inflow", "outflow"] },
            fallback: { type: "boolean" },
            llmScore: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            needsHumanReview: { type: "boolean" },
          },
          required: [
            "bucketKey",
            "semanticKey",
            "direction",
            "fallback",
            "llmScore",
            "reasoning",
            "evidence",
            "needsHumanReview",
          ],
        },
      },
      rowBindingDecisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            semanticKey: { type: "string" },
            rowIndex: { type: "integer", minimum: 1 },
            role: { type: "string", enum: ["input", "summary"] },
            llmScore: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            needsHumanReview: { type: "boolean" },
          },
          required: ["semanticKey", "rowIndex", "role", "llmScore", "reasoning", "evidence", "needsHumanReview"],
        },
      },
      issues: { type: "array", items: { type: "string" } },
      requiredAnchors: { type: "array", items: { type: "string" } },
      needsHumanReview: { type: "boolean" },
    },
    required: ["bucketDecisions", "rowBindingDecisions", "issues", "requiredAnchors", "needsHumanReview"],
  }
}

function isTemplateSemanticEnabled() {
  return config.mappingAssistance?.templateSemanticEnabled !== false
}

function shouldRunSemanticRepair({ configCandidate, deterministicSuggestion }) {
  const statementMethod = getStatementMethodFromConfigCandidate(configCandidate)
  const requiredAnchors = normalizeRequiredAnchors(deterministicSuggestion?.required_anchors)
  if (statementMethod === "indirect") return true
  const bucketBindings = Array.isArray(configCandidate?.bucket_bindings) ? configCandidate.bucket_bindings : []
  if (bucketBindings.some((bucket) => directBucketNeedsSemanticRepair(bucket))) return true
  return requiredAnchors.some((anchor) => ["bucket_targets", "row_bindings"].includes(anchor))
}

function directBucketNeedsSemanticRepair(bucket) {
  if (isTemplateSemanticEnabled() && !bucket?.semantic_key) return true
  const text = normalizeText(`${bucket?.label || ""} ${bucket?.bucket_key || ""}`).toLowerCase()
  if (!text) return true
  if (/^bucket [0-9]+$/.test(text)) return true

  const outflowSignal =
    /\b(payment|paid|expense|repayment|dividend|distribution|redemption|capex|expenditure|purchase|payroll|salary|salaries|wage|wages|benefit|rent|marketing|admin|tax|interest|supplier|vendor)\b/.test(text)
  const inflowSignal =
    /\b(receipt|receipts|proceeds|drawdown|borrowing|contribution|injection|funding|capital call|asset sale|refund|inflow|customer)\b/.test(text)

  if (bucket?.direction === "inflow" && outflowSignal && !inflowSignal) return true
  if (bucket?.direction === "outflow" && inflowSignal && !outflowSignal) return true
  if (bucket?.fallback && !/\b(other|misc|uncategorized|remaining|catch all|catch-all)\b/.test(text)) return true
  return false
}

function compactAllowedDirectConceptsForPrompt(buckets = []) {
  const directions = new Set(
    (Array.isArray(buckets) ? buckets : [])
      .map((bucket) => normalizeText(bucket?.direction).toLowerCase())
      .filter((direction) => direction === "inflow" || direction === "outflow"),
  )
  return CashFlowConcepts.getAllowedDirectConcepts()
    .filter((concept) => !directions.size || directions.has(concept.direction))
    .map((concept) => ({
      key: concept.key,
      direction: concept.direction,
      label: concept.label,
      hints: normalizeTextArray(concept.synonyms, 4),
    }))
}

function buildSemanticRepairMessages({
  rawStructure,
  configCandidate,
  layoutDecision,
  deterministicSuggestion,
  directBucketsOverride = null,
}) {
  const statementMethod = getStatementMethodFromConfigCandidate(configCandidate)
  const currentConfigSummary = summarizeConfigForSemanticRepair(configCandidate, rawStructure)
  const directBuckets = Array.isArray(directBucketsOverride) ? directBucketsOverride : currentConfigSummary.bucket_bindings
  const requestPayload =
    statementMethod === "direct"
      ? {
          statementMethod,
          layoutDecision: {
            detected_layout_type: layoutDecision?.detected_layout_type || null,
            statement_method: layoutDecision?.statement_method || null,
            confidence: Number(layoutDecision?.confidence || 0),
          },
          deterministicIssues: normalizeIssues(deterministicSuggestion?.issues),
          requiredAnchors: normalizeRequiredAnchors(deterministicSuggestion?.required_anchors),
          directBuckets,
          allowedDirectConcepts: compactAllowedDirectConceptsForPrompt(directBuckets),
        }
      : {
          statementMethod,
          layoutDecision,
          deterministicIssues: normalizeIssues(deterministicSuggestion?.issues),
          requiredAnchors: normalizeRequiredAnchors(deterministicSuggestion?.required_anchors),
          currentConfig: currentConfigSummary,
          templateRows: summarizeRawRowsForSemanticRepair(rawStructure, configCandidate),
          allowedIndirectRows: getIndirectRowDefinitions(),
        }

  const systemPrompt =
    statementMethod === "direct"
      ? [
          "You are a strict accounting semantic labeler for direct cash-flow template rows.",
          "For each directBuckets item, choose exactly one allowedDirectConcepts.key with the same direction.",
          "Use row label, section_label, numeric_direction, and concept hints. Do not invent keys or rows.",
          "Important meanings: buyer/client money=customer_receipts; odd/service receipts=other_operating_inflows; partner/vendor operating payouts=supplier_payments; people/staff cash=payroll; space commitments=rent_facilities; demand creation=growth/marketing=sales_marketing; back-office/platform/overhead=general_admin.",
          "Return concise JSON only. Evidence must quote the row label.",
        ].join("\n")
      : [
          LlmSkillPackService.renderSkillPack(TEMPLATE_READING_SKILL_VERSION),
          "You are a strict accounting template semantic repair engine.",
          "Use deterministic workbook cells as the source of truth; do not invent rows, cells, bucket keys, or semantic keys.",
          "For indirect templates, you may map existing workbook rows to allowedIndirectRows semantic keys.",
          "Only recommend a row binding when the row label and nearby evidence clearly match the semantic key.",
          "Never map formula-only period cells to an input row; mark those for human review instead.",
          "Return only JSON matching the schema.",
        ].filter(Boolean).join("\n")

  return {
    requestPayload,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(requestPayload) },
    ],
  }
}

function normalizeScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(1, numeric))
}

function normalizeTextArray(values = [], limit = 5) {
  const output = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    const item = normalizeText(value)
    if (!item || seen.has(item.toLowerCase())) return
    seen.add(item.toLowerCase())
    output.push(item)
  })
  return output.slice(0, limit)
}

function parseSemanticRepairResponse(responseObject, { configCandidate, rowSummaries }) {
  if (!responseObject || typeof responseObject !== "object" || Array.isArray(responseObject)) {
    throw new Error("Semantic repair response must be a JSON object")
  }

  const bucketLookup = new Map((configCandidate?.bucket_bindings || []).map((bucket) => [bucket.bucket_key, bucket]))
  const bucketKeys = new Set(bucketLookup.keys())
  const rowLookup = new Map((rowSummaries || []).map((row) => [Number(row.rowIndex), row]))
  const definitionLookup = getIndirectDefinitionLookup()

  const bucketDecisions = []
  ;(Array.isArray(responseObject.bucketDecisions) ? responseObject.bucketDecisions : []).forEach((item) => {
    const bucketKey = normalizeText(item?.bucketKey).toLowerCase()
    const score = normalizeScore(item?.llmScore)
    const direction = normalizeText(item?.direction).toLowerCase()
    if (!bucketKeys.has(bucketKey) || score === null || !["inflow", "outflow"].includes(direction)) return
    const bucket = bucketLookup.get(bucketKey)
    let semanticKey = CashFlowConcepts.normalizeDirectConceptKey(item?.semanticKey || item?.semantic_key || "")
    if (!semanticKey && bucket) {
      const inferred = CashFlowConcepts.bestDirectCashFlowConcept(
        `${bucket.label || ""} ${bucket.bucket_key || ""}`,
        direction,
      )
      semanticKey = inferred && Number(inferred.score || 0) >= 0.45 ? inferred.key : ""
    }
    const semanticConcept = semanticKey ? CashFlowConcepts.getDirectConcept(semanticKey) : null
    if (semanticKey && (!semanticConcept || semanticConcept.direction !== direction)) return
    bucketDecisions.push({
      bucketKey,
      semanticKey: semanticKey || null,
      direction,
      fallback: Boolean(item?.fallback),
      llmScore: score,
      reasoning: normalizeText(item?.reasoning || null) || null,
      evidence: normalizeTextArray(item?.evidence),
      needsHumanReview: Boolean(item?.needsHumanReview),
    })
  })

  const rowBindingDecisions = []
  ;(Array.isArray(responseObject.rowBindingDecisions) ? responseObject.rowBindingDecisions : []).forEach((item) => {
    const semanticKey = normalizeText(item?.semanticKey).toLowerCase()
    const rowIndex = Number(item?.rowIndex)
    const score = normalizeScore(item?.llmScore)
    const definition = definitionLookup.get(semanticKey)
    const row = rowLookup.get(rowIndex)
    if (!definition || !row || score === null) return
    rowBindingDecisions.push({
      semanticKey,
      rowIndex,
      role: normalizeText(item?.role).toLowerCase() === "summary" ? "summary" : "input",
      llmScore: score,
      reasoning: normalizeText(item?.reasoning || null) || null,
      evidence: normalizeTextArray(item?.evidence),
      needsHumanReview: Boolean(item?.needsHumanReview),
    })
  })

  return {
    bucketDecisions,
    rowBindingDecisions,
    issues: normalizeIssues(responseObject.issues),
    requiredAnchors: normalizeRequiredAnchors(responseObject.requiredAnchors),
    needsHumanReview: Boolean(responseObject.needsHumanReview),
  }
}

function buildCellsForRowBinding(configCandidate, rowIndex) {
  return getConfigPeriodColumns(configCandidate).map((period) => ({
    period_key: period.period_key,
    label: period.label,
    cell: cellAddress(rowIndex, period.column),
  }))
}

function rowIndexFromBinding(binding) {
  const firstCell = Array.isArray(binding?.cells) ? binding.cells[0]?.cell : null
  return parseCellAddress(firstCell)?.row || Number.MAX_SAFE_INTEGER
}

function effectiveDirectSemanticDecisionScore(decision, bucket) {
  const score = Number(decision?.llmScore || 0)
  if (score >= SEMANTIC_REPAIR_MIN_SCORE) return score
  const semanticKey = normalizeText(decision?.semanticKey || "")
  if (!semanticKey || decision?.needsHumanReview) return score
  const direction = normalizeText(decision?.direction || bucket?.direction || "").toLowerCase()
  const text = normalizeText([
    bucket?.label,
    bucket?.bucket_key,
    decision?.reasoning,
    ...(Array.isArray(decision?.evidence) ? decision.evidence : []),
  ].filter(Boolean).join(" "))
  const inferred = CashFlowConcepts.bestDirectCashFlowConcept(text, direction)
  if (inferred?.key === semanticKey && Number(inferred.score || 0) >= 0.45) {
    return Math.max(score, 0.86)
  }
  return score
}

function applySemanticRepair({ configCandidate, parsedRepair, rowSummaries }) {
  const nextConfig = cloneJson(configCandidate)
  const rowLookup = new Map((rowSummaries || []).map((row) => [Number(row.rowIndex), row]))
  const definitionLookup = getIndirectDefinitionLookup()
  const issues = []
  let appliedCount = 0
  const isIndirect = getStatementMethodFromConfigCandidate(nextConfig) === "indirect"
  let needsHumanReview = isIndirect ? Boolean(parsedRepair?.needsHumanReview) : false

  ;(parsedRepair?.bucketDecisions || []).forEach((decision) => {
    const bucket = (nextConfig.bucket_bindings || []).find((item) => item.bucket_key === decision.bucketKey)
    if (!bucket) return
    const effectiveScore = effectiveDirectSemanticDecisionScore(decision, bucket)
    if (decision.needsHumanReview || effectiveScore < SEMANTIC_REPAIR_MIN_SCORE) {
      needsHumanReview = true
      issues.push(`LLM bucket decision for "${decision.bucketKey}" needs review.`)
      return
    }
    if (bucket.direction !== decision.direction || Boolean(bucket.fallback) !== decision.fallback) {
      bucket.direction = decision.direction
      bucket.fallback = decision.fallback
      appliedCount += 1
    }
    if (decision.semanticKey && bucket.semantic_key !== decision.semanticKey) {
      bucket.semantic_key = decision.semanticKey
      bucket.semantic_confidence = Number(effectiveScore || 0)
      bucket.semantic_source = "llm_semantic"
      bucket.semantic_evidence = decision.evidence || []
      appliedCount += 1
    } else if (decision.semanticKey) {
      bucket.semantic_confidence = Math.max(Number(bucket.semantic_confidence || 0), Number(effectiveScore || 0))
      bucket.semantic_source = bucket.semantic_source || "llm_semantic"
      bucket.semantic_evidence = bucket.semantic_evidence || decision.evidence || []
    }
  })

  if (isIndirect) {
    const bindingsByKey = new Map((nextConfig.row_bindings || []).map((binding) => [binding.semantic_key, binding]))

    ;(parsedRepair?.rowBindingDecisions || []).forEach((decision) => {
      const definition = definitionLookup.get(decision.semanticKey)
      const row = rowLookup.get(decision.rowIndex)
      if (!definition || !row) return
      if (decision.needsHumanReview || decision.llmScore < SEMANTIC_REPAIR_MIN_SCORE) {
        needsHumanReview = true
        issues.push(`LLM row binding decision for "${decision.semanticKey}" needs review.`)
        return
      }

      const definitionRole = definition.role === "summary" ? "summary" : "input"
      const role = definitionRole === "summary" ? "summary" : decision.role
      if (role === "input" && Number(row.formulaCount || 0) > 0 && Number(row.writableTargetCount || 0) === 0) {
        needsHumanReview = true
        issues.push(`Row "${row.label}" is formula-driven and cannot be auto-bound to input "${decision.semanticKey}".`)
        return
      }

      const binding = {
        semantic_key: definition.semantic_key,
        label: definition.label,
        role,
        required: Boolean(definition.required),
        cells: buildCellsForRowBinding(nextConfig, decision.rowIndex),
      }
      if (!binding.cells.length) return

      const previous = bindingsByKey.get(binding.semantic_key)
      const previousRow = previous ? rowIndexFromBinding(previous) : null
      bindingsByKey.set(binding.semantic_key, binding)
      if (!previous || Number(previousRow) !== Number(decision.rowIndex) || previous.role !== binding.role) {
        appliedCount += 1
      }

      if (binding.semantic_key === "opening_cash") {
        nextConfig.opening_binding = { cells: binding.cells }
      }
      if (binding.semantic_key === "closing_cash") {
        nextConfig.closing_binding = { cells: binding.cells }
      }
    })

    nextConfig.row_bindings = Array.from(bindingsByKey.values()).sort((left, right) => rowIndexFromBinding(left) - rowIndexFromBinding(right))
  } else if (isTemplateSemanticEnabled()) {
    const missingSemanticBuckets = (nextConfig.bucket_bindings || [])
      .filter((bucket) => !bucket.fallback && !bucket.semantic_key)
      .map((bucket) => bucket.bucket_key)
    if (missingSemanticBuckets.length) {
      needsHumanReview = true
      issues.push(`LLM did not provide canonical semantic labels for direct buckets: ${missingSemanticBuckets.join(", ")}.`)
    }
  }

  const repairIssues = filterSupersededDirectSemanticIssues(parsedRepair?.issues, nextConfig)
  const repairRequiredAnchors = filterSupersededDirectSemanticAnchors(parsedRepair?.requiredAnchors, nextConfig)
  if (repairIssues.length || repairRequiredAnchors.length) {
    needsHumanReview = true
  }

  return {
    config: nextConfig,
    appliedCount,
    issues: normalizeIssues([...repairIssues, ...issues]),
    requiredAnchors: repairRequiredAnchors,
    needsHumanReview,
  }
}

function filterSupersededDeterministicIssues(issues, configCandidate) {
  const semanticEvaluation = evaluateSemanticCompleteness(configCandidate)
  return normalizeIssues(issues).filter((issue) => {
    if (/missing required indirect row bindings/i.test(issue)) {
      return semanticEvaluation.missingRequired.length > 0
    }
    if (/missing required financing row bindings/i.test(issue)) {
      return semanticEvaluation.missingRequired.includes("capital_contributions")
    }
    return true
  })
}

function hasCompleteDirectSemanticBindings(configCandidate) {
  if (getStatementMethodFromConfigCandidate(configCandidate) !== "direct") return false
  const bucketBindings = Array.isArray(configCandidate?.bucket_bindings) ? configCandidate.bucket_bindings : []
  return bucketBindings.length > 0 && bucketBindings.every((bucket) => bucket.fallback || bucket.semantic_key)
}

function filterSupersededDirectSemanticIssues(issues, configCandidate) {
  const normalized = normalizeIssues(issues)
  if (!hasCompleteDirectSemanticBindings(configCandidate)) return normalized
  return normalized.filter((issue) => !/bucket labels need semantic review|bucket targets?|semantic labels?/i.test(issue))
}

function filterSupersededDirectSemanticAnchors(anchors, configCandidate) {
  const normalized = normalizeRequiredAnchors(anchors)
  if (!hasCompleteDirectSemanticBindings(configCandidate)) return normalized
  return normalized.filter((anchor) => anchor !== "bucket_targets")
}

function evaluateSemanticCompleteness(configCandidate) {
  const statementMethod = getStatementMethodFromConfigCandidate(configCandidate)
  if (statementMethod !== "indirect") {
    const bucketBindings = Array.isArray(configCandidate?.bucket_bindings) ? configCandidate.bucket_bindings : []
    const missingSemantic = isTemplateSemanticEnabled()
      ? bucketBindings.filter((bucket) => !bucket.fallback && !bucket.semantic_key).map((bucket) => bucket.bucket_key)
      : []
    const issues = bucketBindings.length
      ? missingSemantic.length
        ? [`Direct cash-flow bucket bindings missing canonical semantic labels: ${missingSemantic.join(", ")}`]
        : []
      : ["No direct cash-flow bucket bindings were detected."]
    return {
      issues,
      requiredAnchors: bucketBindings.length ? [] : ["bucket_targets"],
      needsHumanReview: issues.length > 0 || !bucketBindings.length,
      missingRequired: [],
    }
  }

  const definitionLookup = getIndirectDefinitionLookup()
  const rowBindings = Array.isArray(configCandidate?.row_bindings) ? configCandidate.row_bindings : []
  const boundKeys = new Set(rowBindings.map((binding) => binding.semantic_key))
  const missingRequired = getIndirectRowDefinitions()
    .filter((definition) => definition.required && !boundKeys.has(definition.semantic_key))
    .map((definition) => definition.semantic_key)
  const inputDirections = new Set(
    rowBindings
      .filter((binding) => binding.role === "input")
      .map((binding) => definitionLookup.get(binding.semantic_key)?.cash_direction)
      .filter((direction) => direction === "inflow" || direction === "outflow"),
  )
  const missingDirections = ["inflow", "outflow"].filter((direction) => !inputDirections.has(direction))

  const issues = []
  if (missingRequired.length) {
    issues.push(`Missing required indirect row bindings: ${missingRequired.join(", ")}`)
  }
  if (missingDirections.length) {
    issues.push(`Indirect template is missing writable ${missingDirections.join(" and ")} input rows.`)
  }

  return {
    issues,
    requiredAnchors: issues.length ? ["row_bindings"] : [],
    needsHumanReview: issues.length > 0,
    missingRequired,
  }
}

function calibrateLlmAnalysisConfidence({
  layoutDecision,
  configCandidate,
  semanticRepair,
  semanticEvaluation,
  finalIssues,
  finalRequiredAnchors,
}) {
  const base = Math.max(0, Math.min(1, Number(layoutDecision?.confidence || 0.5)))
  let confidence = base
  const statementMethod = getStatementMethodFromConfigCandidate(configCandidate)
  const directBucketCount = Array.isArray(configCandidate?.bucket_bindings) ? configCandidate.bucket_bindings.length : 0

  if (statementMethod === "direct" && directBucketCount >= 4) {
    confidence = Math.min(confidence, 0.9)
  }
  if (semanticRepair?.meta?.attempted && semanticRepair.meta.failure_code) {
    confidence = Math.min(confidence, 0.64)
  }
  if (semanticRepair?.needsHumanReview || semanticEvaluation?.needsHumanReview) {
    confidence = Math.min(confidence, 0.68)
  }
  if ((finalRequiredAnchors || []).length) {
    confidence = Math.min(confidence, 0.62)
  }
  if ((finalIssues || []).length) {
    confidence = Math.min(confidence, 0.72)
  }

  return Math.round(Math.max(0.05, confidence) * 100) / 100
}

function resolveTemplateSemanticBatchSize() {
  const parsed = Number(config.mappingAssistance?.templateSemanticBatchSize)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed))
  return 4
}

function chunkSemanticItems(items = [], size = 4) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildSemanticRepairOllamaOptions(statementMethod, optionsOverride = null) {
  const options = { ...(optionsOverride || {}) }
  if (normalizeText(statementMethod).toLowerCase() !== "direct") return options

  const configuredPredict = Number(options.num_predict)
  const directPredict = Number.isFinite(configuredPredict) && configuredPredict > 0 ? configuredPredict : DEFAULT_TEMPLATE_NUM_PREDICT
  options.num_predict = Math.min(Math.round(directPredict), 500)

  const configuredCtx = Number(options.num_ctx)
  if (!Number.isFinite(configuredCtx) || configuredCtx <= 0 || configuredCtx > 4096) {
    options.num_ctx = 4096
  }

  return options
}

function mergeSemanticRepairResponses(responses = []) {
  return responses.reduce(
    (merged, parsed) => ({
      bucketDecisions: [...merged.bucketDecisions, ...(parsed.bucketDecisions || [])],
      rowBindingDecisions: [...merged.rowBindingDecisions, ...(parsed.rowBindingDecisions || [])],
      issues: normalizeIssues([...merged.issues, ...(parsed.issues || [])]),
      requiredAnchors: normalizeRequiredAnchors([...merged.requiredAnchors, ...(parsed.requiredAnchors || [])]),
      needsHumanReview: Boolean(merged.needsHumanReview || parsed.needsHumanReview),
    }),
    {
      bucketDecisions: [],
      rowBindingDecisions: [],
      issues: [],
      requiredAnchors: [],
      needsHumanReview: false,
    },
  )
}

async function maybeApplySemanticRepair({
  rawStructure,
  configCandidate,
  layoutDecision,
  deterministicSuggestion,
  modelName,
  timeoutMs,
  optionsOverride,
}) {
  if (!shouldRunSemanticRepair({ configCandidate, deterministicSuggestion })) {
    return {
      config: configCandidate,
      meta: { attempted: false, applied_count: 0 },
      issues: [],
      requiredAnchors: [],
      needsHumanReview: false,
    }
  }

  const rowSummaries = summarizeRawRowsForSemanticRepair(rawStructure, configCandidate)
  const statementMethod = getStatementMethodFromConfigCandidate(configCandidate)
  const currentConfigSummary = summarizeConfigForSemanticRepair(configCandidate, rawStructure)
  const semanticOptions = buildSemanticRepairOllamaOptions(statementMethod, optionsOverride)
  const parsedResponses = []
  const llmMetas = []

  if (statementMethod === "direct") {
    const directBuckets = Array.isArray(currentConfigSummary.bucket_bindings) ? currentConfigSummary.bucket_bindings : []
    const chunks = chunkSemanticItems(directBuckets, resolveTemplateSemanticBatchSize())
    for (let index = 0; index < chunks.length; index += 1) {
      const prompt = buildSemanticRepairMessages({
        rawStructure,
        configCandidate,
        layoutDecision,
        deterministicSuggestion,
        directBucketsOverride: chunks[index],
      })
      const llmResponse = await callOllamaChat({
        messages: prompt.messages,
        format: buildSemanticRepairSchema(statementMethod),
        model: modelName,
        timeoutMs,
        optionsOverride: semanticOptions,
      })
      parsedResponses.push(
        parseSemanticRepairResponse(parseJsonObject(llmResponse.content), {
          configCandidate,
          rowSummaries,
        }),
      )
      llmMetas.push({
        ...llmResponse.meta,
        batch_index: index + 1,
        batch_count: chunks.length,
        bucket_count: chunks[index].length,
      })
    }
  } else {
    const prompt = buildSemanticRepairMessages({
      rawStructure,
      configCandidate,
      layoutDecision,
      deterministicSuggestion,
    })
    const llmResponse = await callOllamaChat({
      messages: prompt.messages,
      format: buildSemanticRepairSchema(statementMethod),
      model: modelName,
      timeoutMs,
      optionsOverride: semanticOptions,
    })
    parsedResponses.push(
      parseSemanticRepairResponse(parseJsonObject(llmResponse.content), {
        configCandidate,
        rowSummaries,
      }),
    )
    llmMetas.push(llmResponse.meta)
  }

  const parsed = mergeSemanticRepairResponses(parsedResponses)
  const applied = applySemanticRepair({
    configCandidate,
    parsedRepair: parsed,
    rowSummaries,
  })

  return {
    ...applied,
    meta: {
      attempted: true,
      applied_count: applied.appliedCount,
      response: parsed,
      llm_meta: {
        ...(llmMetas[0] || {}),
        batches: llmMetas,
        schema_constrained: true,
      },
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

function resolveTemplateAnalysisTimeoutMs() {
  const parsed = Number(config.ollama?.templateAnalysisTimeoutMs)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return DEFAULT_TEMPLATE_ANALYSIS_TIMEOUT_MS
}

function resolveOllamaHealthTimeoutMs() {
  const parsed = Number(config.ollama?.healthTimeoutMs)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed)
  }
  return DEFAULT_OLLAMA_HEALTH_TIMEOUT_MS
}

function resolveTemplateNumPredict() {
  const templateValue = Number(config.ollama?.templateNumPredict)
  if (Number.isFinite(templateValue) && templateValue > 0) return Math.round(templateValue)
  const globalValue = Number(config.ollama?.numPredict)
  if (Number.isFinite(globalValue) && globalValue > 0) return Math.round(globalValue)
  return DEFAULT_TEMPLATE_NUM_PREDICT
}

function resolveTemplateNumCtx() {
  const templateValue = Number(config.ollama?.templateNumCtx)
  if (Number.isFinite(templateValue) && templateValue > 0) return Math.round(templateValue)
  const globalValue = Number(config.ollama?.numCtx)
  if (Number.isFinite(globalValue) && globalValue > 0) return Math.round(globalValue)
  return DEFAULT_TEMPLATE_NUM_CTX
}

function resolveTemplateTemperature() {
  const templateValue = Number(config.ollama?.templateTemperature)
  if (Number.isFinite(templateValue)) return Math.max(0, templateValue)
  const globalValue = Number(config.ollama?.temperature)
  if (Number.isFinite(globalValue)) return Math.max(0, globalValue)
  return 0
}

function buildTemplateOllamaOptions() {
  return {
    num_predict: resolveTemplateNumPredict(),
    num_ctx: resolveTemplateNumCtx(),
    temperature: resolveTemplateTemperature(),
  }
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

let activeOllamaRequests = 0
const ollamaRequestQueue = []

function resolveOllamaMaxConcurrency() {
  const parsed = Number(config.ollama?.maxConcurrency)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed))
  return 1
}

function pumpOllamaRequestQueue() {
  const maxConcurrency = resolveOllamaMaxConcurrency()
  while (activeOllamaRequests < maxConcurrency && ollamaRequestQueue.length > 0) {
    const resolve = ollamaRequestQueue.shift()
    activeOllamaRequests += 1
    let released = false
    resolve(() => {
      if (released) return
      released = true
      activeOllamaRequests = Math.max(0, activeOllamaRequests - 1)
      pumpOllamaRequestQueue()
    })
  }
}

function acquireOllamaSlot() {
  return new Promise((resolve) => {
    ollamaRequestQueue.push(resolve)
    pumpOllamaRequestQueue()
  })
}

function requestJsonOverHttp({ endpoint, method = "GET", body = null, timeoutMs, headers: extraHeaders = null }) {
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
      ...(extraHeaders || {}),
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

function getOllamaModelChain() {
  const models = []
  ;[config.ollama?.model, ...(Array.isArray(config.ollama?.modelCandidates) ? config.ollama.modelCandidates : [])].forEach(
    (model) => {
      const normalized = normalizeText(model)
      if (!normalized || models.includes(normalized)) return
      models.push(normalized)
    },
  )
  return models.length ? models : ["qwen3:14b"]
}

function resolveOllamaThinkForModel(modelName) {
  return resolveCompatibleOllamaThink(modelName, config.ollama?.think)
}

async function callOllamaChat({ messages, format = null, model = null, timeoutMs = null, optionsOverride = null }) {
  const endpoint = buildOllamaEndpoint(config.ollama?.baseUrl, config.ollama?.chatPath || "/api/chat")
  const requestTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Math.round(Number(timeoutMs))
    : resolveOllamaTimeoutMs()
  const numPredict = Number(config.ollama?.numPredict)
  const temperature = Number(config.ollama?.temperature)
  const options = {
    ...(Number.isFinite(numPredict) && numPredict > 0 ? { num_predict: Math.round(numPredict) } : {}),
    ...(Number.isFinite(temperature) ? { temperature: Math.max(0, temperature) } : {}),
    ...(optionsOverride || {}),
  }
  const requestPayload = {
    model: model || config.ollama.model,
    stream: false,
    think: resolveOllamaThinkForModel(model || config.ollama.model),
    ...(format ? { format } : config.ollama?.forceJsonOutput ? { format: "json" } : {}),
    messages,
    keep_alive: config.ollama?.keepAlive || "10m",
    options,
  }
  const promptChars = estimatePromptChars(messages)
  const requestBytes = Buffer.byteLength(JSON.stringify(requestPayload), "utf8")
  const releaseOllamaSlot = await acquireOllamaSlot()
  const startedAt = Date.now()

  logger.info("[v0] Ollama chat request started", {
    ollama_base_url: config.ollama?.baseUrl || null,
    ollama_endpoint: endpoint,
    ollama_model: requestPayload.model || null,
    ollama_timeout_ms: requestTimeoutMs,
    ollama_num_predict: options.num_predict || null,
    ollama_num_ctx: options.num_ctx || null,
    ollama_temperature: Number.isFinite(options.temperature) ? options.temperature : null,
    ollama_max_concurrency: resolveOllamaMaxConcurrency(),
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
      timeoutMs: requestTimeoutMs,
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
      ollama_timeout_ms: requestTimeoutMs,
      ollama_num_predict: options.num_predict || null,
      ollama_num_ctx: options.num_ctx || null,
      ollama_temperature: Number.isFinite(options.temperature) ? options.temperature : null,
      ollama_think: requestPayload.think,
      ollama_force_json_output: Boolean(config.ollama?.forceJsonOutput),
      request_duration_ms: durationMs,
      prompt_chars: promptChars,
      request_bytes: requestBytes,
    })

    return {
      content,
      meta: {
        model: payload?.model || requestPayload.model,
        done: payload?.done ?? true,
        eval_count: payload?.eval_count ?? null,
        total_duration: payload?.total_duration ?? null,
        endpoint,
        timeout_ms: requestTimeoutMs,
        request_duration_ms: durationMs,
        prompt_chars: promptChars,
        request_bytes: requestBytes,
        think: requestPayload.think,
        options,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const failure = classifyOllamaError(error, { timeoutMs: requestTimeoutMs })
    logger.warn("[v0] Ollama chat request failed", {
      ollama_base_url: config.ollama?.baseUrl || null,
      ollama_endpoint: endpoint,
      ollama_model: requestPayload.model || null,
      ollama_timeout_ms: requestTimeoutMs,
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
    wrappedError.timeout_ms = requestTimeoutMs
    wrappedError.endpoint = endpoint
    wrappedError.model = requestPayload.model || null
    wrappedError.prompt_chars = promptChars
    wrappedError.request_bytes = requestBytes
    wrappedError.is_timeout = Boolean(failure.isTimeout)
    throw wrappedError
  } finally {
    releaseOllamaSlot()
  }
}

async function callOpenAiStructuredChat({ messages, schema }) {
  if (!config.openaiLlm?.enabled || !config.openaiLlm?.apiKey) {
    const error = new Error("OpenAI fallback is not configured")
    error.failure_code = "openai_not_configured"
    throw error
  }

  const endpoint = buildOllamaEndpoint(config.openaiLlm.baseUrl || "https://api.openai.com", "/v1/chat/completions")
  const timeoutMs = Number(config.openaiLlm.timeoutMs || 180000)
  const startedAt = Date.now()
  const requestPayload = {
    model: config.openaiLlm.model || "gpt-5.1",
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "cash_flow_template_layout_decision",
        strict: true,
        schema,
      },
    },
  }

  const response = await requestJsonOverHttp({
    endpoint,
    method: "POST",
    body: requestPayload,
    timeoutMs,
    headers: {
      Authorization: `Bearer ${config.openaiLlm.apiKey}`,
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(`OpenAI fallback failed (${response.statusCode}): ${truncateForLog(response.bodyText)}`)
    error.failure_code = "openai_http_error"
    error.statusCode = response.statusCode
    throw error
  }

  const payload = JSON.parse(response.bodyText || "{}")
  const content = payload?.choices?.[0]?.message?.content || ""
  if (!content) {
    const error = new Error("OpenAI fallback returned an empty message")
    error.failure_code = "openai_empty_response"
    throw error
  }

  return {
    content,
    meta: {
      provider: "openai",
      model: payload?.model || requestPayload.model,
      endpoint,
      timeout_ms: timeoutMs,
      request_duration_ms: Date.now() - startedAt,
      prompt_chars: estimatePromptChars(messages),
      request_bytes: Buffer.byteLength(JSON.stringify(requestPayload), "utf8"),
      schema_constrained: true,
      skill_version: TEMPLATE_READING_SKILL_VERSION,
    },
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

function resolveDeterministicBypassThreshold() {
  const configured = Number(config.ollama?.deterministicBypassConfidence)
  if (!Number.isFinite(configured) || configured <= 0) return 0.9
  return configured
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

async function ingestTemplateSchema({ templatePath, sourceFileName, forceLlm = false }) {
  const ollamaEndpoint = buildOllamaEndpoint(config.ollama?.baseUrl, config.ollama?.chatPath || "/api/chat")
  const sourceHash = computeTemplateHash(templatePath)
  const deterministicSuggestion = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
  const rawStructure = await extractTemplateRawStructure({ templatePath, sourceFileName })
  const deterministicConfidence = Number(deterministicSuggestion.confidence || 0)
  const deterministicRequiredAnchors = normalizeRequiredAnchors(deterministicSuggestion.required_anchors)
  const deterministicBypassThreshold = resolveDeterministicBypassThreshold()

  if (!forceLlm && deterministicRequiredAnchors.length === 0 && deterministicConfidence >= deterministicBypassThreshold) {
    try {
      const normalizedDeterministicConfig = await normalizeConfigCandidate({
        configCandidate:
          deterministicSuggestion.suggested_config_json ||
          buildMinimalFallbackConfig(rawStructure.worksheets?.[0]?.name || "Cash Flow"),
        templatePath,
      })
      let finalDeterministicConfig = normalizedDeterministicConfig
      let semanticRepair = {
        config: normalizedDeterministicConfig,
        meta: { attempted: false, applied_count: 0 },
        issues: [],
        requiredAnchors: [],
        needsHumanReview: false,
      }
      const layoutDecision = {
        detected_layout_type: normalizedDeterministicConfig.layout_type || deterministicSuggestion.detected_layout_type || "freeform",
        statement_method: normalizedDeterministicConfig.statement_method || "direct",
        confidence: deterministicConfidence,
        issues: normalizeIssues(deterministicSuggestion.issues),
        required_anchors: deterministicRequiredAnchors,
      }
      if (isTemplateSemanticEnabled() && shouldRunSemanticRepair({ configCandidate: normalizedDeterministicConfig, deterministicSuggestion })) {
        try {
          const modelName = getOllamaModelChain()[0] || config.ollama?.model
          semanticRepair = await maybeApplySemanticRepair({
            rawStructure,
            configCandidate: normalizedDeterministicConfig,
            layoutDecision,
            deterministicSuggestion,
            modelName,
            timeoutMs: resolveTemplateAnalysisTimeoutMs(),
            optionsOverride: buildTemplateOllamaOptions(),
          })
        } catch (repairError) {
          semanticRepair = {
            config: normalizedDeterministicConfig,
            meta: {
              attempted: true,
              applied_count: 0,
              failure_code: normalizeFailureCode(repairError?.failure_code, "semantic_repair_failed"),
              failure_reason: normalizeText(repairError?.failure_reason || repairError?.message || "Semantic repair failed"),
            },
            issues: ["LLM semantic labeling failed; deterministic template bindings were preserved for human review."],
            requiredAnchors: [],
            needsHumanReview: true,
          }
        }
        finalDeterministicConfig = await normalizeConfigCandidate({
          configCandidate: semanticRepair.config,
          templatePath,
        })
      }
      const semanticEvaluation = evaluateSemanticCompleteness(finalDeterministicConfig)
      const finalIssues = normalizeIssues([
        ...filterSupersededDirectSemanticIssues(deterministicSuggestion.issues, finalDeterministicConfig),
        ...semanticRepair.issues,
        ...semanticEvaluation.issues,
      ])
      const finalRequiredAnchors = normalizeRequiredAnchors([
        ...filterSupersededDirectSemanticAnchors(deterministicRequiredAnchors, finalDeterministicConfig),
        ...semanticRepair.requiredAnchors,
        ...semanticEvaluation.requiredAnchors,
      ])
      const finalNeedsHumanReview =
        finalRequiredAnchors.length > 0 ||
        Boolean(semanticRepair.needsHumanReview) ||
        Boolean(semanticEvaluation.needsHumanReview) ||
        finalIssues.length > 0
      const finalConfidence =
        semanticRepair.meta?.attempted && (semanticRepair.meta.failure_code || finalNeedsHumanReview)
          ? Math.min(deterministicConfidence, 0.68)
          : deterministicConfidence

      logger.info("[v0] Template deterministic analysis bypassed LLM", {
        template_path: templatePath,
        deterministic_confidence: deterministicConfidence,
        deterministic_bypass_threshold: deterministicBypassThreshold,
        semantic_repair_attempted: Boolean(semanticRepair.meta?.attempted),
        period_count: finalDeterministicConfig?.period_axis?.labels?.length || 0,
        layout_type: finalDeterministicConfig?.layout_type || null,
        statement_method: finalDeterministicConfig?.statement_method || null,
      })

      return {
        source_file_sha256: sourceHash,
        raw_structure_json: rawStructure,
        detected_layout_type: finalDeterministicConfig.layout_type || deterministicSuggestion.detected_layout_type || "freeform",
        confidence: finalConfidence,
        issues: finalIssues,
        required_anchors: finalRequiredAnchors,
        suggested_config_json: finalDeterministicConfig,
        needs_human_review: finalNeedsHumanReview,
        llm_meta_json: {
          provider: "ollama",
          endpoint: ollamaEndpoint,
          model: config.ollama.model,
          timeout_ms: resolveTemplateAnalysisTimeoutMs(),
          pipeline_version: INGESTION_PIPELINE_VERSION,
          skill_version: TEMPLATE_READING_SKILL_VERSION,
          skipped: !semanticRepair.meta?.attempted,
          skip_reason: "high_confidence_deterministic",
          layout_skipped: true,
          semantic_repair: semanticRepair.meta,
          deterministic_bypass_threshold: deterministicBypassThreshold,
          attempts: [],
          raw_errors: [],
          failure_reason: null,
        },
        llm_failure_reason: null,
        analysis_source: semanticRepair.meta?.attempted ? "deterministic_bypass_semantic_llm" : "deterministic_bypass",
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
    force_llm: Boolean(forceLlm),
  })

  const layoutSchema = buildLayoutDecisionSchema()
  const layoutTimeoutMs = resolveTemplateAnalysisTimeoutMs()
  const templateOllamaOptions = buildTemplateOllamaOptions()
  const ollamaModels = getOllamaModelChain()

  for (const modelName of ollamaModels) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const promptMode = useCompactPrompt ? "compact" : "full"
      const layoutMessages = buildLayoutDecisionMessages({
        rawStructure,
        deterministicSuggestion,
        previousErrors: errors,
        promptMode,
      })
      try {
        const llmResponse = await callOllamaChat({
          messages: layoutMessages,
          format: layoutSchema,
          model: modelName,
          timeoutMs: layoutTimeoutMs,
          optionsOverride: templateOllamaOptions,
        })
        let parsed = null
        try {
          parsed = parseJsonObject(llmResponse.content)
        } catch (parseError) {
          parseError.failure_code = "bad_response_json"
          parseError.failure_reason = `Failed to parse LLM layout decision JSON: ${truncateForLog(parseError.message)}`
          parseError.failure_details = truncateForLog(llmResponse.content, 800)
          parseError.request_duration_ms = Number(llmResponse?.meta?.request_duration_ms || null)
          parseError.timeout_ms = Number(llmResponse?.meta?.timeout_ms || layoutTimeoutMs)
          parseError.endpoint = llmResponse?.meta?.endpoint || ollamaEndpoint
          parseError.model = llmResponse?.meta?.model || modelName
          parseError.prompt_chars = Number(llmResponse?.meta?.prompt_chars || null)
          parseError.request_bytes = Number(llmResponse?.meta?.request_bytes || null)
          parseError.prompt_mode = promptMode
          throw parseError
        }

        const layoutDecision = reconcileLayoutDecisionWithDeterministicBaseline({
          layoutDecision: normalizeLayoutDecision(parsed),
          deterministicSuggestion,
        })
        const configCandidate = buildConfigCandidateFromLayoutDecision({
          templatePath,
          rawStructure,
          layoutDecision,
          deterministicSuggestion,
        })
        const normalizedBaseConfig = await normalizeConfigCandidate({
          configCandidate,
          templatePath,
        })
        let semanticRepair = {
          config: normalizedBaseConfig,
          meta: { attempted: false, applied_count: 0 },
          issues: [],
          requiredAnchors: [],
          needsHumanReview: false,
        }
        try {
          semanticRepair = await maybeApplySemanticRepair({
            rawStructure,
            configCandidate: normalizedBaseConfig,
            layoutDecision,
            deterministicSuggestion,
            modelName,
            timeoutMs: layoutTimeoutMs,
            optionsOverride: templateOllamaOptions,
          })
        } catch (repairError) {
          semanticRepair = {
            config: normalizedBaseConfig,
            meta: {
              attempted: true,
              applied_count: 0,
              failure_code: normalizeFailureCode(repairError?.failure_code, "semantic_repair_failed"),
              failure_reason: normalizeText(repairError?.failure_reason || repairError?.message || "Semantic repair failed"),
            },
            issues: ["LLM semantic repair failed; deterministic semantic bindings were preserved."],
            requiredAnchors: [],
            needsHumanReview: true,
          }
        }
        const normalizedConfig = await normalizeConfigCandidate({
          configCandidate: semanticRepair.config,
          templatePath,
        })
        const semanticEvaluation = evaluateSemanticCompleteness(normalizedConfig)
        const finalIssues = normalizeIssues([
          ...filterSupersededDirectSemanticIssues(layoutDecision.issues, normalizedConfig),
          ...filterSupersededDirectSemanticIssues(
            filterSupersededDeterministicIssues(deterministicSuggestion.issues, normalizedConfig),
            normalizedConfig,
          ),
          ...semanticRepair.issues,
          ...semanticEvaluation.issues,
        ])
        const finalRequiredAnchors = normalizeRequiredAnchors([
          ...filterSupersededDirectSemanticAnchors(layoutDecision.required_anchors, normalizedConfig),
          ...semanticRepair.requiredAnchors,
          ...semanticEvaluation.requiredAnchors,
        ])
        const finalNeedsHumanReview =
          finalRequiredAnchors.length > 0 ||
          Boolean(semanticRepair.needsHumanReview) ||
          Boolean(semanticEvaluation.needsHumanReview) ||
          finalIssues.length > 0
        const finalConfidence = calibrateLlmAnalysisConfidence({
          layoutDecision,
          configCandidate: normalizedConfig,
          semanticRepair,
          semanticEvaluation,
          finalIssues,
          finalRequiredAnchors,
        })
        const contribution = summarizeLlmConfigContribution({
          deterministicBaseConfig: deterministicSuggestion.suggested_config_json || {},
          finalConfig: normalizedConfig,
          parsedResponse: {
            layout_decision: layoutDecision,
            semantic_repair: semanticRepair.meta,
          },
        })
        attempts.push({
          attempt,
          status: "success",
          prompt_mode: promptMode,
          meta: {
            ...llmResponse.meta,
            schema_constrained: true,
            skill_version: TEMPLATE_READING_SKILL_VERSION,
            prompt_mode: promptMode,
          },
        })

        return {
          source_file_sha256: sourceHash,
          raw_structure_json: rawStructure,
          detected_layout_type: normalizedConfig.layout_type || layoutDecision.detected_layout_type,
          confidence: finalConfidence,
          issues: finalIssues,
          required_anchors: finalRequiredAnchors,
          suggested_config_json: normalizedConfig,
          needs_human_review: finalNeedsHumanReview,
          llm_meta_json: {
            provider: "ollama",
            endpoint: ollamaEndpoint,
            model: llmResponse.meta?.model || modelName,
            timeout_ms: layoutTimeoutMs,
            pipeline_version: INGESTION_PIPELINE_VERSION,
            skill_version: TEMPLATE_READING_SKILL_VERSION,
            schema_constrained: true,
            prompt_mode: promptMode,
            ollama_options: templateOllamaOptions,
            layout_decision: layoutDecision,
            semantic_repair: semanticRepair.meta,
            contribution,
            attempts,
            raw_errors: errors,
            failure_reason: null,
          },
          llm_failure_reason: null,
          analysis_source: "llm_layout_decision",
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
          timeout_ms: Number(error?.timeout_ms || layoutTimeoutMs),
          request_duration_ms: Number(error?.request_duration_ms || null),
          request_bytes: Number(error?.request_bytes || null),
          endpoint: error?.endpoint || ollamaEndpoint,
          model: error?.model || modelName,
          prompt_mode: promptMode,
          skill_version: TEMPLATE_READING_SKILL_VERSION,
          schema_constrained: true,
        })
        logger.warn(`[v0] Template layout decision attempt ${attempt} failed`, {
          template_path: templatePath,
          failure_code: failureCode,
          failure_reason: failureReason,
          ollama_endpoint: error?.endpoint || ollamaEndpoint,
          ollama_model: error?.model || modelName,
          ollama_timeout_ms: Number(error?.timeout_ms || layoutTimeoutMs),
          prompt_mode: promptMode,
          request_duration_ms: Number(error?.request_duration_ms || null),
          request_bytes: Number(error?.request_bytes || null),
          failure_details: normalizeText(error?.failure_details || null) || null,
        })
        if ((Boolean(error?.is_timeout) || isTimeoutLikeError(failureReason)) && attempt < maxAttempts) {
          useCompactPrompt = true
        }
      }
    }
  }

  if (config.openaiLlm?.enabled && config.openaiLlm?.apiKey) {
    const promptMode = useCompactPrompt ? "compact" : "full"
    const layoutMessages = buildLayoutDecisionMessages({
      rawStructure,
      deterministicSuggestion,
      previousErrors: errors,
      promptMode,
    })
    try {
      const llmResponse = await callOpenAiStructuredChat({
        messages: layoutMessages,
        schema: layoutSchema,
      })
      const layoutDecision = reconcileLayoutDecisionWithDeterministicBaseline({
        layoutDecision: normalizeLayoutDecision(parseJsonObject(llmResponse.content)),
        deterministicSuggestion,
      })
      const configCandidate = buildConfigCandidateFromLayoutDecision({
        templatePath,
        rawStructure,
        layoutDecision,
        deterministicSuggestion,
      })
      const normalizedConfig = await normalizeConfigCandidate({
        configCandidate,
        templatePath,
      })
      const semanticEvaluation = evaluateSemanticCompleteness(normalizedConfig)
      const finalIssues = normalizeIssues([
        ...layoutDecision.issues,
        ...filterSupersededDeterministicIssues(deterministicSuggestion.issues, normalizedConfig),
        ...semanticEvaluation.issues,
      ])
      const finalRequiredAnchors = normalizeRequiredAnchors([
        ...layoutDecision.required_anchors,
        ...semanticEvaluation.requiredAnchors,
      ])
      const finalConfidence = calibrateLlmAnalysisConfidence({
        layoutDecision,
        configCandidate: normalizedConfig,
        semanticRepair: { meta: { attempted: false }, needsHumanReview: false },
        semanticEvaluation,
        finalIssues,
        finalRequiredAnchors,
      })
      attempts.push({
        attempt: attempts.length + 1,
        status: "success",
        prompt_mode: promptMode,
        meta: {
          ...llmResponse.meta,
          prompt_mode: promptMode,
        },
      })
      return {
        source_file_sha256: sourceHash,
        raw_structure_json: rawStructure,
        detected_layout_type: normalizedConfig.layout_type || layoutDecision.detected_layout_type,
        confidence: finalConfidence,
        issues: finalIssues,
        required_anchors: finalRequiredAnchors,
        suggested_config_json: normalizedConfig,
        needs_human_review: finalRequiredAnchors.length > 0 || finalIssues.length > 0,
        llm_meta_json: {
          provider: "openai",
          endpoint: llmResponse.meta.endpoint,
          model: llmResponse.meta.model,
          timeout_ms: llmResponse.meta.timeout_ms,
          pipeline_version: INGESTION_PIPELINE_VERSION,
          skill_version: TEMPLATE_READING_SKILL_VERSION,
          schema_constrained: true,
          prompt_mode: promptMode,
          layout_decision: layoutDecision,
          attempts,
          raw_errors: errors,
          failure_reason: null,
        },
        llm_failure_reason: null,
        analysis_source: "openai_layout_decision",
      }
    } catch (error) {
      const failureReason = normalizeText(error?.failure_reason || error?.message || "OpenAI layout decision failed")
      errors.push(failureReason)
      attempts.push({
        attempt: attempts.length + 1,
        status: "failed",
        error_code: normalizeFailureCode(error?.failure_code, "openai_layout_decision_failed"),
        error_reason: failureReason,
        endpoint: "openai",
        model: config.openaiLlm?.model || null,
        prompt_mode: promptMode,
        skill_version: TEMPLATE_READING_SKILL_VERSION,
        schema_constrained: true,
      })
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
      timeout_ms: layoutTimeoutMs,
      pipeline_version: INGESTION_PIPELINE_VERSION,
      skill_version: TEMPLATE_READING_SKILL_VERSION,
      schema_constrained: true,
      ollama_options: templateOllamaOptions,
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
    buildLayoutDecisionSchema,
    normalizeLayoutDecision,
    deriveDeterministicColumnPeriodRange,
    reconcileLayoutDecisionWithDeterministicBaseline,
    buildDirectColumnConfigFromLayoutDecision,
    buildConfigCandidateFromLayoutDecision,
    buildSemanticRepairSchema,
    summarizeRawRowsForSemanticRepair,
    parseSemanticRepairResponse,
    applySemanticRepair,
    shouldRunSemanticRepair,
    isTemplateSemanticEnabled,
    evaluateSemanticCompleteness,
    buildLayoutDecisionSystemPrompt,
    buildLayoutDecisionUserPrompt,
    buildLayoutDecisionMessages,
    buildTemplateOllamaOptions,
    resolveTemplateAnalysisTimeoutMs,
    resolveDeterministicBypassThreshold,
    resolveOllamaMaxConcurrency,
    resolveOllamaThinkForModel,
    detectTableCandidates,
    buildMinimalFallbackConfig,
  },
}
