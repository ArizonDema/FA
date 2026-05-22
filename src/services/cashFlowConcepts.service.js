const DIRECT_CASH_FLOW_CONCEPTS = [
  {
    key: "customer_receipts",
    label: "Customer Receipts",
    direction: "inflow",
    indirect_key: "operating_cash_flow",
    synonyms: [
      "cash receipts",
      "customer receipts",
      "client collections",
      "accounts receivable collections",
      "merchant receipts",
      "cash sales",
      "revenue collections",
    ],
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
      /\btrade takings?\b/,
      /\btakings?\b/,
      /\bsettlement-lagged trade\b/,
      /\bretainer drawdowns?\b/,
      /\bretainer .*released\b/,
      /\binvoice .*deposits?\b/,
      /\blockbox\b/,
      /\bfulfilled invoice\b/,
      /\btill sweeps?\b/,
      /\bcard-batch releases?\b/,
    ],
  },
  {
    key: "other_operating_inflows",
    label: "Other Operating Inflows",
    direction: "inflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["refunds", "rebates", "operating inflows", "other receipts", "recoveries"],
    patterns: [
      /\brefunds?\b/,
      /\brebates?\b/,
      /\brecover(y|ies|ed)\b/,
      /\binsurance recovery\b/,
      /\bmerchant service rebates?\b/,
      /\bpublic incentive\b/,
      /\bauthority paybacks?\b/,
      /\bvendor credits?\b/,
      /\bother operating inflows?\b/,
      /\boperating inflows?\b/,
    ],
  },
  {
    key: "supplier_payments",
    label: "Supplier Payments",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: [
      "vendor payments",
      "supplier disbursements",
      "trade payables",
      "materials payments",
      "partner payouts",
      "external partner payouts",
      "operating partner payouts",
    ],
    patterns: [
      /\bsuppliers?\b/,
      /\bvendors?\b/,
      /\bvendor disbursements?\b/,
      /\btrade vendor(s)?\b/,
      /\bpartner payouts?\b/,
      /\bpartner settlements?\b/,
      /\bmarketplace partner settlements?\b/,
      /\bpartner operating payouts?\b/,
      /\bexternal partner payouts?\b/,
      /\boperating payouts?\b/,
      /\baccounts payable\b/,
      /\bap\b/,
      /\bcogs\b/,
      /\bcost of sales\b/,
      /\binventory\b/,
      /\bmaterials?\b/,
      /\bstock replenishment\b/,
      /\bfreight\b/,
      /\bduties\b/,
      /\blanding charges?\b/,
      /\bfulfillment lane charges?\b/,
      /\bvendor passage\b/,
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["people costs", "team compensation", "wages", "salaries", "benefits"],
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
      /\bpeople runway spend\b/,
      /\bpeople .*spend\b/,
      /\brostered crew\b/,
      /\bcrew disbursements?\b/,
      /\bteam stipend\b/,
    ],
  },
  {
    key: "rent_facilities",
    label: "Rent and Facilities",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["rent", "facilities", "premises", "office lease", "occupancy", "space commitments"],
    patterns: [
      /\brent\b/,
      /\bpremises?\b/,
      /\bfacilit(y|ies) costs?\b/,
      /\blease\b/,
      /\boccupancy\b/,
      /\bspace commitments?\b/,
      /\bspace commitment cash\b/,
      /\bstudio and space\b/,
      /\bworkplace\b/,
      /\bpremises? and yard occupancy\b/,
      /\bworkspace occupancy\b/,
    ],
  },
  {
    key: "sales_marketing",
    label: "Sales and Marketing",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["marketing", "advertising", "campaign spend", "growth spend", "demand generation", "demand creation"],
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
      /\baudience acquisition\b/,
      /\bacquisition cash\b/,
    ],
  },
  {
    key: "general_admin",
    label: "General and Administrative",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["general admin", "overhead", "professional fees", "insurance", "bank charges", "software subscriptions"],
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
      /\boperating backbone\b/,
      /\bbackbone cash\b/,
      /\butility and connectivity\b/,
      /\bprofessional bench\b/,
      /\blicenses?\b/,
      /\bpermits?\b/,
      /\bstatutory dues?\b/,
      /\bbank fees?\b/,
      /\btiming wash\b/,
    ],
  },
  {
    key: "income_taxes",
    label: "Income Taxes",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["income taxes paid", "tax payments"],
    patterns: [
      /\bincome taxes?\b/,
      /\btaxes paid\b/,
      /\btax payment(s)?\b/,
      /\bgovernment remittance\b/,
      /\btax authority\b/,
      /\bauthority sweeps?\b/,
    ],
  },
  {
    key: "other_operating_outflows",
    label: "Other Operating Outflows",
    direction: "outflow",
    indirect_key: "operating_cash_flow",
    synonyms: ["miscellaneous operating payments", "customer refunds", "claims payments", "operating adjustments"],
    patterns: [
      /\bclaims?\b/,
      /\bmake-good credits?\b/,
      /\bcustomer refunds?\b/,
      /\brefunds? paid\b/,
      /\btiming wash\b/,
      /\brounding\b/,
      /\bother operating outflows?\b/,
    ],
  },
  {
    key: "capital_expenditures",
    label: "Capital Expenditures",
    direction: "outflow",
    indirect_key: "capital_expenditures",
    synonyms: ["capex", "asset purchases", "equipment purchases", "fixed assets", "property plant equipment"],
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
      /\bworkshop kit\b/,
      /\bkit purchases?\b/,
      /\bequipment refresh\b/,
      /\bfit-out checks?\b/,
      /\bfit[- ]out milestone\b/,
      /\bfit[- ]out .*cheques?\b/,
    ],
  },
  {
    key: "capitalized_software",
    label: "Capitalized Software",
    direction: "outflow",
    indirect_key: "capital_expenditures",
    synonyms: ["software capitalization", "capitalized development", "software development capitalization"],
    patterns: [
      /\bcapitali[sz]ed software\b/,
      /\bsoftware development capitalization\b/,
      /\bdevelopment capitalization\b/,
      /\bcode asset capitalization\b/,
      /\bcore system implementation\b/,
    ],
  },
  {
    key: "asset_sale_proceeds",
    label: "Asset Sale Proceeds",
    direction: "inflow",
    indirect_key: "asset_sales",
    synonyms: ["disposal proceeds", "sale of assets", "investment sale proceeds"],
    patterns: [
      /\basset sale\b/,
      /\bdisposal proceeds?\b/,
      /\bsale proceeds?\b/,
      /\binvestment sale\b/,
      /\bequipment resale\b/,
      /\bresale receipts?\b/,
      /\bretired kit\b/,
      /\bretired .*fixtures?\b/,
    ],
  },
  {
    key: "restricted_cash_investment",
    label: "Restricted Cash Investment",
    direction: "outflow",
    indirect_key: "capital_expenditures",
    synonyms: ["restricted deposits", "pledged deposits", "cash reserves placed"],
    patterns: [
      /\binvestment in pledged\b/,
      /\bpledged term deposits?\b/,
      /\brestricted deposits?\b/,
      /\breserve deposits?\b/,
    ],
  },
  {
    key: "restricted_cash_release",
    label: "Restricted Cash Release",
    direction: "inflow",
    indirect_key: "asset_sales",
    synonyms: ["restricted deposit release", "pledged deposit release", "cash reserves released"],
    patterns: [
      /\brelease of pledged\b/,
      /\bpledged .*release\b/,
      /\brestricted deposit .*release\b/,
      /\breserve .*release\b/,
    ],
  },
  {
    key: "debt_drawdown",
    label: "Debt Drawdown",
    direction: "inflow",
    indirect_key: "debt_issued",
    synonyms: ["borrowings", "loan proceeds", "credit facility proceeds", "debt issued"],
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
      /\bborrowing draws?\b/,
      /\bbooked at treasury\b/,
    ],
  },
  {
    key: "debt_repayment",
    label: "Debt Repayment",
    direction: "outflow",
    indirect_key: "debt_repaid",
    synonyms: ["principal repayment", "loan payment", "note repayment", "credit facility repayment"],
    patterns: [
      /\bdebt repayments?\b/,
      /\bprincipal repayments?\b/,
      /\bprincipal paid\b/,
      /\bborrowing principal paid\b/,
      /\bloan payments?\b/,
      /\bnote repayments?\b/,
      /\bcredit facilit(y|ies) repayments?\b/,
      /\bprincipal sendback\b/,
      /\blender principal sendback\b/,
      /\blender principal retirements?\b/,
      /\bprincipal retirements?\b/,
      /\bprincipal retired\b/,
      /\bbank facility principal retired\b/,
      /\bfacility amortization\b/,
      /\bamortization wires?\b/,
    ],
  },
  {
    key: "interest_paid",
    label: "Interest Paid",
    direction: "outflow",
    indirect_key: "interest_paid",
    synonyms: ["interest expense", "finance charges paid", "finance costs"],
    patterns: [
      /\binterest paid\b/,
      /\binterest expense\b/,
      /\bfinance costs?\b/,
      /\bfinance charges? paid\b/,
      /\bfinance charges?\b/,
      /\bborrowing cost cash\b/,
      /\bborrowing cost\b/,
    ],
  },
  {
    key: "equity_injection",
    label: "Equity Injection",
    direction: "inflow",
    indirect_key: "capital_contributions",
    synonyms: ["capital contributions", "paid-in capital", "founder funding", "member funding", "capital calls", "subscriptions"],
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
      /\bsponsor oxygen\b/,
      /\bmember capital subscriptions?\b/,
    ],
  },
  {
    key: "dividends_distributions",
    label: "Dividends and Distributions",
    direction: "outflow",
    indirect_key: "dividends_paid",
    synonyms: ["dividends paid", "distributions", "redemptions", "owner drawings", "partner drawings"],
    patterns: [
      /\bdividends? paid\b/,
      /\bdistributions?\b/,
      /\bredemptions?\b/,
      /\bowner drawings?\b/,
      /\bpartner drawings?\b/,
      /\bowner cash sweeps?\b/,
      /\bcash sweeps?\b/,
      /\bpreference redemptions?\b/,
      /\bpartner preference redemptions?\b/,
      /\bpreference yield settlements?\b/,
      /\bmember tax draw\b/,
      /\btax draw packets?\b/,
    ],
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
  /\bspend\b/,
  /\bsettlements?\b/,
  /\bcommitments?\b/,
  /\bremittance\b/,
  /\bcapitalization\b/,
  /\bsendback\b/,
  /\bsweeps?\b/,
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

const INDIRECT_CASH_FLOW_CONCEPTS = [
  { key: "net_income", label: "Net Income", role: "input", cash_direction: "neutral", required: true },
  { key: "depreciation_amortization", label: "Depreciation & Amortization", role: "input", cash_direction: "neutral", required: true },
  { key: "change_in_receivables", label: "Change in Receivables", role: "input", cash_direction: "neutral", required: true },
  { key: "change_in_inventory", label: "Change in Inventory", role: "input", cash_direction: "neutral", required: false },
  { key: "change_in_payables", label: "Change in Payables", role: "input", cash_direction: "neutral", required: true },
  { key: "other_working_capital_changes", label: "Other Working Capital Changes", role: "input", cash_direction: "neutral", required: true },
  { key: "operating_cash_flow", label: "Cash Flow from Operations", role: "summary", cash_direction: "mixed", required: true },
  { key: "capital_expenditures", label: "Capital Expenditures", role: "input", cash_direction: "outflow", required: true },
  { key: "asset_sales", label: "Asset Sales", role: "input", cash_direction: "inflow", required: false },
  { key: "investing_cash_flow", label: "Cash Flow from Investing", role: "summary", cash_direction: "mixed", required: true },
  { key: "capital_contributions", label: "Capital Contributions", role: "input", cash_direction: "inflow", required: true },
  { key: "debt_issued", label: "Debt Issued", role: "input", cash_direction: "inflow", required: false },
  { key: "debt_repaid", label: "Debt Repaid", role: "input", cash_direction: "outflow", required: false },
  { key: "interest_paid", label: "Interest Paid", role: "input", cash_direction: "outflow", required: false },
  { key: "dividends_paid", label: "Dividends Paid", role: "input", cash_direction: "outflow", required: false },
  { key: "financing_cash_flow", label: "Cash Flow from Financing", role: "summary", cash_direction: "mixed", required: true },
  { key: "net_change_in_cash", label: "Net Change in Cash", role: "summary", cash_direction: "mixed", required: true },
  { key: "opening_cash", label: "Cash at Beginning", role: "input", cash_direction: "neutral", required: true },
  { key: "closing_cash", label: "Cash at End", role: "summary", cash_direction: "neutral", required: true },
]

const DIRECT_CONCEPT_LOOKUP = new Map(DIRECT_CASH_FLOW_CONCEPTS.map((concept) => [concept.key, concept]))
const INDIRECT_CONCEPT_LOOKUP = new Map(INDIRECT_CASH_FLOW_CONCEPTS.map((concept) => [concept.key, concept]))
const INDIRECT_TO_DIRECT_ALIASES = new Map([
  ["capital_expenditures", "capital_expenditures"],
  ["asset_sales", "asset_sale_proceeds"],
  ["capital_contributions", "equity_injection"],
  ["debt_issued", "debt_drawdown"],
  ["debt_repaid", "debt_repayment"],
  ["interest_paid", "interest_paid"],
  ["dividends_paid", "dividends_distributions"],
])

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

function normalizeConceptKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function scorePatternMatches(text, patterns = []) {
  const normalized = normalizeText(text)
  if (!normalized) return 0
  return patterns.reduce((score, pattern) => score + (pattern.test(normalized) ? 1 : 0), 0)
}

function normalizeDirectConceptKey(value) {
  const key = normalizeConceptKey(value)
  if (DIRECT_CONCEPT_LOOKUP.has(key)) return key
  return INDIRECT_TO_DIRECT_ALIASES.get(key) || key
}

function getDirectConcept(key) {
  return DIRECT_CONCEPT_LOOKUP.get(normalizeDirectConceptKey(key)) || null
}

function getIndirectConcept(key) {
  return INDIRECT_CONCEPT_LOOKUP.get(normalizeConceptKey(key)) || null
}

function keysEquivalent(left, right) {
  const leftKey = normalizeConceptKey(left)
  const rightKey = normalizeConceptKey(right)
  if (!leftKey || !rightKey) return false
  if (leftKey === rightKey) return true
  return normalizeDirectConceptKey(leftKey) === normalizeDirectConceptKey(rightKey)
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
      label: concept.label,
      direction: concept.direction,
      indirect_key: concept.indirect_key,
      score: Math.min(1, 0.72 + matchCount * 0.07),
      matchCount,
    }
  }).filter(Boolean)
}

