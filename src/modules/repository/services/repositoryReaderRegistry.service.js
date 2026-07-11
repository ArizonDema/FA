const AuditReportReader = require("../readers/auditReport.reader")
const AuditAdjustmentScheduleReader = require("../readers/auditAdjustmentSchedule.reader")
const AccrualScheduleReader = require("../readers/accrualSchedule.reader")
const BankReconciliationReader = require("../readers/bankReconciliation.reader")
const BankStatementReader = require("../readers/bankStatement.reader")
const CapitalAccountStatementReader = require("../readers/capitalAccountStatement.reader")
const CapitalCallNoticeReader = require("../readers/capitalCallNotice.reader")
const CommitmentScheduleReader = require("../readers/commitmentSchedule.reader")
const CreditFacilityReader = require("../readers/creditFacility.reader")
const CustodianStatementReader = require("../readers/custodianStatement.reader")
const DistributionNoticeReader = require("../readers/distributionNotice.reader")
const ExpenseInvoiceReader = require("../readers/expenseInvoice.reader")
const FinancialStatementReader = require("../readers/financialStatement.reader")
const GenericRepositoryReader = require("../readers/generic.reader")
const GovernanceMinutesReader = require("../readers/governanceMinutes.reader")
const HoldingsRegisterReader = require("../readers/holdingsRegister.reader")
const InvestorActivityStatementReader = require("../readers/investorActivityStatement.reader")
const LpaReader = require("../readers/lpa.reader")
const LpaAmendmentReader = require("../readers/lpaAmendment.reader")
const ManagementFeeStatementReader = require("../readers/managementFeeStatement.reader")
const NavPackageReader = require("../readers/navPackage.reader")
const PpmReader = require("../readers/ppm.reader")
const PortfolioTransactionReader = require("../readers/portfolioTransaction.reader")
const RedemptionNoticeReader = require("../readers/redemptionNotice.reader")
const ServiceAgreementReader = require("../readers/serviceAgreement.reader")
const ShareholderRegisterReader = require("../readers/shareholderRegister.reader")
const SideLetterReader = require("../readers/sideLetter.reader")
const SubscriptionAgreementReader = require("../readers/subscriptionAgreement.reader")
const TaxDocumentReader = require("../readers/taxDocument.reader")
const TransferNoticeReader = require("../readers/transferNotice.reader")
const ValuationReader = require("../readers/valuation.reader")
const WaterfallStatementReader = require("../readers/waterfallStatement.reader")
const AppError = require("../../../utils/AppError")

const READERS = {
  audit_report: AuditReportReader,
  audit_adjustment_schedule: AuditAdjustmentScheduleReader,
  accrual_schedule: AccrualScheduleReader,
  bank_reconciliation: BankReconciliationReader,
  bank_statement: BankStatementReader,
  capital_account_statement: CapitalAccountStatementReader,
  capital_call_notice: CapitalCallNoticeReader,
  commitment_schedule: CommitmentScheduleReader,
  credit_facility: CreditFacilityReader,
  custodian_statement: CustodianStatementReader,
  distribution_notice: DistributionNoticeReader,
  expense_invoice: ExpenseInvoiceReader,
  generic: GenericRepositoryReader,
  lpa: LpaReader,
  lpa_amendment: LpaAmendmentReader,
  investor_activity_statement: InvestorActivityStatementReader,
  nav_package: NavPackageReader,
  ppm: PpmReader,
  portfolio_transaction: PortfolioTransactionReader,
  redemption_notice: RedemptionNoticeReader,
  financial_statement: FinancialStatementReader,
  holdings_register: HoldingsRegisterReader,
  governance_minutes: GovernanceMinutesReader,
  service_agreement: ServiceAgreementReader,
  management_fee_statement: ManagementFeeStatementReader,
  shareholder_register: ShareholderRegisterReader,
  side_letter: SideLetterReader,
  subscription_agreement: SubscriptionAgreementReader,
  tax_document: TaxDocumentReader,
  transfer_notice: TransferNoticeReader,
  valuation: ValuationReader,
  waterfall_statement: WaterfallStatementReader,
}

