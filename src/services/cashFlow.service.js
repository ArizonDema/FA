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

function validateTemplateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CashFlowValidationError("Template config_json must be a JSON object")
  }

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

  if (!Array.isArray(input.buckets) || input.buckets.length === 0) {
    throw new CashFlowValidationError("Template config_json.buckets must contain at least one bucket")
  }

  const seenKeys = new Set()
  const fallbackByDirection = { inflow: 0, outflow: 0 }
  const buckets = input.buckets.map((bucket, bucketIndex) => {
    const bucketKey = String(bucket?.bucket_key || "").trim()
    const label = String(bucket?.label || "").trim()
    const direction = String(bucket?.direction || "").trim().toLowerCase()
    const columnHeader = String(bucket?.column_header || "").trim()
    const fallback = Boolean(bucket?.fallback)

    if (!bucketKey) throw new CashFlowValidationError(`Bucket #${bucketIndex + 1} is missing bucket_key`)
    if (seenKeys.has(bucketKey)) throw new CashFlowValidationError(`Bucket key "${bucketKey}" is duplicated`)
    seenKeys.add(bucketKey)

    if (!label) throw new CashFlowValidationError(`Bucket "${bucketKey}" is missing label`)
    if (!["inflow", "outflow"].includes(direction)) {
      throw new CashFlowValidationError(`Bucket "${bucketKey}" has invalid direction. Use "inflow" or "outflow"`)
    }
    if (!columnHeader) throw new CashFlowValidationError(`Bucket "${bucketKey}" is missing column_header`)

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

          return {
            match_type: matchType,
            pattern,
            priority,
          }
        })
      : []

    return {
      bucket_key: bucketKey,
      label,
      direction,
      column_header: columnHeader,
      fallback,
      rules,
    }
  })

  return {
    sheet_name: sheetName,
    header_row: headerRow,
    month_column_header: monthColumnHeader,
    opening_column_header: openingColumnHeader,
    closing_column_header: closingColumnHeader,
    buckets,
  }
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

