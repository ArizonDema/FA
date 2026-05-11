const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")
const JSZip = require("jszip")
const CashFlowService = require("../src/services/cashFlow.service")
const appConfig = require("../src/config/app")

const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

const INDIRECT_TEMPLATE_FIXTURE = path.join(
  process.cwd(),
  "uploads",
  "cash-flow",
  "templates",
  "bf126d3e-7a2c-422f-9704-b3ce626d76f1_PLC_Cash_Flow_Template_v2.xlsx",
)
const SAMPLE_2026_TB = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_2026.xlsx"
const SAMPLE_2026_GL = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_2026.xlsx"

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-service-test-"))
}

function removeDirSafe(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true })
}

async function writeTrialBalanceWorkbook(filePath, rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Trial Balance")
  sheet.addRow(["Company", "As of Date", "Account", "Ending Debit", "Ending Credit"])
  rows.forEach((row) => {
    sheet.addRow([
      row.company || "Demo Co",
      row.asOfDate || "2025-06-30",
      row.account,
      row.endingDebit || null,
      row.endingCredit || null,
    ])
  })
  await workbook.xlsx.writeFile(filePath)
}

async function writeGeneralLedgerWorkbook(filePath, rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("General Ledger")
  sheet.addRow([
    "Company",
    "Ledger Account",
    "Date",
    "JE No",
    "Description",
    "Entry Side",
    "Debit",
    "Credit",
    "Balance Amount",
    "Balance Type",
  ])

  rows.forEach((row) => {
    sheet.addRow([
      row.company || "Demo Co",
      row.account,
      row.date,
      row.jeNo,
      row.description || "",
      row.entrySide || "",
      row.debit || null,
      row.credit || null,
      row.balanceAmount || null,
      row.balanceType || null,
    ])
  })
  await workbook.xlsx.writeFile(filePath)
}

async function writeTemplateWorkbook(
  filePath,
  sheetName = "Cash Flow",
  periodLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow([
    "Month",
    "Opening Balance",
    "Sales Inflow",
    "Other Inflow",
    "Total Inflows",
    "Rent",
    "Salaries",
    "Other Outflows",
    "Total Outflows",
    "Net Cash Flow",
    "Closing Balance",
  ])

  periodLabels.forEach((month, index) => {
    const rowIndex = index + 2
    sheet.getCell(`A${rowIndex}`).value = month

    if (rowIndex === 2) {
      sheet.getCell(`B${rowIndex}`).value = null
    } else {
      sheet.getCell(`B${rowIndex}`).value = { formula: `K${rowIndex - 1}` }
    }
    sheet.getCell(`E${rowIndex}`).value = { formula: `C${rowIndex}+D${rowIndex}` }
    sheet.getCell(`I${rowIndex}`).value = { formula: `F${rowIndex}+G${rowIndex}+H${rowIndex}` }
    sheet.getCell(`J${rowIndex}`).value = { formula: `E${rowIndex}-I${rowIndex}` }
    sheet.getCell(`K${rowIndex}`).value = { formula: `B${rowIndex}+J${rowIndex}` }
  })

  await workbook.xlsx.writeFile(filePath)
}

async function writeDirectColumnCashFlowWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Direct CF")
  sheet.addRow([])
  sheet.addRow(["", "Section", "Line Item", "Jan", "Feb", "Mar"])
  ;[
    ["OPERATING CASH FLOW", "Cash receipts from customers", 100, 110, 120],
    ["OPERATING CASH FLOW", "Payments to suppliers", -40, -42, -45],
    ["OPERATING CASH FLOW", "Payroll and benefits", -20, -20, -21],
    ["OPERATING CASH FLOW", "Rent and facilities", -8, -8, -8],
    ["OPERATING CASH FLOW", "Sales & marketing", -6, -7, -8],
    ["OPERATING CASH FLOW", "Income taxes paid", 0, 0, -3],
    ["INVESTING CASH FLOW", "Capital expenditures", -30, -18, -20],
    ["INVESTING CASH FLOW", "Asset sale proceeds", 0, 25, 0],
    ["FINANCING CASH FLOW", "Debt drawdown", 0, 150, 0],
    ["FINANCING CASH FLOW", "Debt principal repayments", -10, -10, -10],
    ["FINANCING CASH FLOW", "Interest paid", -3, -3, -3],
    ["FINANCING CASH FLOW", "Equity injection", 0, 0, 50],
    ["FINANCING CASH FLOW", "Dividends paid", 0, -5, 0],
    ["SUMMARY", "Opening cash balance", 10, 20, 30],
    ["SUMMARY", "Ending cash balance", 20, 30, 40],
  ].forEach((row) => sheet.addRow(["", ...row]))
  await workbook.xlsx.writeFile(filePath)
}

function addSpreadsheetPrefix(xml) {
  let normalized = String(xml || "")
  normalized = normalized.replace(`xmlns="${SPREADSHEETML_NS}"`, `xmlns:x="${SPREADSHEETML_NS}"`)
  normalized = normalized.replace(/<(\/?)(?!\?)([A-Za-z][A-Za-z0-9_.-]*)(?=[\s>])/g, (match, slash, tag) => {
    if (tag.includes(":")) return match
    return `<${slash}x:${tag}`
  })
  return normalized
}

async function writeRecoverableMalformedTemplate(filePath) {
  await writeTemplateWorkbook(filePath)

  const buffer = fs.readFileSync(filePath)
  const zip = await JSZip.loadAsync(buffer)

  const workbookXml = await zip.file("xl/workbook.xml").async("string")
  const worksheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string")
  const stylesXml = await zip.file("xl/styles.xml").async("string")
  const contentTypesXml = await zip.file("[Content_Types].xml").async("string")
  const rootRelsXml = await zip.file("_rels/.rels").async("string")
  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string")

  zip.file("xl/workbook.xml", addSpreadsheetPrefix(workbookXml))
  zip.file("xl/styles.xml", addSpreadsheetPrefix(stylesXml))
  zip.file(
    "xl/worksheets/sheet1.xml",
    addSpreadsheetPrefix(worksheetXml).replace(
      "</x:worksheet>",
      '<x:mergeCells count="2"><x:mergeCell ref="B5:E7"/><x:mergeCell ref="B5:E5"/></x:mergeCells></x:worksheet>',
    ),
  )
  zip.file(
    "[Content_Types].xml",
    contentTypesXml
      .replace(
        /<Default Extension="xml" ContentType="[^"]+"\s*\/>/,
        '<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />',
      )
      .replace(/<Override PartName="\/xl\/workbook\.xml"[^>]*\/>/, ""),
  )
  zip.file("_rels/.rels", rootRelsXml.replace('Target="xl/workbook.xml"', 'Target="/xl/workbook.xml"'))
  zip.file(
    "xl/_rels/workbook.xml.rels",
    workbookRelsXml
      .replace('Target="styles.xml"', 'Target="/xl/styles.xml"')
      .replace('Target="theme/theme1.xml"', 'Target="/xl/theme/theme1.xml"')
      .replace('Target="worksheets/sheet1.xml"', 'Target="/xl/worksheets/sheet1.xml"'),
  )

  fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }))
}

function getRowBinding(config, semanticKey) {
  return (config?.row_bindings || []).find((binding) => binding.semantic_key === semanticKey) || null
}