const READER_CATALOG = {
  accrual_schedule: {
    label: "Accrual Schedule",
    description: "Accrued expenses, payables, providers, categories, aging, invoice links, reversals, approvals, GL coding, and reconciliation.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  audit_report: {
    label: "Audit Report",
    description: "Opinion, audit period, auditor, standards, accounting framework, scope, emphasis matters, control warnings, and review flags.",
    kinds: ["document"],
    categories: ["audit_report", "other_document"],
  },
  audit_adjustment_schedule: {
    label: "Audit Adjustment Schedule",
    description: "Proposed, posted, passed, and reclassification audit adjustments with debit/credit balancing.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  bank_statement: {
    label: "Bank Statement",
    description: "Statement period, account context, balances, transaction totals, categories, largest flows, and reconciliation checks.",
    kinds: ["dataset"],
    categories: ["bank_statement", "other_dataset"],
  },
  bank_reconciliation: {
    label: "Bank Reconciliation",
    description: "Book/bank balances, reconciling item statuses, stale/open items, review controls, adjusted balances, and variance checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  capital_account_statement: {
    label: "Capital Account Statement",
    description: "Investor capital balances, classes, ownership, transfers, allocations, commitments, concentration, and reconciliation checks.",
    kinds: ["dataset"],
    categories: ["other_dataset"],
  },
  capital_call_notice: {
    label: "Capital Call Notice",
    description: "Funding due date, investor, class, call amount, drawdown percentage, commitment rollforward, proceeds components, status, and wire redaction.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  commitment_schedule: {
    label: "Commitment Schedule",
    description: "Investor commitments, status, class, tax residency, changes, called/unfunded capital, recallable amounts, side letters, and concentration checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  credit_facility: {
    label: "Credit Facility / Debt",
    description: "Facility terms, rates, borrowing base, availability, collateral, reporting, covenants, and compliance headroom checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  custodian_statement: {
    label: "Custodian Statement",
    description: "Custody account values, cash, securities market value, positions, and reconciliation checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  distribution_notice: {
    label: "Distribution Notice",
    description: "Payment date, investor, class, gross/net distribution, tax character, recallable amount, withholding, per-unit math, status, and wire redaction.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  expense_invoice: {
    label: "Expense Invoice",
    description: "Provider, invoice period, approvals, payment/accrual status, GL coding, categories, line totals, tax, credits, and amount-due checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  financial_statement: {
    label: "Financial Statement",
    description: "Statement period, balance sheet totals, operations, capital rollforward, accounting basis, and reconciliation checks.",
    kinds: ["document"],
    categories: ["financial_statement", "other_document"],
  },
  generic: {
    label: "Generic Reader",
    description: "Stores a readable excerpt when no specialist reader applies.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  governance_minutes: {
    label: "Governance Minutes / Consent",
    description: "Board, committee, LPAC, and written consent approvals across NAV, statements, tax, capital activity, providers, amendments, side letters, expenses, conflicts, budgets, and borrowing.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  holdings_register: {
    label: "Holdings Register",
    description: "Investee holdings, sectors, geography, valuation methods, fair value levels, commitments, concentration, and unrealized gain/loss checks.",
    kinds: ["dataset"],
    categories: ["holdings_register", "other_dataset"],
  },
  investor_activity_statement: {
    label: "Investor Activity Statement",
    description: "Subscriptions, redemptions, transfers, investor context, settlement status, fees, holdbacks, unit movement, NAV per unit, and reconciliation checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  lpa: {
    label: "Limited Partnership Agreement",
    description: "Fund term, economics, reporting deadlines, valuation cadence, notices, consent rights, and restrictions.",
    kinds: ["document"],
    categories: ["lpa", "other_document"],
  },
  lpa_amendment: {
    label: "LPA Amendment",
    description: "Amendment dates, affected sections, economics, reporting deadlines, NAV/valuation policy, consent, waiver, operating, transfer, and liquidity changes.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  management_fee_statement: {
    label: "Management Fee Statement",
    description: "Fee period, manager, rate, fee basis, waivers, offsets, accruals, payments, approvals, and fee reconciliation checks.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  nav_package: {
    label: "NAV Package / Administrator Report",
    description: "NAV rollforward, balance sheet support, valuation policy, approvals, capital activity, units, and NAV per unit.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  ppm: {
    label: "Private Placement Memorandum",
    description: "Offering size, sponsor, strategy, economics, close dates, reporting, valuation, tax, ERISA, risk, and transfer terms.",
    kinds: ["document"],
    categories: ["ppm", "other_document"],
  },
  portfolio_transaction: {
    label: "Portfolio Transaction Notice",
    description: "Investment purchases, sales, proceeds, cost basis, realized gains/losses, and settlement details.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
  redemption_notice: {
    label: "Redemption Notice",
    description: "Investor redemption date, type, proceeds, fees, holdbacks, withholding, units, NAV per unit, remaining balance, and settlement status.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  service_agreement: {
    label: "Service Agreement",
    description: "Provider, services, fees, billing, deliverables, reporting, controls, confidentiality, liability, and termination terms.",
    kinds: ["document"],
    categories: ["service_agreement", "other_document"],
  },
  shareholder_register: {
    label: "Investor / Shareholder Register",
    description: "Holders, classes, units, ownership percentages, and commitments.",
    kinds: ["dataset"],
    categories: ["investor_register", "other_dataset"],
  },
  side_letter: {
    label: "Side Letter",
    description: "Investor-specific economics, waivers, MFN, reporting, tax, governance, transfer, liquidity, compliance, and confidentiality terms.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  subscription_agreement: {
    label: "Subscription Agreement",
    description: "Subscriber, commitment, class, tax forms, eligibility, AML/KYC, ERISA/FATCA, side letters, and wire-presence flags.",
    kinds: ["document"],
    categories: ["subscription_agreement", "other_document"],
  },
  tax_document: {
    label: "Tax Document",
    description: "Tax year, form, jurisdiction, classification, and withholding rate without tax IDs.",
    kinds: ["document"],
    categories: ["tax_document", "other_document"],
  },
  transfer_notice: {
    label: "Investor Transfer Notice",
    description: "Transferor, transferee, effective date, units, amount, share class, consideration, fees, consent, KYC, settlement, and remaining balance checks.",
    kinds: ["document"],
    categories: ["other_document"],
  },
  valuation: {
    label: "Valuation",
    description: "Valuation date, NAV, GAV, liabilities, fair value, cost, units, methodology, approvals, and reconciliation checks.",
    kinds: ["dataset"],
    categories: ["valuation", "other_dataset"],
  },
  waterfall_statement: {
    label: "Waterfall / Carry Statement",
    description: "Distribution waterfall, return of capital, preferred return, catch-up, carry, and LP/GP allocations.",
    kinds: ["document", "dataset"],
    categories: ["other_document", "other_dataset"],
  },
}

const CATEGORY_READER_KEYS = {
  lpa: "lpa",
  ppm: "ppm",
  subscription_agreement: "subscription_agreement",
  financial_statement: "financial_statement",
  audit_report: "audit_report",
  tax_document: "tax_document",
  service_agreement: "service_agreement",
  bank_statement: "bank_statement",
  valuation: "valuation",
  investor_register: "shareholder_register",
  holdings_register: "holdings_register",
}

const INFERENCE_RULES = [
  {
    key: "audit_report",
    minScore: 2,
    patterns: [
      { pattern: /\bindependent auditor'?s report\b/i, weight: 2 },
      /\bwe have audited\b/i,
      /\bin our opinion\b/i,
    ],
  },
  {
    key: "audit_adjustment_schedule",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:audit adjustment schedule|proposed audit adjustments?|passed audit adjustments?|summary of audit adjustments?|adjusting entries schedule|reclassification adjustments?|unrecorded adjustments?)\b/i, weight: 3 },
      /\b(?:AJE|PAJE)\b/i,
      /\badjustment (?:id|#|no\.?)\b/i,
      /\bposting status\b/i,
      /\bstatement area\b/i,
      /\bdebit\b[\s\S]{0,120}\bcredit\b/i,
    ],
  },
  {
    key: "management_fee_statement",
    minScore: 2,
    patterns: [
      { pattern: /\bmanagement fee (?:statement|calculation|invoice|notice)\b/i, weight: 2 },
      /\bfee calculation period\b/i,
      /\bfee basis amount\b/i,
      /\bnet management fee\b/i,
    ],
  },
  {
    key: "expense_invoice",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:fund expense invoice|service provider invoice|administrator invoice|audit fee invoice|legal fee invoice|custody fee invoice)\b/i, weight: 2 },
      /\binvoice\s*(?:number|no\.?|#|date)\b/i,
      /\bexpense reimbursement statement\b/i,
      /\b(?:vendor|supplier|payee)\b[\s\S]{0,200}\b(?:amount due|invoice date|invoice number|invoice no\.?)\b/i,
    ],
  },
  {
    key: "accrual_schedule",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:accrual schedule|expense accrual schedule|payables schedule|accrued expenses schedule|accounts payable schedule)\b/i, weight: 3 },
      /\baccrued expenses?\b/i,
      /\baccrual amount\b/i,
      /\bpayable amount\b/i,
      /\bservice provider\b/i,
      /\bdue date\b/i,
    ],
  },
  {
    key: "custodian_statement",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:custodian statement|custody statement|brokerage statement|prime broker statement|custody account statement)\b/i, weight: 2 },
      /\bcustodian\b/i,
      /\btotal account value\b/i,
      /\bsecurities market value\b/i,
      /\bposition market value\b/i,
      /\bmarket value of securities\b/i,
    ],
  },
  {
    key: "credit_facility",
    minScore: 2,
    patterns: [
      { pattern: /\bcredit facility agreement\b/i, weight: 2 },
      { pattern: /\b(?:loan agreement|borrowing notice|covenant certificate|compliance certificate)\b/i, weight: 2 },
      { pattern: /\b(?:subscription line|nav facility|capital call facility)\b/i, weight: 2 },
      /\bfacility amount\b/i,
      /\boutstanding principal\b/i,
      /\bborrowing base\b/i,
      /\bmaturity date\b/i,
      /\bloan-to-value\b/i,
      /\bcovenant status\b/i,
    ],
  },
  {
    key: "governance_minutes",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:board minutes|board meeting minutes|meeting minutes|minutes of meeting|unanimous written consent|written consent|board resolutions?|committee resolutions?|lpac minutes|advisory committee minutes|investment committee minutes)\b/i, weight: 2 },
      /\bresolved that\b/i,
      /\b(?:board of directors|investment committee|advisory committee|limited partner advisory committee|LPAC)\b/i,
      /\b(?:approved|ratified|adopted|authorized)\b[\s\S]{0,160}\b(?:NAV|net asset value|financial statements?|capital call|distribution|auditor|administrator)\b/i,
    ],
  },
  {
    key: "lpa_amendment",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+)?amendment to (?:the )?(?:amended and restated )?(?:limited partnership agreement|agreement of limited partnership)\b/i, weight: 3 },
      { pattern: /\blpa amendment\b/i, weight: 3 },
      { pattern: /\bamendment\s*(?:number|no\.?|#)\s*[A-Za-z0-9 -]{1,40}\b/i, weight: 2 },
      /\b(?:section|clause|article)\s+[0-9A-Za-z(). -]+\s+(?:is\s+)?(?:amended|deleted|replaced)\b/i,
      /\blimited partnership agreement\b[\s\S]{0,240}\bamended\b/i,
    ],
  },
  {
    key: "lpa",
    patterns: [
      { pattern: /\blimited partnership agreement\b/i, weight: 2 },
      { pattern: /\bagreement of limited partnership\b/i, weight: 2 },
    ],
  },
  {
    key: "ppm",
    patterns: [
      { pattern: /\bprivate placement memorandum\b/i, weight: 2 },
      { pattern: /\bconfidential offering memorandum\b/i, weight: 2 },
      { pattern: /\boffering memorandum\b/i, weight: 2 },
    ],
  },
  {
    key: "subscription_agreement",
    minScore: 2,
    patterns: [
      { pattern: /\bsubscription agreement\b/i, weight: 2 },
      /\bsubscriber name\b/i,
      /\bsubscription amount\b/i,
    ],
  },
  {
    key: "side_letter",
    patterns: [
      { pattern: /\bside letter\b/i, weight: 2 },
      { pattern: /\binvestor letter agreement\b/i, weight: 2 },
      /\bletter agreement\b/i,
      /\bmost favou?red nation\b/i,
      /\bMFN rights?\b/i,
    ],
  },
  {
    key: "waterfall_statement",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:distribution waterfall|waterfall statement|carried interest statement|carry allocation statement)\b/i, weight: 2 },
      { pattern: /\breturn of capital\b[\s\S]{0,180}\b(?:preferred return|carried interest|gp catch-up|catch-up)\b/i, weight: 2 },
      /\bpreferred return\b/i,
      /\bgp catch-up\b/i,
      /\bcarried interest\b/i,
      /\blp distribution\b/i,
      /\bgp distribution\b/i,
    ],
  },
  {
    key: "investor_activity_statement",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:investor|shareholder|capital) activity statement\b/i, weight: 2 },
      { pattern: /\bsubscriptions?\b[\s\S]{0,160}\bredemptions?\b/i, weight: 2 },
      /\bactivity type\b/i,
      /\btransaction type\b/i,
      /\bnet capital activity\b/i,
      /\bnav per (?:unit|share)\b/i,
    ],
  },
  {
    key: "shareholder_register",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:shareholder|investor) register\b/i, weight: 2 },
      /\b(?:shareholder|investor) name\b/i,
      /\bshare class\b/i,
      /\bownership\s*%/i,
      /\bcommitment amount\b/i,
    ],
  },
  {
    key: "holdings_register",
    minScore: 2,
    patterns: [
      { pattern: /\bholdings register\b/i, weight: 2 },
      /\binvestment name\b/i,
      /\basset class\b/i,
      /\bfair value\b/i,
    ],
  },
  {
    key: "portfolio_transaction",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:portfolio transaction notice|investment transaction notice|investment purchase notice|investment sale notice|trade confirmation|investment disposition notice|portfolio company acquisition notice|portfolio company sale notice|realization notice)\b/i, weight: 3 },
      /\binvestment name\b/i,
      /\bportfolio company\b/i,
      /\b(?:sale proceeds|gross proceeds|purchase amount|acquisition cost|investment amount)\b/i,
      /\bsettlement date\b/i,
      /\brealized gain/i,
    ],
  },
  {
    key: "bank_reconciliation",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:bank reconciliation|bank reconciliation statement|cash reconciliation|cash account reconciliation|bank rec(?:onciliation)?)\b/i, weight: 3 },
      /\badjusted bank balance\b/i,
      /\badjusted book balance\b/i,
      /\boutstanding deposits?\b/i,
      /\bdeposits? in transit\b/i,
      /\boutstanding (?:checks|cheques|payments)\b/i,
    ],
  },
  {
    key: "bank_statement",
    minScore: 2,
    patterns: [
      { pattern: /\bbank statement\b/i, weight: 2 },
      /\bopening balance\b/i,
      /\bclosing balance\b/i,
      /\btransaction date\b/i,
    ],
  },
  {
    key: "capital_call_notice",
    minScore: 2,
    patterns: [
      { pattern: /\bcapital call notices?\b/i, weight: 2 },
      { pattern: /\bdrawdown notices?\b/i, weight: 2 },
      { pattern: /\bcapital contribution notices?\b/i, weight: 2 },
      /\bfunding due date\b/i,
      /\bamount due\b/i,
    ],
  },
  {
    key: "distribution_notice",
    minScore: 2,
    patterns: [
      { pattern: /\bdistribution notices?\b/i, weight: 2 },
      { pattern: /\bnotice of distribution\b/i, weight: 2 },
      { pattern: /\bcash distribution\b/i, weight: 2 },
      /\bamount distributed\b/i,
      /\brecallable distribution\b/i,
    ],
  },
  {
    key: "redemption_notice",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:redemption notice|redemption request notice|notice of redemption|redemption request|withdrawal notice|repurchase notice)\b/i, weight: 2 },
      /\bredemption proceeds\b/i,
      /\bunits redeemed\b/i,
      /\bshares redeemed\b/i,
      /\bredemption effective date\b/i,
      /\bnet redemption\b/i,
    ],
  },
  {
    key: "transfer_notice",
    minScore: 2,
    patterns: [
      { pattern: /\b(?:transfer notice|notice of transfer|interest transfer notice|share transfer notice|assignment notice|transfer request|assignment agreement)\b/i, weight: 2 },
      /\btransferor\b/i,
      /\btransferee\b/i,
      /\bunits transferred\b/i,
      /\bshares transferred\b/i,
      /\btransfer effective date\b/i,
    ],
  },
  {
    key: "commitment_schedule",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:capital commitment schedule|commitment schedule|unfunded commitment schedule|uncalled commitment schedule)\b/i, weight: 3 },
      /\bcalled capital\b/i,
      /\bcapital called\b/i,
      /\bunfunded commitment\b/i,
      /\buncalled commitment\b/i,
      /\bremaining commitment\b/i,
      /\btotal commitment\b/i,
    ],
  },
  {
    key: "capital_account_statement",
    minScore: 2,
    patterns: [
      { pattern: /\bcapital account statements?\b/i, weight: 2 },
      /\bbeginning capital\b/i,
      /\bending capital\b/i,
      /\bunfunded commitment\b/i,
    ],
  },
  {
    key: "nav_package",
    minScore: 3,
    patterns: [
      { pattern: /\b(?:nav package|nav pack|net asset value package|administrator report|fund administrator report|monthly nav report|quarterly nav report)\b/i, weight: 3 },
      { pattern: /\bbeginning nav\b[\s\S]{0,240}\bending nav\b/i, weight: 2 },
      /\bnav rollforward\b/i,
      /\bunits outstanding\b/i,
      /\bshares outstanding\b/i,
      /\bsubscriptions?\b[\s\S]{0,180}\bredemptions?\b/i,
    ],
  },
  {
    key: "valuation",
    patterns: [/\bvaluation date\b/i, /\bnet asset value\b/i, /\bnav per (?:unit|share)\b/i],
  },
  {
    key: "financial_statement",
    patterns: [/\bfinancial statements?\b/i, /\bstatement of assets and liabilities\b/i, /\bnet investment income\b/i],
  },
  {
    key: "tax_document",
    patterns: [/\btax year\b/i, /\bform\s+1065\b/i, /\bschedule\s+k-1\b/i, /\btax residency\b/i],
  },
  {
    key: "service_agreement",
    minScore: 2,
    patterns: [
      /\bservice provider\b/i,
      /\bservices provided\b/i,
      { pattern: /\badministration agreement\b/i, weight: 2 },
      { pattern: /\bcustody agreement\b/i, weight: 2 },
    ],
  },
]

