const fs = require("fs")
const path = require("path")
const ExcelJS = require("exceljs")

const TB_HEADER_SPEC = {
  company: ["Company"],
  as_of_date: ["As of Date"],
  account: ["Account"],
  ending_debit: ["Ending Debit"],
  ending_credit: ["Ending Credit"],
}

const GL_HEADER_SPEC = {
  company: ["Company"],
  ledger_account: ["Ledger Account"],
  date: ["Date"],
  je_no: ["JE No"],
  description: ["Description"],
  entry_side: ["Entry Side"],
  debit: ["Debit"],
  credit: ["Credit"],
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_NAME_LOOKUP = {
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

const QUARTER_LOOKUP = {
  q1: 1,
  q2: 2,
  q3: 3,
  q4: 4,
}

class CashFlowValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = "CashFlowValidationError"
    this.details = details
  }
}

function ensureFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new CashFlowValidationError(`${label} file not found`)
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9 ]/g, "")
}

function readCellPrimitive(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value

  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) return value.result
    if (typeof value.text === "string") return value.text
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || "").join("")
    }
    if (value.hyperlink && value.text) return value.text
  }

  return value
}

function readCellText(value) {
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined) return ""
  if (primitive instanceof Date) {
    return primitive.toISOString().slice(0, 10)
  }
  return String(primitive).trim()
}

function toNumber(value) {
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined || primitive === "") return 0
  if (typeof primitive === "number") return Number.isFinite(primitive) ? primitive : 0
  if (typeof primitive === "string") {
    const cleaned = primitive.replace(/,/g, "").replace(/\s+/g, "")
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function parseDateValue(value, label, { allowNull = false } = {}) {
  const primitive = readCellPrimitive(value)
  if ((primitive === null || primitive === undefined || primitive === "") && allowNull) return null

  let parsed = null
  if (primitive instanceof Date) {
    parsed = new Date(primitive.getTime())
  } else if (typeof primitive === "number") {
    const excelEpochOffset = 25569
    parsed = new Date(Math.round((primitive - excelEpochOffset) * 86400 * 1000))
  } else {
    parsed = new Date(String(primitive))
  }

  if (!parsed || Number.isNaN(parsed.getTime())) {
    if (allowNull) return null
    throw new CashFlowValidationError(`${label} contains an invalid date value`)
  }

  return parsed
}

function extractHeaderLookup(row) {
  const lookup = new Map()
  const maxColumns = Math.max(row.cellCount || 0, row.actualCellCount || 0, 20)

  for (let col = 1; col <= maxColumns; col += 1) {
    const text = normalizeHeader(readCellText(row.getCell(col).value))
    if (!text) continue
    if (!lookup.has(text)) {
      lookup.set(text, col)
    }
  }

  return lookup
}

function findHeaderRowAndColumns(worksheet, headerSpec, fileLabel) {
  const maxRowsToScan = Math.min(Math.max(worksheet.rowCount, 1), 25)

  for (let rowIndex = 1; rowIndex <= maxRowsToScan; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const lookup = extractHeaderLookup(row)
    const columns = {}
    let matched = true

    for (const [key, aliases] of Object.entries(headerSpec)) {
      const foundAlias = aliases.find((alias) => lookup.has(normalizeHeader(alias)))
      if (!foundAlias) {
        matched = false
        break
      }
      columns[key] = lookup.get(normalizeHeader(foundAlias))
    }

    if (matched) {
      return { headerRow: rowIndex, columns }
    }
  }

  throw new CashFlowValidationError(
    `${fileLabel} header row is invalid. Expected columns: ${Object.values(headerSpec)
      .map((aliases) => aliases[0])
      .join(", ")}`,
  )
}

function parseMonthValue(value) {
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined || primitive === "") return null

  if (primitive instanceof Date) {
    return primitive.getMonth() + 1
  }

  if (typeof primitive === "number") {
    if (primitive >= 1 && primitive <= 12) return Math.trunc(primitive)
    return null
  }

  const normalized = normalizeText(primitive).replace(/\./g, "")
  if (!normalized) return null

  if (MONTH_NAME_LOOKUP[normalized]) return MONTH_NAME_LOOKUP[normalized]

  const tokens = normalized.split(/[\s/-]+/)
  for (const token of tokens) {
    if (MONTH_NAME_LOOKUP[token]) return MONTH_NAME_LOOKUP[token]
    const numeric = Number.parseInt(token, 10)
    if (numeric >= 1 && numeric <= 12) return numeric
  }

  return null
}

function normalizePeriodKey(value, fallback = "period") {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return key || fallback
}

function normalizeDateOnly(value) {
  const date = parseDateValue(value, "date")
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function formatIsoDate(date) {
  return normalizeDateOnly(date).toISOString().slice(0, 10)
}

function looksLikeCustomPeriodLabel(text) {
  const normalized = normalizeText(text)
  if (!normalized) return false
  if (shouldIgnoreBucketLabel(normalized)) return false
  if (/\b(period|p\d+|h1|h2|half|week|w\d+|fy|year|yr)\b/i.test(normalized)) return true
  if (/\d/.test(normalized)) return true
  return false
}

function parsePeriodToken(rawValue, options = {}) {
  const allowCustom = options.allowCustom !== false
  const primitive = readCellPrimitive(rawValue)
  if (primitive === null || primitive === undefined || primitive === "") return null

  if (primitive instanceof Date) {
    const month = primitive.getMonth() + 1
    const year = primitive.getFullYear()
    return {
      label: readCellText(rawValue) || MONTH_NAMES[month - 1],
      period_key: `m${String(month).padStart(2, "0")}_${year}`,
      period_type: "monthly",
      month,
      year,
      quarter: Math.floor((month - 1) / 3) + 1,
    }
  }

  const text = readCellText(rawValue)
  const normalized = normalizeText(text).replace(/\./g, "")
  if (!normalized) return null

  const month = parseMonthValue(rawValue)
  if (month) {
    const yearMatch = normalized.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : null
    return {
      label: text,
      period_key: `m${String(month).padStart(2, "0")}${year ? `_${year}` : ""}`,
      period_type: "monthly",
      month,
      year,
      quarter: Math.floor((month - 1) / 3) + 1,
    }
  }

  const quarterMatch = normalized.match(/(?:^|\b)q([1-4])(?:\s*(?:fy|fy|year|yr)?\s*(\d{2,4}))?(?:\b|$)/i)
  if (quarterMatch) {
    const quarter = Number.parseInt(quarterMatch[1], 10)
    let year = null
    if (quarterMatch[2]) {
      year = Number.parseInt(quarterMatch[2], 10)
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000
      }
    }
    return {
      label: text,
      period_key: `q${quarter}${year ? `_${year}` : ""}`,
      period_type: "quarterly",
      quarter,
      year,
    }
  }

  const compact = normalized.replace(/\s+/g, "")
  const monthIndexMatch = compact.match(/^(?:m|month)(0?[1-9]|1[0-2])$/i)
  if (monthIndexMatch) {
    const monthIndex = Number.parseInt(monthIndexMatch[1], 10)
    return {
      label: text,
      period_key: `m${String(monthIndex).padStart(2, "0")}`,
      period_type: "monthly",
      month: monthIndex,
      year: null,
      quarter: Math.floor((monthIndex - 1) / 3) + 1,
    }
  }

  const fyMatch = normalized.match(/(?:^|\b)fy\s*(\d{2,4})(?:\b|$)/i)
  if (fyMatch) {
    let year = Number.parseInt(fyMatch[1], 10)
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000
    }
    return {
      label: text,
      period_key: `y_${year}`,
      period_type: "yearly",
      year,
    }
  }

  const yearMatch = normalized.match(/^(19|20)\d{2}$/)
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[0], 10)
    return {
      label: text,
      period_key: `y_${year}`,
      period_type: "yearly",
      year,
    }
  }

  if (!allowCustom || !looksLikeCustomPeriodLabel(text)) return null

  return {
    label: text,
    period_key: normalizePeriodKey(text, "custom_period"),
    period_type: "custom",
  }
}

function inferGranularityFromLabels(periodLabels) {
  const types = new Set((periodLabels || []).map((item) => item.period_type))
  if (!types.size) return "custom"
  if (types.size === 1) return Array.from(types)[0]
  if (types.has("custom")) return "custom"
  if (types.has("monthly")) return "monthly"
  if (types.has("quarterly")) return "quarterly"
  if (types.has("yearly")) return "yearly"
  return "custom"
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA
}

function normalizeDateRange(dateStart, dateEnd) {
  const start = normalizeDateOnly(dateStart)
  const end = normalizeDateOnly(dateEnd)
  if (start > end) {
    throw new CashFlowValidationError("date_start must be before or equal to date_end")
  }
  return { start, end }
}

function resolveRunDateRange({ dateStart, dateEnd, preset, fiscalYear }) {
  if (dateStart && dateEnd) {
    return normalizeDateRange(dateStart, dateEnd)
  }

  if (fiscalYear) {
    const year = Number.parseInt(fiscalYear, 10)
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new CashFlowValidationError("fiscal_year must be a valid four-digit year")
    }
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31)),
    }
  }

  if (!preset) {
    throw new CashFlowValidationError("Provide date_start/date_end, preset, or fiscal_year")
  }

  const normalizedPreset = String(preset).trim().toUpperCase()
  const currentDate = new Date()
  const currentYear = currentDate.getUTCFullYear()

  if (normalizedPreset === "YTD") {
    return {
      start: new Date(Date.UTC(currentYear, 0, 1)),
      end: normalizeDateOnly(currentDate),
    }
  }

  if (normalizedPreset === "FY") {
    return {
      start: new Date(Date.UTC(currentYear, 0, 1)),
      end: new Date(Date.UTC(currentYear, 11, 31)),
    }
  }

  if (QUARTER_LOOKUP[normalizedPreset.toLowerCase()]) {
    const quarter = QUARTER_LOOKUP[normalizedPreset.toLowerCase()]
    const firstMonth = (quarter - 1) * 3
    return {
      start: new Date(Date.UTC(currentYear, firstMonth, 1)),
      end: new Date(Date.UTC(currentYear, firstMonth + 3, 0)),
    }
  }

  throw new CashFlowValidationError("Invalid preset. Use Q1, Q2, Q3, Q4, FY, or YTD.")
}

function isFormulaCell(cellValue) {
  return Boolean(cellValue && typeof cellValue === "object" && Object.prototype.hasOwnProperty.call(cellValue, "formula"))
}

function compareRuleScore(left, right) {
  if (!left) return 1
  if (!right) return -1

  if (left.priority !== right.priority) return left.priority - right.priority
  if (left.matchTypeRank !== right.matchTypeRank) return left.matchTypeRank - right.matchTypeRank
  if (left.patternLength !== right.patternLength) return right.patternLength - left.patternLength
  if (left.bucketIndex !== right.bucketIndex) return left.bucketIndex - right.bucketIndex
  return left.ruleIndex - right.ruleIndex
}

