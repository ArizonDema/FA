"use strict"

const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..", "..")
const CashFlowService = require(path.join(ROOT, "src/services/cashFlow.service"))
const CashFlowTemplateIngestionService = require(path.join(ROOT, "src/services/cashFlowTemplateIngestion.service"))
const { readWorkbookFromFile } = require(path.join(ROOT, "src/utils/excelWorkbook.util"))

const tbFilePath = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_2026.xlsx"
const glFilePath = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_2026.xlsx"
const dateStart = "2026-01-01"
const dateEnd = "2026-12-31"

const templateRoots = [
  path.join(ROOT, "outputs", "unbiased-cash-flow-template"),
  path.join(ROOT, "outputs", "bulletproof-template-agent-1"),
  path.join(ROOT, "outputs", "bulletproof-template-agent-2"),
  path.join(ROOT, "outputs", "bulletproof-template-agent-3"),
  path.join(ROOT, "outputs", "bulletproof-template-agent-4"),
  path.join(ROOT, "outputs", "bulletproof-template-agent-5"),
]

const EXPECTED_ASSIGNMENT_CONCEPTS = new Map([
  ["accounts receivable:inflow", "customer_receipts"],
  ["unearned revenue:inflow", "customer_receipts"],
  ["accounts payable:outflow", "supplier_payments"],
  ["salaries expense:outflow", "payroll"],
  ["rent expense:outflow", "rent_facilities"],
  ["marketing expense:outflow", "sales_marketing"],
  ["bank fees expense:outflow", "general_admin"],
  ["prepaid insurance:outflow", "general_admin"],
  ["travel expense:outflow", "general_admin"],
  ["utilities expense:outflow", "general_admin"],
  ["office equipment:outflow", "capital_expenditures"],
  ["notes payable:inflow", "debt_drawdown"],
  ["notes payable:outflow", "debt_repayment"],
  ["interest expense:outflow", "interest_paid"],
  ["owner capital:inflow", "equity_injection"],
  ["owner drawings:outflow", "dividends_distributions"],
])

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function normalizeDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function roundCurrency(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100) / 100
}

function numericCellValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object" && value.result !== undefined) return numericCellValue(value.result)
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function closeEnough(left, right) {
  return Math.abs(roundCurrency(left) - roundCurrency(right)) <= 0.01
}

function hasTimeoutMarker(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.some((item) => hasTimeoutMarker(item))
  if (typeof value !== "object") return false
  if (value.isTimeout === true || value.is_timeout === true) return true
  return Object.entries(value).some(([key, entry]) => {
    const normalizedKey = normalizeText(key).replace(/[_-]/g, "")
    if (
      typeof entry === "string" &&
      ["code", "errorcode", "failurecode", "reason", "errorreason", "failurereason", "message"].includes(normalizedKey) &&
      /timeout|timed out/i.test(entry)
    ) {
      return true
    }
    return hasTimeoutMarker(entry)
  })
}

function discoverTemplates() {
  const explicitTemplate = process.env.BULLETPROOF_TEMPLATE_PATH
  if (explicitTemplate) return [path.resolve(explicitTemplate)]
  return templateRoots
    .filter((folder) => fs.existsSync(folder))
    .flatMap((folder) =>
      fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.xlsx$/i.test(entry.name) && !/^~\$/.test(entry.name))
        .map((entry) => path.join(folder, entry.name)),
    )
    .sort((left, right) => left.localeCompare(right))
}

