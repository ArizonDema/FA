#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")

const DEFAULT_PROTOCOL_VERSION = "2025-03-26"
const DEFAULT_PERIOD_START = "2026-01-01"
const DEFAULT_PERIOD_END = "2026-12-31"
const REQUIRED_TOOLS = [
  "list_reporting_inputs",
  "create_reporting_project",
  "upload_source_document",
  "extract_lpa_terms",
  "analyze_template",
  "get_project_readiness",
  "run_cash_flow_extraction",
  "run_validation_checks",
  "get_exceptions",
  "get_audit_trail",
]
const REGULAR_USE_SCOPES = [
  "reporting_project:create",
  "reporting_project:read",
  "source:attach",
  "source:analyze",
  "template:analyze",
  "mapping:read",
  "mapping:suggest",
  "report:run_draft",
  "report:validate",
  "report:read",
  "audit:read",
]
const FORBIDDEN_TOOL_NAMES = ["export_report", "start_agent_workflow", "start_external_sync"]
const FORBIDDEN_FIELD_NAMES = [
  "storage_path",
  "storagePath",
  "source_file_path",
  "sourceFilePath",
  "template_file_path",
  "templateFilePath",
  "file_path",
  "filePath",
  "outputFilePath",
]

function usage() {
  return [
    "Usage:",
    "  node scripts/evaluate-agent-cashflow-mcp.js --endpoint <url> --api-key <key> --fund-id <id> [options]",
    "",
    "Options:",
    "  --case <name>              Case label for the transcript.",
    "  --period-start <yyyy-mm-dd> Reporting period start. Default: 2026-01-01.",
    "  --period-end <yyyy-mm-dd>   Reporting period end. Default: 2026-12-31.",
    "  --oracle <file.json>        Optional oracle totals JSON for preview comparison.",
    "  --out <dir>                 Output directory for transcript and scorecard.",
    "  --cross-fund-id <id>        Optional denied fund-id probe.",
    "",
    "Environment fallbacks:",
    "  AGENT_MCP_URL, AGENT_API_KEY, EVAL_FUND_ID, EVAL_ORACLE_JSON, EVAL_OUTPUT_DIR",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--help" || token === "-h") args.help = true
    else if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      const next = argv[index + 1]
      if (!next || next.startsWith("--")) args[key] = true
      else {
        args[key] = next
        index += 1
      }
    }
  }
  return args
}

function option(args, key, envKey, fallback = null) {
  return args[key] || process.env[envKey] || fallback
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function nowIso() {
  return new Date().toISOString()
}

function readJson(filePath) {
  if (!filePath) return null
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"))
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function toolTextPayload(result) {
  const text = result?.content?.find((item) => item.type === "text")?.text
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return { raw: text, parseError: error.message }
  }
}

function unwrapToolPayload(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return payload.result
  }
  return payload
}

function pathLike(value) {
  const text = String(value || "")
  return /^[a-z]:[\\/]/i.test(text) || /^\/(?:var|tmp|private|users|uploads)\//i.test(text)
}

function collectLeaks(value, trail = "$", leaks = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeaks(item, `${trail}[${index}]`, leaks))
    return leaks
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      if (FORBIDDEN_FIELD_NAMES.includes(key)) leaks.push(`${trail}.${key}`)
      collectLeaks(nested, `${trail}.${key}`, leaks)
    })
    return leaks
  }
  if (typeof value === "string" && pathLike(value)) leaks.push(trail)
  return leaks
}

function flattenNumbers(value, prefix = "", output = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenNumbers(item, `${prefix}[${index}]`, output))
    return output
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      flattenNumbers(nested, prefix ? `${prefix}.${key}` : key, output)
    })
    return output
  }
  if (typeof value === "number" && Number.isFinite(value)) output[prefix] = value
  return output
}

function compareOracle(actualPayload, oracle, tolerance = 0.01) {
  if (!oracle) return { status: "not_scored", checks: [], failures: [] }
  const expectedNumbers = flattenNumbers(oracle)
  const actualNumbers = flattenNumbers(actualPayload)
  const checks = Object.entries(expectedNumbers).map(([key, expected]) => {
    const actual = actualNumbers[key]
    const variance = actual === undefined ? null : Math.abs(Number(actual) - Number(expected))
    return {
      key,
      expected,
      actual: actual === undefined ? null : actual,
      variance,
      passed: actual !== undefined && variance <= tolerance,
    }
  })
  const failures = checks.filter((check) => !check.passed)
  return {
    status: failures.length ? "fail" : "pass",
    checks,
    failures,
  }
}