function allocateByWeights(totalAmount, weights) {
  const safeWeights = weights.map((weight) => Math.max(Number(weight || 0), 0))
  const totalWeight = safeWeights.reduce((sum, value) => sum + value, 0)
  if (totalWeight <= 0) return safeWeights.map(() => 0)

  const totalCents = Math.round(Number(totalAmount || 0) * 100)
  const weighted = safeWeights.map((weight, index) => {
    const exact = (weight / totalWeight) * totalCents
    const base = Math.floor(exact)
    const remainder = exact - base
    return { index, base, remainder }
  })

  let allocated = weighted.reduce((sum, item) => sum + item.base, 0)
  let remainderCents = totalCents - allocated

  weighted
    .slice()
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder
      return a.index - b.index
    })
    .forEach((item) => {
      if (remainderCents <= 0) return
      item.base += 1
      remainderCents -= 1
      allocated += 1
    })

  const output = new Array(weights.length).fill(0)
  weighted.forEach((item) => {
    output[item.index] = item.base / 100
  })
  return output
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

function cellAddressFromRowCol(rowNumber, columnNumber) {
  return `${columnNumberToName(columnNumber)}${rowNumber}`
}

function parseCellAddress(address) {
  const value = String(address || "").trim().toUpperCase()
  const match = value.match(/^([A-Z]+)(\d+)$/)
  if (!match) {
    throw new CashFlowValidationError(`Invalid cell address "${address}"`)
  }

  const letters = match[1]
  const row = Number.parseInt(match[2], 10)
  let col = 0
  for (let index = 0; index < letters.length; index += 1) {
    col = col * 26 + (letters.charCodeAt(index) - 64)
  }
  return { row, col, address: `${letters}${row}` }
}

function normalizeBucketCollection(inputBuckets, { requireColumnHeader = true } = {}) {
  if (!Array.isArray(inputBuckets) || inputBuckets.length === 0) {
    throw new CashFlowValidationError("Template config_json buckets must contain at least one bucket")
  }

  const seenKeys = new Set()
  const fallbackByDirection = { inflow: 0, outflow: 0 }
  return inputBuckets.map((bucket, bucketIndex) => {
    const bucketKey = String(bucket?.bucket_key || "").trim()
    const label = String(bucket?.label || "").trim()
    const direction = String(bucket?.direction || "").trim().toLowerCase()
    const fallback = Boolean(bucket?.fallback)
    const columnHeader = String(bucket?.column_header || "").trim()

    if (!bucketKey) throw new CashFlowValidationError(`Bucket #${bucketIndex + 1} is missing bucket_key`)
    if (seenKeys.has(bucketKey)) throw new CashFlowValidationError(`Bucket key "${bucketKey}" is duplicated`)
    seenKeys.add(bucketKey)
    if (!label) throw new CashFlowValidationError(`Bucket "${bucketKey}" is missing label`)
    if (!["inflow", "outflow"].includes(direction)) {
      throw new CashFlowValidationError(`Bucket "${bucketKey}" has invalid direction. Use "inflow" or "outflow"`)
    }
    if (requireColumnHeader && !columnHeader) {
      throw new CashFlowValidationError(`Bucket "${bucketKey}" is missing column_header`)
    }

    if (fallback) {
      fallbackByDirection[direction] += 1
      if (fallbackByDirection[direction] > 1) {
        throw new CashFlowValidationError(`Only one fallback bucket is allowed for ${direction}`)
      }
    }

    const rules = Array.isArray(bucket?.rules)
      ? bucket.rules.map((rule, ruleIndex) => {
          const matchType = String(rule?.match_type || "").trim().toLowerCase()
          const pattern = String(rule?.pattern || "").trim()
          const priorityRaw = rule?.priority
          const priority = Number.isFinite(Number(priorityRaw)) ? Number(priorityRaw) : 1000
          if (!["exact", "contains"].includes(matchType)) {
            throw new CashFlowValidationError(
              `Bucket "${bucketKey}" rule #${ruleIndex + 1} has invalid match_type. Use "exact" or "contains"`,
            )
          }
          if (!pattern) {
            throw new CashFlowValidationError(`Bucket "${bucketKey}" rule #${ruleIndex + 1} is missing pattern`)
          }
          return { match_type: matchType, pattern, priority }
        })
      : []

    return {
      bucket_key: bucketKey,
      label,
      direction,
      column_header: columnHeader || null,
      fallback,
      rules,
    }
  })
}

function validateLegacyTemplateConfig(input) {
  const sheetName = String(input.sheet_name || "").trim()
  const headerRow = Number.parseInt(input.header_row, 10)
  const monthColumnHeader = String(input.month_column_header || "").trim()
  const openingColumnHeader = String(input.opening_column_header || "").trim()
  const closingColumnHeader = String(input.closing_column_header || "").trim()

  if (!sheetName) throw new CashFlowValidationError("Template config_json.sheet_name is required")
  if (!Number.isInteger(headerRow) || headerRow <= 0) {
    throw new CashFlowValidationError("Template config_json.header_row must be a positive integer")
  }
  if (!monthColumnHeader) throw new CashFlowValidationError("Template config_json.month_column_header is required")
  if (!openingColumnHeader) throw new CashFlowValidationError("Template config_json.opening_column_header is required")
  if (!closingColumnHeader) throw new CashFlowValidationError("Template config_json.closing_column_header is required")

  const buckets = normalizeBucketCollection(input.buckets)
  return {
    version: "v1",
    sheet_name: sheetName,
    header_row: headerRow,
    month_column_header: monthColumnHeader,
    opening_column_header: openingColumnHeader,
    closing_column_header: closingColumnHeader,
    buckets,
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

function normalizeCellBindingEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new CashFlowValidationError(`${label} must contain 12 month/cell bindings`)
  }

  const byMonth = new Map()
  entries.forEach((entry) => {
    const monthIndex = Number.parseInt(entry?.month_index, 10)
    if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
      throw new CashFlowValidationError(`${label} has invalid month_index`)
    }
    const cellAddress = parseCellAddress(entry?.cell || "").address
    byMonth.set(monthIndex, {
      month_index: monthIndex,
      cell: cellAddress,
    })
  })

  if (byMonth.size !== 12) {
    throw new CashFlowValidationError(`${label} must include all 12 months`)
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month_index - b.month_index)
}

function normalizePeriodBindingEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new CashFlowValidationError(`${label} must contain at least one period/cell binding`)
  }

  const byKey = new Map()
  entries.forEach((entry, index) => {
    const periodKey = normalizePeriodKey(entry?.period_key, `period_${index + 1}`)
    const cellAddress = parseCellAddress(entry?.cell || "").address
    byKey.set(periodKey, {
      period_key: periodKey,
      cell: cellAddress,
      label: String(entry?.label || periodKey),
    })
  })

  return Array.from(byKey.values())
}

function normalizeMappingPolicy(input = {}) {
  const highThreshold = Number(input.high_confidence_threshold ?? 0.7)
  const lowThreshold = Number(input.low_confidence_threshold ?? 0.35)
  const normalized = {
    auto_create: input.auto_create !== false,
    high_confidence_threshold: Number.isFinite(highThreshold) ? highThreshold : 0.7,
    low_confidence_threshold: Number.isFinite(lowThreshold) ? lowThreshold : 0.35,
  }

  if (normalized.high_confidence_threshold < normalized.low_confidence_threshold) {
    throw new CashFlowValidationError("mapping_policy.high_confidence_threshold must be >= low_confidence_threshold")
  }

  return normalized
}

function normalizeWriterPolicy(input = {}) {
  return {
    preserve_formulas: input.preserve_formulas !== false,
    full_recalc_on_open: input.full_recalc_on_open !== false,
  }
}

function validateV2TemplateConfig(input) {
  const sheetName = String(input.sheet_name || "").trim()
  if (!sheetName) throw new CashFlowValidationError("Template config_json.sheet_name is required")

  const layoutType = String(input.layout_type || "").trim().toLowerCase()
  if (!["rows", "columns", "sectioned", "freeform"].includes(layoutType)) {
    throw new CashFlowValidationError("Template config_json.layout_type must be rows, columns, sectioned, or freeform")
  }

  const monthBindings = normalizeCellBindingEntries(input.month_bindings, "month_bindings")
  const openingBinding = {
    cells: normalizeCellBindingEntries(input.opening_binding?.cells, "opening_binding.cells"),
  }
  const closingBinding = {
    cells: normalizeCellBindingEntries(input.closing_binding?.cells, "closing_binding.cells"),
  }

  const buckets = normalizeBucketCollection(input.bucket_bindings || input.buckets, {
    requireColumnHeader: false,
  }).map((bucket, index) => {
    const providedBindingCells = input.bucket_bindings?.[index]?.cells || bucket.cells
    const bindingCells = normalizeCellBindingEntries(
      providedBindingCells,
      `bucket_bindings[${index}].cells`,
    )
    return {
      ...bucket,
      cells: bindingCells,
    }
  })

  return {
    version: "v2",
    sheet_name: sheetName,
    layout_type: layoutType,
    month_bindings: monthBindings,
    opening_binding: openingBinding,
    closing_binding: closingBinding,
    bucket_bindings: buckets,
    writer_policy: normalizeWriterPolicy(input.writer_policy),
    mapping_policy: normalizeMappingPolicy(input.mapping_policy),
  }
}

