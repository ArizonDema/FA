const path = require("path")
const CashFlowService = require("../../../services/cashFlow.service")
const TemplateFileLoader = require("../parsing/templateFileLoader.service")
const WorkbookParser = require("../parsing/workbookParser.service")

const CAS_CONFIG_VERSION = "cas_v1"

const SUMMARY_REQUIRED_SCALARS = ["fund_name", "period_start", "period_end"]
const SUMMARY_REQUIRED_COLUMNS = [
  "investor_name",
  "share_class",
  "beginning_capital",
  "contributions",
  "distributions",
  "ending_capital",
  "unfunded_commitment",
]
const STATEMENT_REQUIRED_SCALARS = [
  "fund_name",
  "investor_name",
  "share_class",
  "period_start",
  "period_end",
  "beginning_capital",
  "contributions",
  "distributions",
  "ending_capital",
  "commitment_amount",
  "called_capital",
  "paid_capital",
  "unfunded_commitment",
]
const ACTIVITY_REQUIRED_COLUMNS = ["date", "type", "amount"]

const FIELD_ALIASES = {
  fund_name: ["fund", "fund name", "partnership", "partnership name"],
  period_start: ["period start", "from date", "statement start", "start date"],
  period_end: ["period end", "to date", "statement end", "end date", "as of"],
  investor_name: ["investor", "investor name", "partner", "limited partner", "lp name"],
  investor_type: ["investor type", "partner type"],
  contact_email: ["email", "contact email", "investor email"],
  share_class: ["share class", "class", "interest class"],
  currency: ["currency", "reporting currency"],
  accounting_basis: ["accounting basis", "capital basis", "basis"],
  beginning_capital: ["beginning capital", "opening capital", "beginning capital account", "opening balance"],
  contributions: ["contributions", "capital contributions", "paid in capital"],
  distributions: ["distributions", "capital distributions", "withdrawals"],
  ending_capital: ["ending capital", "closing capital", "ending capital account", "closing balance"],
  commitment_amount: ["commitment", "commitment amount", "total commitment"],
  called_capital: ["called capital", "capital called", "drawn commitment"],
  paid_capital: ["paid capital", "capital paid", "funded capital"],
  outstanding_called_capital: ["outstanding calls", "outstanding called capital", "capital call receivable"],
  unfunded_commitment: ["unfunded commitment", "remaining commitment", "uncalled commitment"],
  ownership_percentage: ["ownership", "ownership %", "ownership percentage", "interest percentage"],
  rollforward_variance: ["rollforward variance", "reconciliation variance", "variance"],
  date: ["date", "transaction date", "activity date"],
  type: ["type", "transaction type", "activity type"],
  amount: ["amount", "gross amount", "transaction amount"],
  withholding: ["withholding", "tax withholding", "withholding amount"],
  net_amount: ["net amount", "net paid", "paid amount"],
  reference: ["reference", "reference id", "transaction reference"],
  memo: ["memo", "description", "notes"],
}

const SUMMARY_COLUMN_FIELDS = [
  ...SUMMARY_REQUIRED_COLUMNS,
  "commitment_amount",
  "called_capital",
  "paid_capital",
  "outstanding_called_capital",
  "ownership_percentage",
  "rollforward_variance",
  "currency",
]
const STATEMENT_SCALAR_FIELDS = Array.from(
  new Set([
    ...STATEMENT_REQUIRED_SCALARS,
    "investor_type",
    "contact_email",
    "currency",
    "accounting_basis",
    "outstanding_called_capital",
    "ownership_percentage",
    "rollforward_variance",
  ]),
)
const ACTIVITY_COLUMN_FIELDS = [
  ...ACTIVITY_REQUIRED_COLUMNS,
  "withholding",
  "net_amount",
  "reference",
  "memo",
]

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9% ]+/g, "")
    .replace(/\s+/g, " ")
}