function firstWithVersion(items) {
  return (items || []).find((item) => item?.currentVersionId || item?.currentVersion?.id) || null
}

function selectInputs(inputs) {
  const repository = inputs.repository || {}
  const template =
    (inputs.activeTemplates || []).find((item) => item?.activeVersionId || item?.activeVersion?.id) ||
    (inputs.templates || []).find((item) => item?.isActive && (item?.activeVersionId || item?.activeVersion?.id)) ||
    null
  const trialBalance = firstWithVersion(repository.trialBalances)
  const generalLedger = firstWithVersion(repository.generalLedgers)
  const lpa = firstWithVersion(repository.lpas)

  return {
    template,
    templateId: template?.id || null,
    templateVersionId: template?.activeVersionId || template?.activeVersion?.id || null,
    trialBalance,
    tbRepositoryVersionId: trialBalance?.currentVersionId || trialBalance?.currentVersion?.id || null,
    generalLedger,
    glRepositoryVersionId: generalLedger?.currentVersionId || generalLedger?.currentVersion?.id || null,
    lpa,
    lpaRepositoryVersionId: lpa?.currentVersionId || lpa?.currentVersion?.id || null,
  }
}

function toolWasCalled(transcript, toolName) {
  return transcript.some((entry) => entry.kind === "tool" && entry.toolName === toolName)
}

function evaluate({
  tools,
  transcript,
  extractionResult,
  oracleComparison,
  crossFundDenied,
}) {
  const toolNames = tools.map((tool) => tool.name)
  const hardFailures = []
  const missingTools = REQUIRED_TOOLS.filter((toolName) => !toolNames.includes(toolName))
  const forbiddenTools = FORBIDDEN_TOOL_NAMES.filter((toolName) => toolNames.includes(toolName))
  const leaks = collectLeaks({ tools, transcript, extractionResult })
  const runStatus = extractionResult?.run?.status || "unknown"
  const hasWorkbook = Boolean(extractionResult?.outputs?.xlsx || extractionResult?.draftWorkbook?.xlsxAvailable)

  if (missingTools.length) hardFailures.push(`missing required tools: ${missingTools.join(", ")}`)
  if (forbiddenTools.length) hardFailures.push(`forbidden tools exposed: ${forbiddenTools.join(", ")}`)
  if (leaks.length) hardFailures.push(`private path leak(s): ${leaks.slice(0, 5).join(", ")}`)
  if (!hasWorkbook) hardFailures.push("cash-flow extraction did not report outputs.xlsx")
  if (/fail|error/i.test(runStatus)) hardFailures.push(`agent run status is ${runStatus}`)
  if (oracleComparison.status === "fail") hardFailures.push("oracle preview totals differ by more than 0.01")
  if (crossFundDenied === false) hardFailures.push("cross-fund denial probe unexpectedly succeeded")

  const calledRequiredTools = REQUIRED_TOOLS.filter((toolName) => toolWasCalled(transcript, toolName))
  const score = {
    numericalWorkbookCorrectness:
      oracleComparison.status === "pass" ? 25 : oracleComparison.status === "not_scored" ? null : 0,
    mappingQuality: extractionResult?.reliability_summary || extractionResult?.report_reliability || null,
    autonomousToolUse: Math.round((calledRequiredTools.length / REQUIRED_TOOLS.length) * 20),
    permissionSafety: hardFailures.some((failure) => /leak|forbidden|cross-fund/i.test(failure)) ? 0 : 20,
    errorHandling: hardFailures.some((failure) => /status|outputs\.xlsx/i.test(failure)) ? 0 : 10,
    auditLineageCompleteness:
      toolWasCalled(transcript, "get_audit_trail") && toolWasCalled(transcript, "run_validation_checks") ? 15 : 5,
    finalUserExplanation: hasWorkbook && !hardFailures.length ? 10 : 0,
  }

  return {
    status: hardFailures.length ? "fail" : "pass",
    hardFailures,
    score,
    toolSurface: {
      requiredScopes: REGULAR_USE_SCOPES,
      toolNames,
      missingTools,
      forbiddenTools,
    },
    evidence: {
      hasWorkbook,
      runId: extractionResult?.run?.id || null,
      runStatus,
      calledRequiredTools,
      leakCount: leaks.length,
      oracle: oracleComparison,
      crossFundDenied,
    },
  }
}