function sourceSearchText(source = {}) {
  const tableText = (source.tables || [])
    .flatMap((table) => (table.rows || []).slice(0, 8).map((row) => row.join(" | ")))
    .join("\n")
  return [source.text, tableText].filter(Boolean).join("\n")
}

function patternEntry(entry) {
  return entry instanceof RegExp ? { pattern: entry, weight: 1 } : entry
}

function inferenceScore(rule, text) {
  return (rule.patterns || []).reduce(
    (result, entry) => {
      const { pattern, weight = 1 } = patternEntry(entry)
      if (!pattern?.test(text)) return result
      return {
        score: result.score + weight,
        matches: result.matches + 1,
      }
    },
    { score: 0, matches: 0 },
  )
}

function readerSupportsKind(readerKey, kind) {
  if (!kind) return true
  const kinds = READER_CATALOG[readerKey]?.kinds || []
  return !kinds.length || kinds.includes(kind)
}

function readerCatalogEntry(readerKey) {
  const Reader = READERS[readerKey]
  if (!Reader) return null
  return {
    key: Reader.key,
    version: Reader.version,
    label: READER_CATALOG[Reader.key]?.label || Reader.key.replace(/_/g, " "),
    description: READER_CATALOG[Reader.key]?.description || null,
    kinds: READER_CATALOG[Reader.key]?.kinds || [],
    categories: READER_CATALOG[Reader.key]?.categories || [],
  }
}