function validateV3TemplateConfig(input) {
  const sheetName = String(input.sheet_name || "").trim()
  if (!sheetName) throw new CashFlowValidationError("Template config_json.sheet_name is required")

  const layoutType = String(input.layout_type || "freeform").trim().toLowerCase()
  if (!["rows", "columns", "sectioned", "freeform"].includes(layoutType)) {
    throw new CashFlowValidationError("Template config_json.layout_type must be rows, columns, sectioned, or freeform")
  }

  const periodAxisInput = input.period_axis || {}
  const orientation = String(periodAxisInput.orientation || "").trim().toLowerCase()
  if (!["row", "column"].includes(orientation)) {
    throw new CashFlowValidationError("Template config_json.period_axis.orientation must be row or column")
  }

  const labels = Array.isArray(periodAxisInput.labels) ? periodAxisInput.labels : []
  if (!labels.length) {
    throw new CashFlowValidationError("Template config_json.period_axis.labels must contain at least one period")
  }

  const normalizedLabels = labels.map((label, index) => {
    const parsedToken = parsePeriodToken(label?.label || label?.period_key || "", { allowCustom: true })
    const periodKey = normalizePeriodKey(label?.period_key || parsedToken?.period_key, `period_${index + 1}`)
    const periodType = String(label?.period_type || parsedToken?.period_type || "custom").toLowerCase()
    return {
      period_key: periodKey,
      label: String(label?.label || parsedToken?.label || periodKey),
      period_type: ["monthly", "quarterly", "yearly", "custom"].includes(periodType) ? periodType : "custom",
      month: Number.isInteger(Number(label?.month)) ? Number(label.month) : parsedToken?.month || null,
      quarter: Number.isInteger(Number(label?.quarter)) ? Number(label.quarter) : parsedToken?.quarter || null,
      year: Number.isInteger(Number(label?.year)) ? Number(label.year) : parsedToken?.year || null,
    }
  })

  const periodBindings = normalizePeriodBindingEntries(
    periodAxisInput.period_bindings,
    "period_axis.period_bindings",
  )
  const labelKeys = new Set(normalizedLabels.map((item) => item.period_key))
  const bindingKeys = new Set(periodBindings.map((item) => item.period_key))
  if (labelKeys.size !== bindingKeys.size || !Array.from(labelKeys).every((key) => bindingKeys.has(key))) {
    throw new CashFlowValidationError("period_axis.labels and period_axis.period_bindings must reference the same period keys")
  }

  const buckets = normalizeBucketCollection(input.bucket_bindings || input.buckets, {
    requireColumnHeader: false,
  }).map((bucket, index) => {
    const candidate = input.bucket_bindings?.[index] || {}
    const cells = normalizePeriodBindingEntries(candidate.cells || bucket.cells, `bucket_bindings[${index}].cells`)
    const cellKeys = new Set(cells.map((item) => item.period_key))
    if (!Array.from(labelKeys).every((key) => cellKeys.has(key))) {
      throw new CashFlowValidationError(`bucket_bindings[${index}] must include cell targets for every detected period`)
    }
    return {
      ...bucket,
      cells,
    }
  })

  const openingCells = input.opening_binding?.cells
    ? normalizePeriodBindingEntries(input.opening_binding.cells, "opening_binding.cells")
    : null
  const closingCells = input.closing_binding?.cells
    ? normalizePeriodBindingEntries(input.closing_binding.cells, "closing_binding.cells")
    : null
  if (openingCells) {
    const openingKeys = new Set(openingCells.map((entry) => entry.period_key))
    if (!Array.from(labelKeys).every((key) => openingKeys.has(key))) {
      throw new CashFlowValidationError("opening_binding.cells must include every detected period key")
    }
  }
  if (closingCells) {
    const closingKeys = new Set(closingCells.map((entry) => entry.period_key))
    if (!Array.from(labelKeys).every((key) => closingKeys.has(key))) {
      throw new CashFlowValidationError("closing_binding.cells must include every detected period key")
    }
  }

  const periodGranularity = String(input.period_granularity || inferGranularityFromLabels(normalizedLabels)).toLowerCase()
  const validGranularity = ["monthly", "quarterly", "yearly", "custom"]
  if (!validGranularity.includes(periodGranularity)) {
    throw new CashFlowValidationError("period_granularity must be monthly, quarterly, yearly, or custom")
  }

  const periodResolutionRules = input.period_resolution_rules && typeof input.period_resolution_rules === "object"
    ? input.period_resolution_rules
    : {}
  const customResolutionsRaw = Array.isArray(periodResolutionRules.custom_periods)
    ? periodResolutionRules.custom_periods
    : []
  const customPeriods = customResolutionsRaw.map((item, index) => {
    const periodKey = normalizePeriodKey(item.period_key, `custom_${index + 1}`)
    const dateStart = item.date_start ? formatIsoDate(item.date_start) : null
    const dateEnd = item.date_end ? formatIsoDate(item.date_end) : null
    if (!dateStart || !dateEnd) {
      throw new CashFlowValidationError("period_resolution_rules.custom_periods requires date_start and date_end")
    }
    normalizeDateRange(dateStart, dateEnd)
    return {
      period_key: periodKey,
      date_start: dateStart,
      date_end: dateEnd,
    }
  })
  const mappingPolicy = normalizeMappingPolicy(input.mapping_policy)
  const writerPolicy = normalizeWriterPolicy(input.writer_policy)

  return {
    version: "v3",
    sheet_name: sheetName,
    layout_type: layoutType,
    period_granularity: periodGranularity,
    period_axis: {
      orientation,
      labels: normalizedLabels,
      period_bindings: periodBindings,
    },
    period_resolution_rules: {
      ...periodResolutionRules,
      custom_periods: customPeriods,
    },
    opening_binding: openingCells ? { cells: openingCells } : null,
    closing_binding: closingCells ? { cells: closingCells } : null,
    bucket_bindings: buckets,
    writer_policy: writerPolicy,
    mapping_policy: mappingPolicy,
  }
}

function validateTemplateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CashFlowValidationError("Template config_json must be a JSON object")
  }

  if (String(input.version || "").toLowerCase() === "v3" || input.period_axis) {
    return validateV3TemplateConfig(input)
  }

  if (String(input.version || "").toLowerCase() === "v2" || Array.isArray(input.month_bindings)) {
    return validateV2TemplateConfig(input)
  }

  return validateLegacyTemplateConfig(input)
}

async function parseTrialBalanceFile(filePath) {
  ensureFileExists(filePath, "Trial Balance")

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new CashFlowValidationError("Trial Balance workbook has no worksheets")
  }

  const { headerRow, columns } = findHeaderRowAndColumns(worksheet, TB_HEADER_SPEC, "Trial Balance")
  const rows = []

  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const account = readCellText(row.getCell(columns.account).value)
    if (!account) continue
    if (normalizeText(account) === "total") continue

    const asOfDate = parseDateValue(row.getCell(columns.as_of_date).value, "Trial Balance As of Date", {
      allowNull: true,
    })

    const parsed = {
      row: rowIndex,
      company: readCellText(row.getCell(columns.company).value),
      asOfDate,
      account,
      endingDebit: roundCurrency(toNumber(row.getCell(columns.ending_debit).value)),
      endingCredit: roundCurrency(toNumber(row.getCell(columns.ending_credit).value)),
    }
    parsed.endingBalance = roundCurrency(parsed.endingDebit - parsed.endingCredit)
    rows.push(parsed)
  }

  if (!rows.length) {
    throw new CashFlowValidationError("Trial Balance workbook has no data rows")
  }

  const exactCash = rows.find((item) => normalizeText(item.account) === "cash")
  const cashCandidate =
    exactCash ||
    rows.find((item) => normalizeText(item.account).includes("cash")) ||
    null

  if (!cashCandidate) {
    throw new CashFlowValidationError("Trial Balance does not contain a Cash account row")
  }

  const asOfDate = cashCandidate.asOfDate || rows.find((item) => item.asOfDate)?.asOfDate || null
  if (!asOfDate) {
    throw new CashFlowValidationError("Trial Balance As of Date is required")
  }

  return {
    sheetName: worksheet.name,
    company: cashCandidate.company || rows[0].company || "",
    asOfDate,
    cashAccountName: cashCandidate.account,
    cashEndingBalance: cashCandidate.endingBalance,
    rows,
  }
}

function resolveCashLines(lines, cashAccountName) {
  const normalizedCashAccount = normalizeText(cashAccountName)
  const exact = lines.filter((line) => normalizeText(line.account_name) === normalizedCashAccount)
  if (exact.length) return exact

  const directCash = lines.filter((line) => normalizeText(line.account_name) === "cash")
  if (directCash.length) return directCash

  return lines.filter((line) => normalizeText(line.account_name).includes("cash"))
}

async function parseGeneralLedgerFile(filePath, { cashAccountName }) {
  ensureFileExists(filePath, "General Ledger")

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new CashFlowValidationError("General Ledger workbook has no worksheets")
  }

  const { headerRow, columns } = findHeaderRowAndColumns(worksheet, GL_HEADER_SPEC, "General Ledger")
  const rows = []

  for (let rowIndex = headerRow + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const accountName = readCellText(row.getCell(columns.ledger_account).value)
    if (!accountName) continue

    const date = parseDateValue(row.getCell(columns.date).value, "General Ledger Date", {
      allowNull: true,
    })
    if (!date) continue

    const debit = roundCurrency(toNumber(row.getCell(columns.debit).value))
    const credit = roundCurrency(toNumber(row.getCell(columns.credit).value))
    if (debit === 0 && credit === 0) continue

    rows.push({
      row: rowIndex,
      company: readCellText(row.getCell(columns.company).value),
      account_name: accountName,
      date,
      je_no: readCellText(row.getCell(columns.je_no).value) || `NO-JE-${rowIndex}`,
      description: readCellText(row.getCell(columns.description).value),
      entry_side: readCellText(row.getCell(columns.entry_side).value),
      debit,
      credit,
      net_amount: roundCurrency(debit - credit),
    })
  }

  if (!rows.length) {
    throw new CashFlowValidationError("General Ledger workbook has no data rows")
  }

  const byEntry = new Map()
  rows.forEach((line) => {
    if (!byEntry.has(line.je_no)) {
      byEntry.set(line.je_no, [])
    }
    byEntry.get(line.je_no).push(line)
  })

  const warnings = []
  const movements = []

  byEntry.forEach((entryLines, jeNo) => {
    const cashLines = resolveCashLines(entryLines, cashAccountName)
    if (!cashLines.length) return

    const cashNet = roundCurrency(cashLines.reduce((sum, line) => sum + line.net_amount, 0))
    if (cashNet === 0) return

    const counterpartLines = entryLines.filter((line) => !cashLines.includes(line))
    const oppositeSignCounterparts = counterpartLines.filter(
      (line) => line.net_amount !== 0 && line.net_amount * cashNet < 0,
    )

    const allocationSource =
      oppositeSignCounterparts.length > 0
        ? oppositeSignCounterparts
        : counterpartLines.filter((line) => line.net_amount !== 0)

    if (!allocationSource.length) {
      throw new CashFlowValidationError(`Unable to allocate cash movement for JE ${jeNo}`)
    }

    if (oppositeSignCounterparts.length === 0) {
      warnings.push(`JE ${jeNo} had no opposite-sign counterpart lines. Used all counterpart lines for allocation.`)
    }

    const allocationWeights = allocationSource.map((line) => Math.abs(line.net_amount))
    const allocationAmounts = allocateByWeights(Math.abs(cashNet), allocationWeights)
    const directionMultiplier = cashNet >= 0 ? 1 : -1
    const entryDate = new Date(
      Math.min(...cashLines.map((line) => line.date.getTime()), ...entryLines.map((line) => line.date.getTime())),
    )
    const description = cashLines.find((line) => line.description)?.description || entryLines[0].description || ""

    allocationSource.forEach((counterLine, index) => {
      const movementAmount = roundCurrency(directionMultiplier * allocationAmounts[index])
      if (!movementAmount) return

      movements.push({
        je_no: jeNo,
        date: entryDate,
        account_name: counterLine.account_name,
        description,
        amount: movementAmount,
      })
    })
  })

  movements.sort((a, b) => {
    if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime()
    if (a.je_no !== b.je_no) return a.je_no.localeCompare(b.je_no)
    return a.account_name.localeCompare(b.account_name)
  })

  return {
    sheetName: worksheet.name,
    rows,
    movements,
    warnings,
  }
}

function detectBucketDirection(label) {
  const normalized = normalizeText(label)
  if (
    normalized.includes("outflow") ||
    normalized.includes("expense") ||
    normalized.includes("payment") ||
    normalized.includes("cost")
  ) {
    return "outflow"
  }
  return "inflow"
}

const OPENING_LABEL_HINTS = [
  "opening balance",
  "opening cash",
  "cash opening",
  "cash at beginning",
  "beginning cash",
  "cash at start",
  "start cash",
  "cash beginning",
]