async function expectedGlTotals() {
  const trialBalance = await CashFlowService.parseTrialBalanceFile(tbFilePath)
  const generalLedger = await CashFlowService.parseGeneralLedgerFile(glFilePath, {
    cashAccountName: trialBalance.cashAccountName,
  })
  const start = normalizeDateOnly(dateStart)
  const end = normalizeDateOnly(dateEnd)
  const totals = { total_inflows: 0, total_outflows: 0, net_cash_flow: 0 }
  const byAccountDirection = new Map()
  generalLedger.movements.forEach((movement) => {
    const movementDate = normalizeDateOnly(movement.date)
    if (!movementDate || movementDate < start || movementDate > end) return
    const amount = Number(movement.amount || 0)
    const direction = amount >= 0 ? "inflow" : "outflow"
    const key = `${normalizeText(movement.account_name)}:${direction}`
    byAccountDirection.set(key, roundCurrency((byAccountDirection.get(key) || 0) + Math.abs(amount)))
    if (amount >= 0) totals.total_inflows = roundCurrency(totals.total_inflows + amount)
    else totals.total_outflows = roundCurrency(totals.total_outflows + Math.abs(amount))
    totals.net_cash_flow = roundCurrency(totals.net_cash_flow + amount)
  })
  return {
    totals,
    by_account_direction: Object.fromEntries(byAccountDirection),
  }
}

async function workbookBucketTotals({ outputFilePath, config }) {
  const workbook = await readWorkbookFromFile({
    filePath: outputFilePath,
    label: "generated bulletproof cash-flow output",
    ValidationErrorCtor: CashFlowService.CashFlowValidationError,
  })
  const worksheet = workbook.getWorksheet(config.sheet_name) || workbook.worksheets[0]
  const totals = {}
  ;(config.bucket_bindings || []).forEach((bucket) => {
    const signed = (bucket.cells || []).reduce((sum, cell) => sum + numericCellValue(worksheet.getCell(cell.cell).value), 0)
    totals[bucket.bucket_key] = roundCurrency(bucket.direction === "outflow" ? Math.abs(signed) : signed)
  })
  return totals
}

function validateExpectedAssignmentConcepts(assignments = []) {
  const actual = new Map(
    assignments.map((assignment) => [
      `${normalizeText(assignment.normalized_account || assignment.account_name)}:${normalizeText(assignment.direction)}`,
      normalizeText(assignment.semantic_key),
    ]),
  )
  const failures = []
  const rows = []
  EXPECTED_ASSIGNMENT_CONCEPTS.forEach((expectedConcept, key) => {
    const actualConcept = actual.get(key)
    const row = {
      account_direction: key,
      expected_concept: expectedConcept,
      actual_concept: actualConcept || null,
      passed: actualConcept === expectedConcept,
    }
    rows.push(row)
    if (!actualConcept) failures.push(`missing mapping assignment for ${key}; expected ${expectedConcept}`)
    else if (actualConcept !== expectedConcept) {
      failures.push(`wrong semantic concept for ${key}: expected ${expectedConcept}, got ${actualConcept}`)
    }
  })
  return { rows, failures }
}

function summarizeAssistance(summary) {
  if (!summary) return null
  return {
    enabled: summary.enabled,
    attempted: summary.attempted,
    failed: summary.failed,
    acceptedCount: summary.acceptedCount,
    rejectedCount: summary.rejectedCount,
    model: summary.model,
    candidatePoolSize: summary.candidatePoolSize,
    candidatesConsidered: summary.candidatesConsidered,
    batchCount: summary.batchCount,
  }
}