class RepositoryReaderRegistryService {
  static assertReaderKey(readerKey) {
    const normalized = String(readerKey || "").trim()
    if (!normalized) return null
    if (!READERS[normalized]) {
      throw new AppError("Unsupported repository reader", 400)
    }
    return normalized
  }

  static inferReaderKey({ kind = null, category, source = null }) {
    if (!["other_document", "other_dataset"].includes(category) || !source) return null
    const text = sourceSearchText(source)
    if (!text.trim()) return null
    const candidates = INFERENCE_RULES
      .map((rule, index) => {
        const { score, matches } = readerSupportsKind(rule.key, kind) ? inferenceScore(rule, text) : { score: 0, matches: 0 }
        return { key: rule.key, score, matches, minScore: rule.minScore || 1, index }
      })
      .filter((candidate) => candidate.score >= candidate.minScore)
      .sort((left, right) => right.score - left.score || right.matches - left.matches || left.index - right.index)
    return candidates[0]?.key || null
  }

  static resolveWithMetadata({ kind = null, category, readerKey = null, source = null }) {
    const requestedReaderKey = this.assertReaderKey(readerKey)
    if (requestedReaderKey && !readerSupportsKind(requestedReaderKey, kind)) {
      throw new AppError("Repository reader does not support this item type", 400)
    }
    const categoryReaderKey = CATEGORY_READER_KEYS[category] || null
    const inferredReaderKey = requestedReaderKey || categoryReaderKey ? null : this.inferReaderKey({ kind, category, source })
    const resolvedKey = requestedReaderKey || categoryReaderKey || inferredReaderKey || "generic"
    const reader = READERS[resolvedKey] || GenericRepositoryReader
    return {
      reader,
      reader_key: reader.key,
      selection_type: requestedReaderKey ? "manual" : categoryReaderKey ? "category" : inferredReaderKey ? "inferred" : "generic",
      category_reader_key: categoryReaderKey,
      inferred_reader_key: inferredReaderKey,
    }
  }

  static resolve({ kind = null, category, readerKey = null, source = null }) {
    return this.resolveWithMetadata({ kind, category, readerKey, source }).reader
  }

  static supportsAutomaticAnalysis({ kind, category }) {
    return (
      kind === "document" ||
      ["bank_statement", "valuation", "investor_register", "holdings_register", "other_dataset"].includes(category)
    )
  }

  static availableReaders() {
    return Object.values(READERS)
      .map((Reader) => readerCatalogEntry(Reader.key))
      .sort((left, right) => {
        if (left.key === "generic") return 1
        if (right.key === "generic") return -1
        return left.label.localeCompare(right.label)
      })
  }

  static readerInfo(readerKey) {
    const normalized = this.assertReaderKey(readerKey)
    return normalized ? readerCatalogEntry(normalized) : null
  }
}

module.exports = RepositoryReaderRegistryService