function columnNumberToName(columnNumber) {
  let value = Number(columnNumber || 0)
  let result = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function normalizeBinding(binding) {
  if (!binding) return null
  if (typeof binding === "string") return { cell: binding.trim().toUpperCase(), mode: "value" }
  const cell = String(binding.cell || "").trim().toUpperCase()
  if (!cell) return null
  return {
    cell,
    mode: binding.mode === "preserve_formula" ? "preserve_formula" : "value",
  }
}

function normalizeColumns(columns) {
  return Object.fromEntries(
    Object.entries(columns || {})
      .map(([field, column]) => [field, String(column || "").trim().toUpperCase()])
      .filter(([, column]) => /^[A-Z]+$/.test(column)),
  )
}

function normalizeConfig(config = {}) {
  const summary = config.summary || {}
  const statement = config.statement || {}
  return {
    ...clone(config),
    version: CAS_CONFIG_VERSION,
    summary: {
      ...clone(summary),
      sheet_name: String(summary.sheet_name || "").trim(),
      scalar_bindings: Object.fromEntries(
        Object.entries(summary.scalar_bindings || {})
          .map(([field, binding]) => [field, normalizeBinding(binding)])
          .filter(([, binding]) => Boolean(binding)),
      ),
      table: {
        ...(clone(summary.table) || {}),
        data_start_row: Number(summary.table?.data_start_row || 0) || null,
        style_source_row:
          Number(summary.table?.style_source_row || summary.table?.data_start_row || 0) || null,
        columns: normalizeColumns(summary.table?.columns),
      },
      totals_bindings: Object.fromEntries(
        Object.entries(summary.totals_bindings || {})
          .map(([field, binding]) => [field, normalizeBinding(binding)])
          .filter(([, binding]) => Boolean(binding)),
      ),
    },
    statement: {
      ...clone(statement),
      prototype_sheet_name: String(statement.prototype_sheet_name || "").trim(),
      scalar_bindings: Object.fromEntries(
        Object.entries(statement.scalar_bindings || {})
          .map(([field, binding]) => [field, normalizeBinding(binding)])
          .filter(([, binding]) => Boolean(binding)),
      ),
      activity_table: {
        ...(clone(statement.activity_table) || {}),
        data_start_row: Number(statement.activity_table?.data_start_row || 0) || null,
        style_source_row:
          Number(statement.activity_table?.style_source_row || statement.activity_table?.data_start_row || 0) || null,
        columns: normalizeColumns(statement.activity_table?.columns),
      },
    },
    review_metadata: clone(config.review_metadata || {}),
  }
}

function findField(label, allowedFields) {
  const normalized = normalizeLabel(label)
  if (!normalized) return null
  return (
    allowedFields.find((field) =>
      (FIELD_ALIASES[field] || []).some((alias) => normalizeLabel(alias) === normalized),
    ) || null
  )
}

function worksheetRows(worksheet) {
  return Array.isArray(worksheet?.rows) ? worksheet.rows : []
}

function suggestTable(worksheet, allowedFields) {
  let best = null
  worksheetRows(worksheet).forEach((row) => {
    const columns = {}
    ;(row.cells || []).forEach((cell) => {
      const field = findField(cell.display_value ?? cell.raw_value, allowedFields)
      if (field && !columns[field]) columns[field] = columnNumberToName(cell.column_index)
    })
    const score = Object.keys(columns).length
    if (score >= 3 && (!best || score > best.score)) {
      best = {
        score,
        header_row: Number(row.row_index),
        data_start_row: Number(row.row_index) + 1,
        style_source_row: Number(row.row_index) + 1,
        columns,
      }
    }
  })
  return best
}

function suggestScalarBindings(worksheet, allowedFields, excludedRows = []) {
  const bindings = {}
  const excluded = new Set(excludedRows.filter(Boolean).map(Number))
  worksheetRows(worksheet).forEach((row) => {
    if (excluded.has(Number(row.row_index))) return
    ;(row.cells || []).forEach((cell) => {
      const field = findField(cell.display_value ?? cell.raw_value, allowedFields)
      if (!field || bindings[field]) return
      const targetColumn = Number(cell.column_index || 0) + 1
      const targetAddress = `${columnNumberToName(targetColumn)}${row.row_index}`
      const targetCell = (row.cells || []).find((candidate) => Number(candidate.column_index) === targetColumn)
      bindings[field] = {
        cell: targetAddress,
        mode: targetCell?.formula_text ? "preserve_formula" : "value",
      }
    })
  })
  return bindings
}

function scoreSheetName(name, terms) {
  const normalized = normalizeLabel(name)
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0)
}

