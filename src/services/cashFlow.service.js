const fs = require("fs")
const path = require("path")
const appConfig = require("../config/app")
const { readWorkbookFromFile } = require("../utils/excelWorkbook.util")
const CashFlowConcepts = require("./cashFlowConcepts.service")

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

const STATEMENT_METHODS = {
  DIRECT: "direct",
  INDIRECT: "indirect",
}

const DIRECT_CASH_FLOW_CONCEPTS = [
  {
    key: "customer_receipts",
    direction: "inflow",
    patterns: [
      /\bcash receipts?\b/,
      /\bcustomer(s)?\b/,
      /\bclient(s)?\b/,
      /\baccounts receivable\b/,
      /\bar\b/,
      /\bclient balances?\b/,
      /\bcustomer balances?\b/,
      /\bcollections?\b/,
      /\bcollected\b/,
      /\brevenue\b/,
      /\bcash sales\b/,
      /\bsales receipts?\b/,
      /\bmerchant\b/,
    ],
  },
  {
    key: "other_operating_inflows",
    direction: "inflow",
    patterns: [/\brefunds?\b/, /\brebates?\b/, /\bother operating inflows?\b/, /\boperating inflows?\b/],
  },
  {
    key: "supplier_payments",
    direction: "outflow",
    patterns: [
      /\bsuppliers?\b/,
      /\bvendors?\b/,
      /\bvendor disbursements?\b/,
      /\btrade vendor(s)?\b/,
      /\bpartner payouts?\b/,
      /\bpartner operating payouts?\b/,
      /\bexternal partner payouts?\b/,
      /\boperating payouts?\b/,
      /\baccounts payable\b/,
      /\bap\b/,
      /\bcogs\b/,
      /\bcost of sales\b/,
      /\binventory\b/,
      /\bmaterials?\b/,
    ],
  },
  {
    key: "payroll",
    direction: "outflow",
    patterns: [
      /\bpayroll\b/,
      /\bwages?\b/,
      /\bsalar(y|ies)\b/,
      /\bbenefits?\b/,
      /\bbonus(es)?\b/,
      /\bcommissions?\b/,
      /\bcompensation\b/,
      /\bpeople costs?\b/,
      /\bteam costs?\b/,
      /\bteam compensation\b/,
    ],
  },
  {
    key: "rent_facilities",
    direction: "outflow",
    patterns: [/\brent\b/, /\bpremises?\b/, /\bfacilit(y|ies) costs?\b/, /\blease\b/, /\boccupancy\b/, /\bspace commitments?\b/, /\bworkplace\b/],
  },
  {
    key: "sales_marketing",
    direction: "outflow",
    patterns: [
      /\bmarketing\b/,
      /\badvertis(e|ing)\b/,
      /\bpromotion(s)?\b/,
      /\bbrand\b/,
      /\bdemand generation\b/,
      /\bdemand creation\b/,
      /\bdemand (gen|creation|capture)\b/,
      /\bgrowth spend\b/,
      /\bgrowth campaign(s)?\b/,
      /\bcampaign spend\b/,
      /\bcampaign expense\b/,
    ],
  },
  {
    key: "general_admin",
    direction: "outflow",
    patterns: [
      /\bgeneral\b/,
      /\badmin\b/,
      /\bg&a\b/,
      /\badministrative\b/,
      /\blegal\b/,
      /\baccounting\b/,
      /\bprofessional fees?\b/,
      /\binsurance\b/,
      /\butilities\b/,
      /\boverhead\b/,
      /\bbank charges?\b/,
      /\bsoftware subscription(s)?\b/,
      /\bsaas\b/,
    ],
  },
  {
    key: "income_taxes",
    direction: "outflow",
    patterns: [/\bincome taxes?\b/, /\btaxes paid\b/, /\btax payment(s)?\b/],
  },
  {
    key: "capital_expenditures",
    direction: "outflow",
    patterns: [
      /\bcapex\b/,
      /\bcapital expenditures?\b/,
      /\bfixed assets?\b/,
      /\basset purchases?\b/,
      /\bequipment\b/,
      /\bhardware\b/,
      /\bproperty\b/,
      /\bplant\b/,
      /\bppe\b/,
      /\bleasehold improvements?\b/,
    ],
  },
  {
    key: "capitalized_software",
    direction: "outflow",
    patterns: [/\bcapitali[sz]ed software\b/, /\bsoftware development capitalization\b/, /\bdevelopment capitalization\b/],
  },
  {
    key: "asset_sale_proceeds",
    direction: "inflow",
    patterns: [/\basset sale\b/, /\bdisposal proceeds?\b/, /\bsale proceeds?\b/, /\binvestment sale\b/],
  },
  {
    key: "debt_drawdown",
    direction: "inflow",
    patterns: [
      /\bdebt drawdown\b/,
      /\bborrowings?\b/,
      /\bborrowing proceeds?\b/,
      /\bloan proceeds?\b/,
      /\bdebt issued\b/,
      /\bnotes? payable proceeds?\b/,
      /\bcredit facilit(y|ies) proceeds?\b/,
      /\bcredit line proceeds?\b/,
      /\bfinancing proceeds?\b/,
    ],
  },
  {
    key: "debt_repayment",
    direction: "outflow",
    patterns: [
      /\bdebt repayments?\b/,
      /\bprincipal repayments?\b/,
      /\bprincipal paid\b/,
      /\bborrowing principal paid\b/,
      /\bloan payments?\b/,
      /\bnote repayments?\b/,
      /\bcredit facilit(y|ies) repayments?\b/,
    ],
  },
  {
    key: "interest_paid",
    direction: "outflow",
    patterns: [/\binterest paid\b/, /\binterest expense\b/, /\bfinance costs?\b/, /\bfinance charges? paid\b/, /\bfinance charges?\b/],
  },
  {
    key: "equity_injection",
    direction: "inflow",
    patterns: [
      /\bequity injection\b/,
      /\bcapital contributions?\b/,
      /\bpaid in capital\b/,
      /\bpaid-in capital\b/,
      /\bowner contributions?\b/,
      /\bpartner contributions?\b/,
      /\bmember funding\b/,
      /\bfounder funding\b/,
      /\bfounder contributions?\b/,
      /\binvestor funding\b/,
      /\binvestor cash\b/,
      /\bcapital calls?\b/,
      /\bsubscriptions?\b/,
    ],
  },
  {
    key: "dividends_distributions",
    direction: "outflow",
    patterns: [/\bdividends? paid\b/, /\bdistributions?\b/, /\bredemptions?\b/, /\bowner drawings?\b/, /\bpartner drawings?\b/],
  },
]

const DIRECT_OUTFLOW_TEXT_HINTS = [
  /\boutflows?\b/,
  /\bpayments?\b/,
  /\bpaid\b/,
  /\bexpense(s)?\b/,
  /\bcost(s)?\b/,
  /\brepayments?\b/,
  /\bdividends?\b/,
  /\bdistributions?\b/,
  /\bredemptions?\b/,
  /\bcapex\b/,
  /\bexpenditures?\b/,
  /\bpurchases?\b/,
  /\bpayroll\b/,
  /\brent\b/,
  /\bmarketing\b/,
  /\badmin\b/,
  /\btaxes?\b/,
]

const DIRECT_INFLOW_TEXT_HINTS = [
  /\binflows?\b/,
  /\breceipts?\b/,
  /\bproceeds?\b/,
  /\bdrawdowns?\b/,
  /\bborrowings?\b/,
  /\bcontributions?\b/,
  /\binjections?\b/,
  /\bfunding\b/,
  /\bcapital calls?\b/,
]

const INDIRECT_ROW_DEFINITIONS = [
  {
    semantic_key: "net_income",
    label: "Net Income",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/^net income$/i, /\bprofit\b/i],
  },
  {
    semantic_key: "depreciation_amortization",
    label: "Depreciation & Amortization",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/depreciation/i, /amorti[sz]ation/i],
  },
  {
    semantic_key: "change_in_receivables",
    label: "Change in Receivables",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/change in receivables?/i, /receivables?/i, /accounts receivable/i],
  },
  {
    semantic_key: "change_in_inventory",
    label: "Change in Inventory",
    role: "input",
    cash_direction: "neutral",
    required: false,
    patterns: [/change in inventory/i, /\binventory\b/i],
  },
  {
    semantic_key: "change_in_payables",
    label: "Change in Payables",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/change in payables?/i, /accounts payable/i],
  },
  {
    semantic_key: "other_working_capital_changes",
    label: "Other Working Capital Changes",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/other working capital/i, /working capital changes/i],
  },
  {
    semantic_key: "operating_cash_flow",
    label: "Cash Flow from Operations",
    role: "summary",
    cash_direction: "mixed",
    required: true,
    patterns: [/cash flow from operations/i, /operating cash flow/i],
  },
  {
    semantic_key: "capital_expenditures",
    label: "Capital Expenditures",
    role: "input",
    cash_direction: "outflow",
    required: true,
    patterns: [/capital expenditures?/i, /\bcapex\b/i],
  },
  {
    semantic_key: "asset_sales",
    label: "Asset Sales",
    role: "input",
    cash_direction: "inflow",
    required: false,
    patterns: [/asset sales?/i, /sale of assets?/i],
  },
  {
    semantic_key: "investing_cash_flow",
    label: "Cash Flow from Investing",
    role: "summary",
    cash_direction: "mixed",
    required: true,
    patterns: [/cash flow from investing/i, /investing cash flow/i],
  },
  {
    semantic_key: "capital_contributions",
    label: "Capital Contributions",
    role: "input",
    cash_direction: "inflow",
    required: true,
    patterns: [/capital contributions?/i, /owner capital/i, /capital infusions?/i],
  },
  {
    semantic_key: "debt_issued",
    label: "Debt Issued",
    role: "input",
    cash_direction: "inflow",
    required: false,
    patterns: [/debt issued/i, /loan proceeds/i, /borrowings?/i],
  },
  {
    semantic_key: "debt_repaid",
    label: "Debt Repaid",
    role: "input",
    cash_direction: "outflow",
    required: false,
    patterns: [/debt repaid/i, /loan repayments?/i, /principal repayments?/i],
  },
  {
    semantic_key: "interest_paid",
    label: "Interest Paid",
    role: "input",
    cash_direction: "outflow",
    required: false,
    patterns: [/interest paid/i],
  },
  {
    semantic_key: "dividends_paid",
    label: "Dividends Paid",
    role: "input",
    cash_direction: "outflow",
    required: false,
    patterns: [/dividends? paid/i, /owner drawings?/i, /drawings?/i, /distributions?/i],
  },
  {
    semantic_key: "financing_cash_flow",
    label: "Cash Flow from Financing",
    role: "summary",
    cash_direction: "mixed",
    required: true,
    patterns: [/cash flow from financing/i, /financing cash flow/i],
  },
  {
    semantic_key: "net_change_in_cash",
    label: "Net Change in Cash",
    role: "summary",
    cash_direction: "mixed",
    required: true,
    patterns: [/net change in cash/i, /net increase in cash/i, /net decrease in cash/i],
  },
  {
    semantic_key: "opening_cash",
    label: "Cash at Beginning",
    role: "input",
    cash_direction: "neutral",
    required: true,
    patterns: [/cash at beginning/i, /opening cash/i, /cash at start/i],
  },
  {
    semantic_key: "closing_cash",
    label: "Cash at End",
    role: "summary",
    cash_direction: "neutral",
    required: true,
    patterns: [/cash at end/i, /closing cash/i, /ending cash/i],
  },
]

const INDIRECT_ROW_LOOKUP = new Map(
  INDIRECT_ROW_DEFINITIONS.map((definition) => [definition.semantic_key, definition]),
)

const REQUIRED_INDIRECT_FINANCING_KEYS = ["capital_contributions"]