async function runOneTemplate({ templatePath, expected, batchDir }) {
  const name = path.basename(templatePath, path.extname(templatePath))
  const slug = name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "template"
  const outputDir = path.join(batchDir, slug)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilePath = path.join(outputDir, `${slug}_output.xlsx`)
  const failures = []
  let ingestion = null
  let report = null
  let reportError = null
  let outputBucketTotals = null

  const ingestionStarted = Date.now()
  try {
    console.log(`[phase] ${path.basename(templatePath)}: ingesting template`)
    ingestion = await CashFlowTemplateIngestionService.ingestTemplateSchema({
      templatePath,
      sourceFileName: path.basename(templatePath),
      forceLlm: true,
    })
    console.log(`[phase] ${path.basename(templatePath)}: ingestion complete in ${Date.now() - ingestionStarted}ms`)
  } catch (error) {
    failures.push(`template ingestion failed: ${error.message}`)
    ingestion = { error: { message: error.message, details: error.details || null } }
  }
  const ingestionLatencyMs = Date.now() - ingestionStarted

  const reportStarted = Date.now()
  if (!ingestion.error) {
    try {
      console.log(`[phase] ${path.basename(templatePath)}: generating report`)
      report = await CashFlowService.generateCashFlowReport({
        templatePath,
        templateConfig: ingestion.suggested_config_json,
        tbFilePath,
        glFilePath,
        dateStart,
        dateEnd,
        outputFilePath,
        learnedMappings: [],
        useRuntimeMappingAssistance: true,
      })
      outputBucketTotals = await workbookBucketTotals({
        outputFilePath,
        config: ingestion.suggested_config_json,
      })
      console.log(`[phase] ${path.basename(templatePath)}: report complete in ${Date.now() - reportStarted}ms`)
    } catch (error) {
      reportError = {
        message: error.message,
        details: error.details || null,
      }
      failures.push(`report generation failed: ${error.message}`)
    }
  }
  const reportLatencyMs = Date.now() - reportStarted

  if (ingestion && !ingestion.error) {
    if (!String(ingestion.analysis_source || "").includes("llm")) {
      failures.push(`template analyzer did not finish on an LLM source: ${ingestion.analysis_source}`)
    }
    if (ingestion.needs_human_review) {
      failures.push(`template analyzer needs review: ${(ingestion.issues || []).join("; ")}`)
    }
    if (hasTimeoutMarker(ingestion.llm_meta_json)) failures.push("template LLM timeout marker found")
  }

  if (report) {
    if (hasTimeoutMarker(report.mapping?.assistance_summary)) failures.push("runtime LLM timeout marker found")
    ;["total_inflows", "total_outflows", "net_cash_flow"].forEach((key) => {
      if (!closeEnough(report.preview?.totals?.[key], expected.totals[key])) {
        failures.push(`report ${key} mismatch: expected ${expected.totals[key]}, got ${report.preview?.totals?.[key]}`)
      }
    })
    const conceptCheck = validateExpectedAssignmentConcepts(report.mapping?.final_bucket_assignments || [])
    failures.push(...conceptCheck.failures)
  }

  const assignmentConceptCheck = report
    ? validateExpectedAssignmentConcepts(report.mapping?.final_bucket_assignments || [])
    : { rows: [], failures: [] }

  const payload = {
    status: failures.length ? "failed" : "passed",
    template_path: templatePath,
    output_path: report ? outputFilePath : null,
    failures,
    timings_ms: {
      ingestion: ingestionLatencyMs,
      report: reportLatencyMs,
    },
    ingestion: ingestion?.error
      ? ingestion
      : {
          analysis_source: ingestion.analysis_source,
          confidence: ingestion.confidence,
          needs_human_review: ingestion.needs_human_review,
          issues: ingestion.issues,
          required_anchors: ingestion.required_anchors,
          model: ingestion.llm_meta_json?.model || null,
          layout_decision: ingestion.llm_meta_json?.layout_decision || null,
          semantic_repair: ingestion.llm_meta_json?.semantic_repair || null,
          attempts: ingestion.llm_meta_json?.attempts || [],
          raw_errors: ingestion.llm_meta_json?.raw_errors || [],
        },
    config_summary: ingestion?.suggested_config_json
      ? {
          sheet_name: ingestion.suggested_config_json.sheet_name,
          layout_type: ingestion.suggested_config_json.layout_type,
          statement_method: ingestion.suggested_config_json.statement_method,
          period_orientation: ingestion.suggested_config_json.period_axis?.orientation,
          period_count: ingestion.suggested_config_json.period_axis?.labels?.length,
          bucket_count: ingestion.suggested_config_json.bucket_bindings?.length,
          row_binding_count: ingestion.suggested_config_json.row_bindings?.length,
          buckets: (ingestion.suggested_config_json.bucket_bindings || []).map((bucket) => ({
            bucket_key: bucket.bucket_key,
            label: bucket.label,
            direction: bucket.direction,
            semantic_key: bucket.semantic_key || null,
            semantic_confidence: bucket.semantic_confidence || null,
            semantic_source: bucket.semantic_source || null,
          })),
        }
      : null,
    report: report
      ? {
          totals: report.preview?.totals || null,
          account_profile_summary: report.mapping?.account_profile_summary || null,
          assistance_summary: report.mapping?.assistance_summary || null,
          final_assignments: report.mapping?.final_bucket_assignments || [],
          assignment_concept_check: assignmentConceptCheck,
          low_confidence_mappings: report.mapping?.low_confidence_mappings || [],
          auto_mappings_created: report.mapping?.auto_mappings_created || [],
          workbook_bucket_totals: outputBucketTotals,
          warnings: report.warnings || [],
        }
      : null,
    report_error: reportError,
  }

  fs.writeFileSync(path.join(outputDir, "diagnostics.json"), JSON.stringify(payload, null, 2))
  return payload
}

