const { formatNumber, matchPointFromSource, parseNumber, point, redactWireInstructions, singleLine, snippet } = require("./reader.utils")

const READER_KEY = "credit_facility"
const READER_VERSION = "credit-facility.v2"

const DATE_PATTERN = "([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})"
const MONEY_PATTERN = "((?:US\\$|USD|EUR|GBP|\\$)?\\s*\\(?-?[0-9][0-9,.]*(?:\\.[0-9]{2})?\\)?(?:\\s*(?:million|billion|m|bn))?)"

const CREDIT_FIELDS = [
  {
    key: "borrower_name",
    label: "Borrower / Fund",
    tableLabels: ["Borrower", "Fund", "Fund Name", "Obligor", "Issuer"],
    patterns: [
      /\b(?:borrower|fund|fund name|obligor|issuer)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,160})(?:[.;\n]|$)/i,
    ],
    confidence: 0.84,
  },
  {
    key: "lender_name",
    label: "Lender / Agent",
    tableLabels: ["Lender", "Administrative Agent", "Agent", "Bank", "Facility Agent"],
    patterns: [
      /\b(?:lender|administrative agent|facility agent|agent|bank)\s*(?:is|:)?\s*([A-Z][A-Za-z0-9&,' .-]{2,160})(?:[.;\n]|$)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "facility_type",
    label: "Facility Type",
    tableLabels: ["Facility Type", "Facility", "Debt Type", "Loan Type"],
    patterns: [
      /\b(subscription line|capital call facility|revolving credit facility|nav facility|asset-backed facility|term loan|bridge facility)\b/i,
    ],
    confidence: 0.86,
  },
  {
    key: "agreement_date",
    label: "Agreement Date",
    tableLabels: ["Agreement Date", "Effective Date", "Facility Date", "Closing Date"],
    patterns: [
      new RegExp(`\\b(?:agreement date|effective date|facility date|closing date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "amendment_date",
    label: "Amendment Date",
    tableLabels: ["Amendment Date", "Amended Date", "Latest Amendment Date"],
    patterns: [
      new RegExp(`\\b(?:amendment date|amended date|latest amendment date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.78,
  },
  {
    key: "facility_currency",
    label: "Facility Currency",
    tableLabels: ["Facility Currency", "Currency", "Loan Currency", "Base Currency"],
    patterns: [/\b(?:facility currency|loan currency|base currency|currency)\s*(?:is|:)?\s*([A-Z]{3}|U\.?S\.?\s+dollars?|euros?|sterling)/i],
    confidence: 0.8,
  },
  {
    key: "facility_amount",
    label: "Facility Amount",
    tableLabels: ["Facility Amount", "Commitment Amount", "Total Commitment", "Credit Limit", "Facility Limit"],
    patterns: [
      new RegExp(`\\b(?:facility amount|commitment amount|total commitment|credit limit|facility limit)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.92,
  },
  {
    key: "commitment_fee",
    label: "Commitment Fee",
    tableLabels: ["Commitment Fee", "Unused Fee", "Unused Commitment Fee", "Undrawn Fee"],
    patterns: [
      /\b(?:commitment fee|unused fee|unused commitment fee|undrawn fee)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "outstanding_principal",
    label: "Outstanding Principal",
    tableLabels: ["Outstanding Principal", "Principal Outstanding", "Loan Balance", "Debt Outstanding", "Drawn Amount"],
    patterns: [
      new RegExp(`\\b(?:outstanding principal|principal outstanding|loan balance|debt outstanding|drawn amount)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.94,
  },
  {
    key: "undrawn_commitment",
    label: "Undrawn Commitment",
    tableLabels: ["Undrawn Commitment", "Available Amount", "Availability", "Unused Commitment", "Remaining Availability"],
    patterns: [
      new RegExp(`\\b(?:undrawn commitment|available amount|availability|unused commitment|remaining availability)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.88,
  },
  {
    key: "eligible_commitments",
    label: "Eligible Commitments",
    tableLabels: ["Eligible Commitments", "Eligible Investor Commitments", "Included Commitments"],
    patterns: [
      new RegExp(`\\b(?:eligible commitments|eligible investor commitments|included commitments)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "borrowing_base",
    label: "Borrowing Base",
    tableLabels: ["Borrowing Base", "Eligible Borrowing Base", "NAV Borrowing Base", "Collateral Value"],
    patterns: [
      new RegExp(`\\b(?:borrowing base|eligible borrowing base|nav borrowing base|collateral value)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "advance_rate",
    label: "Advance Rate",
    tableLabels: ["Advance Rate", "Borrowing Base Advance Rate", "Eligible Advance Rate"],
    patterns: [/\b(?:advance rate|borrowing base advance rate|eligible advance rate)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i],
    confidence: 0.8,
  },
  {
    key: "interest_rate",
    label: "Interest Rate",
    tableLabels: ["Interest Rate", "Rate", "Margin", "Applicable Margin"],
    patterns: [
      /\b(?:interest rate|rate|applicable margin|margin)\s*(?:is|:)?\s*([A-Za-z0-9 +.-]*(?:SOFR|LIBOR|EURIBOR|base rate|prime)[^.\n;]{0,80}|[0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "interest_margin",
    label: "Interest Margin",
    tableLabels: ["Interest Margin", "Applicable Margin", "Spread", "Credit Spread"],
    patterns: [
      /\b(?:interest margin|applicable margin|credit spread|spread)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%(?:[^.\n;]*)?)/i,
    ],
    confidence: 0.8,
  },
  {
    key: "benchmark_rate",
    label: "Benchmark Rate",
    tableLabels: ["Benchmark Rate", "Reference Rate", "Base Rate", "SOFR", "LIBOR", "EURIBOR"],
    patterns: [
      /\b(?:benchmark rate|reference rate|base rate)\s*(?:is|:)?\s*([A-Za-z0-9 +.-]*(?:SOFR|LIBOR|EURIBOR|prime|base rate)[^.\n;]{0,80}|[0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "interest_payment_frequency",
    label: "Interest Payment Frequency",
    tableLabels: ["Interest Payment Frequency", "Interest Payment Date", "Interest Period", "Payment Frequency"],
    patterns: [
      /\b(?:interest payment frequency|interest payment date|interest period|payment frequency)\s*(?:is|:)?\s*([^.\n;]{4,120})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "maturity_date",
    label: "Maturity Date",
    tableLabels: ["Maturity Date", "Termination Date", "Facility Maturity", "Final Repayment Date"],
    patterns: [
      new RegExp(`\\b(?:maturity date|termination date|facility maturity|final repayment date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.9,
  },
  {
    key: "commitment_termination_date",
    label: "Commitment Termination Date",
    tableLabels: ["Commitment Termination Date", "Availability Termination Date", "Commitment Expiry Date"],
    patterns: [
      new RegExp(`\\b(?:commitment termination date|availability termination date|commitment expiry date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.82,
  },
  {
    key: "reporting_frequency",
    label: "Reporting Frequency",
    tableLabels: ["Reporting Frequency", "Certificate Frequency", "Compliance Reporting Frequency"],
    patterns: [
      /\b(?:reporting frequency|certificate frequency|compliance reporting frequency)\s*(?:is|:)?\s*(monthly|quarterly|semi-annual|semiannual|annual|annually|upon each borrowing)/i,
    ],
    confidence: 0.78,
  },
  {
    key: "reporting_deadline",
    label: "Reporting Deadline",
    tableLabels: ["Reporting Deadline", "Certificate Due Date", "Compliance Certificate Deadline"],
    patterns: [
      /\b(?:reporting deadline|certificate due date|compliance certificate deadline)\s*(?:is|:)?\s*([^.\n;]{4,140})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "reporting_date",
    label: "Reporting Date",
    tableLabels: ["Reporting Date", "Certificate Date", "Test Date", "Compliance Date", "As Of Date"],
    patterns: [
      new RegExp(`\\b(?:reporting date|certificate date|test date|compliance date|as of date)\\s*(?:is|:)?\\s*${DATE_PATTERN}`, "i"),
    ],
    confidence: 0.86,
  },
  {
    key: "current_nav",
    label: "Current NAV",
    tableLabels: ["Current NAV", "Fund NAV", "Net Asset Value", "NAV"],
    patterns: [
      new RegExp(`\\b(?:current nav|fund nav|net asset value|nav)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "minimum_nav",
    label: "Minimum NAV Covenant",
    tableLabels: ["Minimum NAV", "Minimum Net Asset Value", "NAV Covenant", "Minimum Fund NAV"],
    patterns: [
      new RegExp(`\\b(?:minimum nav|minimum net asset value|nav covenant|minimum fund nav)\\s*(?:is|:|of|at least)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.84,
  },
  {
    key: "current_ltv",
    label: "Current LTV",
    tableLabels: ["Current LTV", "Loan-to-Value", "LTV", "Debt to NAV"],
    patterns: [
      /\b(?:current ltv|loan-to-value|ltv|debt to nav)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.88,
  },
  {
    key: "maximum_ltv",
    label: "Maximum LTV",
    tableLabels: ["Maximum LTV", "LTV Limit", "Maximum Loan-to-Value", "Covenant Limit"],
    patterns: [
      /\b(?:maximum ltv|ltv limit|maximum loan-to-value|covenant limit)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    ],
    confidence: 0.86,
  },
  {
    key: "asset_coverage_ratio",
    label: "Asset Coverage Ratio",
    tableLabels: ["Asset Coverage Ratio", "Current Asset Coverage", "Coverage Ratio"],
    patterns: [
      /\b(?:asset coverage ratio|current asset coverage|coverage ratio)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*x?)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "minimum_asset_coverage",
    label: "Minimum Asset Coverage",
    tableLabels: ["Minimum Asset Coverage", "Asset Coverage Covenant", "Minimum Coverage Ratio"],
    patterns: [
      /\b(?:minimum asset coverage|asset coverage covenant|minimum coverage ratio)\s*(?:is|:)?\s*([0-9]+(?:\.[0-9]+)?\s*x?)/i,
    ],
    confidence: 0.82,
  },
  {
    key: "current_liquidity",
    label: "Current Liquidity",
    tableLabels: ["Current Liquidity", "Liquidity", "Cash and Availability", "Liquidity Amount"],
    patterns: [
      new RegExp(`\\b(?:current liquidity|cash and availability|liquidity amount|liquidity)\\s*(?:is|:|of)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.8,
  },
  {
    key: "liquidity_requirement",
    label: "Liquidity Requirement",
    tableLabels: ["Liquidity Requirement", "Minimum Liquidity", "Liquidity Covenant"],
    patterns: [
      new RegExp(`\\b(?:liquidity requirement|minimum liquidity|liquidity covenant)\\s*(?:is|:|of|at least)?\\s*${MONEY_PATTERN}`, "i"),
    ],
    confidence: 0.8,
  },
  {
    key: "covenant_status",
    label: "Covenant Status",
    tableLabels: ["Covenant Status", "Compliance Status", "In Compliance", "Default Status"],
    patterns: [
      /\b(?:covenant status|compliance status|default status)\s*(?:is|:)?\s*(in compliance|compliant|not in compliance|breach|event of default|default)/i,
      /\b(in compliance|not in compliance|event of default|default)\s+with\s+(?:the\s+)?(?:financial\s+)?covenants?\b/i,
    ],
    confidence: 0.9,
  },
  {
    key: "default_notice",
    label: "Default / Event Notice",
    tableLabels: ["Default Notice", "Event of Default", "Potential Default", "Default Event"],
    patterns: [
      /\b(?:default notice|event of default|potential default|default event)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "waiver_status",
    label: "Waiver Status",
    tableLabels: ["Waiver Status", "Covenant Waiver", "Forbearance Status"],
    patterns: [
      /\b(?:waiver status|covenant waiver|forbearance status)\s*(?:is|:)?\s*(not required|none|waived|waiver granted|pending|requested|not waived)/i,
    ],
    confidence: 0.76,
  },
  {
    key: "collateral",
    label: "Collateral",
    tableLabels: ["Collateral", "Security", "Collateral Description"],
    patterns: [
      /\b(?:collateral|security|collateral description)\s*(?:is|:)?\s*([^.\n;]{5,180})/i,
    ],
    confidence: 0.78,
  },
  {
    key: "guarantor",
    label: "Guarantor",
    tableLabels: ["Guarantor", "Guarantors", "Credit Support Provider"],
    patterns: [
      /\b(?:guarantor|guarantors|credit support provider)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "pledged_account",
    label: "Pledged Account",
    tableLabels: ["Pledged Account", "Collateral Account", "Collection Account", "Blocked Account"],
    patterns: [
      /\b(?:pledged account|collateral account|collection account|blocked account)\s*(?:is|:)?\s*([^.\n;]{4,160})/i,
    ],
    confidence: 0.76,
  },
  {
    key: "purpose",
    label: "Purpose / Use",
    tableLabels: ["Purpose", "Use of Proceeds", "Use"],
    patterns: [
      /\b(?:purpose|use of proceeds|use)\s*(?:is|:)?\s*([^.\n;]{5,160})/i,
    ],
    confidence: 0.78,
  },
]

function documentIdentity(text) {
  const match = String(text || "").match(
    /\b(credit facility agreement|loan agreement|borrowing notice|covenant certificate|compliance certificate|subscription line|nav facility|capital call facility)\b/i,
  )
  if (!match) return null
  return point({
    key: "document_identity",
    label: "Document Type",
    value: "Credit Facility / Debt Document",
    sourceReference: match[0],
    confidence: 0.95,
  })
}

function parseAmount(value) {
  const text = singleLine(value)
  if (!text) return null
  const normalized = text.replace(/\b(?:million|billion|m|bn)\b/gi, "")
  const number = parseNumber(normalized)
  if (number === null) return null
  if (/\b(?:billion|bn)\b/i.test(text)) return number * 1000000000
  if (/\b(?:million|m)\b/i.test(text)) return number * 1000000
  return number
}

function parsePercent(value) {
  const number = parseNumber(value)
  return number === null ? null : number
}

function parseRatio(value) {
  const text = singleLine(value)
  if (!text) return null
  const match = text.match(/-?[0-9][0-9,.]*(?:\.[0-9]+)?/)
  if (!match) return null
  return Number(match[0].replace(/,/g, ""))
}

function availabilityVariance(values) {
  const facilityAmount = parseAmount(values.facility_amount)
  const outstanding = parseAmount(values.outstanding_principal)
  const undrawn = parseAmount(values.undrawn_commitment)
  if (facilityAmount === null || outstanding === null || undrawn === null) return null
  return facilityAmount - outstanding - undrawn
}

function ltvCalculationVariance(values) {
  const outstanding = parseAmount(values.outstanding_principal)
  const denominator = parseAmount(values.borrowing_base) || parseAmount(values.current_nav)
  const currentLtv = parsePercent(values.current_ltv)
  if (outstanding === null || denominator === null || currentLtv === null || Math.abs(denominator) <= 0.000001) return null
  return (outstanding / denominator) * 100 - currentLtv
}

function percentHeadroom(values, currentKey, limitKey) {
  const current = parsePercent(values[currentKey])
  const limit = parsePercent(values[limitKey])
  if (current === null || limit === null) return null
  return limit - current
}

function amountHeadroom(values, currentKey, requirementKey) {
  const current = parseAmount(values[currentKey])
  const requirement = parseAmount(values[requirementKey])
  if (current === null || requirement === null) return null
  return current - requirement
}

function ratioHeadroom(values, currentKey, requirementKey) {
  const current = parseRatio(values[currentKey])
  const requirement = parseRatio(values[requirementKey])
  if (current === null || requirement === null) return null
  return current - requirement
}

function reconciliationPoint({ key, label, variance, tolerance = 0.01, fractionDigits = 2, confidence = 0.88 }) {
  if (variance === null) return null
  return point({
    key,
    label,
    value: Math.abs(variance) <= tolerance ? "Reconciled" : `Variance ${formatNumber(variance, fractionDigits)}`,
    valueJson: { variance },
    confidence,
  })
}

function headroomPoint({ key, label, headroom, suffix = "", fractionDigits = 2, confidence = 0.86 }) {
  if (headroom === null) return null
  return point({
    key,
    label,
    value: `${headroom >= 0 ? "Headroom" : "Shortfall"} ${formatNumber(Math.abs(headroom), fractionDigits)}${suffix}`,
    valueJson: { headroom },
    confidence,
  })
}

class CreditFacilityReader {
  static key = READER_KEY
  static version = READER_VERSION

  static analyze({ source }) {
    const text = source.text || ""
    const keyPoints = CREDIT_FIELDS.map((field) => matchPointFromSource(source, field)).filter(Boolean)
    const identity = documentIdentity(text)
    if (identity) keyPoints.unshift(identity)
    const values = Object.fromEntries(keyPoints.map((entry) => [entry.point_key, entry.value_text]))
    const facilityAvailabilityVariance = availabilityVariance(values)
    const ltvVariance = ltvCalculationVariance(values)
    const ltvHeadroom = percentHeadroom(values, "current_ltv", "maximum_ltv")
    const navHeadroom = amountHeadroom(values, "current_nav", "minimum_nav")
    const assetCoverageHeadroom = ratioHeadroom(values, "asset_coverage_ratio", "minimum_asset_coverage")
    const liquidityHeadroom = amountHeadroom(values, "current_liquidity", "liquidity_requirement")
    ;[
      reconciliationPoint({
        key: "facility_availability_reconciliation",
        label: "Facility Availability Reconciliation",
        variance: facilityAvailabilityVariance,
        confidence: 0.9,
      }),
      reconciliationPoint({
        key: "ltv_calculation_reconciliation",
        label: "LTV Calculation Reconciliation",
        variance: ltvVariance,
        tolerance: 0.02,
        fractionDigits: 4,
        confidence: 0.88,
      }),
      headroomPoint({ key: "ltv_covenant_headroom", label: "LTV Covenant Headroom", headroom: ltvHeadroom, suffix: "%", confidence: 0.88 }),
      headroomPoint({ key: "minimum_nav_headroom", label: "Minimum NAV Headroom", headroom: navHeadroom, confidence: 0.86 }),
      headroomPoint({
        key: "asset_coverage_headroom",
        label: "Asset Coverage Headroom",
        headroom: assetCoverageHeadroom,
        suffix: "x",
        confidence: 0.84,
      }),
      headroomPoint({ key: "liquidity_headroom", label: "Liquidity Headroom", headroom: liquidityHeadroom, confidence: 0.84 }),
    ]
      .filter(Boolean)
      .forEach((entry) => keyPoints.push(entry))
    const foundKeys = new Set(keyPoints.map((entry) => entry.point_key))
    const financingAmountDetected = ["facility_amount", "outstanding_principal", "borrowing_base"].some((key) => foundKeys.has(key))
    const dateOrRateDetected = ["maturity_date", "reporting_date", "interest_rate"].some((key) => foundKeys.has(key))
    const missingCore = [
      foundKeys.has("lender_name") || foundKeys.has("borrower_name") ? null : "borrower_or_lender",
      financingAmountDetected ? null : "facility_or_debt_amount",
      dateOrRateDetected ? null : "maturity_reporting_date_or_rate",
    ].filter(Boolean)
    const issues = []

    if (missingCore.length) {
      issues.push({ code: "credit_facility_fields_not_detected", message: `Review missing credit facility fields: ${missingCore.join(", ")}.` })
    }
    if (facilityAvailabilityVariance !== null && Math.abs(facilityAvailabilityVariance) > 0.01) {
      issues.push({
        code: "credit_facility_availability_mismatch",
        message: `Facility amount less outstanding principal does not agree to undrawn commitment by ${formatNumber(facilityAvailabilityVariance, 2)}.`,
      })
    }
    if (ltvVariance !== null && Math.abs(ltvVariance) > 0.02) {
      issues.push({
        code: "credit_facility_ltv_calculation_mismatch",
        message: `Outstanding principal divided by covenant base differs from reported LTV by ${formatNumber(ltvVariance, 4)} percentage points.`,
      })
    }
    if (ltvHeadroom !== null && ltvHeadroom < -0.000001) {
      issues.push({ code: "credit_facility_ltv_covenant_breach", message: `Current LTV exceeds maximum LTV by ${formatNumber(Math.abs(ltvHeadroom), 2)}%.` })
    }
    if (navHeadroom !== null && navHeadroom < -0.01) {
      issues.push({ code: "credit_facility_minimum_nav_breach", message: `Current NAV is below the minimum NAV covenant by ${formatNumber(Math.abs(navHeadroom), 2)}.` })
    }
    if (assetCoverageHeadroom !== null && assetCoverageHeadroom < -0.000001) {
      issues.push({
        code: "credit_facility_asset_coverage_breach",
        message: `Asset coverage is below the minimum ratio by ${formatNumber(Math.abs(assetCoverageHeadroom), 2)}x.`,
      })
    }
    if (liquidityHeadroom !== null && liquidityHeadroom < -0.01) {
      issues.push({ code: "credit_facility_liquidity_breach", message: `Liquidity is below the requirement by ${formatNumber(Math.abs(liquidityHeadroom), 2)}.` })
    }

    return {
      reader_key: READER_KEY,
      reader_version: READER_VERSION,
      status: keyPoints.length && !issues.length ? "completed" : "partial",
      summary_text: keyPoints.length
        ? `Extracted ${keyPoints.length} credit facility fact(s) for review.`
        : "No standard credit facility facts were detected automatically.",
      confidence: keyPoints.length && !issues.length ? 0.93 : keyPoints.length ? 0.72 : 0.16,
      key_points: keyPoints,
      structured_data_json: {
        extracted_fields: Array.from(foundKeys),
        missing_core_fields: missingCore,
        financing_amount_detected: financingAmountDetected,
        date_or_rate_detected: dateOrRateDetected,
        facility_availability_variance: facilityAvailabilityVariance,
        ltv_calculation_variance: ltvVariance,
        ltv_covenant_headroom: ltvHeadroom,
        minimum_nav_headroom: navHeadroom,
        asset_coverage_headroom: assetCoverageHeadroom,
        liquidity_headroom: liquidityHeadroom,
      },
      issues_json: issues,
      source_text_excerpt: snippet(redactWireInstructions(text), 1200),
    }
  }
}

module.exports = CreditFacilityReader
