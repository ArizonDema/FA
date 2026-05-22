"use strict"

const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..", "..")
const CashFlowService = require(path.join(ROOT, "src/services/cashFlow.service"))
const CashFlowTemplateIngestionService = require(path.join(ROOT, "src/services/cashFlowTemplateIngestion.service"))
const { readWorkbookFromFile } = require(path.join(ROOT, "src/utils/excelWorkbook.util"))

const templatePath = path.join(__dirname, "Liquidity_Flight_Plan_2026.xlsx")
const tbFilePath = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\Trial_Balance_2026.xlsx"
const glFilePath = "C:\\Users\\Mano PC\\OneDrive\\Documents\\Samples;Data\\General_Ledger_2026.xlsx"
const dateStart = "2026-01-01"
const dateEnd = "2026-12-31"

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
    label: "generated novel cash-flow output",
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

function closeEnough(left, right) {
  return Math.abs(roundCurrency(left) - roundCurrency(right)) <= 0.01
}

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
    rows.push({
      account_direction: key,
      expected_concept: expectedConcept,
      actual_concept: actualConcept || null,
      passed: actualConcept === expectedConcept,
    })
    if (!actualConcept) {
      failures.push(`missing mapping assignment for ${key}; expected ${expectedConcept}`)
    } else if (actualConcept !== expectedConcept) {
      failures.push(`wrong semantic concept for ${key}: expected ${expectedConcept}, got ${actualConcept}`)
    }
  })
  return { rows, failures }
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputDir = path.join(__dirname, `analysis-${timestamp}`)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilePath = path.join(outputDir, "Liquidity_Flight_Plan_output.xlsx")

  const ingestionStarted = Date.now()
  const ingestion = await CashFlowTemplateIngestionService.ingestTemplateSchema({
    templatePath,
    sourceFileName: path.basename(templatePath),
    forceLlm: true,
  })
  const ingestionLatencyMs = Date.now() - ingestionStarted

  let report = null
  let reportLatencyMs = null
  let reportError = null
  const reportStarted = Date.now()
  try {
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
    reportLatencyMs = Date.now() - reportStarted
  } catch (error) {
    reportLatencyMs = Date.now() - reportStarted
    reportError = {
      message: error.message,
      details: error.details || null,
    }
  }

  const expected = await expectedGlTotals()
  const outputBucketTotals = report
    ? await workbookBucketTotals({
        outputFilePath,
        config: ingestion.suggested_config_json,
      })
    : null
  const failures = []
  if (!String(ingestion.analysis_source || "").includes("llm")) {
    failures.push(`template analyzer did not finish on an LLM source: ${ingestion.analysis_source}`)
  }
  if (ingestion.needs_human_review) {
    failures.push(`template analyzer needs review: ${(ingestion.issues || []).join("; ")}`)
  }
  if (hasTimeoutMarker(ingestion.llm_meta_json) || hasTimeoutMarker(report?.mapping?.assistance_summary)) {
    failures.push("LLM timeout marker found")
  }
  if (reportError) {
    failures.push(`report generation failed: ${reportError.message}`)
  }
  if (report) {
    ;["total_inflows", "total_outflows", "net_cash_flow"].forEach((key) => {
      if (!closeEnough(report.preview?.totals?.[key], expected.totals[key])) {
        failures.push(`report ${key} mismatch: expected ${expected.totals[key]}, got ${report.preview?.totals?.[key]}`)
      }
    })
    const assignmentConceptCheck = validateExpectedAssignmentConcepts(report.mapping?.final_bucket_assignments || [])
    failures.push(...assignmentConceptCheck.failures)
  }

  const assignmentConceptCheck = report
    ? validateExpectedAssignmentConcepts(report.mapping?.final_bucket_assignments || [])
    : { rows: [], failures: [] }

  const payload = {
    status: failures.length ? "failed" : "passed",
    generated_at: new Date().toISOString(),
    failures,
    files: {
      template: templatePath,
      output: report ? outputFilePath : null,
    },
    timings_ms: {
      ingestion: ingestionLatencyMs,
      report: reportLatencyMs,
    },
    expected,
    ingestion: {
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
    config_summary: {
      sheet_name: ingestion.suggested_config_json?.sheet_name,
      layout_type: ingestion.suggested_config_json?.layout_type,
      statement_method: ingestion.suggested_config_json?.statement_method,
      period_orientation: ingestion.suggested_config_json?.period_axis?.orientation,
      period_count: ingestion.suggested_config_json?.period_axis?.labels?.length,
      bucket_count: ingestion.suggested_config_json?.bucket_bindings?.length,
      buckets: (ingestion.suggested_config_json?.bucket_bindings || []).map((bucket) => ({
        bucket_key: bucket.bucket_key,
        label: bucket.label,
        direction: bucket.direction,
        semantic_key: bucket.semantic_key || null,
        semantic_confidence: bucket.semantic_confidence || null,
      })),
    },
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

  const jsonPath = path.join(outputDir, "diagnostics.json")
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2))

  console.log(`Novel template check ${payload.status}`)
  console.log(`Diagnostics: ${jsonPath}`)
  console.log(`Template: ${templatePath}`)
  console.log(`Output: ${outputFilePath}`)
  console.log(JSON.stringify({
    status: payload.status,
    failures,
    ingestion: payload.ingestion,
    config_summary: payload.config_summary,
    totals: payload.report?.totals || null,
    account_profile_summary: payload.report?.account_profile_summary || null,
    assistance_summary: payload.report?.assistance_summary
      ? {
          enabled: payload.report.assistance_summary.enabled,
          attempted: payload.report.assistance_summary.attempted,
          failed: payload.report.assistance_summary.failed,
          acceptedCount: payload.report.assistance_summary.acceptedCount,
          rejectedCount: payload.report.assistance_summary.rejectedCount,
          model: payload.report.assistance_summary.model,
          candidatePoolSize: payload.report.assistance_summary.candidatePoolSize,
          candidatesConsidered: payload.report.assistance_summary.candidatesConsidered,
        }
      : null,
  }, null, 2))
  process.exit(failures.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