function bestDirectCashFlowConcept(text, direction = null) {
  return matchDirectCashFlowConcepts(text, direction).sort((left, right) => right.score - left.score)[0] || null
}

function getAllowedDirectConcepts(direction = null) {
  return DIRECT_CASH_FLOW_CONCEPTS.filter((concept) => !direction || concept.direction === direction).map((concept) => ({
    key: concept.key,
    label: concept.label,
    direction: concept.direction,
    indirect_key: concept.indirect_key,
    synonyms: concept.synonyms || [],
  }))
}

function getAllowedIndirectConcepts() {
  return INDIRECT_CASH_FLOW_CONCEPTS.map((concept) => ({ ...concept }))
}

module.exports = {
  DIRECT_CASH_FLOW_CONCEPTS,
  DIRECT_OUTFLOW_TEXT_HINTS,
  DIRECT_INFLOW_TEXT_HINTS,
  INDIRECT_CASH_FLOW_CONCEPTS,
  normalizeText,
  normalizeConceptKey,
  normalizeDirectConceptKey,
  scorePatternMatches,
  matchDirectCashFlowConcepts,
  bestDirectCashFlowConcept,
  getDirectConcept,
  getIndirectConcept,
  keysEquivalent,
  getAllowedDirectConcepts,
  getAllowedIndirectConcepts,
}