function writeMarkdownSummary({ batchDir, results, expected }) {
  const lines = [
    "# Cash-flow template batch evaluation",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    `Expected inflows: ${expected.totals.total_inflows}`,
    `Expected outflows: ${expected.totals.total_outflows}`,
    `Expected net cash flow: ${expected.totals.net_cash_flow}`,
    "",
    "| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  results.forEach((result) => {
    const assistance = result.report?.assistance_summary || {}
    const profile = result.report?.account_profile_summary || {}
    lines.push(
      `| ${path.basename(result.template_path)} | ${result.status} | ${result.failures.length} | ${result.timings_ms.ingestion} | ${result.timings_ms.report} | ${assistance.acceptedCount ?? ""} | ${profile.profile_auto_mappings ?? ""} | ${profile.review_required_mappings ?? ""} |`,
    )
  })
  lines.push("", "## Failures", "")
  results.forEach((result) => {
    lines.push(`### ${path.basename(result.template_path)}`)
    if (!result.failures.length) lines.push("None.")
    else result.failures.forEach((failure) => lines.push(`- ${failure}`))
    lines.push("")
  })
  fs.writeFileSync(path.join(batchDir, "summary.md"), lines.join("\n"))
}

async function main() {
  const templates = discoverTemplates()
  if (!templates.length) {
    throw new Error("No template workbooks found under outputs/unbiased-cash-flow-template or outputs/bulletproof-template-agent-*.")
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const batchDir = path.join(__dirname, `batch-${timestamp}`)
  fs.mkdirSync(batchDir, { recursive: true })
  const expected = await expectedGlTotals()
  const results = []

  for (const templatePath of templates) {
    console.log(`\n=== Evaluating ${templatePath} ===`)
    const result = await runOneTemplate({ templatePath, expected, batchDir })
    results.push(result)
    console.log(
      JSON.stringify(
        {
          template: path.basename(templatePath),
          status: result.status,
          failures: result.failures,
          analysis_source: result.ingestion?.analysis_source,
          totals: result.report?.totals || null,
          assistance: summarizeAssistance(result.report?.assistance_summary),
          profile: result.report?.account_profile_summary || null,
        },
        null,
        2,
      ),
    )
  }

  const payload = {
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    generated_at: new Date().toISOString(),
    batch_dir: batchDir,
    template_count: templates.length,
    expected,
    results,
  }
  fs.writeFileSync(path.join(batchDir, "batch-diagnostics.json"), JSON.stringify(payload, null, 2))
  writeMarkdownSummary({ batchDir, results, expected })

  console.log("\nBatch status:", payload.status)
  console.log("Batch diagnostics:", path.join(batchDir, "batch-diagnostics.json"))
  console.log("Markdown summary:", path.join(batchDir, "summary.md"))
  process.exit(payload.status === "passed" ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