function chooseSheets(worksheets) {
  const sheets = worksheets || []
  const summary = [...sheets].sort(
    (left, right) =>
      scoreSheetName(right.name, ["summary", "consolidated", "overview"]) -
      scoreSheetName(left.name, ["summary", "consolidated", "overview"]),
  )[0] || null
  const statementCandidates = sheets.filter((sheet) => sheet !== summary)
  const statement = [...statementCandidates].sort(
    (left, right) =>
      scoreSheetName(right.name, ["capital account", "statement", "investor", "prototype"]) -
      scoreSheetName(left.name, ["capital account", "statement", "investor", "prototype"]),
  )[0] || null
  return { summary, statement }
}

function missingFields(source, required) {
  return required.filter((field) => !source?.[field])
}

function anchor(key, label, missing, extraMessage = null) {
  const ready = missing.length === 0
  return {
    key,
    label,
    status: ready ? "ready" : "needs_review",
    message: ready
      ? `${label} is ready.`
      : extraMessage || `${label} still needs: ${missing.join(", ").replace(/_/g, " ")}.`,
  }
}

function evaluateReadiness(config = {}) {
  const normalized = normalizeConfig(config)
  const summarySheetMissing = normalized.summary.sheet_name ? [] : ["summary sheet"]
  const statementSheetMissing = normalized.statement.prototype_sheet_name ? [] : ["statement prototype sheet"]
  const sheetsAreDistinct =
    normalized.summary.sheet_name &&
    normalized.statement.prototype_sheet_name &&
    normalized.summary.sheet_name !== normalized.statement.prototype_sheet_name

  const anchors = [
    anchor("summary_sheet", "Summary sheet", summarySheetMissing),
    anchor(
      "summary_scalars",
      "Summary identity and period fields",
      missingFields(normalized.summary.scalar_bindings, SUMMARY_REQUIRED_SCALARS),
    ),
    anchor(
      "summary_table",
      "Summary statement table",
      [
        ...(normalized.summary.table.data_start_row ? [] : ["data start row"]),
        ...missingFields(normalized.summary.table.columns, SUMMARY_REQUIRED_COLUMNS),
      ],
    ),
    anchor("statement_sheet", "Statement prototype sheet", statementSheetMissing),
    anchor(
      "statement_scalars",
      "Statement identity and rollforward fields",
      missingFields(normalized.statement.scalar_bindings, STATEMENT_REQUIRED_SCALARS),
    ),
    anchor(
      "activity_table",
      "Statement activity table",
      [
        ...(normalized.statement.activity_table.data_start_row ? [] : ["data start row"]),
        ...missingFields(normalized.statement.activity_table.columns, ACTIVITY_REQUIRED_COLUMNS),
      ],
    ),
    anchor(
      "distinct_sheets",
      "Separate summary and statement sheets",
      sheetsAreDistinct ? [] : ["two different worksheet names"],
    ),
  ]
  const unresolved = anchors.filter((item) => item.status !== "ready")
  return {
    review_state: unresolved.length ? "needs_review" : "ready",
    can_activate: unresolved.length === 0,
    activation_block_reason: unresolved[0]?.message || null,
    required_anchors: unresolved.map((item) => item.key),
    anchor_statuses: anchors,
    supported_fields: {
      summary_scalars: SUMMARY_REQUIRED_SCALARS,
      summary_columns: SUMMARY_COLUMN_FIELDS,
      statement_scalars: STATEMENT_SCALAR_FIELDS,
      activity_columns: ACTIVITY_COLUMN_FIELDS,
    },
  }
}

