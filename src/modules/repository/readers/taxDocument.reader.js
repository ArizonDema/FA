const { formatNumber, matchPointFromSource, parseNumber, point, snippet } = require("./reader.utils")

const READER_KEY = "tax_document"
const READER_VERSION = "tax-document.v2"

const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?)"

function redactTaxIdentifiers(text) {
  return String(text || "")
    .replace(
      /\b((?:tax identification number|taxpayer identification number|tax id|tin|ein)\s*(?:is|:)?\s*)([A-Z0-9-]{4,})/gi,
      "$1[redacted]",
    )
    .replace(/\b\d{2}-\d{7}\b/g, "[redacted tax id]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted tax id]")
}

const TAX_FIELDS = [
  {
    key: "tax_year",
    label: "Tax Year",
    tableLabels: ["Tax Year", "Calendar Year", "Fiscal Year", "Year"],
    patterns: [
      /\b(?:tax year|calendar year|fiscal year)\s*(?:is|:)?\s*((?:19|20)\d{2})\b/i,
      /\bfor the year ended\s+[A-Za-z]+\s+\d{1,2},?\s+((?:19|20)\d{2})\b/i,
    ],
    confidence: 0.92,
  },
  {
    key: "tax_form",
    label: "Tax Form",
    tableLabels: ["Tax Form", "Form", "Document Type", "Schedule"],
    patterns: [
      /\b(schedule\s+k-1(?:\s*\(\s*form\s+1065\s*\))?)/i,
      /\b(form\s+(?:1065|1120|1042-S|K-1|W-8BEN-E|W-9|PFIC))\b/i,
    ],
    confidence: 0.9,
  },
  {
    key: "partnership_name",
    label: "Partnership / Fund",
    tableLabels: ["Partnership Name", "Partnership", "Fund Name", "Entity Name", "Issuer"],
    patterns: [
      /\b(?:partnership name|fund name|entity name|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "partner_name",
    label: "Partner / Investor",
    tableLabels: ["Partner Name", "Partner", "Investor Name", "Investor", "Limited Partner"],
    patterns: [
      /\b(?:partner name|investor name|limited partner)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "tax_jurisdiction",
    label: "Tax Jurisdiction / Residency",
    tableLabels: ["Tax Jurisdiction", "Tax Residency", "Jurisdiction of Tax Residence"],
    patterns: [
      /\b(?:tax residency|tax resident in|jurisdiction of tax residence|tax jurisdiction)\s*(?:is|:)?\s*([A-Za-z][A-Za-z ,'-]{2,80})/i,
    ],
  },
  {
    key: "entity_classification",
    label: "Entity Tax Classification",
    tableLabels: ["Entity Classification", "Tax Classification", "Entity Tax Classification"],
    patterns: [
      /\b(?:entity classification|tax classification|classified for tax purposes as)\s*(?:is|:)?\s*([^.\n;]{3,100})/i,
    ],
  },
  {
    key: "withholding_rate",
    label: "Withholding Rate",
    tableLabels: ["Withholding Rate", "Withholding Tax Rate"],
    patterns: [
      /\b(?:withholding tax rate|withholding rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "final_k1",
    label: "Final K-1",
    tableLabels: ["Final K-1", "Final"],
    patterns: [/\b(final\s+k-1|final schedule k-1)\b/i],
    confidence: 0.82,
  },
  {
    key: "amended_k1",
    label: "Amended K-1",
    tableLabels: ["Amended K-1", "Amended"],
    patterns: [/\b(amended\s+k-1|amended schedule k-1)\b/i],
    confidence: 0.82,
  },
  {
    key: "capital_account_method",
    label: "Capital Account Method",
    tableLabels: ["Capital Account Method", "Capital Account Analysis Method", "Tax Basis Method", "Partner Capital Account Method"],
    patterns: [
      /\b(?:capital account method|capital account analysis method|partner capital account method)\s*(?:is|:)?\s*([^.\n;]{4,120})/i,
      /\b(tax basis capital)\b/i,
    ],
    confidence: 0.86,
  },
  {
    key: "beginning_capital_account",
    label: "Beginning Capital Account",
    tableLabels: ["Beginning Capital Account", "Beginning Capital", "Opening Capital Account"],
    patterns: [new RegExp(`\\b(?:beginning|opening)\\s+capital(?: account)?\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.9,
  },
  {
    key: "capital_contributed",
    label: "Capital Contributed",
    tableLabels: ["Capital Contributed During Year", "Capital Contributed", "Contributions", "Capital Contributions"],
    patterns: [new RegExp(`\\b(?:capital contributed during year|capital contributed|capital contributions?|contributions?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "current_year_net_income_loss",
    label: "Current Year Net Income / Loss",
    tableLabels: ["Current Year Net Income (Loss)", "Current Year Net Income", "Current Year Net Loss", "Net Income (Loss)"],
    patterns: [new RegExp(`\\b(?:current year net income\\s*\\(?loss\\)?|current year net income|current year net loss|net income\\s*\\(?loss\\)?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "other_increase_decrease",
    label: "Other Increase / Decrease",
    tableLabels: ["Other Increase (Decrease)", "Other Increase / Decrease", "Other Increase", "Other Decrease"],
    patterns: [new RegExp(`\\b(?:other increase\\s*\\(?decrease\\)?|other increase|other decrease)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "withdrawals_distributions",
    label: "Withdrawals and Distributions",
    tableLabels: ["Withdrawals and Distributions", "Withdrawals", "Distributions", "Capital Distributions"],
    patterns: [new RegExp(`\\b(?:withdrawals and distributions|withdrawals|capital distributions?|distributions?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.88,
  },
  {
    key: "ending_capital_account",
    label: "Ending Capital Account",
    tableLabels: ["Ending Capital Account", "Ending Capital", "Closing Capital Account"],
    patterns: [new RegExp(`\\b(?:ending|closing)\\s+capital(?: account)?\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.92,
  },
  {
    key: "ordinary_business_income_loss",
    label: "Ordinary Business Income / Loss",
    tableLabels: ["Ordinary Business Income (Loss)", "Ordinary Business Income", "Ordinary Business Loss"],
    patterns: [new RegExp(`\\b(?:ordinary business income\\s*\\(?loss\\)?|ordinary business income|ordinary business loss)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
  {
    key: "interest_income",
    label: "Interest Income",
    tableLabels: ["Interest Income", "Interest"],
    patterns: [new RegExp(`\\binterest income\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "dividends",
    label: "Dividends",
    tableLabels: ["Dividends", "Dividend Income"],
    patterns: [new RegExp(`\\b(?:dividends?|dividend income)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "net_short_term_capital_gain_loss",
    label: "Net Short-Term Capital Gain / Loss",
    tableLabels: ["Net Short-Term Capital Gain (Loss)", "Short-Term Capital Gain (Loss)", "Net Short-Term Capital Gain"],
    patterns: [new RegExp(`\\b(?:net short-term capital gain\\s*\\(?loss\\)?|short-term capital gain\\s*\\(?loss\\)?|net short term capital gain\\s*\\(?loss\\)?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "net_long_term_capital_gain_loss",
    label: "Net Long-Term Capital Gain / Loss",
    tableLabels: ["Net Long-Term Capital Gain (Loss)", "Long-Term Capital Gain (Loss)", "Net Long-Term Capital Gain"],
    patterns: [new RegExp(`\\b(?:net long-term capital gain\\s*\\(?loss\\)?|long-term capital gain\\s*\\(?loss\\)?|net long term capital gain\\s*\\(?loss\\)?)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.82,
  },
  {
    key: "section_199a_income",
    label: "Section 199A Income",
    tableLabels: ["Section 199A Income", "199A Income", "Qualified Business Income"],
    patterns: [new RegExp(`\\b(?:section 199a income|199a income|qualified business income)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "foreign_tax_paid",
    label: "Foreign Tax Paid",
    tableLabels: ["Foreign Tax Paid", "Foreign Taxes Paid", "Foreign Tax"],
    patterns: [new RegExp(`\\b(?:foreign taxes? paid|foreign tax)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.8,
  },
  {
    key: "state_source_income",
    label: "State Source Income",
    tableLabels: ["State Source Income", "State Income", "State Taxable Income"],
    patterns: [new RegExp(`\\b(?:state source income|state income|state taxable income)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.78,
  },
  {
    key: "withholding_amount",
    label: "Withholding Amount",
    tableLabels: ["Withholding Amount", "Withholding Tax", "Tax Withheld"],
    patterns: [new RegExp(`\\b(?:withholding amount|withholding tax|tax withheld)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i")],
    confidence: 0.84,
  },
]

function identitySearchText(source = {}) {
  const tableText = (source.tables || [])
    .flatMap((table) => (table.rows || []).slice(0, 12).map((row) => row.join(" | ")))
    .join("\n")
  return [source.text, tableText].filter(Boolean).join("\n")
}

function identityPoint(source) {
  const text = identitySearchText(source)
  const scheduleMatch = text.match(/\bschedule\s+k-1\b/i)
  if (scheduleMatch) {
    return point({
      key: "document_identity",
      label: "Document Type",
      value: "Schedule K-1",
      sourceReference: scheduleMatch[0],
      confidence: 0.96,
    })
  }
  const packageMatch = text.match(/\btax package\b/i)
  if (packageMatch) {
    return point({
      key: "document_identity",
      label: "Document Type",
      value: "Tax Package",
      sourceReference: packageMatch[0],
      confidence: 0.9,
    })
  }
  const formMatch = text.match(/\bform\s+(?:1065|1120|1042-S|W-8BEN-E|W-9|PFIC)\b/i)
  if (!formMatch) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Tax Document",
    sourceReference: formMatch[0],
    confidence: 0.86,
  })
}

function capitalAccountReconciliation(values) {
  const beginning = parseNumber(values.beginning_capital_account)
  const contributions = parseNumber(values.capital_contributed)
  const netIncomeLoss = parseNumber(values.current_year_net_income_loss)
  const other = parseNumber(values.other_increase_decrease)
  const withdrawals = parseNumber(values.withdrawals_distributions)
  const ending = parseNumber(values.ending_capital_account)
  if ([beginning, contributions, netIncomeLoss, other, withdrawals, ending].some((value) => value === null)) return null
  return beginning + contributions + netIncomeLoss + other - Math.abs(withdrawals) - ending
}

class TaxDocumentReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const safeTextExcerpt = redactTaxIdentifiers(text)
    const keyPoints = TAX_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = identityPoint(source)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const capitalAccountVariance = capitalAccountReconciliation(values)
    if (capitalAccountVariance !== null) {
      keyPoints.push(point({
        key: "tax_capital_account_reconciliation",
        label: "Tax Capital Account Reconciliation",
        value: Math.abs(capitalAccountVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(capitalAccountVariance, 2)}`,
        confidence: 0.9,
      }))
    }
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const missing = ["tax_year", "tax_form"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "tax_context_fields_not_detected", message: `Review missing tax context: ${missing.join(", ")}.` })
    }
    if (capitalAccountVariance !== null && Math.abs(capitalAccountVariance) > 0.01) {
      issues.push({
        code: "tax_capital_account_mismatch",
        message: `K-1 capital account rollforward differs by ${formatNumber(capitalAccountVariance, 2)}.`,
      })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} non-identifier tax reporting fact(s) for review.`
        : "No standard tax reporting facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? Math.min(0.94, 0.4 + keyPoints.length * 0.08) : keyPoints.length ? 0.68 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        sensitive_identifiers_excluded: true,
        missing_context_fields: missing,
        capital_account_reconciliation_variance: capitalAccountVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(safeTextExcerpt, 1200),
    }
  }
}

module.exports = TaxDocumentReader