describe("cashFlow.service", () => {
  let tempDir

  beforeEach(() => {
    tempDir = makeTempDir()
    appConfig.mappingAssistance.runtimeEnabled = false
  })

  afterEach(() => {
    appConfig.mappingAssistance.runtimeEnabled = false
    removeDirSafe(tempDir)
  })

  test("parses trial balance and resolves ending cash", async () => {
    const tbPath = path.join(tempDir, "tb.xlsx")
    await writeTrialBalanceWorkbook(tbPath, [
      { account: "Cash", endingDebit: 1250, endingCredit: 0 },
      { account: "Accounts Payable", endingDebit: 0, endingCredit: 400 },
    ])

    const parsed = await CashFlowService.parseTrialBalanceFile(tbPath)
    expect(parsed.cashAccountName).toBe("Cash")
    expect(parsed.cashEndingBalance).toBe(1250)
    expect(parsed.asOfDate.toISOString().slice(0, 10)).toBe("2025-06-30")
  })

  test("parses GL and allocates multi-line JE movement proportionally", async () => {
    const glPath = path.join(tempDir, "gl.xlsx")
    await writeGeneralLedgerWorkbook(glPath, [
      {
        account: "Cash",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 100,
        credit: 0,
        entrySide: "DR",
        description: "Collections",
      },
      {
        account: "Service Revenue",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 80,
        entrySide: "CR",
      },
      {
        account: "Unearned Revenue",
        date: "2025-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 20,
        entrySide: "CR",
      },
      {
        account: "Cash",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 0,
        credit: 60,
        entrySide: "CR",
        description: "Payments",
      },
      {
        account: "Rent Expense",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 30,
        credit: 0,
        entrySide: "DR",
      },
      {
        account: "Salaries Expense",
        date: "2025-01-15",
        jeNo: "JE-2",
        debit: 30,
        credit: 0,
        entrySide: "DR",
      },
    ])

    const parsed = await CashFlowService.parseGeneralLedgerFile(glPath, { cashAccountName: "Cash" })
    expect(parsed.movements).toHaveLength(4)

    const totalsByAccount = parsed.movements.reduce((acc, row) => {
      acc[row.account_name] = (acc[row.account_name] || 0) + row.amount
      return acc
    }, {})

    expect(totalsByAccount["Service Revenue"]).toBe(80)
    expect(totalsByAccount["Unearned Revenue"]).toBe(20)
    expect(totalsByAccount["Rent Expense"]).toBe(-30)
    expect(totalsByAccount["Salaries Expense"]).toBe(-30)
  })

  test("builds runtime account profile from TB context and GL cash movements", () => {
    const { buildRuntimeAccountProfile, getRuntimeAccountDirectionProfile } = CashFlowService.__test
    const profile = buildRuntimeAccountProfile({
      trialBalance: {
        cashAccountName: "Cash",
        rows: [
          { account: "Cash", endingDebit: 1000, endingCredit: 0, endingBalance: 1000 },
          { account: "Equipment Clearing", endingDebit: 2500, endingCredit: 0, endingBalance: 2500 },
          { account: "Payroll Payable", endingDebit: 0, endingCredit: 900, endingBalance: -900 },
        ],
      },
      generalLedger: {
        rows: [
          { account_name: "Equipment Clearing", date: new Date("2026-01-15"), je_no: "JE-1", description: "Server equipment purchase" },
          { account_name: "Cash", date: new Date("2026-01-15"), je_no: "JE-1", description: "Cash paid" },
        ],
        movements: [
          {
            account_name: "Equipment Clearing",
            date: new Date("2026-01-15"),
            je_no: "JE-1",
            description: "Server equipment purchase",
            amount: -2500,
          },
        ],
      },
    })

    expect(profile.by_account.cash).toBeUndefined()
    expect(profile.by_account["equipment clearing"]).toEqual(
      expect.objectContaining({
        tb_account_class: "fixed_asset",
        movement_count: 1,
        total_abs_amount: 2500,
      }),
    )
    expect(profile.by_account["payroll payable"]).toEqual(
      expect.objectContaining({
        tb_present: true,
        movement_count: 0,
      }),
    )
    expect(getRuntimeAccountDirectionProfile(profile, "Equipment Clearing", "outflow")).toEqual(
      expect.objectContaining({
        active_months: ["2026-01"],
        sample_descriptions: ["Server equipment purchase"],
        sample_je_numbers: ["JE-1"],
      }),
    )
    expect(profile.summary).toEqual(
      expect.objectContaining({
        profiled_accounts: 2,
        tb_only_accounts: 1,
        direction_profiles: 1,
      }),
    )
  })

  test("maps by rules and fallback buckets", () => {
    const buckets = [
      {
        bucket_key: "sales_inflow",
        label: "Sales",
        direction: "inflow",
        column_header: "Sales",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
      },
      {
        bucket_key: "other_inflow",
        label: "Other Inflow",
        direction: "inflow",
        column_header: "Other Inflow",
        fallback: true,
        rules: [],
      },
      {
        bucket_key: "ops_outflow",
        label: "Ops Outflow",
        direction: "outflow",
        column_header: "Ops Outflow",
        fallback: true,
        rules: [{ match_type: "contains", pattern: "expense", priority: 10 }],
      },
    ]

    const movements = [
      { account_name: "Accounts Receivable", date: new Date("2025-01-10"), amount: 100 },
      { account_name: "Rent Expense", date: new Date("2025-01-10"), amount: -35 },
      { account_name: "Owner Capital", date: new Date("2025-01-10"), amount: 50 },
    ]

    const result = CashFlowService.mapMovementsToBuckets(movements, buckets)
    expect(result.unmapped).toHaveLength(0)
    expect(result.mappedMovements.map((item) => item.bucket_key)).toEqual([
      "sales_inflow",
      "ops_outflow",
      "other_inflow",
    ])
  })

  test("maps direct cash-flow accounts with semantic synonyms before using generic fallback", () => {
    const buckets = [
      { bucket_key: "payments_to_suppliers", label: "Payments to suppliers", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "sales_marketing", label: "Sales & marketing", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "capital_expenditures", label: "Capital expenditures", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "interest_paid", label: "Interest paid", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "debt_drawdown", label: "Debt drawdown", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "equity_injection", label: "Equity injection", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "other_inflow", label: "Other inflow", direction: "inflow", fallback: true, rules: [] },
      { bucket_key: "other_outflow", label: "Other outflow", direction: "outflow", fallback: true, rules: [] },
    ]
    const movements = [
      { account_name: "Advertising Expense", description: "Meta ads", amount: -100 },
      { account_name: "Office Equipment", description: "Laptop purchase", amount: -200 },
      { account_name: "Bank Loan Proceeds", description: "Debt drawdown", amount: 500 },
      { account_name: "Member Funding", description: "Capital call receipt", amount: 300 },
      { account_name: "Vendor Payable", description: "Supplier payment", amount: -50 },
      { account_name: "Interest Expense", description: "Loan interest paid", amount: -10 },
    ]

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    })
    const assignments = new Map(mapped.finalBucketAssignments.map((assignment) => [assignment.normalized_account, assignment]))

    expect(assignments.get("advertising expense")?.bucket_key).toBe("sales_marketing")
    expect(assignments.get("office equipment")?.bucket_key).toBe("capital_expenditures")
    expect(assignments.get("bank loan proceeds")?.bucket_key).toBe("debt_drawdown")
    expect(assignments.get("member funding")?.bucket_key).toBe("equity_injection")
    expect(assignments.get("vendor payable")?.bucket_key).toBe("payments_to_suppliers")
    expect(assignments.get("interest expense")?.bucket_key).toBe("interest_paid")
    expect(mapped.lowConfidenceMappings).toEqual([])
  })

  test("uses runtime account profile evidence to map weak account names aggressively but reviewably", () => {
    const buckets = [
      { bucket_key: "supplier_payments", label: "Supplier payments", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "payroll", label: "Payroll", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "rent_facilities", label: "Rent and facilities", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "sales_marketing", label: "Sales and marketing", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "general_admin", label: "General admin", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "income_taxes", label: "Income taxes", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "capital_expenditures", label: "Capital expenditures", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "debt_drawdown", label: "Debt drawdown", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "debt_repayment", label: "Debt repayment", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "interest_paid", label: "Interest paid", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "equity_injection", label: "Equity injection", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "dividends_distributions", label: "Dividends and distributions", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "other_inflow", label: "Other inflow", direction: "inflow", fallback: true, rules: [] },
      { bucket_key: "other_outflow", label: "Other outflow", direction: "outflow", fallback: true, rules: [] },
    ]
    const movements = [
      { account_name: "Clearing A", description: "Google advertising campaign", amount: -100, date: new Date("2026-01-10"), je_no: "JE-1" },
      { account_name: "Equipment Clearing", description: "Server rack purchase", amount: -900, date: new Date("2026-01-11"), je_no: "JE-2" },
      { account_name: "Long Term Note", description: "Loan proceeds from bank", amount: 2000, date: new Date("2026-01-12"), je_no: "JE-3" },
      { account_name: "Long Term Note", description: "Principal repayment", amount: -300, date: new Date("2026-02-12"), je_no: "JE-4" },
      { account_name: "Funding Clearing", description: "Member capital contribution", amount: 1500, date: new Date("2026-02-13"), je_no: "JE-5" },
      { account_name: "Owner Draw", description: "Owner distribution", amount: -200, date: new Date("2026-02-14"), je_no: "JE-6" },
      { account_name: "Payroll Clearing", description: "Biweekly payroll wages", amount: -700, date: new Date("2026-02-15"), je_no: "JE-7" },
      { account_name: "Facilities Clearing", description: "Monthly office lease", amount: -400, date: new Date("2026-02-16"), je_no: "JE-8" },
      { account_name: "Tax Clearing", description: "Income tax payment", amount: -250, date: new Date("2026-02-17"), je_no: "JE-9" },
      { account_name: "Interest Payable", description: "Loan interest paid", amount: -80, date: new Date("2026-02-18"), je_no: "JE-10" },
    ]
    const accountProfile = CashFlowService.__test.buildRuntimeAccountProfile({
      trialBalance: {
        cashAccountName: "Cash",
        rows: [
          { account: "Cash", endingDebit: 10000, endingCredit: 0, endingBalance: 10000 },
          { account: "Equipment Clearing", endingDebit: 900, endingCredit: 0, endingBalance: 900 },
          { account: "Long Term Note", endingDebit: 0, endingCredit: 5000, endingBalance: -5000 },
          { account: "Funding Clearing", endingDebit: 0, endingCredit: 1500, endingBalance: -1500 },
          { account: "Owner Draw", endingDebit: 200, endingCredit: 0, endingBalance: 200 },
        ],
      },
      generalLedger: {
        rows: movements.map((movement) => ({
          account_name: movement.account_name,
          date: movement.date,
          je_no: movement.je_no,
          description: movement.description,
        })),
        movements,
      },
    })

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
      accountProfile,
    })
    const assignments = new Map(mapped.finalBucketAssignments.map((assignment) => [assignment.normalized_account, assignment]))

    expect(assignments.get("clearing a")?.bucket_key).toBe("sales_marketing")
    expect(assignments.get("equipment clearing")?.bucket_key).toBe("capital_expenditures")
    expect(mapped.finalBucketAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalized_account: "long term note", direction: "inflow", bucket_key: "debt_drawdown" }),
        expect.objectContaining({ normalized_account: "long term note", direction: "outflow", bucket_key: "debt_repayment" }),
        expect.objectContaining({ normalized_account: "funding clearing", bucket_key: "equity_injection" }),
        expect.objectContaining({ normalized_account: "owner draw", bucket_key: "dividends_distributions" }),
        expect.objectContaining({ normalized_account: "payroll clearing", bucket_key: "payroll" }),
        expect.objectContaining({ normalized_account: "facilities clearing", bucket_key: "rent_facilities" }),
        expect.objectContaining({ normalized_account: "tax clearing", bucket_key: "income_taxes" }),
        expect.objectContaining({ normalized_account: "interest payable", bucket_key: "interest_paid" }),
      ]),
    )
    expect(mapped.autoCreatedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized_account: "equipment clearing",
          source: "profile_auto",
          status: "suggested",
          account_profile: expect.objectContaining({ tb_account_class: "fixed_asset" }),
        }),
      ]),
    )
  })

  test("understands renamed template groupings and renamed account profiles", () => {
    const buckets = [
      { bucket_key: "client_collections", label: "Client collections", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "misc_operating_receipts", label: "Misc operating receipts", direction: "inflow", fallback: true, rules: [] },
      { bucket_key: "vendor_disbursements", label: "Vendor disbursements", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "people_costs", label: "People costs", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "premises_costs", label: "Premises costs", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "growth_spend", label: "Growth spend", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "overhead_and_admin", label: "Overhead and admin", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "asset_purchases", label: "Asset purchases", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "credit_facility_proceeds", label: "Credit facility proceeds", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "borrowing_principal_paid", label: "Borrowing principal paid", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "finance_charges_paid", label: "Finance charges paid", direction: "outflow", fallback: false, rules: [] },
      { bucket_key: "founder_funding", label: "Founder funding", direction: "inflow", fallback: false, rules: [] },
      { bucket_key: "member_distributions", label: "Member distributions", direction: "outflow", fallback: false, rules: [] },
    ]
    const movements = [
      { account_name: "Client Balances", description: "Collected customer balances", amount: 39000, date: new Date("2026-01-10") },
      { account_name: "Trade Vendor Ledger", description: "Paid suppliers", amount: -4410, date: new Date("2026-01-15") },
      { account_name: "Team Compensation", description: "Payroll processing", amount: -12000, date: new Date("2026-01-18") },
      { account_name: "Premises Lease Cost", description: "Paid office rent", amount: -4500, date: new Date("2026-01-04") },
      { account_name: "Growth Campaign Spend", description: "Marketing campaign expense", amount: -2300, date: new Date("2026-01-21") },
      { account_name: "Facilities Services", description: "Utilities payment", amount: -2900, date: new Date("2026-01-20") },
      { account_name: "IT Hardware", description: "Purchased office equipment", amount: -18000, date: new Date("2026-01-02") },
      { account_name: "Credit Facility", description: "Bank loan proceeds received", amount: 35000, date: new Date("2026-02-01") },
      { account_name: "Credit Facility", description: "Loan repayment principal", amount: -2260, date: new Date("2026-01-25") },
      { account_name: "Finance Charge", description: "Loan interest paid", amount: -480, date: new Date("2026-01-25") },
      { account_name: "Founder Funding", description: "Owner capital contribution", amount: 120000, date: new Date("2026-01-01") },
      { account_name: "Member Distributions", description: "Owner drawing", amount: -6000, date: new Date("2026-03-01") },
      { account_name: "Deferred Client Deposits", description: "Unearned retainer received", amount: 12000, date: new Date("2026-05-01") },
    ]
    const accountProfile = CashFlowService.__test.buildRuntimeAccountProfile({
      trialBalance: {
        cashAccountName: "Cash",
        rows: [
          { account: "Cash", endingDebit: 10000, endingCredit: 0, endingBalance: 10000 },
          { account: "Client Balances", endingDebit: 145500, endingCredit: 0, endingBalance: 145500 },
          { account: "Trade Vendor Ledger", endingDebit: 0, endingCredit: 14815, endingBalance: -14815 },
          { account: "Credit Facility", endingDebit: 0, endingCredit: 20540, endingBalance: -20540 },
          { account: "Founder Funding", endingDebit: 0, endingCredit: 135000, endingBalance: -135000 },
          { account: "IT Hardware", endingDebit: 38000, endingCredit: 0, endingBalance: 38000 },
        ],
      },
      generalLedger: {
        rows: movements.map((movement, index) => ({
          account_name: movement.account_name,
          date: movement.date,
          je_no: `JE-${index + 1}`,
          description: movement.description,
        })),
        movements,
      },
    })

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
      accountProfile,
    })

    expect(mapped.lowConfidenceMappings).toEqual([])
    expect(mapped.finalBucketAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalized_account: "client balances", bucket_key: "client_collections" }),
        expect.objectContaining({ normalized_account: "trade vendor ledger", bucket_key: "vendor_disbursements" }),
        expect.objectContaining({ normalized_account: "team compensation", bucket_key: "people_costs" }),
        expect.objectContaining({ normalized_account: "premises lease cost", bucket_key: "premises_costs" }),
        expect.objectContaining({ normalized_account: "growth campaign spend", bucket_key: "growth_spend" }),
        expect.objectContaining({ normalized_account: "facilities services", bucket_key: "overhead_and_admin" }),
        expect.objectContaining({ normalized_account: "it hardware", bucket_key: "asset_purchases" }),
        expect.objectContaining({ normalized_account: "credit facility", direction: "inflow", bucket_key: "credit_facility_proceeds" }),
        expect.objectContaining({ normalized_account: "credit facility", direction: "outflow", bucket_key: "borrowing_principal_paid" }),
        expect.objectContaining({ normalized_account: "finance charge", bucket_key: "finance_charges_paid" }),
        expect.objectContaining({ normalized_account: "founder funding", bucket_key: "founder_funding" }),
        expect.objectContaining({ normalized_account: "member distributions", bucket_key: "member_distributions" }),
        expect.objectContaining({ normalized_account: "deferred client deposits", bucket_key: "client_collections" }),
      ]),
    )
  })

  test("resolves account profiles to LLM-labeled direct template semantics before row labels", () => {
    const buckets = [
      {
        bucket_key: "growth_spend",
        label: "Growth Spend",
        direction: "outflow",
        semantic_key: "sales_marketing",
        semantic_confidence: 0.93,
        semantic_source: "llm_semantic",
        fallback: false,
        rules: [],
      },
      {
        bucket_key: "founder_money",
        label: "Founder Money",
        direction: "inflow",
        semantic_key: "equity_injection",
        semantic_confidence: 0.94,
        semantic_source: "llm_semantic",
        fallback: false,
        rules: [],
      },
      { bucket_key: "other_outflow", label: "Other outflow", direction: "outflow", fallback: true, rules: [] },
      { bucket_key: "other_inflow", label: "Other inflow", direction: "inflow", fallback: true, rules: [] },
    ]
    const movements = [
      { account_name: "Clearing 14", description: "Paid growth campaign media buy", amount: -2500, date: new Date("2026-01-10"), je_no: "JE-1" },
      { account_name: "Bridge 82", description: "Founder funding contribution received", amount: 10000, date: new Date("2026-01-11"), je_no: "JE-2" },
    ]
    const accountProfile = CashFlowService.__test.buildRuntimeAccountProfile({
      trialBalance: {
        cashAccountName: "Cash",
        rows: [
          { account: "Cash", endingDebit: 10000, endingCredit: 0, endingBalance: 10000 },
          { account: "Bridge 82", endingDebit: 0, endingCredit: 10000, endingBalance: -10000 },
        ],
      },
      generalLedger: {
        rows: movements.map((movement) => ({
          account_name: movement.account_name,
          date: movement.date,
          je_no: movement.je_no,
          description: movement.description,
        })),
        movements,
      },
    })

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
      accountProfile,
    })

    expect(mapped.finalBucketAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalized_account: "clearing 14", bucket_key: "growth_spend", semantic_key: "sales_marketing" }),
        expect.objectContaining({ normalized_account: "bridge 82", bucket_key: "founder_money", semantic_key: "equity_injection" }),
      ]),
    )
    expect(mapped.autoCreatedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalized_account: "bridge 82", semantic_key: "equity_injection", status: "suggested" }),
      ]),
    )
  })

  test("builds fiscal-year rollforward from TB and GL movement", () => {
    const monthNet = [99450, 47520, 7505, 29525, 27495, 17080, 0, 0, 0, 0, 0, 0]
    const movements = monthNet
      .map((amount, index) => ({
        account_name: "Accounts Receivable",
        date: new Date(Date.UTC(2025, index, 15)),
        amount,
        bucket_key: "sales_inflow",
        bucket_label: "Sales Inflow",
        direction: "inflow",
        abs_amount: Math.abs(amount),
      }))
      .filter((row) => row.amount !== 0)

    const fiscalData = CashFlowService.buildFiscalYearData({
      fiscalYear: 2025,
      tbAsOfDate: "2025-06-30",
      tbCashEndingBalance: 228575,
      cashMovements: movements,
      mappedMovements: movements,
      buckets: [
        {
          bucket_key: "sales_inflow",
          label: "Sales Inflow",
          direction: "inflow",
          column_header: "Sales Inflow",
          fallback: false,
          rules: [],
        },
      ],
    })

    expect(fiscalData.opening_balance_january).toBe(0)
    expect(fiscalData.months[5].closing_balance).toBe(228575)
    expect(fiscalData.months[11].closing_balance).toBe(228575)
  })

  test("fills template by header mapping while preserving formulas", async () => {
    const templatePath = path.join(tempDir, "template.xlsx")
    const outputPath = path.join(tempDir, "filled.xlsx")
    await writeTemplateWorkbook(templatePath)

    const config = CashFlowService.validateTemplateConfig({
      sheet_name: "Cash Flow",
      header_row: 1,
      month_column_header: "Month",
      opening_column_header: "Opening Balance",
      closing_column_header: "Closing Balance",
      buckets: [
        {
          bucket_key: "sales_inflow",
          label: "Sales Inflow",
          direction: "inflow",
          column_header: "Sales Inflow",
          fallback: false,
          rules: [],
        },
        {
          bucket_key: "other_outflow",
          label: "Other Outflow",
          direction: "outflow",
          column_header: "Other Outflows",
          fallback: false,
          rules: [],
        },
      ],
    })

    const months = Array.from({ length: 12 }).map((_, index) => ({
      month_index: index + 1,
      month_label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index],
      opening_balance: index * 100,
      net_cash_flow: 10,
      closing_balance: index * 100 + 10,
      bucket_amounts: {
        sales_inflow: 50,
        other_outflow: 40,
      },
    }))

    await CashFlowService.fillTemplateWorkbook({
      templatePath,
      outputPath,
      config,
      fiscalData: { months },
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(outputPath)
    const sheet = workbook.getWorksheet("Cash Flow")

    expect(sheet.getCell("C2").value).toBe(50)
    expect(sheet.getCell("H2").value).toBe(40)

    const febOpening = sheet.getCell("B3").value
    expect(typeof febOpening).toBe("object")
    expect(febOpening.formula).toBe("K2")
  })

  test("writes negative outflows when a direct template sums mixed signed rows", async () => {
    const templatePath = path.join(tempDir, "signed_direct_template.xlsx")
    const outputPath = path.join(tempDir, "signed_direct_output.xlsx")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Cash Flow")
    sheet.getCell("A1").value = "Section"
    sheet.getCell("B1").value = "Line Item"
    sheet.getCell("C1").value = "Jan"
    sheet.getCell("A2").value = "OPERATING"
    sheet.getCell("B2").value = "Cash receipts"
    sheet.getCell("A3").value = "OPERATING"
    sheet.getCell("B3").value = "Payroll"
    sheet.getCell("A4").value = "OPERATING"
    sheet.getCell("B4").value = "Net operating cash flow"
    sheet.getCell("C4").value = { formula: "SUM(C2:C3)", result: 999 }
    sheet.getCell("A5").value = "SUMMARY"
    sheet.getCell("B5").value = "Opening cash balance"
    sheet.getCell("C5").value = { formula: "180000", result: 180000 }
    sheet.getCell("A6").value = "SUMMARY"
    sheet.getCell("B6").value = "Ending cash balance"
    sheet.getCell("C6").value = { formula: "C5+C4", result: 999 }
    await workbook.xlsx.writeFile(templatePath)

    const config = CashFlowService.validateV3TemplateConfig({
      version: "v3",
      statement_method: "direct",
      sheet_name: "Cash Flow",
      layout_type: "rows",
      period_granularity: "monthly",
      period_axis: {
        orientation: "column",
        labels: [{ period_key: "m01", label: "Jan", period_type: "monthly", month: 1 }],
        period_bindings: [{ period_key: "m01", label: "Jan", cell: "C1" }],
      },
      period_resolution_rules: { custom_periods: [] },
      opening_binding: { cells: [{ period_key: "m01", label: "Jan", cell: "C5" }] },
      closing_binding: { cells: [{ period_key: "m01", label: "Jan", cell: "C6" }] },
      bucket_bindings: [
        {
          bucket_key: "cash_receipts",
          label: "Cash receipts",
          direction: "inflow",
          fallback: false,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "C2" }],
        },
        {
          bucket_key: "payroll",
          label: "Payroll",
          direction: "outflow",
          fallback: false,
          rules: [],
          cells: [{ period_key: "m01", label: "Jan", cell: "C3" }],
        },
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    })

    await CashFlowService.fillTemplateWorkbook({
      templatePath,
      outputPath,
      config,
      periodData: {
        periods: [
          {
            period_key: "m01",
            bucket_amounts: {
              cash_receipts: 100,
              payroll: 40,
            },
            opening_balance: 0,
            closing_balance: 60,
          },
        ],
      },
    })

    const filled = new ExcelJS.Workbook()
    await filled.xlsx.readFile(outputPath)
    const outputSheet = filled.getWorksheet("Cash Flow")
    expect(outputSheet.getCell("C2").value).toBe(100)
    expect(outputSheet.getCell("C3").value).toBe(-40)
    expect(outputSheet.getCell("C4").value.formula).toBe("SUM(C2:C3)")
    expect(outputSheet.getCell("C4").value.result).toBeUndefined()
    expect(outputSheet.getCell("C5").value).toBe(0)
    expect(outputSheet.getCell("C6").value.formula).toBe("C5+C4")
    expect(outputSheet.getCell("C6").value.result).toBeUndefined()
  })

  test("analyzes a template and suggests v3 period bindings", async () => {
    const templatePath = path.join(tempDir, "analyze_template.xlsx")
    await writeTemplateWorkbook(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath,
    })

    expect(analysis.detected_layout_type).toBe("rows")
    expect(analysis.confidence).toBeGreaterThan(0.5)
    expect(analysis.suggested_config_json.version).toBe("v3")
    expect(analysis.suggested_config_json.period_axis.labels.length).toBe(12)
    expect(analysis.suggested_config_json.bucket_bindings.length).toBeGreaterThan(0)
  })

  test("calibrates direct template confidence and detects cash-flow row directions semantically", async () => {
    const templatePath = path.join(tempDir, "direct_column_template.xlsx")
    await writeDirectColumnCashFlowWorkbook(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
    const buckets = new Map(
      analysis.suggested_config_json.bucket_bindings.map((bucket) => [bucket.bucket_key, bucket]),
    )

    expect(analysis.confidence).toBeLessThan(0.9)
    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8)
    expect(buckets.get("payments_to_suppliers")?.direction).toBe("outflow")
    expect(buckets.get("payroll_and_benefits")?.direction).toBe("outflow")
    expect(buckets.get("rent_and_facilities")?.direction).toBe("outflow")
    expect(buckets.get("sales_marketing")?.direction).toBe("outflow")
    expect(buckets.get("capital_expenditures")?.direction).toBe("outflow")
    expect(buckets.get("interest_paid")?.direction).toBe("outflow")
    expect(buckets.get("dividends_paid")?.direction).toBe("outflow")
    expect(buckets.get("debt_drawdown")?.direction).toBe("inflow")
    expect(buckets.get("equity_injection")?.direction).toBe("inflow")
  })

  test("auto-repairs malformed workbook metadata and overlapping merges during analysis", async () => {
    const templatePath = path.join(tempDir, "recoverable_malformed_template.xlsx")
    await writeRecoverableMalformedTemplate(templatePath)

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath,
    })

    expect(analysis.suggested_config_json.version).toBe("v3")
    expect(Array.isArray(analysis.suggested_config_json.period_axis.labels)).toBe(true)
    expect(analysis.suggested_config_json.period_axis.labels.length).toBeGreaterThan(0)
  })

  test("returns a validation error when the uploaded template is not a real xlsx workbook", async () => {
    const templatePath = path.join(tempDir, "invalid_template.xlsx")
    fs.writeFileSync(templatePath, "not a real workbook")

    await expect(
      CashFlowService.analyzeTemplateWorkbook({
        templatePath,
      }),
    ).rejects.toMatchObject({
      name: "CashFlowValidationError",
      message: "Cash flow template is not a valid .xlsx workbook or is corrupted. Re-export it as an Excel .xlsx file and try again.",
    })
  })

  test("analyzes PLC_Cash_Flow_Template_v2 as an indirect template with leaf row bindings", async () => {
    if (!fs.existsSync(INDIRECT_TEMPLATE_FIXTURE)) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })

    expect(analysis.detected_layout_type).toBe("columns")
    expect(analysis.needs_human_review).toBe(false)
    expect(analysis.issues).toEqual([])
    expect(analysis.suggested_config_json.statement_method).toBe("indirect")

    const config = analysis.suggested_config_json
    expect(getRowBinding(config, "net_income")?.cells?.[0]?.cell).toBe("B4")
    expect(getRowBinding(config, "capital_expenditures")?.cells?.[0]?.cell).toBe("B12")
    expect(getRowBinding(config, "asset_sales")?.cells?.[0]?.cell).toBe("B13")
    expect(getRowBinding(config, "capital_contributions")?.cells?.[0]?.cell).toBe("B15")
    expect(getRowBinding(config, "interest_paid")?.cells?.[0]?.cell).toBe("B18")
    expect(getRowBinding(config, "opening_cash")?.cells?.[0]?.cell).toBe("B23")

    expect(getRowBinding(config, "operating_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "investing_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "financing_cash_flow")?.role).toBe("summary")
    expect(getRowBinding(config, "net_change_in_cash")?.role).toBe("summary")
    expect(getRowBinding(config, "closing_cash")?.role).toBe("summary")
  })

  test("infers indirect v3 configs from row bindings even when statement_method is missing", () => {
    const periodLabels = [{ period_key: "m01", label: "M1", period_type: "monthly", month: 1 }]

    const normalized = CashFlowService.validateTemplateConfig({
      version: "v3",
      sheet_name: "Cash Flow Statement",
      layout_type: "columns",
      period_granularity: "monthly",
      period_axis: {
        orientation: "column",
        labels: periodLabels,
        period_bindings: [{ period_key: "m01", label: "M1", cell: "B3" }],
      },
      period_resolution_rules: { custom_periods: [] },
      opening_binding: { cells: [{ period_key: "m01", label: "M1", cell: "B23" }] },
      closing_binding: { cells: [{ period_key: "m01", label: "M1", cell: "B24" }] },
      bucket_bindings: [],
      row_bindings: [
        { semantic_key: "net_income", label: "Net Income", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B4" }] },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations", role: "summary", cells: [{ period_key: "m01", label: "M1", cell: "B10" }] },
        { semantic_key: "capital_contributions", label: "Capital Contributions", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B15" }] },
        { semantic_key: "opening_cash", label: "Cash at Beginning", role: "input", cells: [{ period_key: "m01", label: "M1", cell: "B23" }] },
        { semantic_key: "closing_cash", label: "Cash at End", role: "summary", cells: [{ period_key: "m01", label: "M1", cell: "B24" }] },
      ],
      writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
      mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
    })

    expect(normalized.statement_method).toBe("indirect")
    expect(normalized.bucket_bindings).toEqual([])
    expect(normalized.row_bindings.map((binding) => binding.semantic_key)).toContain("capital_contributions")
  })

  test("treats configs with row bindings as v3 instead of falling back to legacy bucket validation", () => {
    expect(() =>
      CashFlowService.validateTemplateConfig({
        sheet_name: "Cash Flow Statement",
        layout_type: "columns",
        row_bindings: [],
      }),
    ).toThrow("Template config_json.period_axis.orientation must be row or column")
  })

  test("treats M1..M12 period labels as monthly instead of custom", async () => {
    const templatePath = path.join(tempDir, "analyze_template_m_labels.xlsx")
    await writeTemplateWorkbook(
      templatePath,
      "Cash Flow",
      ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"],
    )

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath,
    })

    expect(analysis.suggested_config_json.period_granularity).toBe("monthly")
    expect(analysis.required_anchors).not.toContain("period_ranges")
    expect(
      analysis.suggested_config_json.period_axis.labels.every(
        (label) => label.period_type === "monthly" && Number.isInteger(label.month),
      ),
    ).toBe(true)
  })

  test("rejects v3 config when target sheet does not exist in workbook", async () => {
    const templatePath = path.join(tempDir, "template_missing_sheet.xlsx")
    await writeTemplateWorkbook(templatePath, "Template Layout")

    await expect(
      CashFlowService.ensureV3TemplateConfig({
        templatePath,
        templateConfig: {
          version: "v3",
          sheet_name: "Cash Flow",
          layout_type: "freeform",
          period_granularity: "custom",
          period_axis: {
            orientation: "row",
            labels: [{ period_key: "period_1", label: "Period 1", period_type: "custom" }],
            period_bindings: [{ period_key: "period_1", label: "Period 1", cell: "A1" }],
          },
          period_resolution_rules: {
            custom_periods: [{ period_key: "period_1", date_start: "2025-01-01", date_end: "2025-01-01" }],
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
          writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
          mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
        },
      }),
    ).rejects.toThrow('Template sheet "Cash Flow" not found')
  })

  test("auto-creates mappings with confidence metadata", () => {
    const buckets = [
      {
        bucket_key: "sales_inflow",
        label: "Sales Inflow",
        direction: "inflow",
        fallback: false,
        rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
      },
      {
        bucket_key: "other_inflow",
        label: "Other Inflow",
        direction: "inflow",
        fallback: true,
        rules: [],
      },
      {
        bucket_key: "other_outflow",
        label: "Other Outflows",
        direction: "outflow",
        fallback: true,
        rules: [],
      },
    ]

    const movements = [
      { account_name: "Accounts Receivable", date: new Date("2025-01-10"), amount: 100 },
      { account_name: "Platform Revenue", date: new Date("2025-01-12"), amount: 55 },
      { account_name: "Office Expense", date: new Date("2025-01-13"), amount: -30 },
    ]

    const mapped = CashFlowService.mapMovementsToBuckets(movements, buckets, {
      mappingPolicy: {
        auto_create: true,
        high_confidence_threshold: 0.7,
        low_confidence_threshold: 0.35,
      },
      learnedMappings: [],
    })

    expect(mapped.unmapped).toHaveLength(0)
    expect(mapped.autoCreatedMappings.length).toBeGreaterThan(0)
    expect(mapped.finalBucketAssignments.length).toBeGreaterThan(0)
    expect(mapped.lowConfidenceMappings.length).toBeGreaterThan(0)
  })

  test("classifies indirect financing semantics and preserves outflows", () => {
    const { classifyIndirectCashSemanticKey, mapIndirectCashMovementsToRows } = CashFlowService.__test

    expect(classifyIndirectCashSemanticKey("Interest Expense", "outflow")).toBe("interest_paid")
    expect(classifyIndirectCashSemanticKey("Interest Expense", "inflow")).toBeNull()
    expect(classifyIndirectCashSemanticKey("Notes Payable", "inflow")).toBe("debt_issued")
    expect(classifyIndirectCashSemanticKey("Notes Payable", "outflow")).toBe("debt_repaid")
    expect(classifyIndirectCashSemanticKey("Owner Capital", "inflow")).toBe("capital_contributions")
    expect(classifyIndirectCashSemanticKey("Owner Drawings", "outflow")).toBe("dividends_paid")
    expect(classifyIndirectCashSemanticKey("Member Funding", "inflow")).toBe("capital_contributions")
    expect(classifyIndirectCashSemanticKey("Loan Proceeds", "inflow")).toBe("debt_issued")
    expect(classifyIndirectCashSemanticKey("Asset Sale Proceeds", "inflow")).toBe("asset_sales")

    const mapped = mapIndirectCashMovementsToRows(
      [
        { account_name: "Notes Payable", date: new Date("2026-01-10"), amount: -2500 },
        { account_name: "Interest Expense", date: new Date("2026-01-11"), amount: -150 },
        { account_name: "Owner Capital", date: new Date("2026-01-12"), amount: 5000 },
        { account_name: "Owner Drawings", date: new Date("2026-01-13"), amount: -400 },
      ],
      [
        { semantic_key: "debt_repaid", label: "Debt Repaid" },
        { semantic_key: "interest_paid", label: "Interest Paid" },
        { semantic_key: "capital_contributions", label: "Capital Contributions" },
        { semantic_key: "dividends_paid", label: "Dividends Paid" },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations" },
      ],
    )

    expect(mapped.unmapped).toHaveLength(0)
    expect(mapped.mappedMovements.map((movement) => movement.bucket_key)).toEqual([
      "debt_repaid",
      "interest_paid",
      "capital_contributions",
      "dividends_paid",
    ])
  })

  test("uses learned mappings for indirect movement classification when available", () => {
    const { mapIndirectCashMovementsToRows } = CashFlowService.__test

    const mapped = mapIndirectCashMovementsToRows(
      [{ account_name: "Member Contributions", date: new Date("2026-01-10"), amount: 5000 }],
      [
        { semantic_key: "capital_contributions", label: "Capital Contributions" },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations" },
      ],
      {
        learnedMappings: [
          {
            normalized_account: "member contributions",
            direction: "inflow",
            bucket_key: "capital_contributions",
            confidence: 0.91,
            source: "llm_assisted",
            status: "suggested",
          },
        ],
      },
    )

    expect(mapped.unmapped).toHaveLength(0)
    expect(mapped.mappedMovements[0]).toEqual(
      expect.objectContaining({
        bucket_key: "capital_contributions",
        mapping_source: "llm_assisted",
        grounding_status: "suggested",
      }),
    )
  })

  test("repairs indirect row bindings from profile evidence when account names are weak", () => {
    const { buildRuntimeAccountProfile, mapIndirectCashMovementsToRows } = CashFlowService.__test
    const movements = [
      {
        account_name: "Funding Clearing",
        date: new Date("2026-01-10"),
        je_no: "JE-1",
        description: "Member capital contribution received",
        amount: 5000,
      },
    ]
    const accountProfile = buildRuntimeAccountProfile({
      trialBalance: {
        cashAccountName: "Cash",
        rows: [
          { account: "Cash", endingDebit: 5000, endingCredit: 0, endingBalance: 5000 },
          { account: "Funding Clearing", endingDebit: 0, endingCredit: 5000, endingBalance: -5000 },
        ],
      },
      generalLedger: {
        rows: movements.map((movement) => ({
          account_name: movement.account_name,
          date: movement.date,
          je_no: movement.je_no,
          description: movement.description,
        })),
        movements,
      },
    })

    const mapped = mapIndirectCashMovementsToRows(
      movements,
      [
        { semantic_key: "capital_contributions", label: "Capital Contributions", role: "input" },
        { semantic_key: "operating_cash_flow", label: "Cash Flow from Operations", role: "summary" },
      ],
      {
        accountProfile,
        mappingPolicy: { auto_create: true },
      },
    )

    expect(mapped.mappedMovements[0]).toEqual(
      expect.objectContaining({
        bucket_key: "capital_contributions",
        mapping_source: "profile_auto",
        grounding_status: "suggested",
      }),
    )
    expect(mapped.autoCreatedMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized_account: "funding clearing",
          bucket_key: "capital_contributions",
          status: "suggested",
          account_profile: expect.objectContaining({
            sample_descriptions: ["Member capital contribution received"],
          }),
        }),
      ]),
    )
  })

  test("report generation includes runtime account profile summary in the mapping response", async () => {
    const templatePath = path.join(tempDir, "profile_summary_template.xlsx")
    const tbPath = path.join(tempDir, "profile_summary_tb.xlsx")
    const glPath = path.join(tempDir, "profile_summary_gl.xlsx")
    const outputPath = path.join(tempDir, "profile_summary_output.xlsx")

    await writeTemplateWorkbook(templatePath)
    await writeTrialBalanceWorkbook(tbPath, [
      { account: "Cash", asOfDate: "2026-01-31", endingDebit: 100 },
      { account: "Accounts Receivable", asOfDate: "2026-01-31", endingCredit: 100 },
    ])
    await writeGeneralLedgerWorkbook(glPath, [
      {
        account: "Cash",
        date: "2026-01-10",
        jeNo: "JE-1",
        debit: 100,
        credit: 0,
        description: "Customer collection",
      },
      {
        account: "Accounts Receivable",
        date: "2026-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 100,
        description: "Customer invoice paid",
      },
    ])

    const result = await CashFlowService.generateCashFlowReport({
      templatePath,
      templateConfig: {
        sheet_name: "Cash Flow",
        header_row: 1,
        month_column_header: "Month",
        opening_column_header: "Opening Balance",
        closing_column_header: "Closing Balance",
        buckets: [
          {
            bucket_key: "sales_inflow",
            label: "Sales Inflow",
            direction: "inflow",
            column_header: "Sales Inflow",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
          },
          {
            bucket_key: "other_inflow",
            label: "Other Inflow",
            direction: "inflow",
            column_header: "Other Inflow",
            fallback: true,
            rules: [],
          },
          {
            bucket_key: "other_outflow",
            label: "Other Outflows",
            direction: "outflow",
            column_header: "Other Outflows",
            fallback: true,
            rules: [],
          },
        ],
      },
      tbFilePath: tbPath,
      glFilePath: glPath,
      fiscalYear: 2026,
      outputFilePath: outputPath,
    })

    expect(result.mapping.account_profile_summary).toEqual(
      expect.objectContaining({
        profiled_accounts: 1,
        movement_accounts: 1,
        mapped_accounts: 1,
      }),
    )
    expect(result.preview.mapping_summary.account_profile).toEqual(result.mapping.account_profile_summary)
  })

  test("deterministic verification against provided sample files", async () => {
    const sampleTB = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_GLC_Services.xlsx"
    const sampleGL = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_GLC_Services.xlsx"
    const sampleTemplate = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\simple_cash_flow_template.xlsx"

    if (!fs.existsSync(sampleTB) || !fs.existsSync(sampleGL) || !fs.existsSync(sampleTemplate)) {
      expect(true).toBe(true)
      return
    }

    const outputPath = path.join(tempDir, "sample_output.xlsx")
    const result = await CashFlowService.generateCashFlowReport({
      templatePath: sampleTemplate,
      templateConfig: {
        sheet_name: "Cash Flow",
        header_row: 1,
        month_column_header: "Month",
        opening_column_header: "Opening Balance",
        closing_column_header: "Closing Balance",
        buckets: [
          {
            bucket_key: "sales_inflow",
            label: "Sales Inflow",
            direction: "inflow",
            column_header: "Sales Inflow",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Accounts Receivable", priority: 1 }],
          },
          {
            bucket_key: "other_inflow",
            label: "Other Inflow",
            direction: "inflow",
            column_header: "Other Inflow",
            fallback: true,
            rules: [],
          },
          {
            bucket_key: "rent_outflow",
            label: "Rent",
            direction: "outflow",
            column_header: "Rent",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Rent Expense", priority: 1 }],
          },
          {
            bucket_key: "salaries_outflow",
            label: "Salaries",
            direction: "outflow",
            column_header: "Salaries",
            fallback: false,
            rules: [{ match_type: "exact", pattern: "Salaries Expense", priority: 1 }],
          },
          {
            bucket_key: "other_outflow",
            label: "Other Outflows",
            direction: "outflow",
            column_header: "Other Outflows",
            fallback: true,
            rules: [],
          },
        ],
      },
      tbFilePath: sampleTB,
      glFilePath: sampleGL,
      fiscalYear: 2025,
      outputFilePath: outputPath,
    })

    expect(result.preview.monthly[5].closing_balance).toBe(228575)
    expect(result.preview.monthly[11].closing_balance).toBe(228575)
    expect(result.preview.totals.closing_balance_end).toBe(228575)
  })

  test("2026 indirect template regression matches TB cash and maps all movements", async () => {
    if (
      !fs.existsSync(INDIRECT_TEMPLATE_FIXTURE) ||
      !fs.existsSync(SAMPLE_2026_TB) ||
      !fs.existsSync(SAMPLE_2026_GL)
    ) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })
    const outputPath = path.join(tempDir, "indirect_2026_output.xlsx")

    const result = await CashFlowService.generateCashFlowReport({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
      templateConfig: analysis.suggested_config_json,
      tbFilePath: SAMPLE_2026_TB,
      glFilePath: SAMPLE_2026_GL,
      dateStart: "2026-01-01",
      dateEnd: "2026-12-31",
      outputFilePath: outputPath,
    })

    expect(result.warnings).toEqual([])
    expect(result.preview.mapping_summary.total_cash_movements).toBe(68)
    expect(result.preview.mapping_summary.mapped_cash_movements).toBe(68)
    expect(result.preview.mapping_summary.low_confidence_mappings).toBe(0)
    expect(result.preview.monthly[5].closing_balance).toBe(228575)
    expect(result.preview.monthly[6].closing_balance).toBe(228575)
    expect(result.preview.monthly[11].closing_balance).toBe(228575)
    expect(result.preview.monthly.slice(6).every((period) => period.closing_balance === 228575)).toBe(true)
    expect(result.preview.totals.closing_balance_end).toBe(228575)
  })

  test("runtime mapping assistance can reclassify novel indirect financing accounts without changing deterministic write logic", async () => {
    if (!fs.existsSync(INDIRECT_TEMPLATE_FIXTURE)) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })
    const previousRuntimeEnabled = appConfig.mappingAssistance.runtimeEnabled
    appConfig.mappingAssistance.runtimeEnabled = true
    const tbPath = path.join(tempDir, "runtime_tb.xlsx")
    const glPath = path.join(tempDir, "runtime_gl.xlsx")
    const outputPath = path.join(tempDir, "runtime_indirect_output.xlsx")

    await writeTrialBalanceWorkbook(tbPath, [{ account: "Cash", asOfDate: "2026-01-31", endingDebit: 1000 }])
    await writeGeneralLedgerWorkbook(glPath, [
      {
        account: "Cash",
        date: "2026-01-10",
        jeNo: "JE-1",
        debit: 1000,
        credit: 0,
        entrySide: "DR",
        description: "Investor cash receipt for financing review",
      },
      {
        account: "Financing Intake",
        date: "2026-01-10",
        jeNo: "JE-1",
        debit: 0,
        credit: 1000,
        entrySide: "CR",
        description: "Investor cash receipt for financing review",
      },
    ])

    const runtimeMappingAssistant = {
      assistMappings: jest.fn().mockResolvedValue({
        acceptedMappings: [
          {
            account_key: "financing intake:inflow",
            account_name: "Financing Intake",
            normalized_account: "financing intake",
            direction: "inflow",
            bucket_key: "capital_contributions",
            confidence: 0.92,
            source: "llm_assisted",
            status: "suggested",
            reasoning: "capital contribution wording is explicit",
            evidence: ["contains contributions"],
            previous_bucket_key: "operating_cash_flow",
            changed: true,
          },
        ],
        notes: ["capital activity detected"],
        summary: {
          enabled: true,
          statementMethod: "indirect",
          attempted: true,
          acceptedCount: 1,
          rejectedCount: 0,
          failed: false,
          model: "mock-llm",
        },
      }),
    }

    let result = null
    try {
      result = await CashFlowService.generateCashFlowReport({
        templatePath: INDIRECT_TEMPLATE_FIXTURE,
        templateConfig: analysis.suggested_config_json,
        tbFilePath: tbPath,
        glFilePath: glPath,
        dateStart: "2026-01-01",
        dateEnd: "2026-01-31",
        outputFilePath: outputPath,
        runtimeMappingAssistant,
      })
    } finally {
      appConfig.mappingAssistance.runtimeEnabled = previousRuntimeEnabled
    }

    expect(runtimeMappingAssistant.assistMappings).toHaveBeenCalledTimes(1)
    expect(result.preview.monthly[0].buckets.capital_contributions).toBe(1000)
    expect(result.preview.monthly[0].buckets.financing_cash_flow).toBe(1000)
    expect(result.preview.monthly[0].buckets.operating_cash_flow).toBe(0)
    expect(result.mapping.final_bucket_assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized_account: "financing intake",
          bucket_key: "capital_contributions",
          source: "llm_assisted",
          grounding_status: "suggested",
        }),
      ]),
    )
    expect(result.mapping.assistance_summary.acceptedCount).toBe(1)
  })

  test("enabling runtime mapping assistance does not disturb the stable 2026 indirect regression when no ambiguous specialized accounts are present", async () => {
    if (
      !fs.existsSync(INDIRECT_TEMPLATE_FIXTURE) ||
      !fs.existsSync(SAMPLE_2026_TB) ||
      !fs.existsSync(SAMPLE_2026_GL)
    ) {
      expect(true).toBe(true)
      return
    }

    const analysis = await CashFlowService.analyzeTemplateWorkbook({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
    })
    const outputPath = path.join(tempDir, "indirect_2026_runtime_output.xlsx")
    const runtimeMappingAssistant = {
      assistMappings: jest.fn(),
    }

    const result = await CashFlowService.generateCashFlowReport({
      templatePath: INDIRECT_TEMPLATE_FIXTURE,
      templateConfig: analysis.suggested_config_json,
      tbFilePath: SAMPLE_2026_TB,
      glFilePath: SAMPLE_2026_GL,
      dateStart: "2026-01-01",
      dateEnd: "2026-12-31",
      outputFilePath: outputPath,
      useRuntimeMappingAssistance: true,
      runtimeMappingAssistant,
    })

    expect(runtimeMappingAssistant.assistMappings).not.toHaveBeenCalled()
    expect(result.warnings).toEqual([])
    expect(result.preview.monthly[5].closing_balance).toBe(228575)
    expect(result.preview.monthly.slice(6).every((period) => period.closing_balance === 228575)).toBe(true)
    expect(result.preview.mapping_summary.assistance.attempted).toBe(false)
  })
})