function validateConfig(config = {}) {
  const normalized = normalizeConfig(config)
  if (String(config.version || CAS_CONFIG_VERSION).toLowerCase() !== CAS_CONFIG_VERSION) {
    throw new CashFlowService.CashFlowValidationError(`CAS template config version must be ${CAS_CONFIG_VERSION}`)
  }
  const allBindings = [
    ...Object.values(normalized.summary.scalar_bindings),
    ...Object.values(normalized.summary.totals_bindings),
    ...Object.values(normalized.statement.scalar_bindings),
  ]
  const invalid = allBindings.find((binding) => !/^[A-Z]+[1-9][0-9]*$/.test(binding.cell))
  if (invalid) {
    throw new CashFlowService.CashFlowValidationError(`Invalid CAS cell binding: ${invalid.cell}`)
  }
  const targetGroups = [
    [
      "summary scalar/total cells",
      [
        ...Object.values(normalized.summary.scalar_bindings),
        ...Object.values(normalized.summary.totals_bindings),
      ].map((binding) => binding.cell),
    ],
    ["statement scalar cells", Object.values(normalized.statement.scalar_bindings).map((binding) => binding.cell)],
    ["summary table columns", Object.values(normalized.summary.table.columns)],
    ["activity table columns", Object.values(normalized.statement.activity_table.columns)],
  ]
  targetGroups.forEach(([label, targets]) => {
    const duplicates = targets.filter((target, index) => targets.indexOf(target) !== index)
    if (duplicates.length) {
      throw new CashFlowService.CashFlowValidationError(
        `CAS ${label} contain duplicate targets: ${Array.from(new Set(duplicates)).join(", ")}`,
      )
    }
  })
  if (
    normalized.summary.sheet_name &&
    normalized.statement.prototype_sheet_name &&
    normalized.summary.sheet_name === normalized.statement.prototype_sheet_name
  ) {
    throw new CashFlowService.CashFlowValidationError(
      "CAS summary and statement prototype must use different worksheets",
    )
  }
  return normalized
}

async function analyzeTemplate({ templatePath, sourceFileName }) {
  const file = TemplateFileLoader.load({ filePath: templatePath, sourceFileName })
  const structure = await WorkbookParser.parse(file)
  const worksheets = structure.worksheets || []
  const { summary, statement } = chooseSheets(worksheets)
  const summaryTable = summary ? suggestTable(summary, SUMMARY_COLUMN_FIELDS) : null
  const activityTable = statement ? suggestTable(statement, ACTIVITY_COLUMN_FIELDS) : null
  const config = normalizeConfig({
    version: CAS_CONFIG_VERSION,
    summary: {
      sheet_name: summary?.name || "",
      scalar_bindings: summary
        ? suggestScalarBindings(summary, SUMMARY_REQUIRED_SCALARS, [summaryTable?.header_row])
        : {},
      table: summaryTable || {},
      totals_bindings: {},
    },
    statement: {
      prototype_sheet_name: statement?.name || "",
      scalar_bindings: statement
        ? suggestScalarBindings(statement, STATEMENT_SCALAR_FIELDS, [activityTable?.header_row])
        : {},
      activity_table: activityTable || {},
    },
  })
  const review = evaluateReadiness(config)
  const worksheetCount = worksheets.length
  const mappedCount =
    Object.keys(config.summary.scalar_bindings).length +
    Object.keys(config.summary.table.columns).length +
    Object.keys(config.statement.scalar_bindings).length +
    Object.keys(config.statement.activity_table.columns).length
  return {
    detected_layout_type: worksheetCount > 1 ? "sectioned" : "freeform",
    confidence: Math.min(0.99, 0.35 + mappedCount * 0.025),
    suggested_config_json: config,
    raw_structure_json: structure,
    source_file_sha256: file.source_file_sha256,
    needs_human_review: !review.can_activate,
    required_anchors: review.required_anchors,
    issues: review.anchor_statuses
      .filter((item) => item.status !== "ready")
      .map((item) => item.message),
    analysis_source: "deterministic_cas_aliases",
    llm_meta_json: null,
    source_file_name: sourceFileName || path.basename(templatePath),
    review,
  }
}

module.exports = {
  CAS_CONFIG_VERSION,
  SUMMARY_REQUIRED_SCALARS,
  SUMMARY_REQUIRED_COLUMNS,
  STATEMENT_REQUIRED_SCALARS,
  ACTIVITY_REQUIRED_COLUMNS,
  SUMMARY_COLUMN_FIELDS,
  STATEMENT_SCALAR_FIELDS,
  ACTIVITY_COLUMN_FIELDS,
  normalizeConfig,
  validateConfig,
  evaluateReadiness,
  analyzeTemplate,
  _private: {
    normalizeLabel,
    findField,
    suggestTable,
    suggestScalarBindings,
    chooseSheets,
  },
}