const CLOSING_LABEL_HINTS = [
  "closing balance",
  "closing cash",
  "cash closing",
  "cash at end",
  "ending cash",
  "cash ending",
  "cash end",
  "end cash",
]

function isOpeningLabel(value) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return OPENING_LABEL_HINTS.some((hint) => normalized.includes(hint))
}

function isClosingLabel(value) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return CLOSING_LABEL_HINTS.some((hint) => normalized.includes(hint))
}

function normalizeBucketKey(value, fallbackKey) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return key || fallbackKey
}

function shouldIgnoreBucketLabel(label) {
  const normalized = normalizeText(label)
  if (!normalized) return true
  return (
    normalized.includes("month") ||
    isOpeningLabel(normalized) ||
    isClosingLabel(normalized) ||
    normalized.includes("beginning") ||
    normalized.includes("ending") ||
    normalized.includes("net") ||
    normalized.includes("total") ||
    normalized.includes("balance")
  )
}

function getCellNumericSignal(value) {
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined || primitive === "") return false
  if (typeof primitive === "number") return true
  if (primitive instanceof Date) return false
  if (typeof primitive === "object" && primitive.formula) return true
  if (typeof primitive === "string") {
    const number = Number.parseFloat(primitive.replace(/,/g, ""))
    return Number.isFinite(number)
  }
  return false
}

function dedupePeriodEntries(entries) {
  const seen = new Map()
  return entries.map((entry, index) => {
    const baseKey = normalizePeriodKey(entry?.period_key, `period_${index + 1}`)
    const duplicateCount = seen.get(baseKey) || 0
    seen.set(baseKey, duplicateCount + 1)
    const periodKey = duplicateCount ? `${baseKey}_${duplicateCount + 1}` : baseKey
    return {
      ...entry,
      period_key: periodKey,
    }
  })
}

function pickRowLayoutCandidate(worksheet) {
  const maxRows = Math.min(Math.max(worksheet.rowCount, 1), 260)
  const maxCols = Math.min(Math.max(worksheet.columnCount || 0, 20), 90)
  let best = null

  for (let col = 1; col <= maxCols; col += 1) {
    const strictEntries = []
    const customEntries = []

    for (let row = 1; row <= maxRows; row += 1) {
      const cellValue = worksheet.getRow(row).getCell(col).value
      const strictToken = parsePeriodToken(cellValue, { allowCustom: false })
      if (strictToken) {
        strictEntries.push({ row, token: strictToken, strict: true })
        continue
      }
      const customToken = parsePeriodToken(cellValue, { allowCustom: true })
      if (customToken?.period_type === "custom") {
        customEntries.push({ row, token: customToken, strict: false })
      }
    }

    let periodEntries = strictEntries
    if (periodEntries.length < 2) {
      periodEntries = [...strictEntries, ...customEntries]
    }
    if (!periodEntries.length) continue

    periodEntries.sort((a, b) => a.row - b.row)
    periodEntries = dedupePeriodEntries(
      periodEntries.map((entry) => ({
        row: entry.row,
        label: entry.token.label,
        period_key: entry.token.period_key,
        period_type: entry.token.period_type,
        month: entry.token.month || null,
        quarter: entry.token.quarter || null,
        year: entry.token.year || null,
        strict: entry.strict,
      })),
    )

    const firstRow = periodEntries[0].row
    const headerRowIndex = firstRow > 1 ? firstRow - 1 : firstRow
    const headerLookup = extractHeaderLookup(worksheet.getRow(headerRowIndex))

    const findColumnByKeywords = (keywords) => {
      for (const [headerText, headerColumn] of headerLookup.entries()) {
        if (keywords.some((keyword) => headerText.includes(keyword))) return headerColumn
      }
      return null
    }

    const openingColumn = findColumnByKeywords(OPENING_LABEL_HINTS)
    const closingColumn = findColumnByKeywords(CLOSING_LABEL_HINTS)

    const bucketColumns = []
    for (const [headerText, headerColumn] of headerLookup.entries()) {
      if (headerColumn === col) continue
      if (headerColumn === openingColumn || headerColumn === closingColumn) continue
      if (shouldIgnoreBucketLabel(headerText)) continue
      bucketColumns.push({
        column: headerColumn,
        label: readCellText(worksheet.getRow(headerRowIndex).getCell(headerColumn).value) || headerText,
      })
    }

    if (!bucketColumns.length) {
      for (let candidateCol = 1; candidateCol <= maxCols; candidateCol += 1) {
        if ([col, openingColumn, closingColumn].includes(candidateCol)) continue
        const label =
          readCellText(worksheet.getRow(headerRowIndex).getCell(candidateCol).value) ||
          `Bucket ${candidateCol}`
        if (shouldIgnoreBucketLabel(label)) continue
        const hasNumericSignal = periodEntries.some((entry) =>
          getCellNumericSignal(worksheet.getRow(entry.row).getCell(candidateCol).value),
        )
        if (!hasNumericSignal) continue
        bucketColumns.push({
          column: candidateCol,
          label,
        })
      }
    }

    if (!bucketColumns.length) continue

    const strictCount = periodEntries.filter((item) => item.strict).length
    const score =
      periodEntries.length * 1.1 +
      bucketColumns.length * 0.75 +
      (openingColumn ? 0.35 : 0) +
      (closingColumn ? 0.35 : 0) +
      strictCount * 0.4

    if (!best || score > best.score) {
      best = {
        layout_type: "rows",
        score,
        periodColumn: col,
        headerRowIndex,
        openingColumn,
        closingColumn,
        periodEntries,
        bucketColumns,
      }
    }
  }

  return best
}

function pickColumnLayoutCandidate(worksheet) {
  const maxRows = Math.min(Math.max(worksheet.rowCount, 1), 240)
  const maxCols = Math.min(Math.max(worksheet.columnCount || 0, 20), 120)
  let best = null

  for (let row = 1; row <= maxRows; row += 1) {
    const strictEntries = []
    const customEntries = []
    for (let col = 1; col <= maxCols; col += 1) {
      const cellValue = worksheet.getRow(row).getCell(col).value
      const strictToken = parsePeriodToken(cellValue, { allowCustom: false })
      if (strictToken) {
        strictEntries.push({ col, token: strictToken, strict: true })
        continue
      }
      const customToken = parsePeriodToken(cellValue, { allowCustom: true })
      if (customToken?.period_type === "custom") {
        customEntries.push({ col, token: customToken, strict: false })
      }
    }

    let periodEntries = strictEntries
    if (periodEntries.length < 2) {
      periodEntries = [...strictEntries, ...customEntries]
    }
    if (!periodEntries.length) continue

    periodEntries.sort((a, b) => a.col - b.col)
    periodEntries = dedupePeriodEntries(
      periodEntries.map((entry) => ({
        col: entry.col,
        label: entry.token.label,
        period_key: entry.token.period_key,
        period_type: entry.token.period_type,
        month: entry.token.month || null,
        quarter: entry.token.quarter || null,
        year: entry.token.year || null,
        strict: entry.strict,
      })),
    )

    const firstCol = periodEntries[0].col
    let labelColumn = null
    for (let candidate = 1; candidate < firstCol; candidate += 1) {
      const signal = normalizeText(readCellText(worksheet.getRow(row + 1).getCell(candidate).value))
      if (signal) {
        labelColumn = candidate
        break
      }
    }
    if (!labelColumn) labelColumn = Math.max(1, firstCol - 1)

    let openingRow = null
    let closingRow = null
    const bucketRows = []
    for (let scanRow = row + 1; scanRow <= Math.min(maxRows, row + 140); scanRow += 1) {
      const label = readCellText(worksheet.getRow(scanRow).getCell(labelColumn).value)
      const normalizedLabel = normalizeText(label)
      if (!normalizedLabel) continue

      if (!openingRow && isOpeningLabel(normalizedLabel)) {
        openingRow = scanRow
        continue
      }
      if (!closingRow && isClosingLabel(normalizedLabel)) {
        closingRow = scanRow
        continue
      }
      if (shouldIgnoreBucketLabel(normalizedLabel)) continue

      const hasNumericSignal = periodEntries.some((entry) =>
        getCellNumericSignal(worksheet.getRow(scanRow).getCell(entry.col).value),
      )
      if (!hasNumericSignal) continue
      bucketRows.push({
        row: scanRow,
        label: label || normalizedLabel,
      })
    }

    if (!bucketRows.length) continue

    const strictCount = periodEntries.filter((item) => item.strict).length
    const score =
      periodEntries.length * 1.05 +
      bucketRows.length * 0.8 +
      (openingRow ? 0.3 : 0) +
      (closingRow ? 0.3 : 0) +
      strictCount * 0.45

    if (!best || score > best.score) {
      best = {
        layout_type: bucketRows.some((item) => /inflow|outflow/i.test(item.label)) ? "sectioned" : "columns",
        score,
        periodRow: row,
        periodEntries,
        labelColumn,
        openingRow,
        closingRow,
        bucketRows,
      }
    }
  }

  return best
}

function ensureDirectionalFallbacks(bucketBindings) {
  const inflowFallback = bucketBindings.find((item) => item.direction === "inflow" && item.fallback)
  const outflowFallback = bucketBindings.find((item) => item.direction === "outflow" && item.fallback)
  if (!inflowFallback) {
    const firstInflow = bucketBindings.find((item) => item.direction === "inflow")
    if (firstInflow) firstInflow.fallback = true
  }
  if (!outflowFallback) {
    const firstOutflow = bucketBindings.find((item) => item.direction === "outflow")
    if (firstOutflow) firstOutflow.fallback = true
  }
}