function mapMovementsToBuckets(movements, buckets) {
  const fallbackByDirection = {
    inflow: buckets.find((bucket) => bucket.direction === "inflow" && bucket.fallback) || null,
    outflow: buckets.find((bucket) => bucket.direction === "outflow" && bucket.fallback) || null,
  }

  const mappedMovements = []
  const unmapped = []

  movements.forEach((movement) => {
    const direction = movement.amount >= 0 ? "inflow" : "outflow"
    const directionBuckets = buckets
      .map((bucket, bucketIndex) => ({ bucket, bucketIndex }))
      .filter((item) => item.bucket.direction === direction)

    let bestMatch = null
    directionBuckets.forEach(({ bucket, bucketIndex }) => {
      bucket.rules.forEach((rule, ruleIndex) => {
        const normalizedAccount = normalizeText(movement.account_name)
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

        if (compareRuleScore(bestMatch, score) > 0) {
          bestMatch = score
        }
      })
    })

    const bucket = bestMatch?.bucket || fallbackByDirection[direction] || null

    if (!bucket) {
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
      bucket_key: bucket.bucket_key,
      bucket_label: bucket.label,
      abs_amount: roundCurrency(Math.abs(movement.amount)),
    })
  })

  return { mappedMovements, unmapped }
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

  const asOf = parseDateValue(tbAsOfDate, "Trial Balance As of Date")
  if (asOf.getFullYear() !== year) {
    throw new CashFlowValidationError(
      `Trial Balance As of Date (${asOf.toISOString().slice(0, 10)}) must be within fiscal year ${year}`,
    )
  }

  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const asOfEnd = new Date(Date.UTC(year, asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999))

  const netToAsOf = roundCurrency(
    cashMovements
      .filter((movement) => movement.date >= yearStart && movement.date <= asOfEnd)
      .reduce((sum, movement) => sum + movement.amount, 0),
  )

  const openingJanuary = roundCurrency(tbCashEndingBalance - netToAsOf)

  const months = MONTH_NAMES.map((month, index) => {
    const bucketAmounts = {}
    buckets.forEach((bucket) => {
      bucketAmounts[bucket.bucket_key] = 0
    })
    return {
      month_index: index + 1,
      month_label: month,
      opening_balance: 0,
      net_cash_flow: 0,
      closing_balance: 0,
      bucket_amounts: bucketAmounts,
    }
  })

  mappedMovements.forEach((movement) => {
    const movementDate = movement.date
    if (movementDate.getFullYear() !== year) return
    const monthIndex = movementDate.getMonth() + 1
    const month = months[monthIndex - 1]
    if (!month) return

    month.net_cash_flow = roundCurrency(month.net_cash_flow + movement.amount)
    month.bucket_amounts[movement.bucket_key] = roundCurrency(
      (month.bucket_amounts[movement.bucket_key] || 0) + movement.abs_amount,
    )
  })

  let rollingOpening = openingJanuary
  months.forEach((month) => {
    month.opening_balance = roundCurrency(rollingOpening)
    month.closing_balance = roundCurrency(month.opening_balance + month.net_cash_flow)
    rollingOpening = month.closing_balance
  })

  const totals = {
    total_inflows: roundCurrency(
      mappedMovements
        .filter((movement) => movement.date.getFullYear() === year && movement.amount >= 0)
        .reduce((sum, movement) => sum + movement.amount, 0),
    ),
    total_outflows: roundCurrency(
      mappedMovements
        .filter((movement) => movement.date.getFullYear() === year && movement.amount < 0)
        .reduce((sum, movement) => sum + Math.abs(movement.amount), 0),
    ),
    net_cash_flow: roundCurrency(
      mappedMovements
        .filter((movement) => movement.date.getFullYear() === year)
        .reduce((sum, movement) => sum + movement.amount, 0),
    ),
    opening_balance_january: openingJanuary,
    closing_balance_december: months[11].closing_balance,
    bucket_totals: {},
  }

  buckets.forEach((bucket) => {
    totals.bucket_totals[bucket.bucket_key] = roundCurrency(
      months.reduce((sum, month) => sum + (month.bucket_amounts[bucket.bucket_key] || 0), 0),
    )
  })

  const asOfMonth = asOf.getMonth() + 1
  const calculatedAsOfClosing = months[asOfMonth - 1].closing_balance
  const warnings = []
  if (Math.abs(calculatedAsOfClosing - tbCashEndingBalance) > 0.01) {
    warnings.push(
      `Calculated closing balance at TB as-of month (${calculatedAsOfClosing}) does not match TB cash ending (${tbCashEndingBalance}).`,
    )
  }

  return {
    fiscal_year: year,
    opening_balance_january: openingJanuary,
    months,
    totals,
    warnings,
  }
}