function getIndirectRowDefinitions() {
  return INDIRECT_ROW_DEFINITIONS.map((definition) => ({
    semantic_key: definition.semantic_key,
    label: definition.label,
    role: definition.role,
    cash_direction: definition.cash_direction,
    required: Boolean(definition.required),
  }))
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

function isFormulaCellValue(value) {
  return Boolean(value && typeof value === "object" && value.formula)
}

function isFormulaLiteralNumber(value) {
  if (!isFormulaCellValue(value)) return false
  const formula = String(value.formula || "").trim()
  return /^[+-]?(?:\d+|\d*\.\d+)$/.test(formula)
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
  const compactNumeric = normalized.replace(/,/g, "").replace(/\s+/g, "")
  if (/^[+-]?(?:\d+|\d*\.\d+)$/.test(compactNumeric)) return false
  if (/\b(period|p\d+|h1|h2|half|week|w\d+|fy|year|yr)\b/i.test(normalized)) return true
  if (/\d/.test(normalized)) return true
  return false
}

function parsePeriodToken(rawValue, options = {}) {
  const allowCustom = options.allowCustom !== false
  const allowFormulaResult = options.allowFormulaResult === true
  const allowNumericPeriod = options.allowNumericPeriod === true
  if (isFormulaCellValue(rawValue) && !allowFormulaResult) return null
  const primitive = readCellPrimitive(rawValue)
  if (primitive === null || primitive === undefined || primitive === "") return null
  if (typeof primitive === "number" && !allowNumericPeriod) return null

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

  const compactNumeric = normalized.replace(/,/g, "").replace(/\s+/g, "")
  if (!allowNumericPeriod && /^[+-]?(?:\d+|\d*\.\d+)$/.test(compactNumeric)) return null

  const month = parseMonthValue(rawValue)
  if (month) {
    const embeddedYearMatch = normalized.match(/\b(19|20)\d{2}\b/)
    const year = embeddedYearMatch ? Number.parseInt(embeddedYearMatch[0], 10) : null
    return {
      label: text,
      period_key: `m${String(month).padStart(2, "0")}${year ? `_${year}` : ""}`,
      period_type: "monthly",
      month,
      year,
      quarter: Math.floor((month - 1) / 3) + 1,
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
    const semanticKey = CashFlowConcepts.normalizeDirectConceptKey(bucket?.semantic_key || bucket?.semanticKey || "")
    const semanticConcept = semanticKey ? CashFlowConcepts.getDirectConcept(semanticKey) : null
    const semanticConfidence = Number(bucket?.semantic_confidence ?? bucket?.semanticConfidence ?? 0)

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
    if (semanticKey && (!semanticConcept || semanticConcept.direction !== direction)) {
      throw new CashFlowValidationError(`Bucket "${bucketKey}" has invalid semantic_key for ${direction}`)
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
      ...(semanticConcept
        ? {
            semantic_key: semanticConcept.key,
            semantic_confidence: Number.isFinite(semanticConfidence) ? Math.max(0, Math.min(1, semanticConfidence)) : 0,
            semantic_source: String(bucket?.semantic_source || bucket?.semanticSource || "deterministic").trim() || "deterministic",
            semantic_evidence: Array.isArray(bucket?.semantic_evidence || bucket?.semanticEvidence)
              ? (bucket.semantic_evidence || bucket.semanticEvidence).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
              : [],
          }
        : {}),
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
    statement_method: STATEMENT_METHODS.DIRECT,
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

function normalizeStatementMethod(input) {
  const method = String(input || STATEMENT_METHODS.DIRECT)
    .trim()
    .toLowerCase()
  if (!Object.values(STATEMENT_METHODS).includes(method)) {
    throw new CashFlowValidationError('statement_method must be "direct" or "indirect"')
  }
  return method
}

function inferStatementMethodFromConfigShape(input = {}) {
  if (input?.statement_method !== undefined && input?.statement_method !== null && String(input.statement_method).trim()) {
    return normalizeStatementMethod(input.statement_method)
  }

  const hasRowBindings = Array.isArray(input?.row_bindings) && input.row_bindings.length > 0
  const hasBucketBindings =
    (Array.isArray(input?.bucket_bindings) && input.bucket_bindings.length > 0) ||
    (Array.isArray(input?.buckets) && input.buckets.length > 0)

  if (hasRowBindings && !hasBucketBindings) {
    return STATEMENT_METHODS.INDIRECT
  }

  return STATEMENT_METHODS.DIRECT
}

function looksLikeV3TemplateConfig(input = {}) {
  return Boolean(
    String(input?.version || "").toLowerCase() === "v3" ||
      input?.period_axis ||
      input?.period_granularity ||
      input?.period_resolution_rules ||
      Array.isArray(input?.row_bindings) ||
      Array.isArray(input?.bucket_bindings) ||
      input?.opening_binding ||
      input?.closing_binding ||
      String(input?.statement_method || "").trim().toLowerCase() === STATEMENT_METHODS.INDIRECT,
  )
}

function normalizeIndirectRowBindings(input, labelKeys) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new CashFlowValidationError("row_bindings must contain at least one row binding for indirect templates")
  }

  const seenKeys = new Set()
  return input.map((binding, index) => {
    const semanticKey = normalizePeriodKey(binding?.semantic_key, `row_${index + 1}`)
    if (seenKeys.has(semanticKey)) {
      throw new CashFlowValidationError(`row_bindings contains duplicate semantic_key "${semanticKey}"`)
    }
    seenKeys.add(semanticKey)

    const label = String(binding?.label || INDIRECT_ROW_LOOKUP.get(semanticKey)?.label || semanticKey).trim()
    const role = String(binding?.role || INDIRECT_ROW_LOOKUP.get(semanticKey)?.role || "input")
      .trim()
      .toLowerCase()
    if (!["input", "summary"].includes(role)) {
      throw new CashFlowValidationError(`row_bindings[${index}] role must be input or summary`)
    }

    const cells = normalizePeriodBindingEntries(binding?.cells, `row_bindings[${index}].cells`)
    const cellKeys = new Set(cells.map((entry) => entry.period_key))
    if (!Array.from(labelKeys).every((key) => cellKeys.has(key))) {
      throw new CashFlowValidationError(`row_bindings[${index}] must include cell targets for every detected period`)
    }

    return {
      semantic_key: semanticKey,
      label,
      role,
      required: binding?.required !== false,
      cells,
    }
  })
}

function validateV2TemplateConfig(input) {
  const sheetName = String(input.sheet_name || "").trim()
  if (!sheetName) throw new CashFlowValidationError("Template config_json.sheet_name is required")
  const statementMethod = inferStatementMethodFromConfigShape(input)

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

  const buckets =
    statementMethod === STATEMENT_METHODS.DIRECT
      ? normalizeBucketCollection(input.bucket_bindings || input.buckets, {
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
      : []

  return {
    version: "v2",
    statement_method: statementMethod,
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
  const statementMethod = inferStatementMethodFromConfigShape(input)

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

  const buckets =
    statementMethod === STATEMENT_METHODS.DIRECT
      ? normalizeBucketCollection(input.bucket_bindings || input.buckets, {
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
      : []

  const rowBindings =
    statementMethod === STATEMENT_METHODS.INDIRECT
      ? normalizeIndirectRowBindings(input.row_bindings, labelKeys)
      : []

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
    statement_method: statementMethod,
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
    row_bindings: rowBindings,
    writer_policy: writerPolicy,
    mapping_policy: mappingPolicy,
    review_metadata:
      input.review_metadata && typeof input.review_metadata === "object"
        ? {
            ...input.review_metadata,
            confirmed_anchors: Array.isArray(input.review_metadata.confirmed_anchors)
              ? input.review_metadata.confirmed_anchors
                  .map((anchor) => String(anchor || "").trim().toLowerCase().replace(/\s+/g, "_"))
                  .filter(Boolean)
              : [],
          }
        : undefined,
  }
}

function validateTemplateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CashFlowValidationError("Template config_json must be a JSON object")
  }

  if (looksLikeV3TemplateConfig(input)) {
    return validateV3TemplateConfig(input)
  }

  if (String(input.version || "").toLowerCase() === "v2" || Array.isArray(input.month_bindings)) {
    return validateV2TemplateConfig(input)
  }

  return validateLegacyTemplateConfig(input)
}

async function parseTrialBalanceFile(filePath) {
  ensureFileExists(filePath, "Trial Balance")

  const workbook = await readWorkbookFromFile({
    filePath,
    label: "Trial Balance",
    ValidationErrorCtor: CashFlowValidationError,
  })
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

  const workbook = await readWorkbookFromFile({
    filePath,
    label: "General Ledger",
    ValidationErrorCtor: CashFlowValidationError,
  })
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

function pushUniqueText(target, value, limit = 6) {
  if (!Array.isArray(target)) return
  const text = String(value || "").trim().replace(/\s+/g, " ")
  if (!text) return
  const key = text.toLowerCase()
  if (target.some((item) => String(item || "").trim().toLowerCase() === key)) return
  if (target.length < limit) target.push(text)
}

function normalizeProfileToken(value) {
  return normalizeText(value).replace(/[^a-z0-9 ]/g, "").trim()
}

function pushEvidenceToken(target, value, limit = 16) {
  if (!Array.isArray(target)) return
  const token = normalizeProfileToken(value)
  if (!token || token.length < 3) return
  if (target.includes(token)) return
  if (target.length < limit) target.push(token)
}

function isCashLikeAccount(accountName) {
  const normalized = normalizeText(accountName)
  if (!normalized) return false
  return /\b(cash|checking|bank account|operating account|savings|money market)\b/.test(normalized)
}

function inferRuntimeAccountClass(accountName, tbRow = null) {
  const normalized = normalizeText(accountName)
  if (!normalized) return "other"
  if (isCashLikeAccount(normalized)) return "cash"
  if (/\b(accounts receivable|trade receivables?|a\/r| ar |client balances?|customer balances?|open invoices?)\b/.test(` ${normalized} `)) {
    return "receivable"
  }
  if (/\binventory\b/.test(normalized)) return "inventory"
  if (/\b(prepaid|deposit asset|other current asset|current asset)\b/.test(normalized)) return "current_asset"
  if (
    /\b(fixed asset|ppe|p p e|property|plant|equipment|vehicle|machinery|furniture|hardware|computer hardware|leasehold|capital asset|accumulated depreciation)\b/.test(
      normalized,
    )
  ) {
    return "fixed_asset"
  }
  if (/\b(accounts payable|trade payable|a\/p| ap |vendor payable|supplier payable)\b/.test(` ${normalized} `)) return "payable"
  if (/\b(accrued|accrual|credit card|tax payable|payroll payable|wages payable|deferred revenue|unearned revenue)\b/.test(normalized)) {
    return "current_liability"
  }
  if (/\b(loan|note payable|notes payable|debt|line of credit|credit facility|credit line|loc|mortgage|borrowing|term note|capital lease)\b/.test(normalized)) {
    return "debt"
  }
  if (
    /\b(equity|capital|contribution|member|owner|founder|investor|partner|paid in|paid-in|retained earnings|drawing|drawings|distribution|dividend|redemption|funding)\b/.test(
      normalized,
    )
  ) {
    return "equity"
  }
  if (/\b(revenue|sales|income|merchant|customer)\b/.test(normalized) && !/\bunearned revenue\b/.test(normalized)) return "revenue"
  if (/\b(payroll|wages?|salar(y|ies)|benefits?|bonus|commission|compensation|people costs?|team costs?)\b/.test(normalized)) {
    return "payroll_expense"
  }
  if (/\b(rent|lease|premises?|occupancy)\b/.test(normalized)) return "rent_expense"
  if (/\b(marketing|advertising|promotion|brand|sales expense|growth campaign|growth spend|campaign spend)\b/.test(normalized)) {
    return "marketing_expense"
  }
  if (/\b(income tax|tax expense|taxes)\b/.test(normalized)) return "tax_expense"
  if (/\b(interest expense|finance cost|finance charge|bank fee|loan fee)\b/.test(normalized)) return "interest_expense"
  if (/\b(expense|fees?|legal|accounting|professional|insurance|utilities|facility services|facilities services|software|subscription|travel|supplies|admin|bank charges?)\b/.test(normalized)) {
    return "admin_expense"
  }

  const balance = Number(tbRow?.endingBalance || 0)
  if (Number.isFinite(balance) && balance < 0 && /\bpayable|liabilit|loan|debt|capital|equity\b/.test(normalized)) {
    return "liability_or_equity"
  }
  return "other"
}

function getRuntimeAccountClassTokens(accountClass) {
  const lookup = {
    cash: ["cash"],
    receivable: ["accounts receivable", "customer receipts", "revenue"],
    inventory: ["inventory", "supplier payments", "cost of goods sold"],
    current_asset: ["current asset", "operating cash flow"],
    fixed_asset: ["fixed asset", "ppe", "equipment", "capital expenditures", "capex"],
    payable: ["accounts payable", "supplier payments", "vendor payments"],
    current_liability: ["current liability", "operating cash flow"],
    debt: ["debt", "loan", "borrowings", "principal repayment"],
    equity: ["equity", "capital contribution", "owner distribution"],
    revenue: ["revenue", "sales", "customer receipts"],
    payroll_expense: ["payroll", "wages", "salaries"],
    rent_expense: ["rent", "facilities", "lease"],
    marketing_expense: ["marketing", "advertising", "promotion"],
    tax_expense: ["income taxes", "tax payments"],
    interest_expense: ["interest paid", "interest expense"],
    admin_expense: ["general admin", "professional fees", "operating expenses"],
    liability_or_equity: ["liability", "equity", "financing"],
  }
  return lookup[accountClass] || []
}

function createRuntimeAccountProfileBase({ accountName, tbRow = null }) {
  const normalizedAccount = normalizeText(accountName)
  const endingDebit = roundCurrency(Number(tbRow?.endingDebit || 0))
  const endingCredit = roundCurrency(Number(tbRow?.endingCredit || 0))
  const endingBalance = roundCurrency(
    tbRow?.endingBalance !== undefined && tbRow?.endingBalance !== null
      ? Number(tbRow.endingBalance || 0)
      : endingDebit - endingCredit,
  )
  const accountClass = inferRuntimeAccountClass(accountName, tbRow)
  const profile = {
    account_name: accountName,
    normalized_account: normalizedAccount,
    company: tbRow?.company || null,
    tb_present: Boolean(tbRow),
    tb_ending_debit: endingDebit,
    tb_ending_credit: endingCredit,
    tb_ending_balance: endingBalance,
    tb_balance_direction: endingBalance > 0 ? "debit" : endingBalance < 0 ? "credit" : "zero",
    tb_account_class: accountClass,
    gl_line_count: 0,
    movement_count: 0,
    total_abs_amount: 0,
    net_amount: 0,
    active_months: [],
    sample_descriptions: [],
    sample_je_numbers: [],
    evidence_tokens: [],
    direction_keys: [],
  }

  pushEvidenceToken(profile.evidence_tokens, normalizedAccount)
  pushEvidenceToken(profile.evidence_tokens, accountClass)
  getRuntimeAccountClassTokens(accountClass).forEach((token) => pushEvidenceToken(profile.evidence_tokens, token))
  return profile
}

function serializeRuntimeAccountProfile(profile) {
  return {
    account_name: profile.account_name,
    normalized_account: profile.normalized_account,
    company: profile.company || null,
    tb_present: Boolean(profile.tb_present),
    tb_ending_debit: roundCurrency(profile.tb_ending_debit || 0),
    tb_ending_credit: roundCurrency(profile.tb_ending_credit || 0),
    tb_ending_balance: roundCurrency(profile.tb_ending_balance || 0),
    tb_balance_direction: profile.tb_balance_direction || "zero",
    tb_account_class: profile.tb_account_class || "other",
    gl_line_count: Number(profile.gl_line_count || 0),
    movement_count: Number(profile.movement_count || 0),
    total_abs_amount: roundCurrency(profile.total_abs_amount || 0),
    net_amount: roundCurrency(profile.net_amount || 0),
    active_months: Array.from(new Set(profile.active_months || [])).sort(),
    sample_descriptions: (profile.sample_descriptions || []).slice(0, 6),
    sample_je_numbers: (profile.sample_je_numbers || []).slice(0, 6),
    evidence_tokens: (profile.evidence_tokens || []).slice(0, 16),
    direction_keys: (profile.direction_keys || []).slice().sort(),
  }
}

function serializeRuntimeDirectionProfile(profile) {
  return {
    account_key: profile.account_key,
    account_name: profile.account_name,
    normalized_account: profile.normalized_account,
    direction: profile.direction,
    tb_present: Boolean(profile.tb_present),
    tb_ending_debit: roundCurrency(profile.tb_ending_debit || 0),
    tb_ending_credit: roundCurrency(profile.tb_ending_credit || 0),
    tb_ending_balance: roundCurrency(profile.tb_ending_balance || 0),
    tb_balance_direction: profile.tb_balance_direction || "zero",
    tb_account_class: profile.tb_account_class || "other",
    movement_count: Number(profile.movement_count || 0),
    total_abs_amount: roundCurrency(profile.total_abs_amount || 0),
    net_amount: roundCurrency(profile.net_amount || 0),
    active_months: Array.from(new Set(profile.active_months || [])).sort(),
    sample_descriptions: (profile.sample_descriptions || []).slice(0, 6),
    sample_je_numbers: (profile.sample_je_numbers || []).slice(0, 6),
    evidence_tokens: (profile.evidence_tokens || []).slice(0, 16),
  }
}

function buildRuntimeAccountProfile({
  trialBalance = null,
  generalLedger = null,
  trialBalanceRows = null,
  generalLedgerRows = null,
  movements = null,
  cashAccountName = null,
} = {}) {
  const tbRows = Array.isArray(trialBalance?.rows) ? trialBalance.rows : Array.isArray(trialBalanceRows) ? trialBalanceRows : []
  const glRows = Array.isArray(generalLedger?.rows) ? generalLedger.rows : Array.isArray(generalLedgerRows) ? generalLedgerRows : []
  const cashMovements = Array.isArray(generalLedger?.movements) ? generalLedger.movements : Array.isArray(movements) ? movements : []
  const normalizedCashAccount = normalizeText(cashAccountName || trialBalance?.cashAccountName || "")
  const cashAccountKeys = new Set()
  if (normalizedCashAccount) cashAccountKeys.add(normalizedCashAccount)

  tbRows.forEach((row) => {
    const normalizedAccount = normalizeText(row?.account || row?.account_name || "")
    if (!normalizedAccount) return
    if (isCashLikeAccount(normalizedAccount)) cashAccountKeys.add(normalizedAccount)
  })

  const accountProfiles = new Map()
  const directionProfiles = new Map()
  const getAccountProfile = (accountName, tbRow = null) => {
    const normalizedAccount = normalizeText(accountName)
    if (!normalizedAccount || cashAccountKeys.has(normalizedAccount) || isCashLikeAccount(normalizedAccount)) return null
    if (!accountProfiles.has(normalizedAccount)) {
      accountProfiles.set(normalizedAccount, createRuntimeAccountProfileBase({ accountName, tbRow }))
    } else if (tbRow && !accountProfiles.get(normalizedAccount).tb_present) {
      const current = accountProfiles.get(normalizedAccount)
      const refreshed = createRuntimeAccountProfileBase({ accountName: current.account_name || accountName, tbRow })
      accountProfiles.set(normalizedAccount, {
        ...refreshed,
        gl_line_count: current.gl_line_count,
        movement_count: current.movement_count,
        total_abs_amount: current.total_abs_amount,
        net_amount: current.net_amount,
        active_months: current.active_months,
        sample_descriptions: current.sample_descriptions,
        sample_je_numbers: current.sample_je_numbers,
        evidence_tokens: Array.from(new Set([...refreshed.evidence_tokens, ...current.evidence_tokens])).slice(0, 16),
        direction_keys: current.direction_keys,
      })
    }
    return accountProfiles.get(normalizedAccount)
  }

  tbRows.forEach((row) => {
    getAccountProfile(row?.account || row?.account_name || "", row)
  })

  glRows.forEach((row) => {
    const profile = getAccountProfile(row?.account_name || row?.account || "")
    if (!profile) return
    profile.gl_line_count += 1
    pushUniqueText(profile.sample_descriptions, row?.description, 6)
    pushUniqueText(profile.sample_je_numbers, row?.je_no, 6)
    pushEvidenceToken(profile.evidence_tokens, row?.description)
  })

  cashMovements.forEach((movement) => {
    const accountName = movement?.account_name || ""
    const normalizedAccount = normalizeText(accountName)
    if (!normalizedAccount || cashAccountKeys.has(normalizedAccount) || isCashLikeAccount(normalizedAccount)) return
    const direction = Number(movement?.amount || 0) >= 0 ? "inflow" : "outflow"
    const accountKey = buildRuntimeMappingAccountKey(normalizedAccount, direction)
    const profile = getAccountProfile(accountName)
    if (!profile || !accountKey) return

    if (!directionProfiles.has(accountKey)) {
      directionProfiles.set(accountKey, {
        ...serializeRuntimeAccountProfile(profile),
        account_key: accountKey,
        direction,
        movement_count: 0,
        total_abs_amount: 0,
        net_amount: 0,
        active_months: [],
        sample_descriptions: [],
        sample_je_numbers: [],
        evidence_tokens: [...(profile.evidence_tokens || [])],
      })
    }

    const directionProfile = directionProfiles.get(accountKey)
    const amount = Number(movement?.amount || 0)
    const absAmount = Math.abs(amount)
    directionProfile.movement_count += 1
    directionProfile.total_abs_amount = roundCurrency(Number(directionProfile.total_abs_amount || 0) + absAmount)
    directionProfile.net_amount = roundCurrency(Number(directionProfile.net_amount || 0) + amount)
    profile.movement_count += 1
    profile.total_abs_amount = roundCurrency(Number(profile.total_abs_amount || 0) + absAmount)
    profile.net_amount = roundCurrency(Number(profile.net_amount || 0) + amount)

    try {
      const monthKey = normalizeDateOnly(movement.date).toISOString().slice(0, 7)
      pushUniqueText(directionProfile.active_months, monthKey, 24)
      pushUniqueText(profile.active_months, monthKey, 24)
    } catch (error) {
      // Ignore malformed dates here; GL parsing already validates normal upload rows.
    }

    pushUniqueText(directionProfile.sample_descriptions, movement?.description, 6)
    pushUniqueText(directionProfile.sample_je_numbers, movement?.je_no, 6)
    pushEvidenceToken(directionProfile.evidence_tokens, movement?.description)
    pushEvidenceToken(directionProfile.evidence_tokens, direction)
    pushUniqueText(profile.sample_descriptions, movement?.description, 6)
    pushUniqueText(profile.sample_je_numbers, movement?.je_no, 6)
    pushEvidenceToken(profile.evidence_tokens, movement?.description)
    pushEvidenceToken(profile.evidence_tokens, direction)
    pushUniqueText(profile.direction_keys, accountKey, 4)
  })

  const serializedAccounts = Array.from(accountProfiles.values()).map(serializeRuntimeAccountProfile)
  const serializedDirections = Array.from(directionProfiles.values()).map(serializeRuntimeDirectionProfile)
  const byAccount = {}
  serializedAccounts.forEach((profile) => {
    byAccount[profile.normalized_account] = profile
  })
  const byAccountDirection = {}
  serializedDirections.forEach((profile) => {
    byAccountDirection[profile.account_key] = profile
  })

  return {
    by_account: byAccount,
    by_account_direction: byAccountDirection,
    accounts: serializedAccounts,
    direction_profiles: serializedDirections,
    summary: {
      profiled_accounts: serializedAccounts.length,
      tb_only_accounts: serializedAccounts.filter((profile) => profile.tb_present && Number(profile.movement_count || 0) === 0).length,
      movement_accounts: serializedAccounts.filter((profile) => Number(profile.movement_count || 0) > 0).length,
      direction_profiles: serializedDirections.length,
      cash_accounts_excluded: cashAccountKeys.size,
    },
  }
}

function getRuntimeAccountDirectionProfile(accountProfile, accountName, direction) {
  const normalizedAccount = normalizeText(accountName)
  const normalizedDirection = normalizeText(direction).toLowerCase()
  if (!accountProfile || !normalizedAccount || !normalizedDirection) return null
  const accountKey = buildRuntimeMappingAccountKey(normalizedAccount, normalizedDirection)
  return accountProfile.by_account_direction?.[accountKey] || null
}

function compactRuntimeProfileEvidence(profile) {
  if (!profile) return null
  return {
    tb_account_class: profile.tb_account_class || "other",
    tb_ending_balance: roundCurrency(profile.tb_ending_balance || 0),
    tb_balance_direction: profile.tb_balance_direction || "zero",
    movement_count: Number(profile.movement_count || 0),
    total_abs_amount: roundCurrency(profile.total_abs_amount || 0),
    net_amount: roundCurrency(profile.net_amount || 0),
    active_months: (profile.active_months || []).slice(0, 12),
    sample_descriptions: (profile.sample_descriptions || []).slice(0, 4),
    sample_je_numbers: (profile.sample_je_numbers || []).slice(0, 4),
    evidence_tokens: (profile.evidence_tokens || []).slice(0, 12),
  }
}

function buildRuntimeAccountProfileSummary({ accountProfile, mapped = null, assistanceSummary = null } = {}) {
  const finalAssignments = Array.isArray(mapped?.finalBucketAssignments) ? mapped.finalBucketAssignments : []
  const autoMappings = Array.isArray(mapped?.autoCreatedMappings) ? mapped.autoCreatedMappings : []
  const lowConfidence = Array.isArray(mapped?.lowConfidenceMappings) ? mapped.lowConfidenceMappings : []
  const rejected = Array.isArray(assistanceSummary?.rejectedRecommendations) ? assistanceSummary.rejectedRecommendations : []
  const mappedAccountKeys = new Set(
    finalAssignments.map((assignment) => buildRuntimeMappingAccountKey(assignment.normalized_account || assignment.account_name, assignment.direction)),
  )
  return {
    profiled_accounts: Number(accountProfile?.summary?.profiled_accounts || 0),
    movement_accounts: Number(accountProfile?.summary?.movement_accounts || 0),
    direction_profiles: Number(accountProfile?.summary?.direction_profiles || 0),
    mapped_accounts: mappedAccountKeys.size,
    profile_auto_mappings: autoMappings.filter((mapping) => mapping.source === "profile_auto").length,
    llm_assisted_mappings: autoMappings.filter((mapping) => mapping.source === "llm_assisted").length,
    review_required_mappings: lowConfidence.length + rejected.length,
  }
}

function detectBucketDirection(input) {
  const options = typeof input === "object" && input !== null && !Array.isArray(input)
    ? input
    : { label: input }
  const label = options.label || ""
  const sectionLabel = options.sectionLabel || ""
  const text = normalizeText(`${sectionLabel} ${label}`)
  const numericDirection = inferDirectionFromCellValues(options.cells || [])
  const concept = bestDirectCashFlowConcept(text)
  const outflowHints = scorePatternMatches(text, DIRECT_OUTFLOW_TEXT_HINTS)
  const inflowHints = scorePatternMatches(text, DIRECT_INFLOW_TEXT_HINTS)

  if (concept && (!numericDirection || concept.direction === numericDirection)) {
    return concept.direction
  }

  if (outflowHints && !inflowHints) return "outflow"
  if (inflowHints && !outflowHints) return "inflow"
  if (outflowHints && inflowHints) {
    if (numericDirection) return numericDirection
    return outflowHints >= inflowHints ? "outflow" : "inflow"
  }

  if (concept) return concept.direction
  if (numericDirection) return numericDirection
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
    normalized === "summary" ||
    normalized.includes("free cash flow") ||
    isOpeningLabel(normalized) ||
    isClosingLabel(normalized) ||
    normalized.includes("beginning") ||
    normalized.includes("ending") ||
    normalized.includes("net") ||
    normalized.includes("total") ||
    normalized.includes("balance")
  )
}

function isFallbackBucketLabel(label) {
  return /\b(other|misc|miscellaneous|uncategorized|remaining|catch all|catch-all)\b/i.test(String(label || ""))
}

function scorePatternMatches(text, patterns = []) {
  const normalized = normalizeText(text)
  if (!normalized) return 0
  return patterns.reduce((score, pattern) => score + (pattern.test(normalized) ? 1 : 0), 0)
}

function matchDirectCashFlowConcepts(text, direction = null) {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return DIRECT_CASH_FLOW_CONCEPTS.map((concept) => {
    if (direction && concept.direction !== direction) return null
    const matchCount = scorePatternMatches(normalized, concept.patterns)
    if (!matchCount) return null
    return {
      key: concept.key,
      direction: concept.direction,
      score: Math.min(1, 0.72 + matchCount * 0.07),
      matchCount,
    }
  }).filter(Boolean)
}

function bestDirectCashFlowConcept(text, direction = null) {
  return matchDirectCashFlowConcepts(text, direction).sort((left, right) => right.score - left.score)[0] || null
}

function getNumericValue(value) {
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined || primitive === "") return null
  if (typeof primitive === "number") return Number.isFinite(primitive) ? primitive : null
  if (primitive instanceof Date) return null
  const parsed = Number.parseFloat(String(primitive).replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function inferDirectionFromCellValues(values = []) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => getNumericValue(value))
    .filter((value) => value !== null && value !== 0)
  if (!numericValues.length) return null
  const negativeCount = numericValues.filter((value) => value < 0).length
  const positiveCount = numericValues.filter((value) => value > 0).length
  if (negativeCount > positiveCount) return "outflow"
  if (positiveCount > negativeCount) return "inflow"
  const total = numericValues.reduce((sum, value) => sum + value, 0)
  if (total < 0) return "outflow"
  if (total > 0) return "inflow"
  return null
}

function getCellNumericSignal(value, options = {}) {
  if (isFormulaCellValue(value)) return options.allowFormula === true
  const primitive = readCellPrimitive(value)
  if (primitive === null || primitive === undefined || primitive === "") return false
  if (typeof primitive === "number") return true
  if (primitive instanceof Date) return false
  if (typeof primitive === "string") {
    const number = Number.parseFloat(primitive.replace(/,/g, ""))
    return Number.isFinite(number)
  }
  return false
}

function chooseColumnLayoutLabelColumn({ worksheet, headerRowIndex, firstPeriodCol, maxRows }) {
  const preferredHeaderHints = ["line item", "lineitem", "description", "account", "label", "name"]
  const rejectedHeaderHints = ["section", "category", "class"]
  const headerRow = worksheet.getRow(headerRowIndex)
  let best = null

  for (let candidate = 1; candidate < firstPeriodCol; candidate += 1) {
    const headerText = normalizeHeader(readCellText(headerRow.getCell(candidate).value))
    const labels = []
    for (let scanRow = headerRowIndex + 1; scanRow <= Math.min(maxRows, headerRowIndex + 140); scanRow += 1) {
      const label = normalizeText(readCellText(worksheet.getRow(scanRow).getCell(candidate).value))
      if (label) labels.push(label)
    }

    const uniqueLabels = new Set(labels)
    const preferred = preferredHeaderHints.some((hint) => headerText.includes(hint))
    const rejected = rejectedHeaderHints.some((hint) => headerText.includes(hint))
    const repeatedPenalty = labels.length && uniqueLabels.size <= Math.max(2, Math.ceil(labels.length * 0.25)) ? 2 : 0
    const score = uniqueLabels.size * 1.25 + labels.length * 0.15 + (preferred ? 20 : 0) - (rejected ? 6 : 0) - repeatedPenalty

    if (!best || score > best.score) {
      best = {
        column: candidate,
        score,
      }
    }
  }

  return best?.column || Math.max(1, firstPeriodCol - 1)
}

function getStatementMethodFromConfig(config) {
  return normalizeStatementMethod(config?.statement_method)
}

function getIndirectRowBindingsFromConfig(config) {
  return Array.isArray(config?.row_bindings) ? config.row_bindings : []
}

function findIndirectRowDefinition(label) {
  const normalizedLabel = normalizeText(label)
  if (!normalizedLabel) return null
  return (
    INDIRECT_ROW_DEFINITIONS.find((definition) =>
      definition.patterns.some((pattern) => pattern.test(normalizedLabel)),
    ) || null
  )
}

function isIndirectWorkbookCandidate(worksheet, normalizedSheet) {
  const title = normalizeText(worksheet?.getCell?.("A1")?.value || normalizedSheet?.rows?.[0]?.rowLabel || "")
  if (title.includes("indirect method")) return true

  const matchedDefinitions = new Set()
  ;(normalizedSheet?.rows || []).forEach((row) => {
    const definition = findIndirectRowDefinition(row.rowLabel)
    if (definition) matchedDefinitions.add(definition.semantic_key)
  })

  return matchedDefinitions.size >= 6
}

function getCellSnapshotForColumn(row, columnIndex) {
  return (row?.metadata?.cellSnapshots || []).find((cell) => Number(cell.column_index) === Number(columnIndex)) || null
}

function analyzeIndirectRowTarget(row, periodColumns = []) {
  const periodCells = periodColumns.map((columnIndex) => {
    const snapshot = getCellSnapshotForColumn(row, columnIndex)
    if (snapshot) return snapshot
    return {
      column_index: columnIndex,
      formula_text: null,
      display_value: null,
      raw_value: null,
    }
  })
  const formulaCount = periodCells.filter((cell) => Boolean(cell.formula_text)).length
  const writableCount = periodCells.filter((cell) => !cell.formula_text).length
  return {
    periodCells,
    formulaCount,
    writableCount,
    allFormula: periodCells.length > 0 && formulaCount === periodCells.length,
    hasWritableTargets: writableCount > 0,
  }
}

function resolveTemplateStructure(templatePath) {
  const TemplateFileLoader = require("../modules/templates/parsing/templateFileLoader.service")
  const WorkbookParser = require("../modules/templates/parsing/workbookParser.service")
  const TemplateNormalizer = require("../modules/templates/parsing/templateNormalizer.service")

  const filePayload = TemplateFileLoader.load({
    filePath: templatePath,
    sourceFileName: path.basename(templatePath),
  })
  return WorkbookParser.parse(filePayload).then((workbookStructure) => ({
    workbookStructure,
    normalized: TemplateNormalizer.normalize({
      templateVersionId: "analysis",
      workbookStructure,
    }),
  }))
}

function buildIndirectV3ConfigFromNormalizedSheet(worksheet, layoutCandidate, normalizedSheet) {
  const periodLabels = layoutCandidate.periodEntries.map((entry, index) => ({
    period_key: normalizePeriodKey(entry.period_key, `period_${index + 1}`),
    label: entry.label || `Period ${index + 1}`,
    period_type: entry.period_type || "custom",
    month: entry.month || null,
    quarter: entry.quarter || null,
    year: entry.year || null,
  }))
  const periodBindings = layoutCandidate.periodEntries.map((entry, index) => ({
    period_key: periodLabels[index].period_key,
    label: periodLabels[index].label,
    cell: cellAddressFromRowCol(layoutCandidate.periodRow, entry.col),
  }))
  const periodColumnLookup = new Map(
    layoutCandidate.periodEntries.map((entry, index) => [periodLabels[index].period_key, entry.col]),
  )

  const rowBindings = []
  const matchedKeys = new Set()
  const issues = []

  ;(normalizedSheet?.rows || []).forEach((row) => {
    const definition = findIndirectRowDefinition(row.rowLabel)
    if (!definition || matchedKeys.has(definition.semantic_key)) return
    const rowTargetState = analyzeIndirectRowTarget(
      row,
      layoutCandidate.periodEntries.map((entry) => entry.col),
    )
    const role = rowTargetState.allFormula ? "summary" : definition.role
    const binding = {
      semantic_key: definition.semantic_key,
      label: definition.label,
      role,
      required: definition.required,
      cells: periodLabels.map((label) => ({
        period_key: label.period_key,
        label: label.label,
        cell: cellAddressFromRowCol(row.rowIndex, periodColumnLookup.get(label.period_key)),
      })),
      metadata: {
        row_index: row.rowIndex,
        row_type: row.rowType,
        formula_count: rowTargetState.formulaCount,
        writable_target_count: rowTargetState.writableCount,
      },
    }
    if (definition.role === "input" && role !== "input") {
      issues.push(`Row "${row.rowLabel}" is formula-driven across detected periods and cannot be used as a writable input row.`)
    }
    rowBindings.push(binding)
    matchedKeys.add(definition.semantic_key)
  })

  const missingRequired = INDIRECT_ROW_DEFINITIONS.filter(
    (definition) => definition.required && !matchedKeys.has(definition.semantic_key),
  ).map((definition) => definition.semantic_key)

  if (missingRequired.length) {
    issues.push(`Missing required indirect row bindings: ${missingRequired.join(", ")}`)
  }

  const writableLeafInputs = rowBindings.filter(
    (binding) =>
      binding.role === "input" &&
      binding.semantic_key !== "opening_cash" &&
      Number(binding.metadata?.writable_target_count || 0) > 0,
  )
  if (!writableLeafInputs.length) {
    issues.push("No writable indirect input rows were detected for the template leaf rows.")
  }

  const directionalCoverage = new Set(
    writableLeafInputs
      .map((binding) => INDIRECT_ROW_LOOKUP.get(binding.semantic_key)?.cash_direction || "neutral")
      .filter((direction) => direction === "inflow" || direction === "outflow"),
  )
  const missingDirections = ["inflow", "outflow"].filter((direction) => !directionalCoverage.has(direction))
  if (missingDirections.length) {
    issues.push(`Indirect template is missing writable ${missingDirections.join(" and ")} input rows.`)
  }

  const missingRequiredFinancing = REQUIRED_INDIRECT_FINANCING_KEYS.filter((semanticKey) => !matchedKeys.has(semanticKey))
  if (missingRequiredFinancing.length) {
    issues.push(`Missing required financing row bindings: ${missingRequiredFinancing.join(", ")}`)
  }

  const openingBinding = rowBindings.find((binding) => binding.semantic_key === "opening_cash") || null
  const closingBinding = rowBindings.find((binding) => binding.semantic_key === "closing_cash") || null
  const rowBindingsSanitized = rowBindings.map(({ metadata, ...binding }) => binding)

  let confidence = roundCurrency(
    Math.max(0.22, Math.min(0.92, 0.28 + rowBindingsSanitized.length * 0.03 + matchedKeys.size * 0.015)),
  )
  const needsHumanReview =
    missingRequired.length > 0 ||
    missingRequiredFinancing.length > 0 ||
    missingDirections.length > 0 ||
    !writableLeafInputs.length ||
    rowBindings.some((binding) => binding.role === "summary" && INDIRECT_ROW_LOOKUP.get(binding.semantic_key)?.role === "input")

  if (needsHumanReview) {
    confidence = Math.min(confidence, 0.58)
  }

  return {
    detected_layout_type: layoutCandidate.layout_type,
    confidence,
    needs_human_review: needsHumanReview,
    issues,
    required_anchors: needsHumanReview ? ["row_bindings"] : [],
    suggested_config_json: {
      version: "v3",
      statement_method: STATEMENT_METHODS.INDIRECT,
      sheet_name: worksheet.name,
      layout_type: layoutCandidate.layout_type,
      period_granularity: inferGranularityFromLabels(periodLabels),
      period_axis: {
        orientation: "column",
        labels: periodLabels,
        period_bindings: periodBindings,
      },
      period_resolution_rules: {
        custom_periods: [],
      },
      opening_binding: openingBinding ? { cells: openingBinding.cells } : null,
      closing_binding: closingBinding ? { cells: closingBinding.cells } : null,
      bucket_bindings: [],
      row_bindings: rowBindingsSanitized,
      writer_policy: {
        preserve_formulas: true,
        full_recalc_on_open: true,
      },
      mapping_policy: {
        auto_create: true,
        high_confidence_threshold: 0.7,
        low_confidence_threshold: 0.35,
      },
    },
  }
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
    const labelColumn = chooseColumnLayoutLabelColumn({
      worksheet,
      headerRowIndex: row,
      firstPeriodCol: firstCol,
      maxRows,
    })

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
        getCellNumericSignal(worksheet.getRow(scanRow).getCell(entry.col).value, { allowFormula: true }),
      )
      if (!hasNumericSignal) continue
      bucketRows.push({
        row: scanRow,
        label: label || normalizedLabel,
        sectionLabel:
          labelColumn > 1 ? readCellText(worksheet.getRow(scanRow).getCell(labelColumn - 1).value) : "",
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
  ;["inflow", "outflow"].forEach((direction) => {
    const fallbackBuckets = bucketBindings.filter((item) => item.direction === direction && item.fallback)
    fallbackBuckets.slice(1).forEach((bucket) => {
      bucket.fallback = false
    })
  })
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
      const bucketCells = layoutCandidate.periodEntries.map((entry) => worksheet.getRow(entry.row).getCell(bucket.column).value)
      bucketBindings.push({
        bucket_key: bucketKey,
        label: bucket.label,
        direction: detectBucketDirection({
          label: bucket.label,
          sectionLabel: bucket.sectionLabel,
          cells: bucketCells,
        }),
        fallback: isFallbackBucketLabel(bucket.label),
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
      const bucketCells = layoutCandidate.periodEntries.map((entry) => worksheet.getRow(bucket.row).getCell(entry.col).value)
      bucketBindings.push({
        bucket_key: bucketKey,
        label: bucket.label,
        direction: detectBucketDirection({
          label: bucket.label,
          sectionLabel: bucket.sectionLabel,
          cells: bucketCells,
        }),
        fallback: isFallbackBucketLabel(bucket.label),
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
    statement_method: STATEMENT_METHODS.DIRECT,
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

function evaluateDirectBucketSemanticQuality(bucketBindings = []) {
  if (!Array.isArray(bucketBindings) || !bucketBindings.length) {
    return {
      score: 0,
      issues: ["No direct cash-flow bucket bindings were detected."],
      needsHumanReview: true,
    }
  }

  const directionCounts = bucketBindings.reduce(
    (counts, bucket) => {
      if (bucket.direction === "inflow") counts.inflow += 1
      if (bucket.direction === "outflow") counts.outflow += 1
      return counts
    },
    { inflow: 0, outflow: 0 },
  )
  const ambiguous = bucketBindings.filter((bucket) => {
    if (isFallbackBucketLabel(bucket.label)) return false
    if (bestDirectCashFlowConcept(`${bucket.label} ${bucket.bucket_key}`, bucket.direction)) return false
    return scorePatternMatches(`${bucket.label} ${bucket.bucket_key}`, [
      ...DIRECT_INFLOW_TEXT_HINTS,
      ...DIRECT_OUTFLOW_TEXT_HINTS,
    ]) === 0
  })
  const generic = bucketBindings.filter((bucket) => /^bucket [0-9]+$/i.test(String(bucket.label || "")))
  const issues = []

  if (!directionCounts.inflow) issues.push("No direct inflow bucket rows were detected.")
  if (!directionCounts.outflow) issues.push("No direct outflow bucket rows were detected.")
  if (ambiguous.length > Math.max(1, Math.ceil(bucketBindings.length * 0.35))) {
    issues.push(
      `Several direct bucket labels need semantic review: ${ambiguous
        .slice(0, 4)
        .map((bucket) => bucket.label)
        .join(", ")}.`,
    )
  }
  if (generic.length) {
    issues.push("One or more detected bucket labels are generic placeholders and need review.")
  }

  const recognizedRatio = (bucketBindings.length - ambiguous.length - generic.length) / bucketBindings.length
  const directionCoverage = directionCounts.inflow && directionCounts.outflow ? 1 : 0.45
  const score = Math.max(
    0,
    Math.min(1, recognizedRatio * 0.72 + directionCoverage * 0.22 + (bucketBindings.some((bucket) => bucket.fallback) ? 0.06 : 0.03)),
  )

  return {
    score,
    issues,
    needsHumanReview: score < 0.62 || directionCounts.inflow === 0 || directionCounts.outflow === 0 || generic.length > 0,
  }
}

function calculateDirectTemplateConfidence({
  periodCount,
  strictPeriods,
  bucketCount,
  hasCustomPeriods,
  hasOpening,
  hasClosing,
  semanticQuality,
}) {
  const periodScore = Math.min(1, Math.max(0, periodCount / 12))
  const strictScore = periodCount ? Math.min(1, Math.max(0, strictPeriods / periodCount)) : 0
  const bucketScore = Math.min(1, Math.max(0, bucketCount / 10))
  const semanticScore = Math.max(0, Math.min(1, Number(semanticQuality?.score || 0)))
  let confidence =
    0.24 +
    periodScore * 0.2 +
    strictScore * 0.16 +
    bucketScore * 0.12 +
    semanticScore * 0.32 +
    (hasOpening ? 0.04 : 0) +
    (hasClosing ? 0.04 : 0)

  if (hasCustomPeriods) confidence -= 0.14
  if (semanticQuality?.needsHumanReview) confidence = Math.min(confidence, 0.64)
  if (!hasOpening || !hasClosing) confidence = Math.min(confidence, 0.82)

  return roundCurrency(Math.max(0.22, Math.min(0.88, confidence)))
}

function buildMinimalSuggestedV3Config(sheetName = "Cash Flow") {
  return {
    version: "v3",
    statement_method: STATEMENT_METHODS.DIRECT,
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

async function analyzeTemplateWorkbook({ templatePath }) {
  ensureFileExists(templatePath, "Cash flow template")
  const workbook = await readWorkbookFromFile({
    filePath: templatePath,
    label: "Cash flow template",
    ValidationErrorCtor: CashFlowValidationError,
  })
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

  if (bestCandidate && bestWorksheet && bestCandidate.layout_type !== "rows") {
    try {
      const { normalized } = await resolveTemplateStructure(templatePath)
      const normalizedSheet = normalized.sheets.find((sheet) => sheet.name === bestWorksheet.name) || null
      if (normalizedSheet && isIndirectWorkbookCandidate(bestWorksheet, normalizedSheet)) {
        return buildIndirectV3ConfigFromNormalizedSheet(bestWorksheet, bestCandidate, normalizedSheet)
      }
    } catch (error) {
      if (!(error instanceof CashFlowValidationError)) {
        throw error
      }
    }
  }

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
  const semanticQuality = evaluateDirectBucketSemanticQuality(suggestedConfig.bucket_bindings)
  let confidence = calculateDirectTemplateConfidence({
    periodCount,
    strictPeriods,
    bucketCount,
    hasCustomPeriods,
    hasOpening: Boolean(suggestedConfig.opening_binding),
    hasClosing: Boolean(suggestedConfig.closing_binding),
    semanticQuality,
  })

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
  semanticQuality.issues.forEach((issue) => issues.push(issue))
  if (semanticQuality.needsHumanReview) {
    requiredAnchors.push("bucket_targets")
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
    needs_human_review: confidence < 0.55 || requiredAnchors.length > 0 || semanticQuality.needsHumanReview,
    suggested_config_json: suggestedConfig,
  }
}

async function migrateLegacyTemplateConfigToV2({ templatePath, legacyConfig }) {
  const normalizedLegacy = validateLegacyTemplateConfig(legacyConfig)
  ensureFileExists(templatePath, "Cash flow template")

  const workbook = await readWorkbookFromFile({
    filePath: templatePath,
    label: "Cash flow template",
    ValidationErrorCtor: CashFlowValidationError,
  })
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
    statement_method: normalizedV2.statement_method || STATEMENT_METHODS.DIRECT,
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
    row_bindings: [],
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

function expandCashFlowTokens(tokens) {
  const expanded = new Set(tokens)
  const addWhenPresent = (needles, additions) => {
    if (needles.some((needle) => expanded.has(needle))) {
      additions.forEach((addition) => expanded.add(addition))
    }
  }

  addWhenPresent(["customer", "customers", "receivable", "receivables", "revenue"], ["receipt", "receipts"])
  addWhenPresent(["client", "clients", "collection", "collections", "collected"], ["customer", "receipt", "receipts"])
  addWhenPresent(["supplier", "suppliers", "vendor", "vendors", "payable", "payables"], ["payment", "payments"])
  addWhenPresent(["disbursement", "disbursements"], ["payment", "payments"])
  addWhenPresent(["salary", "salaries", "wage", "wages", "benefit", "benefits", "compensation", "people"], ["payroll"])
  addWhenPresent(["advertising", "promotion", "brand", "growth", "campaign"], ["marketing"])
  addWhenPresent(["premises", "lease", "occupancy"], ["rent", "facilities"])
  addWhenPresent(["equipment", "hardware", "ppe", "plant", "property"], ["capex", "expenditure", "asset"])
  addWhenPresent(["loan", "borrowings", "borrowing", "note", "credit", "facility"], ["debt"])
  addWhenPresent(["principal"], ["repayment"])
  addWhenPresent(["finance", "charge", "charges"], ["interest"])
  addWhenPresent(["contribution", "contributions", "funding", "injection", "founder", "investor"], ["equity", "capital"])
  addWhenPresent(["dividend", "dividends", "distribution", "distributions"], ["payout"])

  return expanded
}

function computeTokenSimilarity(left, right) {
  const leftTokens = expandCashFlowTokens(normalizeText(left).split(" ").filter(Boolean))
  const rightTokens = expandCashFlowTokens(normalizeText(right).split(" ").filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })
  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

function getRuntimeProfileEvidenceText(profile, movement = null) {
  return normalizeText(
    [
      movement?.account_name,
      movement?.normalized_account,
      movement?.description,
      profile?.account_name,
      profile?.normalized_account,
      profile?.tb_account_class,
      ...(Array.isArray(profile?.evidence_tokens) ? profile.evidence_tokens : []),
      ...(Array.isArray(profile?.sample_descriptions) ? profile.sample_descriptions : []),
    ]
      .filter(Boolean)
      .join(" "),
  )
}

function directTargetScoresFromProfile(profile, direction, evidenceText) {
  const targets = new Map()
  const addTarget = (key, score, reason) => {
    if (!key) return
    const existing = targets.get(key)
    if (!existing || Number(score || 0) > existing.score) {
      targets.set(key, {
        key,
        score: Math.max(0, Math.min(1, Number(score || 0))),
        reason,
      })
    }
  }

  const accountClass = profile?.tb_account_class || null
  const classTargets = {
    receivable: { inflow: ["customer_receipts", 0.84, "tb_class_receivable"] },
    revenue: { inflow: ["customer_receipts", 0.82, "tb_class_revenue"] },
    inventory: { outflow: ["supplier_payments", 0.78, "tb_class_inventory"] },
    payable: { outflow: ["supplier_payments", 0.82, "tb_class_payable"] },
    fixed_asset: {
      inflow: ["asset_sale_proceeds", 0.78, "tb_class_fixed_asset"],
      outflow: ["capital_expenditures", 0.86, "tb_class_fixed_asset"],
    },
    debt: {
      inflow: ["debt_drawdown", 0.87, "tb_class_debt"],
      outflow: ["debt_repayment", 0.86, "tb_class_debt"],
    },
    equity: {
      inflow: ["equity_injection", 0.87, "tb_class_equity"],
      outflow: ["dividends_distributions", 0.8, "tb_class_equity"],
    },
    payroll_expense: { outflow: ["payroll", 0.86, "tb_class_payroll_expense"] },
    rent_expense: { outflow: ["rent_facilities", 0.84, "tb_class_rent_expense"] },
    marketing_expense: { outflow: ["sales_marketing", 0.84, "tb_class_marketing_expense"] },
    tax_expense: { outflow: ["income_taxes", 0.84, "tb_class_tax_expense"] },
    interest_expense: { outflow: ["interest_paid", 0.86, "tb_class_interest_expense"] },
    admin_expense: { outflow: ["general_admin", 0.74, "tb_class_admin_expense"] },
  }

  const classTarget = classTargets[accountClass]?.[direction]
  if (classTarget) addTarget(classTarget[0], classTarget[1], classTarget[2])

  if (profile) {
    matchDirectCashFlowConcepts(evidenceText, direction).forEach((concept) => {
      addTarget(concept.key, Math.min(0.94, Number(concept.score || 0) + 0.08), "profile_evidence_concept")
    })
  }

  return Array.from(targets.values())
}

function bucketSupportsDirectTarget(bucket, bucketEvidence, bucketConceptKeys, targetKey) {
  if (!targetKey) return false
  const normalizedBucketKey = normalizeBucketKey(bucket?.bucket_key || "", "")
  const semanticKey = CashFlowConcepts.normalizeDirectConceptKey(bucket?.semantic_key || "")
  if (CashFlowConcepts.keysEquivalent(normalizedBucketKey, targetKey)) return true
  if (semanticKey && CashFlowConcepts.keysEquivalent(semanticKey, targetKey)) return true
  if (Array.from(bucketConceptKeys || []).some((key) => CashFlowConcepts.keysEquivalent(key, targetKey))) return true
  if (normalizeText(bucketEvidence).includes(normalizeText(targetKey))) return true
  return false
}

function scoreDirectBucketMatchDetails(movement, bucket, options = {}) {
  const explicitDirection = normalizeText(movement?.direction || options.direction || "").toLowerCase()
  const direction = explicitDirection || (Number(movement?.amount || 0) >= 0 ? "inflow" : "outflow")
  if (bucket?.direction && bucket.direction !== direction) {
    return {
      score: 0,
      lexical_score: 0,
      concept_score: 0,
      profile_score: 0,
      direction_hint_score: 0,
      profile_target_key: null,
      reasons: ["direction_mismatch"],
    }
  }

  const profile = options.accountProfile || movement?.account_profile || null
  const accountEvidence = getRuntimeProfileEvidenceText(profile, movement)
  const basicAccountEvidence = normalizeText(
    [movement?.account_name, movement?.normalized_account, movement?.description]
      .filter(Boolean)
      .join(" "),
  )
  const semanticConcept = CashFlowConcepts.getDirectConcept(bucket?.semantic_key || "")
  const bucketEvidence = normalizeText(
    [
      bucket?.label,
      bucket?.bucket_key,
      bucket?.description,
      semanticConcept?.label,
      ...(Array.isArray(semanticConcept?.synonyms) ? semanticConcept.synonyms : []),
      ...(Array.isArray(bucket?.semantic_evidence) ? bucket.semantic_evidence : []),
    ]
      .filter(Boolean)
      .join(" "),
  )
  const lexicalScore = Math.max(
    computeTokenSimilarity(accountEvidence, bucket?.label),
    computeTokenSimilarity(accountEvidence, bucket?.bucket_key),
    computeTokenSimilarity(accountEvidence, bucketEvidence),
  )

  const accountConcepts = matchDirectCashFlowConcepts(accountEvidence, direction)
  const bucketConcepts = [
    ...matchDirectCashFlowConcepts(bucketEvidence, direction),
    ...(semanticConcept && semanticConcept.direction === direction
      ? [
          {
            key: semanticConcept.key,
            direction: semanticConcept.direction,
            score: Math.max(0.88, Number(bucket?.semantic_confidence || 0)),
            matchCount: 1,
          },
        ]
      : []),
  ]
  const bucketConceptKeys = new Set(bucketConcepts.map((concept) => concept.key))
  const sharedConcept = accountConcepts.find((concept) =>
    Array.from(bucketConceptKeys).some((key) => CashFlowConcepts.keysEquivalent(key, concept.key)),
  )
  const conceptScore = sharedConcept ? Math.min(0.96, (sharedConcept.score + 0.86) / 2) : 0
  const basicConcepts = matchDirectCashFlowConcepts(basicAccountEvidence, direction)
  const profileTargets = directTargetScoresFromProfile(profile, direction, accountEvidence)
  const bestProfileTarget = profileTargets
    .filter((target) => bucketSupportsDirectTarget(bucket, bucketEvidence, bucketConceptKeys, target.key))
    .sort((left, right) => right.score - left.score)[0] || null
  const profileScore = bestProfileTarget ? bestProfileTarget.score : 0
  const directionHintScore =
    !conceptScore &&
    scorePatternMatches(bucketEvidence, direction === "inflow" ? DIRECT_INFLOW_TEXT_HINTS : DIRECT_OUTFLOW_TEXT_HINTS) &&
    scorePatternMatches(accountEvidence, direction === "inflow" ? DIRECT_INFLOW_TEXT_HINTS : DIRECT_OUTFLOW_TEXT_HINTS)
      ? 0.62
      : 0

  let score = Math.max(lexicalScore, conceptScore, profileScore, directionHintScore)
  const reasons = []
  if (lexicalScore >= 0.45) reasons.push("name_similarity")
  if (conceptScore >= 0.7) reasons.push(`shared_concept:${sharedConcept?.key}`)
  if (profileScore >= 0.7) reasons.push(bestProfileTarget?.reason || "profile_evidence")
  if (directionHintScore >= 0.6) reasons.push("direction_hint")
  if (basicConcepts.length && profileScore >= 0.7 && !basicConcepts.some((concept) => concept.key === bestProfileTarget?.key)) {
    reasons.push("gl_or_tb_overrode_weak_account_name")
  }
  if (bucket?.is_fallback || bucket?.fallback) score = Math.min(score || 0.38, 0.48)
  return {
    score: roundCurrency(Math.max(0, Math.min(1, score))),
    lexical_score: roundCurrency(lexicalScore),
    concept_score: roundCurrency(conceptScore),
    profile_score: roundCurrency(profileScore),
    direction_hint_score: roundCurrency(directionHintScore),
    profile_target_key: bestProfileTarget?.key || null,
    reasons,
  }
}

function scoreDirectBucketMatch(movement, bucket, options = {}) {
  return scoreDirectBucketMatchDetails(movement, bucket, options).score
}

function buildLearnedMappingLookup(learnedMappings = []) {
  const learnedLookup = new Map()
  ;(Array.isArray(learnedMappings) ? learnedMappings : []).forEach((mapping) => {
    const normalizedAccount = normalizeText(mapping?.normalized_account || mapping?.account_name || "")
    const direction = normalizeText(mapping?.direction || "").toLowerCase()
    const bucketKey = normalizeBucketKey(mapping?.bucket_key || "", "")
    if (!normalizedAccount || !direction || !bucketKey) return
    const metadata = mapping?.metadata || mapping?.metadata_json || null
    const semanticKey = CashFlowConcepts.normalizeDirectConceptKey(
      mapping?.semantic_key || metadata?.semantic_key || metadata?.bucket_semantic_key || "",
    )

    learnedLookup.set(`${normalizedAccount}:${direction}`, {
      bucket_key: bucketKey,
      confidence: Number(mapping?.confidence || 1),
      source: mapping?.source || "auto_semantic",
      status: mapping?.status || "suggested",
      metadata,
      semantic_key: semanticKey || null,
      account_profile: mapping?.account_profile || mapping?.profile_evidence || null,
      evidence: Array.isArray(mapping?.evidence) ? mapping.evidence : [],
      profile_score: Number(mapping?.profile_score || 0),
      llm_score: Number(mapping?.llm_score || 0),
    })
  })
  return learnedLookup
}

function mergeAutoCreatedMappings(existingMappings = [], additionalMappings = []) {
  const merged = new Map()
  ;[...(existingMappings || []), ...(additionalMappings || [])].forEach((mapping) => {
    const normalizedAccount = normalizeText(mapping?.normalized_account || "")
    const direction = normalizeText(mapping?.direction || "").toLowerCase()
    const bucketKey = normalizeBucketKey(mapping?.bucket_key || "", "")
    if (!normalizedAccount || !direction || !bucketKey) return
    const semanticKey = CashFlowConcepts.normalizeDirectConceptKey(
      mapping?.semantic_key || mapping?.bucket_semantic_key || mapping?.metadata?.semantic_key || mapping?.metadata_json?.semantic_key || "",
    )

    const key = `${normalizedAccount}:${direction}:${bucketKey}`
    const current = merged.get(key)
    if (!current || Number(mapping?.confidence || 0) > Number(current.confidence || 0)) {
      merged.set(key, {
        normalized_account: normalizedAccount,
        direction,
        bucket_key: bucketKey,
        confidence: Number(mapping?.confidence || 0),
        source: mapping?.source || "auto_semantic",
        status: mapping?.status || "suggested",
        semantic_key: semanticKey || null,
        profile_score: Number(mapping?.profile_score || 0),
        llm_score: Number(mapping?.llm_score || 0),
        deterministic_score: Number(mapping?.deterministic_score || mapping?.confidence || 0),
        evidence: Array.isArray(mapping?.evidence) ? mapping.evidence : [],
        reasoning: mapping?.reasoning || null,
        previous_bucket_key: mapping?.previous_bucket_key || null,
        account_profile: mapping?.account_profile || mapping?.profile_evidence || null,
      })
    }
  })
  return Array.from(merged.values())
}

function mapMovementsToBuckets(movements, buckets, options = {}) {
  const mappingPolicy = normalizeMappingPolicy(options.mappingPolicy)
  const learnedMappings = Array.isArray(options.learnedMappings) ? options.learnedMappings : []
  const accountProfile = options.accountProfile || null
  const fallbackByDirection = {
    inflow: buckets.find((bucket) => bucket.direction === "inflow" && bucket.fallback) || null,
    outflow: buckets.find((bucket) => bucket.direction === "outflow" && bucket.fallback) || null,
  }

  const learnedLookup = buildLearnedMappingLookup(learnedMappings)

  const mappedMovements = []
  const unmapped = []
  const autoCreatedMappings = []
  const lowConfidenceMap = new Map()

  movements.forEach((movement) => {
    const direction = movement.amount >= 0 ? "inflow" : "outflow"
    const normalizedAccount = normalizeText(movement.account_name)
    const profileEntry = getRuntimeAccountDirectionProfile(accountProfile, normalizedAccount, direction)
    const compactProfile = compactRuntimeProfileEvidence(profileEntry)
    const directionBuckets = buckets
      .map((bucket, bucketIndex) => ({ bucket, bucketIndex }))
      .filter((item) => item.bucket.direction === direction)

    let selectedBucket = null
    let selectedSource = "template_rule"
    let selectedConfidence = 1
    let selectedGroundingStatus = "template_rule"
    let selectedScoreDetails = null

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
        const details = scoreDirectBucketMatchDetails(
          {
            ...movement,
            direction,
            normalized_account: normalizedAccount,
          },
          bucket,
          { accountProfile: profileEntry },
        )
        if (!bestSemantic || details.score > bestSemantic.score) {
          bestSemantic = { bucket, score: details.score, details }
        }
      })

      if (bestSemantic && bestSemantic.score >= mappingPolicy.low_confidence_threshold) {
        selectedBucket = bestSemantic.bucket
        selectedSource =
          bestSemantic.details?.profile_score >= mappingPolicy.high_confidence_threshold &&
          bestSemantic.score >= mappingPolicy.high_confidence_threshold
            ? "profile_auto"
            : "auto_semantic"
        selectedConfidence = bestSemantic.score
        selectedGroundingStatus = selectedSource === "profile_auto" ? "suggested" : "auto_semantic"
        selectedScoreDetails = bestSemantic.details
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
      bucket_semantic_key: selectedBucket.semantic_key || selectedScoreDetails?.profile_target_key || null,
      abs_amount: roundCurrency(Math.abs(movement.amount)),
      mapping_source: selectedSource,
      mapping_confidence: Number(selectedConfidence || 0),
      grounding_status: selectedGroundingStatus,
      profile_score: Number(selectedScoreDetails?.profile_score || 0),
      profile_evidence: compactProfile,
      mapping_evidence: selectedScoreDetails?.reasons || [],
    })

    const existingLearned = learnedLookup.get(`${normalizedAccount}:${direction}`)
    const canPersistAutoMapping =
      !existingLearned &&
      mappingPolicy.auto_create &&
      Number(selectedConfidence || 0) >= Number(mappingPolicy.high_confidence_threshold || 0.7) &&
      !["fallback"].includes(selectedSource) &&
      selectedGroundingStatus !== "fallback"
    if (canPersistAutoMapping) {
      autoCreatedMappings.push({
        normalized_account: normalizedAccount,
        direction,
        bucket_key: selectedBucket.bucket_key,
        semantic_key: selectedBucket.semantic_key || selectedScoreDetails?.profile_target_key || null,
        confidence: Number(selectedConfidence || 0),
        source: selectedSource === "template_rule" ? "template_rule" : selectedSource,
        status: "suggested",
        profile_score: Number(selectedScoreDetails?.profile_score || 0),
        deterministic_score: Number(selectedConfidence || 0),
        evidence: selectedScoreDetails?.reasons || [],
        account_profile: compactProfile,
      })
      learnedLookup.set(`${normalizedAccount}:${direction}`, {
        bucket_key: selectedBucket.bucket_key,
        confidence: Number(selectedConfidence || 0),
        source: selectedSource,
        status: "suggested",
        semantic_key: selectedBucket.semantic_key || selectedScoreDetails?.profile_target_key || null,
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
        semantic_key: row.bucket_semantic_key || null,
        confidence: Number(row.mapping_confidence || 0),
        source: row.mapping_source,
        grounding_status: row.grounding_status || null,
        abs_amount: Number(row.abs_amount || 0),
        profile_score: Number(row.profile_score || 0),
        profile_evidence: row.profile_evidence || null,
        mapping_evidence: row.mapping_evidence || [],
      })
    } else {
      const existing = assignmentMap.get(key)
      existing.abs_amount = roundCurrency(Number(existing.abs_amount || 0) + Number(row.abs_amount || 0))
      existing.confidence = Math.max(Number(existing.confidence || 0), Number(row.mapping_confidence || 0))
      if (!existing.profile_evidence && row.profile_evidence) existing.profile_evidence = row.profile_evidence
      if (!existing.semantic_key && row.bucket_semantic_key) existing.semantic_key = row.bucket_semantic_key
      existing.profile_score = Math.max(Number(existing.profile_score || 0), Number(row.profile_score || 0))
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

function getFormulaText(cell) {
  const value = cell?.value
  if (!value || typeof value !== "object" || !value.formula) return ""
  return String(value.formula || "")
}

function clearFormulaCachedResults(workbook) {
  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value
        if (!isFormulaCellValue(value) || value.result === undefined) return
        const { result, ...formulaValue } = value
        cell.value = formulaValue
      })
    })
  })
}

function parseCellAddressLoose(address) {
  return parseCellAddress(String(address || "").replace(/\$/g, ""))
}

function parseFormulaRanges(formula) {
  const ranges = []
  const text = String(formula || "")
  const rangePattern = /(?:'[^']+'!|[A-Za-z0-9_ ]+!)?(\$?[A-Z]{1,3}\$?\d+)\s*:\s*(\$?[A-Z]{1,3}\$?\d+)/gi
  let match = null
  while ((match = rangePattern.exec(text))) {
    try {
      const start = parseCellAddressLoose(match[1])
      const end = parseCellAddressLoose(match[2])
      ranges.push({
        startRow: Math.min(start.row, end.row),
        endRow: Math.max(start.row, end.row),
        startCol: Math.min(start.col, end.col),
        endCol: Math.max(start.col, end.col),
      })
    } catch (error) {
      // Ignore formula fragments that are not normal A1 ranges.
    }
  }
  return ranges
}

function inferDirectBucketCellWriteSigns(worksheet, bucketBindings = []) {
  const cellLookup = new Map()
  ;(bucketBindings || []).forEach((bucket) => {
    ;(bucket.resolved_cells || []).forEach((cell) => {
      cellLookup.set(cell.address, {
        address: cell.address,
        row: cell.row,
        col: cell.col,
        bucket_key: bucket.bucket_key,
        direction: bucket.direction,
      })
    })
  })

  const writeSigns = new Map()
  cellLookup.forEach((cell) => {
    writeSigns.set(cell.address, 1)
  })

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const formula = getFormulaText(cell)
      if (!formula) return
      parseFormulaRanges(formula).forEach((range) => {
        const bucketCells = Array.from(cellLookup.values()).filter(
          (item) =>
            item.row >= range.startRow &&
            item.row <= range.endRow &&
            item.col >= range.startCol &&
            item.col <= range.endCol,
        )
        if (bucketCells.length < 2) return
        const directions = new Set(bucketCells.map((item) => item.direction).filter(Boolean))
        if (!directions.has("inflow") || !directions.has("outflow")) return
        bucketCells
          .filter((item) => item.direction === "outflow")
          .forEach((item) => {
            writeSigns.set(item.address, -1)
          })
      })
    })
  })

  return writeSigns
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

function initializePeriodRowValueMap(rowBindings = []) {
  return rowBindings.reduce((accumulator, binding) => {
    accumulator[binding.semantic_key] = 0
    return accumulator
  }, {})
}

function inferProfitAndLossAccount(accountName) {
  const normalized = normalizeText(accountName)
  if (!normalized || normalized.includes("cash")) return null
  if (normalized.includes("revenue") || normalized.includes("income") || normalized.includes("sales")) {
    if (normalized.includes("unearned revenue")) return null
    return "revenue"
  }
  if (
    normalized.includes("expense") ||
    normalized.includes("fees") ||
    normalized.includes("salary") ||
    normalized.includes("rent") ||
    normalized.includes("utility") ||
    normalized.includes("marketing") ||
    normalized.includes("travel") ||
    normalized.includes("insurance") ||
    normalized.includes("supplies")
  ) {
    return "expense"
  }
  return null
}

function classifyWorkingCapitalAccount(accountName) {
  const normalized = normalizeText(accountName)
  if (!normalized) return null
  if (normalized.includes("accounts receivable") || normalized === "accounts receivable") return "receivable"
  if (normalized.includes("inventory")) return "inventory"
  if (normalized.includes("accounts payable") || normalized === "accounts payable") return "payable"
  if (normalized.includes("prepaid")) return "other_wc_asset"
  if (normalized.includes("unearned revenue")) return "other_wc_liability"
  return null
}

function classifyIndirectCashSemanticKey(accountName, direction) {
  const normalized = normalizeText(accountName)
  if (!normalized) return null

  if (
    normalized.includes("office equipment") ||
    normalized.includes("capital expenditure") ||
    normalized.includes("capex") ||
    normalized.includes("fixed asset") ||
    normalized.includes("ppe") ||
    normalized.includes("property plant") ||
    normalized.includes("investment purchase")
  ) {
    return direction === "outflow" ? "capital_expenditures" : "asset_sales"
  }
  if (normalized.includes("asset sale") || normalized.includes("disposal proceeds") || normalized.includes("sale proceeds")) {
    return direction === "inflow" ? "asset_sales" : null
  }
  if (
    normalized.includes("owner capital") ||
    normalized.includes("capital contribution") ||
    normalized.includes("member funding") ||
    normalized.includes("capital call") ||
    normalized.includes("paid in capital") ||
    normalized.includes("paid-in capital") ||
    normalized.includes("equity injection") ||
    normalized.includes("partner contribution")
  ) {
    return direction === "inflow" ? "capital_contributions" : null
  }
  if (
    normalized.includes("owner drawings") ||
    normalized.includes("drawings") ||
    normalized.includes("dividend") ||
    normalized.includes("distribution") ||
    normalized.includes("redemption")
  ) {
    return direction === "outflow" ? "dividends_paid" : null
  }
  if (
    normalized.includes("notes payable") ||
    normalized.includes("loan payable") ||
    normalized.includes("loan proceeds") ||
    normalized.includes("borrowings") ||
    normalized.includes("debt")
  ) {
    return direction === "inflow" ? "debt_issued" : "debt_repaid"
  }
  if (normalized.includes("interest expense") || normalized.includes("interest payable")) {
    return direction === "outflow" ? "interest_paid" : null
  }

  return null
}

function classifyIndirectCashSemanticKeyFromProfile(profile, accountName, direction) {
  if (!profile) return null
  const evidenceText = getRuntimeProfileEvidenceText(profile, {
    account_name: accountName,
    normalized_account: normalizeText(accountName),
    direction,
  })
  const accountClass = profile.tb_account_class || "other"
  const classTargets = {
    fixed_asset: direction === "outflow" ? "capital_expenditures" : "asset_sales",
    debt: direction === "inflow" ? "debt_issued" : "debt_repaid",
    equity: direction === "inflow" ? "capital_contributions" : "dividends_paid",
    interest_expense: direction === "outflow" ? "interest_paid" : null,
  }
  if (classTargets[accountClass]) {
    return {
      semantic_key: classTargets[accountClass],
      confidence: accountClass === "equity" || accountClass === "debt" ? 0.87 : 0.84,
      reason: `tb_class_${accountClass}`,
      evidence: compactRuntimeProfileEvidence(profile),
    }
  }

  const directConcept = bestDirectCashFlowConcept(evidenceText, direction)
  const conceptTargets = {
    capital_expenditures: "capital_expenditures",
    asset_sale_proceeds: "asset_sales",
    debt_drawdown: "debt_issued",
    debt_repayment: "debt_repaid",
    interest_paid: "interest_paid",
    equity_injection: "capital_contributions",
    dividends_distributions: "dividends_paid",
  }
  if (directConcept?.key && conceptTargets[directConcept.key]) {
    return {
      semantic_key: conceptTargets[directConcept.key],
      confidence: Math.min(0.9, Number(directConcept.score || 0.78) + 0.08),
      reason: `profile_concept_${directConcept.key}`,
      evidence: compactRuntimeProfileEvidence(profile),
    }
  }

  const textKey = classifyIndirectCashSemanticKey(evidenceText, direction)
  if (textKey && textKey !== "operating_cash_flow") {
    return {
      semantic_key: textKey,
      confidence: 0.78,
      reason: "profile_text_signal",
      evidence: compactRuntimeProfileEvidence(profile),
    }
  }

  return null
}

function summarizeIndirectAssignments(assignments = []) {
  const deduped = new Map()
  assignments.forEach((assignment) => {
    const key = `${normalizeText(assignment.account_name)}:${assignment.direction}:${assignment.bucket_key}`
    if (!deduped.has(key)) {
      deduped.set(key, {
        account_name: assignment.account_name,
        normalized_account: normalizeText(assignment.account_name),
        direction: assignment.direction,
        bucket_key: assignment.bucket_key,
        semantic_key: assignment.bucket_key,
        confidence: Number(assignment.mapping_confidence || 0),
        source: assignment.mapping_source,
        grounding_status: assignment.grounding_status || null,
        abs_amount: Number(assignment.abs_amount || 0),
        profile_score: Number(assignment.profile_score || 0),
        profile_evidence: assignment.profile_evidence || null,
        mapping_evidence: assignment.mapping_evidence || [],
      })
    } else {
      deduped.get(key).abs_amount = roundCurrency(
        Number(deduped.get(key).abs_amount || 0) + Number(assignment.abs_amount || 0),
      )
    }
  })
  return Array.from(deduped.values())
}

function mapIndirectCashMovementsToRows(movements, rowBindings, options = {}) {
  const bindingLookup = new Map((rowBindings || []).map((binding) => [binding.semantic_key, binding]))
  const learnedLookup = buildLearnedMappingLookup(options.learnedMappings)
  const accountProfile = options.accountProfile || null
  const mappedMovements = []
  const lowConfidenceMappings = []
  const unmapped = []
  const warnings = []
  const autoCreatedMappings = []

  movements.forEach((movement) => {
    const direction = movement.amount >= 0 ? "inflow" : "outflow"
    const normalizedAccount = normalizeText(movement.account_name)
    const profileEntry = getRuntimeAccountDirectionProfile(accountProfile, normalizedAccount, direction)
    const profileSemantic = classifyIndirectCashSemanticKeyFromProfile(profileEntry, movement.account_name, direction)
    const learned = learnedLookup.get(`${normalizedAccount}:${direction}`) || null
    const explicitSemanticKey = classifyIndirectCashSemanticKey(movement.account_name, direction)
    const fallbackSemanticKey = "operating_cash_flow"
    let selectedSemanticKey = learned?.bucket_key || profileSemantic?.semantic_key || explicitSemanticKey || fallbackSemanticKey
    let mappingSource = learned?.source || (profileSemantic ? "profile_auto" : explicitSemanticKey ? "template_rule" : "derived_operating")
    let confidence = learned ? Number(learned.confidence || 1) : profileSemantic?.confidence || (explicitSemanticKey ? 0.86 : 0.82)
    let groundingStatus = learned
      ? learned.status === "approved"
        ? "approved"
        : "suggested"
      : profileSemantic
        ? "suggested"
        : explicitSemanticKey
          ? "template_rule"
          : "suggested"
    let mappingEvidence = profileSemantic?.reason ? [profileSemantic.reason] : explicitSemanticKey ? ["account_name_semantic"] : []
    let profileScore = profileSemantic?.confidence || 0

    if (selectedSemanticKey !== fallbackSemanticKey && !bindingLookup.has(selectedSemanticKey)) {
      warnings.push(
        `Template is missing an indirect row binding for "${selectedSemanticKey}" while processing account "${movement.account_name}".`,
      )
      unmapped.push({
        ...movement,
        direction,
        abs_amount: roundCurrency(Math.abs(movement.amount)),
      })
      return
    }

    if (!bindingLookup.has(selectedSemanticKey)) {
      selectedSemanticKey = fallbackSemanticKey
      mappingSource = "derived_operating"
      confidence = 0.82
      groundingStatus = "suggested"
      mappingEvidence = []
      profileScore = 0
    }

    mappedMovements.push({
      ...movement,
      direction,
      bucket_key: selectedSemanticKey,
      bucket_label: bindingLookup.get(selectedSemanticKey)?.label || selectedSemanticKey,
      bucket_semantic_key: selectedSemanticKey,
      abs_amount: roundCurrency(Math.abs(movement.amount)),
      mapping_source: mappingSource,
      mapping_confidence: confidence,
      grounding_status: groundingStatus,
      profile_score: Number(profileScore || 0),
      profile_evidence: compactRuntimeProfileEvidence(profileEntry),
      mapping_evidence: mappingEvidence,
    })

    const shouldAutoCreate =
      !learned &&
      options.mappingPolicy?.auto_create !== false &&
      selectedSemanticKey !== fallbackSemanticKey &&
      Number(confidence || 0) >= 0.7 &&
      bindingLookup.has(selectedSemanticKey)
    if (shouldAutoCreate) {
      autoCreatedMappings.push({
        normalized_account: normalizedAccount,
        direction,
        bucket_key: selectedSemanticKey,
        semantic_key: selectedSemanticKey,
        confidence: Number(confidence || 0),
        source: mappingSource,
        status: "suggested",
        profile_score: Number(profileScore || 0),
        deterministic_score: Number(confidence || 0),
        evidence: mappingEvidence,
        account_profile: compactRuntimeProfileEvidence(profileEntry),
      })
      learnedLookup.set(`${normalizedAccount}:${direction}`, {
        bucket_key: selectedSemanticKey,
        confidence: Number(confidence || 0),
        source: mappingSource,
        status: "suggested",
        semantic_key: selectedSemanticKey,
      })
    }

    if (confidence < 0.75) {
      lowConfidenceMappings.push({
        account_name: movement.account_name,
        normalized_account: normalizedAccount,
        direction,
        bucket_key: selectedSemanticKey,
        confidence,
      })
    }
  })

  return {
    mappedMovements,
    unmapped,
    warnings: Array.from(new Set(warnings)),
    autoCreatedMappings: mergeAutoCreatedMappings(autoCreatedMappings),
    lowConfidenceMappings,
    finalBucketAssignments: summarizeIndirectAssignments(mappedMovements),
  }
}

function buildIndirectTemplatePeriodData({
  config,
  dateRange,
  tbAsOfDate,
  tbCashEndingBalance,
  generalLedgerRows,
  cashMovements,
  movementMapping = null,
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

  const rowBindings = getIndirectRowBindingsFromConfig(config)
  const rowBindingLookup = new Map(rowBindings.map((binding) => [binding.semantic_key, binding]))
  const periodRows = periodResolution.periods.map((period) => ({
    ...period,
    in_scope: Boolean(period.start && period.end ? rangesOverlap(period.start, period.end, runRange.start, runRange.end) : true),
    opening_balance: 0,
    net_cash_flow: 0,
    closing_balance: 0,
    row_values: initializePeriodRowValueMap(rowBindings),
  }))

  const periodLookup = new Map(periodRows.map((period) => [period.period_key, period]))
  const periodForDate = (date) =>
    periodRows.find((period) => period.start && period.end && date >= period.start && date <= period.end) || null

  const indirectMovementMapping = movementMapping || mapIndirectCashMovementsToRows(cashMovements, rowBindings)
  indirectMovementMapping.mappedMovements.forEach((movement) => {
    const movementDate = normalizeDateOnly(movement.date)
    if (movementDate < runRange.start || movementDate > runRange.end) return
    const period = periodForDate(movementDate)
    if (!period) return
    period.net_cash_flow = roundCurrency(period.net_cash_flow + movement.amount)
    period.row_values[movement.bucket_key] = roundCurrency(
      Number(period.row_values[movement.bucket_key] || 0) + Number(movement.amount || 0),
    )
  })

  generalLedgerRows.forEach((row) => {
    const rowDate = normalizeDateOnly(row.date)
    if (rowDate < runRange.start || rowDate > runRange.end) return
    const period = periodForDate(rowDate)
    if (!period) return

    const pnlClass = inferProfitAndLossAccount(row.account_name)
    if (pnlClass) {
      period.row_values.net_income = roundCurrency(
        Number(period.row_values.net_income || 0) + Number(row.credit || 0) - Number(row.debit || 0),
      )
    }

    const normalizedAccount = normalizeText(row.account_name)
    if (normalizedAccount.includes("depreciation") || normalizedAccount.includes("amortization")) {
      period.row_values.depreciation_amortization = roundCurrency(
        Number(period.row_values.depreciation_amortization || 0) + Number(row.debit || 0) - Number(row.credit || 0),
      )
    }

    const wcClass = classifyWorkingCapitalAccount(row.account_name)
    if (wcClass === "receivable") {
      period.row_values.change_in_receivables = roundCurrency(
        Number(period.row_values.change_in_receivables || 0) - (Number(row.debit || 0) - Number(row.credit || 0)),
      )
    } else if (wcClass === "inventory") {
      period.row_values.change_in_inventory = roundCurrency(
        Number(period.row_values.change_in_inventory || 0) - (Number(row.debit || 0) - Number(row.credit || 0)),
      )
    } else if (wcClass === "payable") {
      period.row_values.change_in_payables = roundCurrency(
        Number(period.row_values.change_in_payables || 0) + (Number(row.credit || 0) - Number(row.debit || 0)),
      )
    }
  })

  periodRows.forEach((period) => {
    const operatingTarget = roundCurrency(Number(period.row_values.operating_cash_flow || 0))
    const operatingBase = roundCurrency(
      Number(period.row_values.net_income || 0) +
        Number(period.row_values.depreciation_amortization || 0) +
        Number(period.row_values.change_in_receivables || 0) +
        Number(period.row_values.change_in_inventory || 0) +
        Number(period.row_values.change_in_payables || 0),
    )
    period.row_values.other_working_capital_changes = roundCurrency(operatingTarget - operatingBase)
    period.row_values.investing_cash_flow = roundCurrency(
      Number(period.row_values.capital_expenditures || 0) + Number(period.row_values.asset_sales || 0),
    )
    period.row_values.financing_cash_flow = roundCurrency(
      Number(period.row_values.capital_contributions || 0) +
        Number(period.row_values.debt_issued || 0) +
        Number(period.row_values.debt_repaid || 0) +
        Number(period.row_values.interest_paid || 0) +
        Number(period.row_values.dividends_paid || 0),
    )
    period.row_values.net_change_in_cash = roundCurrency(
      Number(period.row_values.operating_cash_flow || 0) +
        Number(period.row_values.investing_cash_flow || 0) +
        Number(period.row_values.financing_cash_flow || 0),
    )
    period.net_cash_flow = roundCurrency(Number(period.row_values.net_change_in_cash || 0))
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

  let rollingOpening = openingBalance
  periodRows.forEach((period, index) => {
    period.opening_balance = roundCurrency(rollingOpening)
    period.row_values.opening_cash = period.opening_balance
    period.closing_balance = roundCurrency(period.opening_balance + period.net_cash_flow)
    period.row_values.closing_cash = period.closing_balance
    if (index > 0 && rowBindingLookup.has("opening_cash")) {
      period.row_values.opening_cash = periodRows[index - 1].closing_balance
    }
    rollingOpening = period.closing_balance
  })

  const totals = {
    total_inflows: roundCurrency(
      cashMovements.filter((movement) => movement.amount >= 0).reduce((sum, movement) => sum + movement.amount, 0),
    ),
    total_outflows: roundCurrency(
      cashMovements.filter((movement) => movement.amount < 0).reduce((sum, movement) => sum + Math.abs(movement.amount), 0),
    ),
    net_cash_flow: roundCurrency(periodRows.reduce((sum, period) => sum + period.net_cash_flow, 0)),
    opening_balance_start: openingBalance,
    closing_balance_end: periodRows.length ? periodRows[periodRows.length - 1].closing_balance : openingBalance,
    bucket_totals: {},
    row_totals: {},
  }

  rowBindings.forEach((binding) => {
    totals.row_totals[binding.semantic_key] = roundCurrency(
      periodRows.reduce((sum, period) => sum + Number(period.row_values[binding.semantic_key] || 0), 0),
    )
  })

  const warnings = [...indirectMovementMapping.warnings]
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
    movementMapping: indirectMovementMapping,
  }
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
    const workbook = await readWorkbookFromFile({
      filePath: templatePath,
      label: "Cash flow template",
      ValidationErrorCtor: CashFlowValidationError,
    })
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
  if (getStatementMethodFromConfig(v3) === STATEMENT_METHODS.INDIRECT) {
    throw new CashFlowValidationError("Cannot convert indirect template config to v2.")
  }
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

function buildRuntimeMappingAccountKey(normalizedAccount, direction) {
  return `${normalizeText(normalizedAccount)}:${normalizeText(direction).toLowerCase()}`
}

function buildRuntimeMovementContext(movements = []) {
  const lookup = new Map()
  ;(Array.isArray(movements) ? movements : []).forEach((movement) => {
    const direction = Number(movement?.amount || 0) >= 0 ? "inflow" : "outflow"
    const normalizedAccount = normalizeText(movement?.account_name || "")
    if (!normalizedAccount) return
    const accountKey = buildRuntimeMappingAccountKey(normalizedAccount, direction)
    if (!accountKey) return

    if (!lookup.has(accountKey)) {
      lookup.set(accountKey, {
        movement_count: 0,
        total_abs_amount: 0,
        sample_descriptions: [],
      })
    }

    const context = lookup.get(accountKey)
    context.movement_count += 1
    context.total_abs_amount = roundCurrency(context.total_abs_amount + Math.abs(Number(movement?.amount || 0)))

    const description = String(movement?.description || "").trim()
    if (description && !context.sample_descriptions.includes(description) && context.sample_descriptions.length < 4) {
      context.sample_descriptions.push(description)
    }
  })

  return lookup
}

function hasIndirectSpecializedRuntimeSignal(accountName) {
  const normalized = normalizeText(accountName)
  if (!normalized) return false
  return /capital contribution|capital call|paid in capital|paid-in capital|owner capital|capital expenditure|capitalized|contribution|subscription|financing|drawdown|distribution|redemption|drawing|dividend|loan|note payable|debt|borrowing|interest|equipment|fixed asset|property|plant|ppe|asset sale|asset disposal|investment|proceeds/.test(
    normalized,
  )
}

function getIndirectRuntimeAllowedCandidates(rowBindings = [], direction) {
  const allowed = []
  const seen = new Set()
  ;(rowBindings || []).forEach((binding) => {
    const definition = INDIRECT_ROW_LOOKUP.get(binding.semantic_key)
    const bindingRole = binding.role || definition?.role
    if (!definition || bindingRole !== "input") return
    if (definition.cash_direction !== direction) return
    if (seen.has(binding.semantic_key)) return
    seen.add(binding.semantic_key)
    allowed.push({
      mapping_key: binding.semantic_key,
      semantic_key: binding.semantic_key,
      label: binding.label,
      description: `${definition.label} (${definition.cash_direction})`,
      is_fallback: false,
    })
  })

  const operatingBinding = (rowBindings || []).find((binding) => binding.semantic_key === "operating_cash_flow")
  if (operatingBinding && !seen.has("operating_cash_flow")) {
    allowed.push({
      mapping_key: "operating_cash_flow",
      semantic_key: "operating_cash_flow",
      label: operatingBinding.label,
      description: "Operating cash flow fallback",
      is_fallback: true,
    })
  }

  return allowed
}

function buildRuntimeMappingCandidates({
  statementMethod,
  initialMapping,
  buckets,
  rowBindings,
  mappingPolicy,
  movements = [],
  accountProfile = null,
}) {
  const candidates = []
  const candidateKeys = new Set()
  const highConfidenceThreshold = Number(mappingPolicy?.high_confidence_threshold || 0.7)
  const movementContextLookup = buildRuntimeMovementContext(movements)

  const addCandidate = ({
    account_name,
    normalized_account,
    direction,
    current_mapping_key = null,
    current_mapping_label = null,
    current_mapping_source = null,
    current_mapping_confidence = 0,
    allowed_candidates = [],
  }) => {
    const accountKey = buildRuntimeMappingAccountKey(normalized_account || account_name, direction)
    if (!accountKey || candidateKeys.has(accountKey) || allowed_candidates.length < 2) return
    const movementContext = movementContextLookup.get(accountKey) || {}
    const profileEntry = getRuntimeAccountDirectionProfile(accountProfile, normalized_account || account_name, direction)
    const accountEvidence = {
      account_name,
      normalized_account: normalized_account || account_name,
      description: (movementContext.sample_descriptions || []).join(" "),
      direction,
      amount: direction === "outflow" ? -1 : 1,
      account_profile: profileEntry,
    }
    const enrichedAllowedCandidates = (allowed_candidates || []).map((candidate) => {
      const scoreDetails =
        candidate.deterministic_score !== undefined
          ? {
              score: Number(candidate.deterministic_score || 0),
              profile_score: Number(candidate.profile_score || 0),
              reasons: candidate.evidence || [],
              profile_target_key: candidate.profile_target_key || null,
            }
          : scoreDirectBucketMatchDetails(
              accountEvidence,
              {
                bucket_key: candidate.mapping_key,
                label: candidate.label,
                description: candidate.description,
                direction,
                fallback: candidate.is_fallback,
                semantic_key: candidate.semantic_key || null,
                semantic_confidence: candidate.semantic_confidence || 0,
                semantic_evidence: candidate.semantic_evidence || [],
              },
              { accountProfile: profileEntry },
            )
      return {
        ...candidate,
        deterministic_score: Number(scoreDetails.score || 0),
        profile_score: Number(scoreDetails.profile_score || 0),
        profile_target_key: scoreDetails.profile_target_key || null,
        evidence: scoreDetails.reasons || [],
      }
    })
    const bestDeterministic = enrichedAllowedCandidates
      .filter((candidate) => !candidate.is_fallback)
      .sort((left, right) => Number(right.deterministic_score || 0) - Number(left.deterministic_score || 0))[0] || null
    candidateKeys.add(accountKey)
    candidates.push({
      account_key: accountKey,
      account_name,
      normalized_account: normalizeText(normalized_account || account_name),
      direction,
      movement_count: Number(movementContext.movement_count || 0),
      total_abs_amount: Number(movementContext.total_abs_amount || 0),
      sample_descriptions: movementContext.sample_descriptions || [],
      account_profile: compactRuntimeProfileEvidence(profileEntry),
      best_profile_mapping_key:
        bestDeterministic && Number(bestDeterministic.profile_score || 0) >= 0.7
          ? bestDeterministic.mapping_key
          : null,
      best_profile_score: bestDeterministic ? Number(bestDeterministic.profile_score || 0) : 0,
      best_deterministic_mapping_key: bestDeterministic?.mapping_key || null,
      best_deterministic_score: bestDeterministic ? Number(bestDeterministic.deterministic_score || 0) : 0,
      current_mapping_key,
      current_mapping_label,
      current_mapping_source,
      current_mapping_confidence: Number(current_mapping_confidence || 0),
      allowed_candidates: enrichedAllowedCandidates,
    })
  }

  if (statementMethod === STATEMENT_METHODS.INDIRECT) {
    ;(initialMapping?.finalBucketAssignments || []).forEach((assignment) => {
      const source = normalizeBucketKey(assignment?.source || assignment?.mapping_source || "", "")
      if (!["derived_operating", "fallback"].includes(source)) return
      const profileEntry = getRuntimeAccountDirectionProfile(
        accountProfile,
        assignment.normalized_account || assignment.account_name,
        assignment.direction,
      )
      const profileEvidenceText = getRuntimeProfileEvidenceText(profileEntry, {
        account_name: assignment.account_name,
        normalized_account: assignment.normalized_account,
        direction: assignment.direction,
      })
      if (
        !hasIndirectSpecializedRuntimeSignal(assignment.account_name || assignment.normalized_account) &&
        !hasIndirectSpecializedRuntimeSignal(profileEvidenceText)
      ) {
        return
      }

      const allowedCandidates = getIndirectRuntimeAllowedCandidates(rowBindings, assignment.direction)
      addCandidate({
        account_name: assignment.account_name,
        normalized_account: assignment.normalized_account,
        direction: assignment.direction,
        current_mapping_key: assignment.bucket_key,
        current_mapping_label:
          (rowBindings || []).find((binding) => binding.semantic_key === assignment.bucket_key)?.label || assignment.bucket_key,
        current_mapping_source: assignment.source || assignment.mapping_source || null,
        current_mapping_confidence: assignment.confidence || assignment.mapping_confidence || 0,
        allowed_candidates: allowedCandidates,
      })
    })

    return candidates
  }

  ;(initialMapping?.finalBucketAssignments || []).forEach((assignment) => {
    const source = normalizeBucketKey(assignment?.source || assignment?.mapping_source || "", "")
    const grounding = normalizeBucketKey(assignment?.grounding_status || "", "")
    const confidence = Number(assignment?.confidence || assignment?.mapping_confidence || 0)
    const currentBucket = (buckets || []).find((bucket) => bucket.bucket_key === assignment.bucket_key) || null
    const currentUsesLlmSemantic = normalizeBucketKey(currentBucket?.semantic_source || "", "") === "llm_semantic"
    const isGrounded = ["template_rule", "approved"].includes(grounding) || ["template_rule", "manual_rule", "seeded"].includes(source)
    if (isGrounded) return
    if (
      confidence >= highConfidenceThreshold &&
      !["fallback", "auto_semantic"].includes(source) &&
      grounding !== "suggested" &&
      !currentUsesLlmSemantic
    ) {
      return
    }

    const allowedCandidates = (buckets || [])
      .filter((bucket) => bucket.direction === assignment.direction)
      .map((bucket) => ({
        mapping_key: bucket.bucket_key,
        label: bucket.label,
        description: bucket.fallback ? "Fallback bucket" : "Template bucket",
        is_fallback: Boolean(bucket.fallback),
        semantic_key: bucket.semantic_key || null,
        semantic_confidence: Number(bucket.semantic_confidence || 0),
        semantic_source: bucket.semantic_source || null,
        semantic_evidence: Array.isArray(bucket.semantic_evidence) ? bucket.semantic_evidence : [],
      }))

    addCandidate({
      account_name: assignment.account_name,
      normalized_account: assignment.normalized_account,
      direction: assignment.direction,
      current_mapping_key: assignment.bucket_key,
      current_mapping_label: assignment.bucket_label || (buckets || []).find((bucket) => bucket.bucket_key === assignment.bucket_key)?.label || assignment.bucket_key,
      current_mapping_source: assignment.source || assignment.mapping_source || null,
      current_mapping_confidence: confidence,
      allowed_candidates: allowedCandidates,
    })
  })

  return candidates
}

async function resolveRuntimeMappingAssistant(explicitAssistant = null) {
  if (explicitAssistant && typeof explicitAssistant.assistMappings === "function") {
    return explicitAssistant
  }

  try {
    const assistant = require("../modules/mappings/services/runtimeMappingAssistant.service")
    if (assistant && typeof assistant.assistMappings === "function") {
      return assistant
    }
  } catch (error) {
    return null
  }

  return null
}

async function maybeApplyRuntimeMappingAssistance({
  statementMethod,
  movements,
  initialMapping,
  buckets,
  rowBindings,
  mappingPolicy,
  learnedMappings,
  accountProfile = null,
  useRuntimeMappingAssistance = false,
  runtimeMappingAssistant = null,
}) {
  const baseSummary = {
    enabled: Boolean(useRuntimeMappingAssistance),
    statementMethod,
    candidatesConsidered: 0,
    attempted: false,
    acceptedCount: 0,
    rejectedCount: 0,
    failed: false,
  }
  if (!useRuntimeMappingAssistance) {
    return {
      mapped: initialMapping,
      assistanceSummary: baseSummary,
    }
  }

  const assistant = await resolveRuntimeMappingAssistant(runtimeMappingAssistant)
  if (!assistant) {
    return {
      mapped: initialMapping,
      assistanceSummary: {
        ...baseSummary,
        failed: true,
        failureReason: "runtime_mapping_assistant_unavailable",
      },
    }
  }

  const candidates = buildRuntimeMappingCandidates({
    statementMethod,
    initialMapping,
    buckets,
    rowBindings,
    mappingPolicy,
    movements,
    accountProfile,
  })
  if (!candidates.length) {
    return {
      mapped: initialMapping,
      assistanceSummary: {
        ...baseSummary,
        candidatesConsidered: 0,
      },
    }
  }

  let assistance = null
  try {
    assistance = await assistant.assistMappings({
      statementMethod,
      candidates,
    })
  } catch (error) {
    return {
      mapped: initialMapping,
      assistanceSummary: {
        ...baseSummary,
        candidatesConsidered: candidates.length,
        attempted: true,
        failed: true,
        failureReason: String(error?.message || "runtime_mapping_assistance_failed"),
      },
    }
  }
  const acceptedMappings = Array.isArray(assistance?.acceptedMappings) ? assistance.acceptedMappings : []
  const rejectedRecommendations = Array.isArray(assistance?.rejectedRecommendations) ? assistance.rejectedRecommendations : []
  const profileEvidenceStats = {
    candidates_with_profile: candidates.filter((candidate) => candidate.account_profile).length,
    strong_profile_candidates: candidates.filter((candidate) => Number(candidate.best_profile_score || 0) >= 0.7).length,
    deterministic_profile_disagreements: rejectedRecommendations.filter(
      (item) => item.reason === "profile_llm_conflict_requires_review",
    ).length,
  }
  const assistanceSummary = {
    ...baseSummary,
    ...(assistance?.summary || {}),
    candidatePoolSize: candidates.length,
    candidatesConsidered: Number(assistance?.summary?.candidatesConsidered || candidates.length),
    notes: assistance?.notes || [],
    runtimeScope: appConfig.mappingAssistance?.runtimeScope || "ambiguous_novel",
    confidenceCalibrationNotes: [
      "accepted mappings require schema-valid targets, non-empty evidence, and min score",
      "profile/llm conflicts within 0.12 are review-only",
      "auto-created runtime mappings persist as suggested",
    ],
    profileEvidenceStats,
    rejectedRecommendations,
    acceptedMappings: acceptedMappings.map((mapping) => ({
      normalized_account: mapping.normalized_account,
      direction: mapping.direction,
      bucket_key: mapping.bucket_key,
      semantic_key: mapping.semantic_key || null,
      confidence: mapping.confidence,
      llm_score: mapping.llm_score || mapping.confidence,
      profile_score: mapping.profile_score || 0,
      reasoning: mapping.reasoning || null,
      previous_bucket_key: mapping.previous_bucket_key || null,
      changed: Boolean(mapping.changed),
    })),
  }

  if (!acceptedMappings.length) {
    return {
      mapped: initialMapping,
      assistanceSummary,
    }
  }

  const augmentedLearnedMappings = [...(learnedMappings || []), ...acceptedMappings]
  const remapped =
    statementMethod === STATEMENT_METHODS.INDIRECT
      ? mapIndirectCashMovementsToRows(movements, rowBindings, {
          learnedMappings: augmentedLearnedMappings,
          mappingPolicy,
          accountProfile,
        })
      : mapMovementsToBuckets(movements, buckets, {
          learnedMappings: augmentedLearnedMappings,
          mappingPolicy,
          accountProfile,
        })

  remapped.autoCreatedMappings = mergeAutoCreatedMappings(
    remapped.autoCreatedMappings,
    acceptedMappings.map((mapping) => ({
      normalized_account: mapping.normalized_account,
      direction: mapping.direction,
      bucket_key: mapping.bucket_key,
      semantic_key: mapping.semantic_key || null,
      confidence: mapping.confidence,
      source: mapping.source || "llm_assisted",
      status: "suggested",
      profile_score: mapping.profile_score || 0,
      llm_score: mapping.llm_score || mapping.confidence || 0,
      deterministic_score: mapping.deterministic_score || 0,
      evidence: mapping.evidence || [],
      reasoning: mapping.reasoning || null,
      previous_bucket_key: mapping.previous_bucket_key || null,
      account_profile: mapping.account_profile || null,
    })),
  )

  return {
    mapped: remapped,
    assistanceSummary,
  }
}

async function fillTemplateWorkbook({ templatePath, outputPath, config, periodData, fiscalData }) {
  ensureFileExists(templatePath, "Cash flow template")

  const normalizedConfig = await ensureV3TemplateConfig({
    templateConfig: config,
    templatePath,
  })
  const statementMethod = getStatementMethodFromConfig(normalizedConfig)
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
  const rowBindings = getIndirectRowBindingsFromConfig(normalizedConfig).map((binding) => ({
    ...binding,
    resolved_cells: resolvePeriodCellBindings(binding.cells, `row_bindings.${binding.semantic_key}.cells`),
  }))

  const workbook = await readWorkbookFromFile({
    filePath: templatePath,
    label: "Cash flow template",
    ValidationErrorCtor: CashFlowValidationError,
  })
  const worksheet = workbook.getWorksheet(normalizedConfig.sheet_name)
  if (!worksheet) {
    throw new CashFlowValidationError(`Template sheet "${normalizedConfig.sheet_name}" not found`)
  }
  const directBucketWriteSigns =
    statementMethod === STATEMENT_METHODS.DIRECT
      ? inferDirectBucketCellWriteSigns(worksheet, bucketBindings)
      : new Map()

  const setNumberCellIfWritable = (cell, value) => {
    if (writerPolicy.preserve_formulas && isFormulaCell(cell.value)) return false
    cell.value = roundCurrency(value)
    return true
  }
  const setOpeningNumberCell = (cell, value) => {
    if (writerPolicy.preserve_formulas && isFormulaCell(cell.value) && !isFormulaLiteralNumber(cell.value)) return false
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
    const period =
      periodLookup.get(periodKey) ||
      (statementMethod === STATEMENT_METHODS.INDIRECT
        ? {
            period_key: periodKey,
            opening_balance: 0,
            closing_balance: 0,
            row_values: {},
          }
        : {
            period_key: periodKey,
            opening_balance: 0,
            closing_balance: 0,
            bucket_amounts: {},
          })

    if (statementMethod === STATEMENT_METHODS.INDIRECT) {
      rowBindings.forEach((binding) => {
        const rowCellBinding = getValueByPeriod(binding.resolved_cells, periodKey)
        const value = period.row_values?.[binding.semantic_key] || 0
        setNumberCellIfWritable(
          resolveWorksheetCell(rowCellBinding, `row ${binding.semantic_key} period ${periodKey}`),
          value,
        )
      })
      return
    }

    const openingBinding = getValueByPeriod(openingBindings, periodKey)
    const closingBinding = getValueByPeriod(closingBindings, periodKey)

    if (openingBinding) {
      setOpeningNumberCell(
        resolveWorksheetCell(openingBinding, `opening period ${periodKey}`),
        period.opening_balance || 0,
      )
    }

    bucketBindings.forEach((bucket) => {
      const bucketCellBinding = getValueByPeriod(bucket.resolved_cells, periodKey)
      const amount = period.bucket_amounts?.[bucket.bucket_key] || 0
      const writeSign = bucket.direction === "outflow" ? directBucketWriteSigns.get(bucketCellBinding?.address) || 1 : 1
      setNumberCellIfWritable(
        resolveWorksheetCell(bucketCellBinding, `bucket ${bucket.bucket_key} period ${periodKey}`),
        roundCurrency(Number(amount || 0) * writeSign),
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
    clearFormulaCachedResults(workbook)
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
  useRuntimeMappingAssistance = Boolean(appConfig.mappingAssistance?.runtimeEnabled),
  runtimeMappingAssistant = null,
}) {
  const config = await ensureV3TemplateConfig({
    templateConfig,
    templatePath,
  })
  const statementMethod = getStatementMethodFromConfig(config)
  const buckets = getBucketsFromConfig(config)
  const rowBindings = getIndirectRowBindingsFromConfig(config)
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
  const accountProfile = buildRuntimeAccountProfile({
    trialBalance,
    generalLedger,
    cashAccountName: trialBalance.cashAccountName,
  })

  const initialMapping =
    statementMethod === STATEMENT_METHODS.INDIRECT
      ? mapIndirectCashMovementsToRows(generalLedger.movements, rowBindings, {
          learnedMappings,
          mappingPolicy,
          accountProfile,
        })
      : mapMovementsToBuckets(generalLedger.movements, buckets, {
          learnedMappings,
          mappingPolicy,
          accountProfile,
        })
  const runtimeAssistance = await maybeApplyRuntimeMappingAssistance({
    statementMethod,
    movements: generalLedger.movements,
    initialMapping,
    buckets,
    rowBindings,
    mappingPolicy,
    learnedMappings,
    accountProfile,
    useRuntimeMappingAssistance,
    runtimeMappingAssistant,
  })
  const mapped = runtimeAssistance.mapped
  const accountProfileSummary = buildRuntimeAccountProfileSummary({
    accountProfile,
    mapped,
    assistanceSummary: runtimeAssistance.assistanceSummary,
  })

  const periodData =
    statementMethod === STATEMENT_METHODS.INDIRECT
      ? buildIndirectTemplatePeriodData({
          config,
          dateRange: resolvedRange,
          tbAsOfDate: trialBalance.asOfDate,
          tbCashEndingBalance: trialBalance.cashEndingBalance,
          generalLedgerRows: generalLedger.rows,
          cashMovements: generalLedger.movements,
          movementMapping: mapped,
        })
      : buildTemplatePeriodData({
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
    ...(mapped.warnings || []),
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
          buckets: statementMethod === STATEMENT_METHODS.INDIRECT ? period.row_values || {} : period.bucket_amounts,
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
      assistance_summary: runtimeAssistance.assistanceSummary,
      account_profile_summary: accountProfileSummary,
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
        buckets: statementMethod === STATEMENT_METHODS.INDIRECT ? period.row_values || {} : period.bucket_amounts,
      })),
      monthly: monthlyPreview,
      mapping_summary: {
        total_cash_movements: generalLedger.movements.length,
        mapped_cash_movements: mapped.mappedMovements.length,
        auto_mappings_created: mapped.autoCreatedMappings.length,
        low_confidence_mappings: mapped.lowConfidenceMappings.length,
        assistance: runtimeAssistance.assistanceSummary,
        account_profile: accountProfileSummary,
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
  getIndirectRowDefinitions,
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
    inferStatementMethodFromConfigShape,
    looksLikeV3TemplateConfig,
    normalizeStatementMethod,
    normalizeIndirectRowBindings,
    normalizeBucketKey,
    detectBucketDirection,
    computeTokenSimilarity,
    scoreDirectBucketMatch,
    scoreDirectBucketMatchDetails,
    evaluateDirectBucketSemanticQuality,
    pickRowLayoutCandidate,
    pickColumnLayoutCandidate,
    resolvePeriodRanges,
    buildIndirectV3ConfigFromNormalizedSheet,
    classifyIndirectCashSemanticKey,
    classifyIndirectCashSemanticKeyFromProfile,
    mapIndirectCashMovementsToRows,
    buildLearnedMappingLookup,
    buildRuntimeAccountProfile,
    getRuntimeAccountDirectionProfile,
    compactRuntimeProfileEvidence,
    buildRuntimeAccountProfileSummary,
    buildRuntimeMappingCandidates,
    buildRuntimeMovementContext,
    maybeApplyRuntimeMappingAssistance,
    inferDirectBucketCellWriteSigns,
    buildIndirectTemplatePeriodData,
    buildTemplatePeriodData,
  },
}