function buildV3ConfigFromLayoutDetection(worksheet, layoutCandidate) {
  const periodLabels = layoutCandidate.periodEntries.map((entry, index) => ({
    period_key: normalizePeriodKey(entry.period_key, `period_${index + 1}`),
    label: entry.label || `Period ${index + 1}`,
    period_type: entry.period_type || "custom",
    month: entry.month || null,
    quarter: entry.quarter || null,
    year: entry.year || null,
  }))

  const periodBindings = []
  const openingCells = []
  const closingCells = []
  const bucketBindings = []
  const seenBucketKeys = new Set()

  if (layoutCandidate.layout_type === "rows") {
    layoutCandidate.periodEntries.forEach((entry, index) => {
      periodBindings.push({
        period_key: periodLabels[index].period_key,
        label: periodLabels[index].label,
        cell: cellAddressFromRowCol(entry.row, layoutCandidate.periodColumn),
      })
      if (layoutCandidate.openingColumn) {
        openingCells.push({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(entry.row, layoutCandidate.openingColumn),
        })
      }
      if (layoutCandidate.closingColumn) {
        closingCells.push({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(entry.row, layoutCandidate.closingColumn),
        })
      }
    })

    layoutCandidate.bucketColumns.forEach((bucket, bucketIndex) => {
      const bucketKey = normalizeBucketKey(bucket.label, `bucket_${bucketIndex + 1}`)
      if (seenBucketKeys.has(bucketKey)) return
      seenBucketKeys.add(bucketKey)
      bucketBindings.push({
        bucket_key: bucketKey,
        label: bucket.label,
        direction: detectBucketDirection(bucket.label),
        fallback: /other|misc|uncategorized|remaining/i.test(bucket.label),
        rules: [],
        cells: layoutCandidate.periodEntries.map((entry, index) => ({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(entry.row, bucket.column),
        })),
      })
    })
  } else {
    layoutCandidate.periodEntries.forEach((entry, index) => {
      periodBindings.push({
        period_key: periodLabels[index].period_key,
        label: periodLabels[index].label,
        cell: cellAddressFromRowCol(layoutCandidate.periodRow, entry.col),
      })
      if (layoutCandidate.openingRow) {
        openingCells.push({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(layoutCandidate.openingRow, entry.col),
        })
      }
      if (layoutCandidate.closingRow) {
        closingCells.push({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(layoutCandidate.closingRow, entry.col),
        })
      }
    })

    layoutCandidate.bucketRows.forEach((bucket, bucketIndex) => {
      const bucketKey = normalizeBucketKey(bucket.label, `bucket_${bucketIndex + 1}`)
      if (seenBucketKeys.has(bucketKey)) return
      seenBucketKeys.add(bucketKey)
      bucketBindings.push({
        bucket_key: bucketKey,
        label: bucket.label,
        direction: detectBucketDirection(bucket.label),
        fallback: /other|misc|uncategorized|remaining/i.test(bucket.label),
        rules: [],
        cells: layoutCandidate.periodEntries.map((entry, index) => ({
          period_key: periodLabels[index].period_key,
          label: periodLabels[index].label,
          cell: cellAddressFromRowCol(bucket.row, entry.col),
        })),
      })
    })
  }

  ensureDirectionalFallbacks(bucketBindings)

  return {
    version: "v3",
    sheet_name: worksheet.name,
    layout_type: layoutCandidate.layout_type,
    period_granularity: inferGranularityFromLabels(periodLabels),
    period_axis: {
      orientation: layoutCandidate.layout_type === "rows" ? "row" : "column",
      labels: periodLabels,
      period_bindings: periodBindings,
    },
    period_resolution_rules: {
      custom_periods: [],
    },
    opening_binding: openingCells.length ? { cells: openingCells } : null,
    closing_binding: closingCells.length ? { cells: closingCells } : null,
    bucket_bindings: bucketBindings,
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

function buildMinimalSuggestedV3Config(sheetName = "Cash Flow") {
  return {
    version: "v3",
    sheet_name: sheetName,
    layout_type: "freeform",
    period_granularity: "custom",
    period_axis: {
      orientation: "row",
      labels: [
        {
          period_key: "period_1",
          label: "Period 1",
          period_type: "custom",
        },
      ],
      period_bindings: [
        {
          period_key: "period_1",
          label: "Period 1",
          cell: "A1",
        },
      ],
    },
    period_resolution_rules: {
      custom_periods: [
        {
          period_key: "period_1",
          date_start: formatIsoDate(new Date()),
          date_end: formatIsoDate(new Date()),
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

async function analyzeTemplateWorkbook({ templatePath }) {
  ensureFileExists(templatePath, "Cash flow template")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  if (!workbook.worksheets.length) {
    throw new CashFlowValidationError("Template workbook has no worksheets")
  }

  let bestWorksheet = null
  let bestCandidate = null
  workbook.worksheets.forEach((worksheet) => {
    const rowCandidate = pickRowLayoutCandidate(worksheet)
    const colCandidate = pickColumnLayoutCandidate(worksheet)
    const candidate = [rowCandidate, colCandidate].filter(Boolean).sort((a, b) => b.score - a.score)[0] || null
    if (!candidate) return
    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestWorksheet = worksheet
      bestCandidate = candidate
    }
  })

  if (!bestCandidate || !bestWorksheet) {
    const fallbackConfig = buildMinimalSuggestedV3Config(workbook.worksheets[0]?.name || "Cash Flow")
    return {
      detected_layout_type: "freeform",
      confidence: 0.22,
      issues: [
        "Unable to automatically detect period axis and writable cash flow cells.",
        "Provide guided anchors for period axis, bucket targets, and optional opening/closing targets.",
      ],
      required_anchors: ["period_axis", "bucket_targets", "period_ranges"],
      suggested_config_json: fallbackConfig,
    }
  }

  const suggestedConfig = buildV3ConfigFromLayoutDetection(bestWorksheet, bestCandidate)
  const periodCount = suggestedConfig.period_axis.labels.length
  const strictPeriods = bestCandidate.periodEntries.filter((item) => item.strict).length
  const bucketCount = suggestedConfig.bucket_bindings.length
  const hasCustomPeriods = suggestedConfig.period_axis.labels.some((label) => label.period_type === "custom")

  let confidence = roundCurrency(
    Math.min(
      0.99,
      Math.max(0.3, periodCount * 0.09 + bucketCount * 0.08 + strictPeriods * 0.07 + (hasCustomPeriods ? -0.12 : 0.12)),
    ),
  )

  const issues = []
  const requiredAnchors = []
  if (!bucketCount) {
    issues.push("No writable bucket targets were detected. Add bucket anchors before confirming.")
    requiredAnchors.push("bucket_targets")
  }
  if (hasCustomPeriods) {
    issues.push("Custom or ambiguous period labels detected. Add date-range anchors for these periods.")
    requiredAnchors.push("period_ranges")
    confidence = Math.min(confidence, 0.72)
  }
  if (confidence < 0.55) {
    issues.push("Low-confidence detection. Review axis and bucket bindings in the confirmation step.")
    requiredAnchors.push("period_axis")
  }
  if (!suggestedConfig.opening_binding) {
    issues.push("Opening balance target not detected. It will be skipped unless you map it manually.")
  }
  if (!suggestedConfig.closing_binding) {
    issues.push("Closing balance target not detected. It will be skipped unless you map it manually.")
  }

  return {
    detected_layout_type: bestCandidate.layout_type,
    confidence,
    issues,
    required_anchors: Array.from(new Set(requiredAnchors)),
    suggested_config_json: suggestedConfig,
  }
}

async function migrateLegacyTemplateConfigToV2({ templatePath, legacyConfig }) {
  const normalizedLegacy = validateLegacyTemplateConfig(legacyConfig)
  ensureFileExists(templatePath, "Cash flow template")

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const worksheet = workbook.getWorksheet(normalizedLegacy.sheet_name)
  if (!worksheet) {
    throw new CashFlowValidationError(`Template sheet "${normalizedLegacy.sheet_name}" not found`)
  }

  const headerRow = worksheet.getRow(normalizedLegacy.header_row)
  const headerLookup = extractHeaderLookup(headerRow)
  const resolveColumn = (headerName, label) => {
    const key = normalizeHeader(headerName)
    const column = headerLookup.get(key)
    if (!column) {
      throw new CashFlowValidationError(`Template header "${headerName}" not found for ${label}`)
    }
    return column
  }

  const monthColumn = resolveColumn(normalizedLegacy.month_column_header, "month")
  const openingColumn = resolveColumn(normalizedLegacy.opening_column_header, "opening balance")
  const closingColumn = resolveColumn(normalizedLegacy.closing_column_header, "closing balance")
  const bucketColumns = normalizedLegacy.buckets.map((bucket) => ({
    ...bucket,
    column: resolveColumn(bucket.column_header, `bucket ${bucket.bucket_key}`),
  }))

  const monthRows = new Map()
  const maxRowsToScan = Math.max(worksheet.rowCount, normalizedLegacy.header_row + 48)
  for (let rowIndex = normalizedLegacy.header_row + 1; rowIndex <= maxRowsToScan; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const month = parseMonthValue(row.getCell(monthColumn).value)
    if (!month || monthRows.has(month)) continue
    monthRows.set(month, rowIndex)
  }

  if (monthRows.size < 1) {
    throw new CashFlowValidationError("Template month mapping failed. No period rows were detected from month column.")
  }

  const orderedMonths = Array.from(monthRows.entries()).sort((a, b) => a[0] - b[0])
  const v2Config = {
    version: "v2",
    sheet_name: normalizedLegacy.sheet_name,
    layout_type: "rows",
    month_bindings: orderedMonths.map(([monthIndex, rowIndex]) => ({
      month_index: monthIndex,
      cell: cellAddressFromRowCol(rowIndex, monthColumn),
    })),
    opening_binding: {
      cells: orderedMonths.map(([monthIndex, rowIndex]) => ({
        month_index: monthIndex,
        cell: cellAddressFromRowCol(rowIndex, openingColumn),
      })),
    },
    closing_binding: {
      cells: orderedMonths.map(([monthIndex, rowIndex]) => ({
        month_index: monthIndex,
        cell: cellAddressFromRowCol(rowIndex, closingColumn),
      })),
    },
    bucket_bindings: bucketColumns.map((bucket) => ({
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      direction: bucket.direction,
      fallback: bucket.fallback,
      rules: bucket.rules || [],
      cells: orderedMonths.map(([monthIndex, rowIndex]) => ({
        month_index: monthIndex,
        cell: cellAddressFromRowCol(rowIndex, bucket.column),
      })),
    })),
    writer_policy: normalizeWriterPolicy(normalizedLegacy.writer_policy),
    mapping_policy: normalizeMappingPolicy(normalizedLegacy.mapping_policy),
  }

  return validateV2TemplateConfig(v2Config)
}

function migrateV2TemplateConfigToV3(v2Config) {
  const normalizedV2 = validateV2TemplateConfig(v2Config)
  const labels = normalizedV2.month_bindings
    .slice()
    .sort((a, b) => a.month_index - b.month_index)
    .map((binding, index) => ({
      month_index: binding.month_index,
      period_key: `m${String(binding.month_index).padStart(2, "0")}`,
      label: MONTH_NAMES[binding.month_index - 1] || `Period ${index + 1}`,
      period_type: "monthly",
      month: binding.month_index,
      quarter: Math.floor((binding.month_index - 1) / 3) + 1,
      year: null,
    }))

  const monthKeyLookup = new Map(labels.map((item) => [item.month_index, item.period_key]))
  const openingCells = (normalizedV2.opening_binding?.cells || []).map((entry) => ({
    period_key: monthKeyLookup.get(entry.month_index),
    label: MONTH_NAMES[entry.month_index - 1] || `Period ${entry.month_index}`,
    cell: entry.cell,
  }))
  const closingCells = (normalizedV2.closing_binding?.cells || []).map((entry) => ({
    period_key: monthKeyLookup.get(entry.month_index),
    label: MONTH_NAMES[entry.month_index - 1] || `Period ${entry.month_index}`,
    cell: entry.cell,
  }))

  const v3 = {
    version: "v3",
    sheet_name: normalizedV2.sheet_name,
    layout_type: normalizedV2.layout_type,
    period_granularity: "monthly",
    period_axis: {
      orientation: normalizedV2.layout_type === "rows" ? "row" : "column",
      labels: labels.map((label) => ({
        period_key: label.period_key,
        label: label.label,
        period_type: "monthly",
        month: label.month,
        quarter: label.quarter,
        year: null,
      })),
      period_bindings: normalizedV2.month_bindings.map((binding) => ({
        period_key: monthKeyLookup.get(binding.month_index),
        label: MONTH_NAMES[binding.month_index - 1] || `Period ${binding.month_index}`,
        cell: binding.cell,
      })),
    },
    period_resolution_rules: {
      custom_periods: [],
    },
    opening_binding: openingCells.length ? { cells: openingCells } : null,
    closing_binding: closingCells.length ? { cells: closingCells } : null,
    bucket_bindings: normalizedV2.bucket_bindings.map((bucket) => ({
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      direction: bucket.direction,
      fallback: bucket.fallback,
      rules: bucket.rules || [],
      cells: (bucket.cells || []).map((cell) => ({
        period_key: monthKeyLookup.get(cell.month_index),
        label: MONTH_NAMES[cell.month_index - 1] || `Period ${cell.month_index}`,
        cell: cell.cell,
      })),
    })),
    writer_policy: normalizeWriterPolicy(normalizedV2.writer_policy),
    mapping_policy: normalizeMappingPolicy(normalizedV2.mapping_policy),
  }

  return validateV3TemplateConfig(v3)
}

async function migrateLegacyTemplateConfigToV3({ templatePath, legacyConfig }) {
  const v2 = await migrateLegacyTemplateConfigToV2({
    templatePath,
    legacyConfig,
  })
  return migrateV2TemplateConfigToV3(v2)
}

function computeTokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean))
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })
  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

function mapMovementsToBuckets(movements, buckets, options = {}) {
  const mappingPolicy = normalizeMappingPolicy(options.mappingPolicy)
  const learnedMappings = Array.isArray(options.learnedMappings) ? options.learnedMappings : []
  const fallbackByDirection = {
    inflow: buckets.find((bucket) => bucket.direction === "inflow" && bucket.fallback) || null,
    outflow: buckets.find((bucket) => bucket.direction === "outflow" && bucket.fallback) || null,
  }

  const learnedLookup = new Map()
  learnedMappings.forEach((mapping) => {
    const normalizedAccount = normalizeText(mapping.normalized_account || mapping.account_name || "")
    if (!normalizedAccount) return
    learnedLookup.set(`${normalizedAccount}:${mapping.direction}`, {
      bucket_key: mapping.bucket_key,
      confidence: Number(mapping.confidence || 1),
      source: mapping.source || "auto_semantic",
      status: mapping.status || "suggested",
    })
  })

  const mappedMovements = []
  const unmapped = []
  const autoCreatedMappings = []
  const lowConfidenceMap = new Map()

  movements.forEach((movement) => {
    const direction = movement.amount >= 0 ? "inflow" : "outflow"
    const normalizedAccount = normalizeText(movement.account_name)
    const directionBuckets = buckets
      .map((bucket, bucketIndex) => ({ bucket, bucketIndex }))
      .filter((item) => item.bucket.direction === direction)

    let selectedBucket = null
    let selectedSource = "template_rule"
    let selectedConfidence = 1
    let selectedGroundingStatus = "template_rule"

    let bestRuleMatch = null
    directionBuckets.forEach(({ bucket, bucketIndex }) => {
      bucket.rules.forEach((rule, ruleIndex) => {
        const normalizedPattern = normalizeText(rule.pattern)
        const isMatch =
          rule.match_type === "exact"
            ? normalizedAccount === normalizedPattern
            : normalizedAccount.includes(normalizedPattern)
        if (!isMatch) return

        const score = {
          bucket,
          bucketIndex,
          ruleIndex,
          priority: Number(rule.priority || 1000),
          matchTypeRank: rule.match_type === "exact" ? 0 : 1,
          patternLength: normalizedPattern.length,
        }
        if (compareRuleScore(bestRuleMatch, score) > 0) {
          bestRuleMatch = score
        }
      })
    })
    if (bestRuleMatch?.bucket) {
      selectedBucket = bestRuleMatch.bucket
      selectedSource = "template_rule"
      selectedConfidence = 1
      selectedGroundingStatus = "template_rule"
    }

    if (!selectedBucket) {
      const learned = learnedLookup.get(`${normalizedAccount}:${direction}`)
      if (learned) {
        selectedBucket = buckets.find((bucket) => bucket.bucket_key === learned.bucket_key && bucket.direction === direction)
        if (selectedBucket) {
          selectedSource = learned.source || "auto_semantic"
          selectedConfidence = Number(learned.confidence || 1)
          selectedGroundingStatus = learned.status === "approved" ? "approved" : "suggested"
        }
      }
    }

    if (!selectedBucket) {
      let bestSemantic = null
      directionBuckets.forEach(({ bucket }) => {
        const score = Math.max(
          computeTokenSimilarity(normalizedAccount, bucket.label),
          computeTokenSimilarity(normalizedAccount, bucket.bucket_key),
        )
        if (!bestSemantic || score > bestSemantic.score) {
          bestSemantic = { bucket, score }
        }
      })

      if (bestSemantic && bestSemantic.score >= mappingPolicy.low_confidence_threshold) {
        selectedBucket = bestSemantic.bucket
        selectedSource = "auto_semantic"
        selectedConfidence = bestSemantic.score
        selectedGroundingStatus = "auto_semantic"
      }
    }

    if (!selectedBucket) {
      const directionBuckets = buckets.filter((bucket) => bucket.direction === direction)
      selectedBucket = fallbackByDirection[direction] || directionBuckets[0] || null
      selectedSource = fallbackByDirection[direction] ? "fallback" : "auto_semantic"
      selectedConfidence = fallbackByDirection[direction] ? 0.4 : 0.25
      selectedGroundingStatus = fallbackByDirection[direction] ? "fallback" : "auto_semantic"
    }

    if (!selectedBucket) {
      unmapped.push({
        ...movement,
        direction,
        abs_amount: roundCurrency(Math.abs(movement.amount)),
      })
      return
    }

    mappedMovements.push({
      ...movement,
      direction,
      bucket_key: selectedBucket.bucket_key,
      bucket_label: selectedBucket.label,
      abs_amount: roundCurrency(Math.abs(movement.amount)),
      mapping_source: selectedSource,
      mapping_confidence: Number(selectedConfidence || 0),
      grounding_status: selectedGroundingStatus,
    })

    const existingLearned = learnedLookup.get(`${normalizedAccount}:${direction}`)
    if (!existingLearned && mappingPolicy.auto_create) {
      autoCreatedMappings.push({
        normalized_account: normalizedAccount,
        direction,
        bucket_key: selectedBucket.bucket_key,
        confidence: Number(selectedConfidence || 0),
        source: selectedSource === "template_rule" ? "template_rule" : selectedSource,
      })
      learnedLookup.set(`${normalizedAccount}:${direction}`, {
        bucket_key: selectedBucket.bucket_key,
        confidence: Number(selectedConfidence || 0),
        source: selectedSource,
      })
    }

    if (Number(selectedConfidence || 0) < mappingPolicy.high_confidence_threshold) {
      const key = `${normalizedAccount}:${direction}:${selectedBucket.bucket_key}`
      if (!lowConfidenceMap.has(key)) {
        lowConfidenceMap.set(key, {
          account_name: movement.account_name,
          normalized_account: normalizedAccount,
          direction,
          bucket_key: selectedBucket.bucket_key,
          confidence: Number(selectedConfidence || 0),
        })
      }
    }
  })

  const lowConfidenceMappings = Array.from(lowConfidenceMap.values())

  const assignmentMap = new Map()
  mappedMovements.forEach((row) => {
    const key = `${normalizeText(row.account_name)}:${row.direction}:${row.bucket_key}`
    if (!assignmentMap.has(key)) {
      assignmentMap.set(key, {
        account_name: row.account_name,
        normalized_account: normalizeText(row.account_name),
        direction: row.direction,
        bucket_key: row.bucket_key,
        confidence: Number(row.mapping_confidence || 0),
        source: row.mapping_source,
        grounding_status: row.grounding_status || null,
        abs_amount: Number(row.abs_amount || 0),
      })
    }
  })

  return {
    mappedMovements,
    unmapped,
    autoCreatedMappings,
    lowConfidenceMappings,
    finalBucketAssignments: Array.from(assignmentMap.values()),
  }
}

function getBucketsFromConfig(config) {
  if (Array.isArray(config.bucket_bindings)) return config.bucket_bindings
  return config.buckets || []
}

function getMappingPolicyFromConfig(config) {
  if (config.mapping_policy) return normalizeMappingPolicy(config.mapping_policy)
  return normalizeMappingPolicy({})
}

function getWriterPolicyFromConfig(config) {
  if (config.writer_policy) return normalizeWriterPolicy(config.writer_policy)
  return normalizeWriterPolicy({})
}

function resolvePeriodCellBindings(entries, label) {
  const bindings = normalizePeriodBindingEntries(entries, label)
  return bindings.map((item) => ({
    period_key: item.period_key,
    label: item.label,
    ...parseCellAddress(item.cell),
  }))
}

function getValueByPeriod(bindings, periodKey) {
  return bindings.find((binding) => binding.period_key === periodKey) || null
}

function normalizeDateStart(dateValue) {
  return normalizeDateOnly(dateValue)
}

function normalizeDateEnd(dateValue) {
  return normalizeDateOnly(dateValue)
}

function addDays(dateValue, days) {
  const output = new Date(dateValue.getTime())
  output.setUTCDate(output.getUTCDate() + days)
  return output
}

function resolvePeriodRanges({ config, runRange }) {
  const labels = Array.isArray(config.period_axis?.labels) ? config.period_axis.labels : []
  if (!labels.length) {
    throw new CashFlowValidationError("Template config has no period labels")
  }

  const customPeriodMap = new Map(
    (config.period_resolution_rules?.custom_periods || []).map((item) => [
      normalizePeriodKey(item.period_key),
      {
        date_start: normalizeDateStart(item.date_start),
        date_end: normalizeDateEnd(item.date_end),
      },
    ]),
  )
  const normalizedLabelTypes = labels.map((label) => {
    const parsed = parsePeriodToken(label.label || label.period_key, { allowCustom: true })
    return String(label.period_type || parsed?.period_type || "custom").toLowerCase()
  })
  const canAutoPartitionCustom = normalizedLabelTypes.every((type) => type === "custom") && customPeriodMap.size === 0

  const monthlyState = {
    year: runRange.start.getUTCFullYear(),
    lastMonth: null,
  }
  const quarterlyState = {
    year: runRange.start.getUTCFullYear(),
    lastQuarter: null,
  }
  let yearlyCursor = runRange.start.getUTCFullYear()
  const unresolved = []
  const customAutoPartitionIndexes = []

  const resolved = labels.map((label, index) => {
    const periodKey = normalizePeriodKey(label.period_key, `period_${index + 1}`)
    const parsed = parsePeriodToken(label.label || periodKey, { allowCustom: true }) || null
    const periodType = String(label.period_type || parsed?.period_type || "custom").toLowerCase()

    let start = null
    let end = null
    let month = Number.isInteger(Number(label.month)) ? Number(label.month) : parsed?.month || null
    let quarter = Number.isInteger(Number(label.quarter)) ? Number(label.quarter) : parsed?.quarter || null
    let year = Number.isInteger(Number(label.year)) ? Number(label.year) : parsed?.year || null

    if (periodType === "monthly") {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        unresolved.push(periodKey)
      } else {
        if (!year) {
          if (monthlyState.lastMonth !== null && month < monthlyState.lastMonth) {
            monthlyState.year += 1
          }
          year = monthlyState.year
        }
        monthlyState.lastMonth = month
        monthlyState.year = year
        start = new Date(Date.UTC(year, month - 1, 1))
        end = new Date(Date.UTC(year, month, 0))
      }
    } else if (periodType === "quarterly") {
      if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        unresolved.push(periodKey)
      } else {
        if (!year) {
          if (quarterlyState.lastQuarter !== null && quarter < quarterlyState.lastQuarter) {
            quarterlyState.year += 1
          }
          year = quarterlyState.year
        }
        quarterlyState.lastQuarter = quarter
        quarterlyState.year = year
        const startMonth = (quarter - 1) * 3
        start = new Date(Date.UTC(year, startMonth, 1))
        end = new Date(Date.UTC(year, startMonth + 3, 0))
      }
    } else if (periodType === "yearly") {
      if (!year) {
        year = yearlyCursor
      }
      yearlyCursor = year + 1
      start = new Date(Date.UTC(year, 0, 1))
      end = new Date(Date.UTC(year, 11, 31))
    } else {
      const custom = customPeriodMap.get(periodKey)
      if (custom) {
        start = custom.date_start
        end = custom.date_end
      } else if (labels.length === 1) {
        start = runRange.start
        end = runRange.end
      } else if (canAutoPartitionCustom) {
        customAutoPartitionIndexes.push(index)
      } else {
        unresolved.push(periodKey)
      }
    }

    return {
      period_key: periodKey,
      label: String(label.label || periodKey),
      period_type: periodType,
      month,
      quarter,
      year,
      start,
      end,
    }
  })

  if (customAutoPartitionIndexes.length) {
    const totalDays =
      Math.floor((runRange.end.getTime() - runRange.start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const slices = customAutoPartitionIndexes.length
    const baseSpanDays = Math.max(1, Math.floor(totalDays / slices))
    let remainder = Math.max(0, totalDays - baseSpanDays * slices)
    let cursor = new Date(runRange.start.getTime())

    customAutoPartitionIndexes.forEach((periodIndex, partitionIndex) => {
      const extra = remainder > 0 ? 1 : 0
      if (remainder > 0) remainder -= 1
      const spanDays = baseSpanDays + extra
      const start = new Date(cursor.getTime())
      const end = partitionIndex === slices - 1 ? new Date(runRange.end.getTime()) : addDays(start, spanDays - 1)
      resolved[periodIndex].start = start
      resolved[periodIndex].end = end
      cursor = addDays(end, 1)
    })
  }

  return {
    periods: resolved,
    unresolved_period_keys: Array.from(new Set(unresolved)),
  }
}

function computeOpeningBalanceAtDate({ openingDate, tbAsOfDate, tbCashEndingBalance, cashMovements }) {
  const opening = normalizeDateStart(openingDate)
  const asOf = normalizeDateEnd(tbAsOfDate)
  if (opening.getTime() <= asOf.getTime()) {
    const net = roundCurrency(
      cashMovements
        .filter((movement) => {
          const movementDate = normalizeDateOnly(movement.date)
          return movementDate >= opening && movementDate <= asOf
        })
        .reduce((sum, movement) => sum + movement.amount, 0),
    )
    return roundCurrency(tbCashEndingBalance - net)
  }

  const netForward = roundCurrency(
    cashMovements
      .filter((movement) => {
        const movementDate = normalizeDateOnly(movement.date)
        return movementDate > asOf && movementDate < opening
      })
      .reduce((sum, movement) => sum + movement.amount, 0),
  )
  return roundCurrency(tbCashEndingBalance + netForward)
}

function buildTemplatePeriodData({
  config,
  dateRange,
  tbAsOfDate,
  tbCashEndingBalance,
  cashMovements,
  mappedMovements,
  buckets,
}) {
  const runRange = {
    start: normalizeDateStart(dateRange.start),
    end: normalizeDateEnd(dateRange.end),
  }
  const periodResolution = resolvePeriodRanges({ config, runRange })
  if (periodResolution.unresolved_period_keys.length) {
    throw new CashFlowValidationError(
      "Template includes custom/ambiguous periods without date ranges. Add period anchors and re-run analysis.",
      {
        missing_period_keys: periodResolution.unresolved_period_keys,
      },
    )
  }

  const periodRows = periodResolution.periods.map((period) => {
    const bucketAmounts = {}
    buckets.forEach((bucket) => {
      bucketAmounts[bucket.bucket_key] = 0
    })
    const inScope =
      period.start && period.end ? rangesOverlap(period.start, period.end, runRange.start, runRange.end) : true
    return {
      ...period,
      in_scope: Boolean(inScope),
      opening_balance: 0,
      net_cash_flow: 0,
      closing_balance: 0,
      bucket_amounts: bucketAmounts,
    }
  })

  const orderedStarts = periodRows
    .filter((period) => period.start)
    .map((period) => period.start)
    .sort((left, right) => left.getTime() - right.getTime())
  const openingReferenceDate = orderedStarts[0] || runRange.start
  const openingBalance = computeOpeningBalanceAtDate({
    openingDate: openingReferenceDate,
    tbAsOfDate,
    tbCashEndingBalance,
    cashMovements,
  })

  const assignedMovements = []
  mappedMovements.forEach((movement) => {
    const movementDate = normalizeDateOnly(movement.date)
    if (movementDate < runRange.start || movementDate > runRange.end) return
    const period = periodRows.find(
      (item) => item.start && item.end && movementDate >= item.start && movementDate <= item.end,
    )
    if (!period) return
    assignedMovements.push(movement)
    period.net_cash_flow = roundCurrency(period.net_cash_flow + movement.amount)
    period.bucket_amounts[movement.bucket_key] = roundCurrency(
      (period.bucket_amounts[movement.bucket_key] || 0) + movement.abs_amount,
    )
  })

  let rollingOpening = openingBalance
  periodRows.forEach((period) => {
    period.opening_balance = roundCurrency(rollingOpening)
    period.closing_balance = roundCurrency(period.opening_balance + period.net_cash_flow)
    rollingOpening = period.closing_balance
  })

  const totals = {
    total_inflows: roundCurrency(
      assignedMovements.filter((movement) => movement.amount >= 0).reduce((sum, movement) => sum + movement.amount, 0),
    ),
    total_outflows: roundCurrency(
      assignedMovements
        .filter((movement) => movement.amount < 0)
        .reduce((sum, movement) => sum + Math.abs(movement.amount), 0),
    ),
    net_cash_flow: roundCurrency(periodRows.reduce((sum, period) => sum + period.net_cash_flow, 0)),
    opening_balance_start: openingBalance,
    closing_balance_end: periodRows.length ? periodRows[periodRows.length - 1].closing_balance : openingBalance,
    bucket_totals: {},
  }

  buckets.forEach((bucket) => {
    totals.bucket_totals[bucket.bucket_key] = roundCurrency(
      periodRows.reduce((sum, period) => sum + (period.bucket_amounts[bucket.bucket_key] || 0), 0),
    )
  })

  const warnings = []
  const asOfDate = normalizeDateOnly(tbAsOfDate)
  const asOfPeriod = periodRows.find((period) => period.start && period.end && asOfDate >= period.start && asOfDate <= period.end)
  if (asOfPeriod) {
    const difference = roundCurrency(asOfPeriod.closing_balance - tbCashEndingBalance)
    if (Math.abs(difference) > 0.01) {
      warnings.push(
        `Calculated closing balance at TB as-of period (${asOfPeriod.closing_balance}) differs from TB cash ending (${tbCashEndingBalance}).`,
      )
    }
  }

  return {
    period_start: formatIsoDate(runRange.start),
    period_end: formatIsoDate(runRange.end),
    opening_balance_start: openingBalance,
    periods: periodRows,
    totals,
    warnings,
  }
}

async function ensureV3TemplateConfig({ templateConfig, templatePath }) {
  const normalized = validateTemplateConfig(templateConfig)
  let v3Config = null

  if (normalized.version === "v3") {
    v3Config = normalized
  } else if (normalized.version === "v2") {
    v3Config = migrateV2TemplateConfigToV3(normalized)
  } else {
    v3Config = await migrateLegacyTemplateConfigToV3({
      templatePath,
      legacyConfig: normalized,
    })
  }

  if (templatePath) {
    ensureFileExists(templatePath, "Cash flow template")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    const worksheet = workbook.getWorksheet(v3Config.sheet_name)
    if (!worksheet) {
      throw new CashFlowValidationError(`Template sheet "${v3Config.sheet_name}" not found`, {
        available_sheets: workbook.worksheets.map((item) => item.name),
      })
    }
  }

  return v3Config
}

async function ensureV2TemplateConfig({ templateConfig, templatePath }) {
  const normalized = validateTemplateConfig(templateConfig)
  if (normalized.version === "v2") return normalized
  if (normalized.version === "v1") {
    return migrateLegacyTemplateConfigToV2({ templatePath, legacyConfig: normalized })
  }
  const v3 = await ensureV3TemplateConfig({ templateConfig, templatePath })
  const monthlyKeys = v3.period_axis.labels
    .map((label) => ({
      key: label.period_key,
      month: Number(label.month),
      type: label.period_type,
    }))
    .filter((item) => item.type === "monthly" && Number.isInteger(item.month))
  if (monthlyKeys.length !== 12) {
    throw new CashFlowValidationError("Cannot convert v3 template to v2 because period axis is not 12-month monthly.")
  }
  const monthLookup = new Map(monthlyKeys.map((item) => [item.key, item.month]))
  const toMonthCells = (entries, label) =>
    normalizePeriodBindingEntries(entries, label).map((entry) => ({
      month_index: monthLookup.get(entry.period_key),
      cell: entry.cell,
    }))

  return validateV2TemplateConfig({
    version: "v2",
    sheet_name: v3.sheet_name,
    layout_type: v3.layout_type,
    month_bindings: toMonthCells(v3.period_axis.period_bindings, "period_axis.period_bindings"),
    opening_binding: v3.opening_binding ? { cells: toMonthCells(v3.opening_binding.cells, "opening_binding.cells") } : { cells: [] },
    closing_binding: v3.closing_binding ? { cells: toMonthCells(v3.closing_binding.cells, "closing_binding.cells") } : { cells: [] },
    bucket_bindings: (v3.bucket_bindings || []).map((bucket) => ({
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      direction: bucket.direction,
      fallback: bucket.fallback,
      rules: bucket.rules || [],
      cells: toMonthCells(bucket.cells, `bucket_bindings.${bucket.bucket_key}.cells`),
    })),
    writer_policy: v3.writer_policy,
    mapping_policy: v3.mapping_policy,
  })
}

function buildFiscalYearData({
  fiscalYear,
  tbAsOfDate,
  tbCashEndingBalance,
  cashMovements,
  mappedMovements,
  buckets,
}) {
  const year = Number.parseInt(fiscalYear, 10)
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    throw new CashFlowValidationError("fiscal_year must be a valid four-digit year")
  }

  const pseudoConfig = {
    version: "v3",
    sheet_name: "Cash Flow",
    layout_type: "rows",
    period_granularity: "monthly",
    period_axis: {
      orientation: "row",
      labels: MONTH_NAMES.map((name, index) => ({
        period_key: `m${String(index + 1).padStart(2, "0")}`,
        label: name,
        period_type: "monthly",
        month: index + 1,
        quarter: Math.floor(index / 3) + 1,
        year,
      })),
      period_bindings: MONTH_NAMES.map((name, index) => ({
        period_key: `m${String(index + 1).padStart(2, "0")}`,
        label: name,
        cell: `A${index + 2}`,
      })),
    },
    period_resolution_rules: { custom_periods: [] },
    bucket_bindings: [],
    writer_policy: normalizeWriterPolicy({}),
    mapping_policy: normalizeMappingPolicy({}),
  }

  const periodData = buildTemplatePeriodData({
    config: pseudoConfig,
    dateRange: {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31)),
    },
    tbAsOfDate,
    tbCashEndingBalance,
    cashMovements,
    mappedMovements,
    buckets,
  })

  const months = periodData.periods.map((period, index) => ({
    month_index: index + 1,
    month_label: period.label,
    opening_balance: period.opening_balance,
    net_cash_flow: period.net_cash_flow,
    closing_balance: period.closing_balance,
    bucket_amounts: period.bucket_amounts,
  }))

  return {
    fiscal_year: year,
    opening_balance_january: periodData.opening_balance_start,
    months,
    totals: {
      total_inflows: periodData.totals.total_inflows,
      total_outflows: periodData.totals.total_outflows,
      net_cash_flow: periodData.totals.net_cash_flow,
      opening_balance_january: periodData.opening_balance_start,
      closing_balance_december: months[months.length - 1]?.closing_balance || periodData.opening_balance_start,
      bucket_totals: periodData.totals.bucket_totals,
    },
    warnings: periodData.warnings,
  }
}

