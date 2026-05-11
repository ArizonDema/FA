"use strict"

const fs = require("fs")
const path = require("path")
const ExcelJS = require("exceljs")

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

const runLlm = parseBoolean(process.env.CASHFLOW_MAPPING_EVAL_RUN_LLM, true)
if (process.env.MAPPING_LLM_RUNTIME_ENABLED === undefined) {
  process.env.MAPPING_LLM_RUNTIME_ENABLED = runLlm ? "true" : "false"
}
if (process.env.MAPPING_LLM_RUNTIME_SCOPE === undefined) {
  process.env.MAPPING_LLM_RUNTIME_SCOPE = "ambiguous_novel"
}
if (process.env.MAPPING_LLM_RUNTIME_MIN_ACCEPTED_SCORE === undefined) {
  process.env.MAPPING_LLM_RUNTIME_MIN_ACCEPTED_SCORE = "0.70"
}

const CashFlowService = require("../src/services/cashFlow.service")
const appConfig = require("../src/config/app")

const ROOT_DIR = path.join(__dirname, "..")
const OUTPUT_ROOT = path.join(ROOT_DIR, "uploads", "cash-flow", "mapping-evaluations")
const PERIOD_KEY = "fy2026"
const PERIOD_LABEL = "FY 2026"
const DATE_START = "2026-01-01"
const DATE_END = "2026-12-31"
const COMPANY = "Adversarial Mapping Co"

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function safeName(value) {
  return String(value || "scenario")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function excelDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

async function writeWorkbook(filePath, configure) {
  const workbook = new ExcelJS.Workbook()
  configure(workbook)
  await workbook.xlsx.writeFile(filePath)
}

async function writeTemplateWorkbook(filePath, scenario) {
  await writeWorkbook(filePath, (workbook) => {
    const sheet = workbook.addWorksheet("Cash Flow")
    sheet.getCell("A1").value = "Cash Flow Category"
    sheet.getCell("B1").value = PERIOD_LABEL
    scenario.templateRows.forEach((bucket, index) => {
      const rowIndex = index + 2
      sheet.getCell(`A${rowIndex}`).value = bucket.label
      sheet.getCell(`B${rowIndex}`).value = 0
    })
    const openingRow = scenario.templateRows.length + 3
    const closingRow = scenario.templateRows.length + 4
    sheet.getCell(`A${openingRow}`).value = "Opening cash"
    sheet.getCell(`B${openingRow}`).value = 0
    sheet.getCell(`A${closingRow}`).value = "Closing cash"
    sheet.getCell(`B${closingRow}`).value = 0
    sheet.columns = [{ width: 34 }, { width: 16 }]
  })
}

function buildTemplateConfig(scenario) {
  const openingRow = scenario.templateRows.length + 3
  const closingRow = scenario.templateRows.length + 4
  return {
    version: "v3",
    statement_method: "direct",
    sheet_name: "Cash Flow",
    layout_type: "rows",
    period_granularity: "yearly",
    period_axis: {
      orientation: "column",
      labels: [
        {
          period_key: PERIOD_KEY,
          label: PERIOD_LABEL,
          period_type: "yearly",
          year: 2026,
        },
      ],
      period_bindings: [{ period_key: PERIOD_KEY, label: PERIOD_LABEL, cell: "B1" }],
    },
    period_resolution_rules: { custom_periods: [] },
    opening_binding: { cells: [{ period_key: PERIOD_KEY, label: PERIOD_LABEL, cell: `B${openingRow}` }] },
    closing_binding: { cells: [{ period_key: PERIOD_KEY, label: PERIOD_LABEL, cell: `B${closingRow}` }] },
    bucket_bindings: scenario.templateRows.map((bucket, index) => ({
      bucket_key: bucket.bucket_key,
      label: bucket.label,
      direction: bucket.direction,
      semantic_key: bucket.semantic_key,
      semantic_confidence: bucket.semantic_confidence || 0.92,
      semantic_source: bucket.semantic_source || "llm_semantic",
      semantic_evidence: bucket.semantic_evidence || [bucket.label],
      fallback: Boolean(bucket.fallback),
      rules: [],
      cells: [{ period_key: PERIOD_KEY, label: PERIOD_LABEL, cell: `B${index + 2}` }],
    })),
    writer_policy: { preserve_formulas: true, full_recalc_on_open: true },
    mapping_policy: { auto_create: true, high_confidence_threshold: 0.7, low_confidence_threshold: 0.35 },
  }
}

function buildTrialBalanceRows(scenario) {
  const movementByAccount = new Map()
  scenario.movements.forEach((movement) => {
    const key = movement.account
    movementByAccount.set(key, roundCurrency((movementByAccount.get(key) || 0) + movement.amount))
  })

  const rows = [
    {
      account: "Operating Cash",
      endingDebit: scenario.openingCash + scenario.expected.net_cash_flow,
      endingCredit: 0,
    },
  ]

  movementByAccount.forEach((netAmount, account) => {
    const tbClass = scenario.tbClasses?.[account] || "expense"
    if (tbClass === "liability" || tbClass === "equity" || netAmount > 0) {
      rows.push({ account, endingDebit: 0, endingCredit: Math.abs(netAmount) })
    } else {
      rows.push({ account, endingDebit: Math.abs(netAmount), endingCredit: 0 })
    }
  })

  ;(scenario.tbOnlyAccounts || []).forEach((account) => {
    rows.push({
      account: account.account,
      endingDebit: Number(account.debit || 0),
      endingCredit: Number(account.credit || 0),
    })
  })

  return rows
}

async function writeTrialBalanceWorkbook(filePath, scenario) {
  const rows = buildTrialBalanceRows(scenario)
  await writeWorkbook(filePath, (workbook) => {
    const sheet = workbook.addWorksheet("Trial Balance")
    sheet.addRow(["Company", "As of Date", "Account", "Ending Debit", "Ending Credit"])
    rows.forEach((row) => {
      sheet.addRow([COMPANY, excelDate(DATE_END), row.account, row.endingDebit, row.endingCredit])
    })
    sheet.columns = [{ width: 26 }, { width: 14 }, { width: 30 }, { width: 16 }, { width: 16 }]
  })
}

function addGlEntry(sheet, jeNo, movement) {
  const date = excelDate(movement.date || "2026-06-30")
  const description = movement.description
  const amount = Math.abs(Number(movement.amount || 0))
  if (movement.amount >= 0) {
    sheet.addRow([COMPANY, "Operating Cash", date, jeNo, description, "Debit", amount, 0])
    sheet.addRow([COMPANY, movement.account, date, jeNo, description, "Credit", 0, amount])
  } else {
    sheet.addRow([COMPANY, "Operating Cash", date, jeNo, description, "Credit", 0, amount])
    sheet.addRow([COMPANY, movement.account, date, jeNo, description, "Debit", amount, 0])
  }
}

async function writeGeneralLedgerWorkbook(filePath, scenario) {
  await writeWorkbook(filePath, (workbook) => {
    const sheet = workbook.addWorksheet("General Ledger")
    sheet.addRow(["Company", "Ledger Account", "Date", "JE No", "Description", "Entry Side", "Debit", "Credit"])
    scenario.movements.forEach((movement, index) => addGlEntry(sheet, `EVAL-${index + 1}`, movement))
    sheet.columns = [
      { width: 26 },
      { width: 30 },
      { width: 14 },
      { width: 12 },
      { width: 58 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
    ]
  })
}

function buildExpected(movements, openingCash) {
  const bucketTotals = {}
  let inflows = 0
  let outflows = 0
  movements.forEach((movement) => {
    bucketTotals[movement.expectedBucket] = roundCurrency(
      (bucketTotals[movement.expectedBucket] || 0) + Math.abs(movement.amount),
    )
    if (movement.amount >= 0) inflows = roundCurrency(inflows + movement.amount)
    else outflows = roundCurrency(outflows + Math.abs(movement.amount))
  })
  const netCashFlow = roundCurrency(inflows - outflows)
  return {
    bucket_totals: bucketTotals,
    total_inflows: inflows,
    total_outflows: outflows,
    net_cash_flow: netCashFlow,
    opening_balance_start: openingCash,
    closing_balance_end: roundCurrency(openingCash + netCashFlow),
  }
}

const scenarios = [
  (() => {
    const openingCash = 10000
    const movements = [
      {
        account: "Clearing A",
        amount: 120000,
        description: "Customer invoice collections deposited from enterprise buyers",
        expectedBucket: "buyer_money_in",
      },
      {
        account: "Spend Pod",
        amount: -22000,
        description: "Growth campaign media buy and demand generation spend",
        expectedBucket: "growth_spend",
      },
      {
        account: "Founder Bridge",
        amount: 50000,
        description: "Founder funding contribution received from members",
        expectedBucket: "founder_funding",
      },
      {
        account: "Asset Build Ledger",
        amount: -30000,
        description: "Purchase of equipment and leasehold improvements for new site",
        expectedBucket: "asset_buildout",
      },
      {
        account: "Note Channel",
        amount: -15000,
        description: "Principal repayment on bank term loan",
        expectedBucket: "debt_service_principal",
      },
      {
        account: "Ops Payables",
        amount: -40000,
        description: "Vendor settlement and supplier invoices paid",
        expectedBucket: "partner_operating_payouts",
      },
    ]
    return {
      name: "renamed_accounts_and_template_rows",
      openingCash,
      movements,
      expected: buildExpected(movements, openingCash),
      tbClasses: {
        "Founder Bridge": "equity",
        "Note Channel": "liability",
        "Asset Build Ledger": "fixed_asset",
      },
      tbOnlyAccounts: [{ account: "Dormant Asset Bucket", debit: 7500, credit: 0 }],
      templateRows: [
        { bucket_key: "buyer_money_in", label: "Receipts From Buyers", direction: "inflow", semantic_key: "customer_receipts" },
        { bucket_key: "growth_spend", label: "Growth Spend", direction: "outflow", semantic_key: "sales_marketing" },
        { bucket_key: "founder_funding", label: "Founder Funding", direction: "inflow", semantic_key: "equity_injection" },
        { bucket_key: "asset_buildout", label: "Asset Buildout", direction: "outflow", semantic_key: "capital_expenditures" },
        { bucket_key: "debt_service_principal", label: "Debt Service Principal", direction: "outflow", semantic_key: "debt_repayment" },
        { bucket_key: "partner_operating_payouts", label: "Partner Operating Payouts", direction: "outflow", semantic_key: "supplier_payments" },
      ],
      expectLlmAttempt: runLlm,
    }
  })(),
  (() => {
    const openingCash = 25000
    const movements = [
      {
        account: "Facility",
        amount: 80000,
        description: "Credit facility drawdown proceeds received",
        expectedBucket: "capital_source_cash",
      },
      {
        account: "Facility",
        amount: -20000,
        description: "Principal repayment against revolving credit facility",
        expectedBucket: "debt_return_cash",
      },
      {
        account: "Cost of Capital",
        amount: -5000,
        description: "Finance charges and interest paid to lender",
        expectedBucket: "financing_costs",
      },
      {
        account: "Owner Payout Lane",
        amount: -12000,
        description: "Member distributions paid to owners",
        expectedBucket: "owner_payouts",
      },
      {
        account: "Generic Expense 72",
        amount: -18000,
        description: "Payroll run for hourly team wages and benefits",
        expectedBucket: "people_out",
      },
    ]
    return {
      name: "split_financing_and_generic_accounts",
      openingCash,
      movements,
      expected: buildExpected(movements, openingCash),
      tbClasses: {
        Facility: "liability",
        "Owner Payout Lane": "equity",
      },
      tbOnlyAccounts: [{ account: "Loan Interest Accrual", debit: 0, credit: 2400 }],
      templateRows: [
        { bucket_key: "capital_source_cash", label: "Capital Source Cash", direction: "inflow", semantic_key: "debt_drawdown" },
        { bucket_key: "debt_return_cash", label: "Debt Return Cash", direction: "outflow", semantic_key: "debt_repayment" },
        { bucket_key: "financing_costs", label: "Cost of Capital", direction: "outflow", semantic_key: "interest_paid" },
        { bucket_key: "owner_payouts", label: "Owner Payouts", direction: "outflow", semantic_key: "dividends_distributions" },
        { bucket_key: "people_out", label: "People Out", direction: "outflow", semantic_key: "payroll" },
      ],
      expectLlmAttempt: runLlm,
    }
  })(),
]

function compareNumber(actual, expected, label, failures) {
  if (Math.abs(Number(actual || 0) - Number(expected || 0)) > 0.01) {
    failures.push(`${label}: expected ${expected}, got ${actual}`)
  }
}

function validateScenarioResult({ scenario, result }) {
  const failures = []
  const totals = result.preview?.totals || {}
  compareNumber(totals.total_inflows, scenario.expected.total_inflows, "total_inflows", failures)
  compareNumber(totals.total_outflows, scenario.expected.total_outflows, "total_outflows", failures)
  compareNumber(totals.net_cash_flow, scenario.expected.net_cash_flow, "net_cash_flow", failures)
  compareNumber(totals.closing_balance_end, scenario.expected.closing_balance_end, "closing_balance_end", failures)

  Object.entries(scenario.expected.bucket_totals).forEach(([bucketKey, expectedTotal]) => {
    compareNumber(totals.bucket_totals?.[bucketKey], expectedTotal, `bucket_totals.${bucketKey}`, failures)
  })

  const assignments = new Map(
    (result.mapping?.final_bucket_assignments || []).map((assignment) => [
      `${normalizeText(assignment.normalized_account || assignment.account_name)}:${assignment.direction}`,
      assignment,
    ]),
  )

  scenario.movements.forEach((movement) => {
    const key = `${normalizeText(movement.account)}:${movement.amount >= 0 ? "inflow" : "outflow"}`
    const assignment = assignments.get(key)
    if (!assignment) {
      failures.push(`missing assignment for ${key}`)
      return
    }
    if (assignment.bucket_key !== movement.expectedBucket) {
      failures.push(
        `wrong assignment for ${key}: expected ${movement.expectedBucket}, got ${assignment.bucket_key} at confidence ${assignment.confidence}`,
      )
    }
    if (assignment.confidence >= 0.9 && assignment.bucket_key !== movement.expectedBucket) {
      failures.push(`unreviewed high-confidence contradiction for ${key}`)
    }
  })

  const allowedKeys = new Set(scenario.templateRows.map((row) => row.bucket_key))
  ;(result.mapping?.auto_mappings_created || []).forEach((mapping) => {
    if (!allowedKeys.has(mapping.bucket_key)) {
      failures.push(`schema-invalid auto mapping target: ${mapping.bucket_key}`)
    }
    if (mapping.status && mapping.status !== "suggested") {
      failures.push(`auto mapping was not persisted as suggested in result metadata: ${mapping.normalized_account}`)
    }
  })

  const assistance = result.mapping?.assistance_summary || {}
  if (scenario.expectLlmAttempt && assistance.failed) {
    failures.push(`runtime LLM failed: ${assistance.failureReason || assistance.failureCode || "unknown"}`)
  }
  if (scenario.expectLlmAttempt && assistance.enabled && Number(assistance.candidatesConsidered || 0) > 0 && !assistance.attempted) {
    failures.push("runtime LLM had candidates but was not attempted")
  }

  return failures
}

async function runScenario(scenario, evalDir) {
  const scenarioDir = path.join(evalDir, safeName(scenario.name))
  ensureDir(scenarioDir)
  const templatePath = path.join(scenarioDir, "template.xlsx")
  const tbFilePath = path.join(scenarioDir, "trial_balance.xlsx")
  const glFilePath = path.join(scenarioDir, "general_ledger.xlsx")
  const outputFilePath = path.join(scenarioDir, "cash_flow_output.xlsx")

  await writeTemplateWorkbook(templatePath, scenario)
  await writeTrialBalanceWorkbook(tbFilePath, scenario)
  await writeGeneralLedgerWorkbook(glFilePath, scenario)

  const startedAt = Date.now()
  const result = await CashFlowService.generateCashFlowReport({
    templatePath,
    templateConfig: buildTemplateConfig(scenario),
    tbFilePath,
    glFilePath,
    dateStart: DATE_START,
    dateEnd: DATE_END,
    outputFilePath,
    learnedMappings: [],
    useRuntimeMappingAssistance: runLlm,
  })
  const latencyMs = Date.now() - startedAt
  const failures = validateScenarioResult({ scenario, result })

  return {
    name: scenario.name,
    status: failures.length ? "failed" : "passed",
    failures,
    latency_ms: latencyMs,
    expected: scenario.expected,
    actual_totals: result.preview?.totals || null,
    final_assignments: result.mapping?.final_bucket_assignments || [],
    auto_mappings_created: result.mapping?.auto_mappings_created || [],
    low_confidence_mappings: result.mapping?.low_confidence_mappings || [],
    assistance_summary: result.mapping?.assistance_summary || null,
    account_profile_summary: result.mapping?.account_profile_summary || null,
    warnings: result.warnings || [],
    files: {
      template: templatePath,
      trial_balance: tbFilePath,
      general_ledger: glFilePath,
      output: outputFilePath,
    },
  }
}

function writeDiagnostics(evalDir, diagnostics) {
  const jsonPath = path.join(evalDir, "diagnostics.json")
  const markdownPath = path.join(evalDir, "diagnostics.md")
  fs.writeFileSync(jsonPath, JSON.stringify(diagnostics, null, 2))

  const lines = [
    "# Cash-Flow Mapping Evaluation",
    "",
    `- Status: ${diagnostics.status}`,
    `- Model: ${diagnostics.model || "n/a"}`,
    `- Runtime LLM enabled: ${diagnostics.runtime_llm_enabled}`,
    `- Prompt version: ${diagnostics.runtime_prompt_version || "n/a"}`,
    `- Output directory: ${evalDir}`,
    "",
  ]
  diagnostics.scenarios.forEach((scenario) => {
    lines.push(`## ${scenario.name}`)
    lines.push("")
    lines.push(`- Status: ${scenario.status}`)
    lines.push(`- Latency: ${scenario.latency_ms}ms`)
    lines.push(`- LLM attempted: ${Boolean(scenario.assistance_summary?.attempted)}`)
    lines.push(`- Accepted: ${scenario.assistance_summary?.acceptedCount || 0}`)
    lines.push(`- Rejected: ${scenario.assistance_summary?.rejectedCount || 0}`)
    if (scenario.failures.length) {
      lines.push("")
      lines.push("Failures:")
      scenario.failures.forEach((failure) => lines.push(`- ${failure}`))
    }
    lines.push("")
  })
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`)
  return { jsonPath, markdownPath }
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const evalDir = path.join(OUTPUT_ROOT, timestamp)
  ensureDir(evalDir)

  const scenarioResults = []
  for (const scenario of scenarios) {
    scenarioResults.push(await runScenario(scenario, evalDir))
  }

  const failed = scenarioResults.some((scenario) => scenario.failures.length)
  const diagnostics = {
    status: failed ? "failed" : "passed",
    generated_at: new Date().toISOString(),
    runtime_llm_enabled: runLlm,
    model: appConfig.mappingAssistance?.model || appConfig.ollama?.model || null,
    runtime_prompt_version: appConfig.mappingAssistance?.runtimePromptVersion || null,
    min_accepted_score: appConfig.mappingAssistance?.runtimeMinAcceptedScore || null,
    scenarios: scenarioResults,
  }
  const paths = writeDiagnostics(evalDir, diagnostics)

  console.log(`Cash-flow mapping evaluation ${diagnostics.status}`)
  console.log(`Diagnostics JSON: ${paths.jsonPath}`)
  console.log(`Diagnostics Markdown: ${paths.markdownPath}`)
  scenarioResults.forEach((scenario) => {
    console.log(`- ${scenario.name}: ${scenario.status} (${scenario.latency_ms}ms)`)
    scenario.failures.forEach((failure) => console.log(`  * ${failure}`))
  })

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error("Cash-flow mapping evaluation crashed")
  console.error(error)
  process.exit(1)
})