async function fillTemplateWorkbook({ templatePath, outputPath, config, fiscalData }) {
  ensureFileExists(templatePath, "Cash flow template")

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const worksheet = workbook.getWorksheet(config.sheet_name)
  if (!worksheet) {
    throw new CashFlowValidationError(`Template sheet "${config.sheet_name}" not found`)
  }

  const headerRow = worksheet.getRow(config.header_row)
  const headerLookup = extractHeaderLookup(headerRow)

  const resolveColumn = (headerName, label) => {
    const key = normalizeHeader(headerName)
    const column = headerLookup.get(key)
    if (!column) {
      throw new CashFlowValidationError(`Template header "${headerName}" not found for ${label}`)
    }
    return column
  }

  const monthColumn = resolveColumn(config.month_column_header, "month")
  const openingColumn = resolveColumn(config.opening_column_header, "opening balance")
  const closingColumn = resolveColumn(config.closing_column_header, "closing balance")

  const bucketColumns = {}
  config.buckets.forEach((bucket) => {
    bucketColumns[bucket.bucket_key] = resolveColumn(bucket.column_header, `bucket ${bucket.bucket_key}`)
  })

  const monthRows = new Map()
  const maxRowsToScan = Math.max(worksheet.rowCount, config.header_row + 48)
  for (let rowIndex = config.header_row + 1; rowIndex <= maxRowsToScan; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const month = parseMonthValue(row.getCell(monthColumn).value)
    if (!month) continue
    if (!monthRows.has(month)) {
      monthRows.set(month, rowIndex)
    }
  }

  if (monthRows.size < 12) {
    throw new CashFlowValidationError(
      `Template month mapping failed. Found ${monthRows.size} month rows; expected all 12 months.`,
    )
  }

  const setNumberCellIfWritable = (cell, value) => {
    if (isFormulaCell(cell.value)) return false
    cell.value = roundCurrency(value)
    return true
  }

  fiscalData.months.forEach((month) => {
    const rowIndex = monthRows.get(month.month_index)
    if (!rowIndex) return

    const row = worksheet.getRow(rowIndex)
    setNumberCellIfWritable(row.getCell(openingColumn), month.opening_balance)
    config.buckets.forEach((bucket) => {
      const amount = month.bucket_amounts[bucket.bucket_key] || 0
      setNumberCellIfWritable(row.getCell(bucketColumns[bucket.bucket_key]), amount)
    })
    setNumberCellIfWritable(row.getCell(closingColumn), month.closing_balance)
  })

  workbook.calcProperties.fullCalcOnLoad = true
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await workbook.xlsx.writeFile(outputPath)
}

async function generateCashFlowReport({
  templatePath,
  templateConfig,
  tbFilePath,
  glFilePath,
  fiscalYear,
  outputFilePath,
}) {
  const config = validateTemplateConfig(templateConfig)
  const trialBalance = await parseTrialBalanceFile(tbFilePath)
  const generalLedger = await parseGeneralLedgerFile(glFilePath, {
    cashAccountName: trialBalance.cashAccountName,
  })

  const mapped = mapMovementsToBuckets(generalLedger.movements, config.buckets)
  if (mapped.unmapped.length) {
    const sample = mapped.unmapped
      .slice(0, 5)
      .map((item) => item.account_name)
      .join(", ")
    throw new CashFlowValidationError(
      `Unmapped cash movements found for ${mapped.unmapped.length} row(s). Example account(s): ${sample}`,
      mapped.unmapped.slice(0, 50),
    )
  }

  const fiscalData = buildFiscalYearData({
    fiscalYear,
    tbAsOfDate: trialBalance.asOfDate,
    tbCashEndingBalance: trialBalance.cashEndingBalance,
    cashMovements: generalLedger.movements,
    mappedMovements: mapped.mappedMovements,
    buckets: config.buckets,
  })

  await fillTemplateWorkbook({
    templatePath,
    outputPath: outputFilePath,
    config,
    fiscalData,
  })

  return {
    outputFilePath,
    warnings: [...generalLedger.warnings, ...fiscalData.warnings],
    preview: {
      fiscal_year: fiscalData.fiscal_year,
      trial_balance: {
        company: trialBalance.company,
        as_of_date: trialBalance.asOfDate.toISOString().slice(0, 10),
        cash_account: trialBalance.cashAccountName,
        cash_ending_balance: trialBalance.cashEndingBalance,
      },
      totals: fiscalData.totals,
      monthly: fiscalData.months.map((month) => ({
        month: month.month_label,
        opening_balance: month.opening_balance,
        net_cash_flow: month.net_cash_flow,
        closing_balance: month.closing_balance,
        buckets: month.bucket_amounts,
      })),
      mapping_summary: {
        total_cash_movements: generalLedger.movements.length,
        mapped_cash_movements: mapped.mappedMovements.length,
      },
    },
  }
}

module.exports = {
  CashFlowValidationError,
  validateTemplateConfig,
  parseTrialBalanceFile,
  parseGeneralLedgerFile,
  mapMovementsToBuckets,
  buildFiscalYearData,
  fillTemplateWorkbook,
  generateCashFlowReport,
  __test: {
    normalizeText,
    parseMonthValue,
    allocateByWeights,
    roundCurrency,
  },
}