async function fillTemplateWorkbook({ templatePath, outputPath, config, periodData, fiscalData }) {
  ensureFileExists(templatePath, "Cash flow template")

  const normalizedConfig = await ensureV3TemplateConfig({
    templateConfig: config,
    templatePath,
  })
  const writerPolicy = getWriterPolicyFromConfig(normalizedConfig)
  const buckets = getBucketsFromConfig(normalizedConfig)
  const openingBindings = normalizedConfig.opening_binding?.cells
    ? resolvePeriodCellBindings(normalizedConfig.opening_binding.cells, "opening_binding.cells")
    : []
  const closingBindings = normalizedConfig.closing_binding?.cells
    ? resolvePeriodCellBindings(normalizedConfig.closing_binding.cells, "closing_binding.cells")
    : []
  const bucketBindings = buckets.map((bucket) => ({
    ...bucket,
    resolved_cells: resolvePeriodCellBindings(bucket.cells, `bucket_bindings.${bucket.bucket_key}.cells`),
  }))

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const worksheet = workbook.getWorksheet(normalizedConfig.sheet_name)
  if (!worksheet) {
    throw new CashFlowValidationError(`Template sheet "${normalizedConfig.sheet_name}" not found`)
  }

  const setNumberCellIfWritable = (cell, value) => {
    if (writerPolicy.preserve_formulas && isFormulaCell(cell.value)) return false
    cell.value = roundCurrency(value)
    return true
  }

  let resolvedPeriodData = periodData || null
  if (!resolvedPeriodData && fiscalData?.months) {
    const monthsLookup = new Map((fiscalData.months || []).map((row) => [row.month_index, row]))
    resolvedPeriodData = {
      periods: (normalizedConfig.period_axis?.labels || []).map((label) => {
        const month =
          Number.isInteger(Number(label.month))
            ? Number(label.month)
            : parsePeriodToken(label.label, { allowCustom: true })?.month || null
        const source = month ? monthsLookup.get(month) : null
        return {
          period_key: label.period_key,
          opening_balance: source?.opening_balance || 0,
          closing_balance: source?.closing_balance || 0,
          bucket_amounts: source?.bucket_amounts || {},
        }
      }),
    }
  }

  const periodLookup = new Map((resolvedPeriodData?.periods || []).map((period) => [period.period_key, period]))
  const orderedPeriodKeys = normalizedConfig.period_axis.labels.map((label) => label.period_key)

  const resolveWorksheetCell = (bindingEntry, label) => {
    if (!bindingEntry) {
      throw new CashFlowValidationError(`Missing binding for ${label}`)
    }
    return worksheet.getCell(bindingEntry.address)
  }

  orderedPeriodKeys.forEach((periodKey) => {
    const period = periodLookup.get(periodKey) || {
      period_key: periodKey,
      opening_balance: 0,
      closing_balance: 0,
      bucket_amounts: {},
    }
    const openingBinding = getValueByPeriod(openingBindings, periodKey)
    const closingBinding = getValueByPeriod(closingBindings, periodKey)

    if (openingBinding) {
      setNumberCellIfWritable(
        resolveWorksheetCell(openingBinding, `opening period ${periodKey}`),
        period.opening_balance || 0,
      )
    }

    bucketBindings.forEach((bucket) => {
      const bucketCellBinding = getValueByPeriod(bucket.resolved_cells, periodKey)
      const amount = period.bucket_amounts?.[bucket.bucket_key] || 0
      setNumberCellIfWritable(
        resolveWorksheetCell(bucketCellBinding, `bucket ${bucket.bucket_key} period ${periodKey}`),
        amount,
      )
    })

    if (closingBinding) {
      setNumberCellIfWritable(
        resolveWorksheetCell(closingBinding, `closing period ${periodKey}`),
        period.closing_balance || 0,
      )
    }
  })

  if (writerPolicy.full_recalc_on_open) {
    workbook.calcProperties.fullCalcOnLoad = true
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await workbook.xlsx.writeFile(outputPath)
}

async function generateCashFlowReport({
  templatePath,
  templateConfig,
  tbFilePath,
  glFilePath,
  dateStart,
  dateEnd,
  preset,
  fiscalYear,
  outputFilePath,
  learnedMappings = [],
}) {
  const config = await ensureV3TemplateConfig({
    templateConfig,
    templatePath,
  })
  const buckets = getBucketsFromConfig(config)
  const mappingPolicy = getMappingPolicyFromConfig(config)
  const resolvedRange = resolveRunDateRange({
    dateStart,
    dateEnd,
    preset,
    fiscalYear,
  })

  const trialBalance = await parseTrialBalanceFile(tbFilePath)
  const generalLedger = await parseGeneralLedgerFile(glFilePath, {
    cashAccountName: trialBalance.cashAccountName,
  })

  const mapped = mapMovementsToBuckets(generalLedger.movements, buckets, {
    learnedMappings,
    mappingPolicy,
  })

  const periodData = buildTemplatePeriodData({
    config,
    dateRange: resolvedRange,
    tbAsOfDate: trialBalance.asOfDate,
    tbCashEndingBalance: trialBalance.cashEndingBalance,
    cashMovements: generalLedger.movements,
    mappedMovements: mapped.mappedMovements,
    buckets,
  })

  await fillTemplateWorkbook({
    templatePath,
    outputPath: outputFilePath,
    config,
    periodData,
  })

  const warnings = [
    ...generalLedger.warnings,
    ...periodData.warnings,
    ...(mapped.unmapped.length
      ? [`${mapped.unmapped.length} movement(s) could not be mapped and were skipped.`]
      : []),
    ...(mapped.lowConfidenceMappings.length
      ? [`${mapped.lowConfidenceMappings.length} auto-mapped account(s) have low confidence.`]
      : []),
  ]

  const monthlyPreview =
    config.period_granularity === "monthly"
      ? periodData.periods.map((period) => ({
          month: period.label,
          opening_balance: period.opening_balance,
          net_cash_flow: period.net_cash_flow,
          closing_balance: period.closing_balance,
          buckets: period.bucket_amounts,
        }))
      : []

  const previewTotals = {
    ...periodData.totals,
  }
  if (monthlyPreview.length) {
    previewTotals.opening_balance_january = monthlyPreview[0]?.opening_balance || periodData.opening_balance_start
    previewTotals.closing_balance_december =
      monthlyPreview[Math.min(11, monthlyPreview.length - 1)]?.closing_balance || periodData.totals.closing_balance_end
  }

  return {
    outputFilePath,
    normalizedConfig: config,
    warnings,
    mapping: {
      auto_mappings_created: mapped.autoCreatedMappings,
      low_confidence_mappings: mapped.lowConfidenceMappings,
      final_bucket_assignments: mapped.finalBucketAssignments,
    },
    preview: {
      period_start: periodData.period_start,
      period_end: periodData.period_end,
      preset: preset || null,
      trial_balance: {
        company: trialBalance.company,
        as_of_date: trialBalance.asOfDate.toISOString().slice(0, 10),
        cash_account: trialBalance.cashAccountName,
        cash_ending_balance: trialBalance.cashEndingBalance,
      },
      totals: previewTotals,
      periods: periodData.periods.map((period) => ({
        period_key: period.period_key,
        label: period.label,
        period_type: period.period_type,
        date_start: period.start ? formatIsoDate(period.start) : null,
        date_end: period.end ? formatIsoDate(period.end) : null,
        in_scope: period.in_scope,
        opening_balance: period.opening_balance,
        net_cash_flow: period.net_cash_flow,
        closing_balance: period.closing_balance,
        buckets: period.bucket_amounts,
      })),
      monthly: monthlyPreview,
      mapping_summary: {
        total_cash_movements: generalLedger.movements.length,
        mapped_cash_movements: mapped.mappedMovements.length,
        auto_mappings_created: mapped.autoCreatedMappings.length,
        low_confidence_mappings: mapped.lowConfidenceMappings.length,
      },
    },
  }
}

module.exports = {
  CashFlowValidationError,
  validateTemplateConfig,
  validateV2TemplateConfig,
  validateV3TemplateConfig,
  analyzeTemplateWorkbook,
  migrateLegacyTemplateConfigToV2,
  migrateLegacyTemplateConfigToV3,
  migrateV2TemplateConfigToV3,
  ensureV2TemplateConfig,
  ensureV3TemplateConfig,
  parseTrialBalanceFile,
  parseGeneralLedgerFile,
  resolveRunDateRange,
  mapMovementsToBuckets,
  buildFiscalYearData,
  fillTemplateWorkbook,
  generateCashFlowReport,
  __test: {
    normalizeText,
    parseMonthValue,
    parsePeriodToken,
    allocateByWeights,
    roundCurrency,
    normalizeBucketKey,
    detectBucketDirection,
    computeTokenSimilarity,
    pickRowLayoutCandidate,
    pickColumnLayoutCandidate,
    resolvePeriodRanges,
    buildTemplatePeriodData,
  },
}