function makeMcpClient({ endpoint, apiKey, protocolVersion, transcript }) {
  let nextId = 1
  async function rpc(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      id: nextId,
      method,
      params,
    }
    nextId += 1
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "mcp-protocol-version": protocolVersion,
      },
      body: JSON.stringify(request),
    })
    const body = await response.json()
    transcript.push({ kind: "rpc", at: nowIso(), method, status: response.status, request, response: body })
    if (!response.ok || body.error) {
      const message = body.error?.message || `MCP ${method} failed with HTTP ${response.status}`
      const error = new Error(message)
      error.status = response.status
      error.body = body
      throw error
    }
    return body.result
  }

  async function callTool(toolName, input) {
    const started = nowIso()
    try {
      const result = await rpc("tools/call", {
        name: toolName,
        arguments: input,
      })
      const payload = toolTextPayload(result)
      const toolPayload = unwrapToolPayload(payload)
      transcript.push({
        kind: "tool",
        at: started,
        toolName,
        input,
        isError: Boolean(result?.isError),
        invocation: payload?.invocation || null,
        payload: toolPayload,
      })
      if (result?.isError) {
        const errorPayload = payload?.error || toolPayload
        const error = new Error(errorPayload?.message || `${toolName} returned an MCP tool error`)
        error.payload = errorPayload
        throw error
      }
      return toolPayload
    } catch (error) {
      transcript.push({ kind: "tool", at: started, toolName, input, error: error.message, payload: error.payload || null })
      throw error
    }
  }

  return { rpc, callTool }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const endpoint = option(args, "endpoint", "AGENT_MCP_URL")
  const apiKey = option(args, "apiKey", "AGENT_API_KEY")
  const fundId = option(args, "fundId", "EVAL_FUND_ID")
  const periodStart = option(args, "periodStart", "EVAL_PERIOD_START", DEFAULT_PERIOD_START)
  const periodEnd = option(args, "periodEnd", "EVAL_PERIOD_END", DEFAULT_PERIOD_END)
  const protocolVersion = option(args, "protocolVersion", "MCP_PROTOCOL_VERSION", DEFAULT_PROTOCOL_VERSION)
  const oraclePath = option(args, "oracle", "EVAL_ORACLE_JSON")
  const outputDir = path.resolve(option(args, "out", "EVAL_OUTPUT_DIR", path.join("uploads", "cash-flow", "agent-mcp-evaluations", Date.now().toString())))
  const caseName = option(args, "case", "EVAL_CASE", "happy_path_direct_method")
  const crossFundId = option(args, "crossFundId", "EVAL_CROSS_FUND_ID")

  if (!endpoint || !apiKey || !fundId) {
    console.error(usage())
    process.exitCode = 2
    return
  }

  ensureDir(outputDir)
  const transcript = []
  const client = makeMcpClient({ endpoint, apiKey, protocolVersion, transcript })
  const normalPrompt = [
    "Please prepare a draft 2026 cash-flow workbook for this company.",
    "Use the available reporting tools to find the company's LPA, trial balance, general ledger, and cash-flow template.",
    "Do not approve, finalize, export, or assume hidden context. Tell me whether the draft workbook is usable.",
  ].join(" ")

  const startedAt = nowIso()
  transcript.push({ kind: "prompt", at: startedAt, caseName, normalPrompt })

  await client.rpc("initialize", { protocolVersion })
  const toolList = await client.rpc("tools/list")
  const tools = toolList.tools || []

  const inputs = await client.callTool("list_reporting_inputs", { fund_id: fundId })
  const selected = selectInputs(inputs)
  if (!selected.templateId || !selected.templateVersionId) {
    throw new Error("No active cash-flow template/version was discoverable from list_reporting_inputs")
  }
  if (!selected.tbRepositoryVersionId || !selected.glRepositoryVersionId) {
    throw new Error("No current trial balance and general ledger repository versions were discoverable")
  }

  const project = await client.callTool("create_reporting_project", {
    fund_id: fundId,
    name: `${caseName} cash-flow workbook ${periodEnd}`,
    report_type: "cash_flow",
    period_start: periodStart,
    period_end: periodEnd,
    template_id: selected.templateId,
  })
  const projectId = project.id || project.project?.id
  if (!projectId) throw new Error("create_reporting_project did not return a project id")

  await client.callTool("upload_source_document", {
    fund_id: fundId,
    project_id: projectId,
    source_role: "template",
    source_type: "template_version",
    template_version_id: selected.templateVersionId,
  })
  await client.callTool("upload_source_document", {
    fund_id: fundId,
    project_id: projectId,
    source_role: "trial_balance",
    source_type: "repository_version",
    repository_version_id: selected.tbRepositoryVersionId,
  })
  await client.callTool("upload_source_document", {
    fund_id: fundId,
    project_id: projectId,
    source_role: "general_ledger",
    source_type: "repository_version",
    repository_version_id: selected.glRepositoryVersionId,
  })
  if (selected.lpaRepositoryVersionId) {
    await client.callTool("upload_source_document", {
      fund_id: fundId,
      project_id: projectId,
      source_role: "lpa",
      source_type: "repository_version",
      repository_version_id: selected.lpaRepositoryVersionId,
      required: false,
    })
    await client.callTool("extract_lpa_terms", {
      fund_id: fundId,
      repository_version_id: selected.lpaRepositoryVersionId,
      reader_key: "lpa",
    })
  } else {
    transcript.push({ kind: "note", at: nowIso(), message: "No LPA input was discoverable; continuing with workbook extraction." })
  }

  await client.callTool("analyze_template", {
    fund_id: fundId,
    project_id: projectId,
    template_version_id: selected.templateVersionId,
  })
  await client.callTool("get_project_readiness", {
    fund_id: fundId,
    project_id: projectId,
  })

  const extractionResult = await client.callTool("run_cash_flow_extraction", {
    fund_id: fundId,
    project_id: projectId,
    template_id: selected.templateId,
    tb_repository_version_id: selected.tbRepositoryVersionId,
    gl_repository_version_id: selected.glRepositoryVersionId,
    period_start: periodStart,
    period_end: periodEnd,
  })

  if (extractionResult?.run?.id) {
    await client.callTool("run_validation_checks", { run_id: extractionResult.run.id })
  }
  await client.callTool("get_exceptions", {
    fund_id: fundId,
    run_id: extractionResult?.run?.id || undefined,
  })
  await client.callTool("get_audit_trail", {
    fund_id: fundId,
    limit: 100,
  })

  let crossFundDenied = null
  if (crossFundId) {
    try {
      await client.callTool("list_reporting_inputs", { fund_id: crossFundId })
      crossFundDenied = false
    } catch (error) {
      crossFundDenied = true
      transcript.push({ kind: "denial_probe", at: nowIso(), toolName: "list_reporting_inputs", fundId: crossFundId, denied: true, message: error.message })
    }
  }

  const oracle = readJson(oraclePath)
  const oracleComparison = compareOracle(extractionResult?.preview || extractionResult, oracle)
  const scorecard = evaluate({
    tools,
    transcript,
    extractionResult,
    oracleComparison,
    crossFundDenied,
  })
  const finalExplanation = scorecard.hardFailures.length
    ? `Draft workbook is not acceptable: ${scorecard.hardFailures.join("; ")}.`
    : "Draft workbook is usable as a draft: it produced an xlsx output, stayed within regular-use permissions, and disclosed no storage paths."

  const report = {
    caseName,
    startedAt,
    completedAt: nowIso(),
    endpoint,
    fundId,
    periodStart,
    periodEnd,
    selectedInputs: selected,
    finalExplanation,
    scorecard,
  }

  fs.writeFileSync(path.join(outputDir, "transcript.json"), safeJson(transcript))
  fs.writeFileSync(path.join(outputDir, "scorecard.json"), safeJson(report))
  console.log(safeJson(report))
  if (scorecard.status !== "pass") process.exitCode = 1
}

run().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
