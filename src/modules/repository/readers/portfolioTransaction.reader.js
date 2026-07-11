const { formatNumber, matchPoint, matchTablePoint, parseNumber, point, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "portfolio_transaction"
const READER_VERSION = "portfolio-transaction.v1"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"
const NUMBER_PATTERN = "([0-9][0-9,.]*(?:\\.[0-9]{2,6})?)"

const TRANSACTION_FIELDS = [
  {
    key: "fund_name",
    label: "Fund",
    tableLabels: ["Fund", "Fund Name", "Entity", "Investor", "Purchaser"],
    patterns: [
      /\b(?:fund|fund name|entity|purchaser)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "investment_name",
    label: "Investment",
    tableLabels: ["Investment", "Investment Name", "Portfolio Company", "Issuer", "Security", "Asset"],
    patterns: [
      /\b(?:investment|investment name|portfolio company|issuer|security|asset)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,160})(?:[.;\n]|$)/i,
    ],
    confidence: 0.9,
  },
  {
    key: "transaction_type",
    label: "Transaction Type",
    tableLabels: ["Transaction Type", "Type", "Action", "Trade Type"],
    patterns: [
      /\b(acquisition|purchase|investment|follow-on investment|sale|disposition|disposal|realization|exit|partial sale|secondary sale)\b/i,
    ],
    confidence: 0.86,
  },
  {
    key: "asset_class",
    label: "Asset Class",
    tableLabels: ["Asset Class", "Investment Type", "Security Type", "Category"],
    patterns: [
      /\b(?:asset class|investment type|security type|category)\s*(?:is|:)?\s*([A-Za-z0-9&,' .-]{3,120})(?:[.;\n]|$)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "trade_date",
    label: "Trade Date",
    tableLabels: ["Trade Date", "Transaction Date", "Purchase Date", "Sale Date", "Disposition Date"],
    patterns: [
      new RegExp(`\\b(?:trade date|transaction date|purchase date|sale date|disposition date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "settlement_date",
    label: "Settlement Date",
    tableLabels: ["Settlement Date", "Closing Date", "Funding Date", "Proceeds Date"],
    patterns: [
      new RegExp(`\\b(?:settlement date|closing date|funding date|proceeds date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "currency",
    label: "Currency",
    tableLabels: ["Currency", "Transaction Currency", "Reporting Currency"],
    patterns: [
      /\b(?:currency|transaction currency|reporting currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "quantity",
    label: "Quantity",
    tableLabels: ["Quantity", "Units", "Shares", "Number of Shares", "Number of Units"],
    patterns: [
      new RegExp(`\\b(?:quantity|units|shares|number of shares|number of units)\\s*(?:is|:)?\\s*${NUMBER_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "price_per_unit",
    label: "Price Per Unit / Share",
    tableLabels: ["Price Per Unit", "Price Per Share", "Unit Price", "Share Price", "Transaction Price"],
    patterns: [
      new RegExp(`\\b(?:price per (?:unit|share)|unit price|share price|transaction price)\\s*(?:is|:|of)?\\s*((?:US\\$|USD|EUR|GBP|\\$)?\\s*[0-9][0-9,]*(?:\\.[0-9]{2,6})?)`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "purchase_amount",
    label: "Purchase Amount",
    tableLabels: ["Purchase Amount", "Acquisition Cost", "Investment Amount", "Funding Amount", "Purchase Price"],
    patterns: [
      new RegExp(`\\b(?:purchase amount|acquisition cost|investment amount|funding amount|purchase price)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "sale_proceeds",
    label: "Sale Proceeds",
    tableLabels: ["Sale Proceeds", "Gross Proceeds", "Disposition Proceeds", "Gross Sale Proceeds", "Realization Proceeds"],
    patterns: [
      new RegExp(`\\b(?:sale proceeds|gross proceeds|disposition proceeds|gross sale proceeds|realization proceeds)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "net_proceeds",
    label: "Net Proceeds",
    tableLabels: ["Net Proceeds", "Net Sale Proceeds", "Net Settlement Amount", "Net Amount"],
    patterns: [
      new RegExp(`\\b(?:net proceeds|net sale proceeds|net settlement amount|net amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "cost_basis",
    label: "Cost Basis",
    tableLabels: ["Cost Basis", "Book Cost", "Carrying Cost", "Original Cost", "Tax Cost"],
    patterns: [
      new RegExp(`\\b(?:cost basis|book cost|carrying cost|original cost|tax cost)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "transaction_fees",
    label: "Transaction Fees",
    tableLabels: ["Transaction Fees", "Fees", "Brokerage Fees", "Closing Costs", "Expenses"],
    patterns: [
      new RegExp(`\\b(?:transaction fees|brokerage fees|closing costs|expenses|fees)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "realized_gain_loss",
    label: "Realized Gain / Loss",
    tableLabels: ["Realized Gain/Loss", "Realized Gain", "Realized Loss", "Gain/Loss", "P&L"],
    patterns: [
      new RegExp(`\\b(?:realized|realised) (?:gain/loss|gain|loss|p&l)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "counterparty",
    label: "Counterparty",
    tableLabels: ["Counterparty", "Buyer", "Seller", "Broker", "Purchaser"],
    patterns: [
      /\b(?:counterparty|buyer|seller|broker|purchaser)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,140})(?:[.;\n]|$)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "ownership_percent",
    label: "Ownership Percentage",
    tableLabels: ["Ownership %", "Ownership Percentage", "Stake %", "Equity Stake %"],
    patterns: [
      /\b(?:ownership percentage|ownership %|stake %|equity stake %)\s*(?:is|:|of)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.78,
  },
]

function sourcePoint(source, definition) {
  return matchTablePoint(source, definition) || matchPoint(source.text || "", definition)
}

function documentIdentity(text) {
  const match = String(text || "").match(/\b(portfolio transaction notice|investment transaction notice|investment purchase notice|investment sale notice|trade confirmation|investment disposition notice|portfolio company acquisition notice|portfolio company sale notice|realization notice)\b/i)
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Portfolio Transaction Notice",
    sourceReference: match[0],
    confidence: 0.96,
  })
}

function transactionAmount(values) {
  return parseNumber(values.sale_proceeds) ?? parseNumber(values.purchase_amount)
}

function netProceedsVariance(values) {
  const saleProceeds = parseNumber(values.sale_proceeds)
  const netProceeds = parseNumber(values.net_proceeds)
  if (saleProceeds === null || netProceeds === null) return null
  return saleProceeds - (parseNumber(values.transaction_fees) || 0) - netProceeds
}

function realizedGainVariance(values) {
  const saleProceeds = parseNumber(values.sale_proceeds)
  const costBasis = parseNumber(values.cost_basis)
  const realizedGain = parseNumber(values.realized_gain_loss)
  if (saleProceeds === null || costBasis === null || realizedGain === null) return null
  return saleProceeds - costBasis - realizedGain
}

function unitPriceVariance(values) {
  const quantity = parseNumber(values.quantity)
  const price = parseNumber(values.price_per_unit)
  const amount = transactionAmount(values)
  if (quantity === null || price === null || amount === null) return null
  return quantity * price - amount
}

class PortfolioTransactionReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = TRANSACTION_FIELDS.map((field) => sourcePoint(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const netVariance = netProceedsVariance(values)
    const realizedVariance = realizedGainVariance(values)
    const priceVariance = unitPriceVariance(values)

    keyPoints.push(
      point({
        key: "net_proceeds_reconciliation",
        label: "Net Proceeds Reconciliation",
        value: netVariance === null ? null : Math.abs(netVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(netVariance, 2)}`,
        confidence: 0.9,
      }),
      point({
        key: "realized_gain_loss_reconciliation",
        label: "Realized Gain / Loss Reconciliation",
        value: realizedVariance === null ? null : Math.abs(realizedVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(realizedVariance, 2)}`,
        confidence: 0.88,
      }),
      point({
        key: "unit_price_reconciliation",
        label: "Unit Price Reconciliation",
        value: priceVariance === null ? null : Math.abs(priceVariance) <= 0.01 ? "Reconciled" : `Variance ${formatNumber(priceVariance, 2)}`,
        confidence: 0.86,
      }),
    )

    const finalKeyPoints = keyPoints.filter(Boolean)
    const foundKeys = new Set(finalKeyPoints.map((entry) => entry.point_key))
    const missing = ["investment_name", "trade_date"].filter((key) => !foundKeys.has(key))
    const issues = []
    if (missing.length) {
      issues.push({ code: "portfolio_transaction_fields_not_detected", message: `Review missing portfolio transaction fields: ${missing.join(", ")}.` })
    }
    if (!foundKeys.has("purchase_amount") && !foundKeys.has("sale_proceeds")) {
      issues.push({ code: "portfolio_transaction_amount_not_detected", message: "No purchase amount or sale proceeds were detected." })
    }
    if (netVariance !== null && Math.abs(netVariance) > 0.01) {
      issues.push({ code: "portfolio_transaction_net_proceeds_mismatch", message: `Gross proceeds less fees does not agree to net proceeds by ${formatNumber(netVariance, 2)}.` })
    }
    if (realizedVariance !== null && Math.abs(realizedVariance) > 0.01) {
      issues.push({ code: "portfolio_transaction_realized_gain_mismatch", message: `Sale proceeds less cost basis does not agree to realized gain/loss by ${formatNumber(realizedVariance, 2)}.` })
    }
    if (priceVariance !== null && Math.abs(priceVariance) > 0.01) {
      issues.push({ code: "portfolio_transaction_unit_price_mismatch", message: `Quantity multiplied by price does not agree to transaction amount by ${formatNumber(priceVariance, 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: finalKeyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: finalKeyPoints.length
        ? `Extracted ${finalKeyPoints.length} portfolio transaction fact(s) for review.`
        : "No standard portfolio transaction facts were detected automatically.",
      confidence: finalKeyPoints.length && !issues.length ? 0.93 : finalKeyPoints.length ? 0.68 : 0.16,
      key_points: finalKeyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missing,
        net_proceeds_variance: netVariance,
        realized_gain_loss_variance: realizedVariance,
        unit_price_variance: priceVariance,
      },
      issues_json: issues,
      source_text_excerpt: snippet(text, 1200),
    }
  }
}

module.exports = PortfolioTransactionReader
