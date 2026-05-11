#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const config = require("../src/config/app")
const CashFlowService = require("../src/services/cashFlow.service")
const TemplateIngestion = require("../src/services/cashFlowTemplateIngestion.service")

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

function parseList(value) {
  if (!value) return []
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

function discoverDefaultTemplates() {
  const uploadDir = path.resolve(__dirname, "..", "uploads", "cash-flow", "template-analyses")
  if (!fs.existsSync(uploadDir)) return []
  return fs
    .readdirSync(uploadDir)
    .filter((fileName) => /\.(xlsx|xlsm)$/i.test(fileName))
    .map((fileName) => path.join(uploadDir, fileName))
}

function resolveTemplateFiles() {
  const fromArgs = process.argv.slice(2)
  const fromEnv = parseList(process.env.TEMPLATE_EVAL_FILES)
  const candidates = fromArgs.length > 0 ? fromArgs : fromEnv.length > 0 ? fromEnv : discoverDefaultTemplates()
  return unique(candidates.map((filePath) => path.resolve(process.cwd(), filePath))).filter((filePath) => {
    if (fs.existsSync(filePath)) return true
    console.warn(`Skipping missing template: ${filePath}`)
    return false
  })
}

function summarizeValidation(configJson) {
  try {
    CashFlowService.validateV3TemplateConfig(configJson || {})
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function getCells(binding) {
  if (!binding) return []
  if (Array.isArray(binding.cells)) return binding.cells
  if (binding.cell) return [binding]
  return []
}

function getPeriodLabels(configJson) {
  return (configJson?.period_axis?.labels || [])
    .map((label) => (typeof label === "string" ? label : label?.label))
    .filter(Boolean)
}

function getPeriodBindingCells(configJson) {
  return (configJson?.period_axis?.period_bindings || [])
    .map((binding) => binding?.cell)
    .filter(Boolean)
}

function summarizeConfig(configJson) {
  const periodLabels = getPeriodLabels(configJson)
  const periodBindingCells = getPeriodBindingCells(configJson)
  const bucketCells = (configJson?.bucket_bindings || []).flatMap((bucket) =>
    (bucket?.cells || []).map((cell) => cell?.cell).filter(Boolean),
  )
  const rowBindingCount = Array.isArray(configJson?.row_bindings) ? configJson.row_bindings.length : 0
  const openingCells = getCells(configJson?.opening_binding)
  const closingCells = getCells(configJson?.closing_binding)

  return {
    layout_type: configJson?.layout_type || null,
    statement_method: configJson?.statement_method || null,
    period_orientation: configJson?.period_axis?.orientation || null,
    period_count: periodLabels.length || periodBindingCells.length,
    period_labels: periodLabels,
    period_binding_cells: periodBindingCells,
    bucket_count: Array.isArray(configJson?.bucket_bindings) ? configJson.bucket_bindings.length : 0,
    row_binding_count: rowBindingCount,
    opening_detected: openingCells.length > 0,
    closing_detected: closingCells.length > 0,
    opening_cells: openingCells.map((cell) => cell.cell).filter(Boolean),
    closing_cells: closingCells.map((cell) => cell.cell).filter(Boolean),
    total_period_detected: periodLabels.some((label) => /\btotal\b/i.test(label)),
    total_column_written: bucketCells.some((cell) => /^[A-Z]+[0-9]+$/.test(cell) && cell.startsWith("P")),
  }
}

function expectedProfileFor(filePath) {
  const basename = path.basename(filePath).toLowerCase()
  if (basename.includes("testing_template_2")) {
    return {
      name: "testing_template_2",
      statement_method: "direct",
      period_orientation: "column",
      period_count: 12,
      opening_detected: true,
      closing_detected: true,
      total_period_detected: false,
      total_column_written: false,
    }
  }
  if (basename.includes("arizon")) {
    return {
      name: "arizon_numeric_guard",
      total_period_detected: false,
      numeric_period_guard: true,
    }
  }
  if (basename.includes("plc")) {
    return {
      name: "plc_indirect_monthly",
      statement_method: "indirect",
      period_orientation: "column",
      period_count: 12,
      opening_detected: true,
      closing_detected: true,
    }
  }
  return null
}

function scoreExpected(summary, expected) {
  if (!expected) {
    return {
      status: "unknown",
      profile: null,
      passed: [],
      failed: [],
    }
  }

  const checks = []
  Object.entries(expected).forEach(([key, expectedValue]) => {
    if (key === "name" || key === "numeric_period_guard") return
    checks.push({
      key,
      expected: expectedValue,
      actual: summary[key],
      passed: summary[key] === expectedValue,
    })
  })

  if (expected.numeric_period_guard) {
    const numericLabels = (summary.period_labels || []).filter((label) => /^-?\d+(?:\.\d+)?$/.test(String(label)))
    checks.push({
      key: "numeric_period_guard",
      expected: "no numeric-only period labels",
      actual: numericLabels,
      passed: numericLabels.length === 0,
    })
  }

  return {
    status: checks.every((check) => check.passed) ? "pass" : "fail",
    profile: expected.name,
    passed: checks.filter((check) => check.passed).map((check) => check.key),
    failed: checks.filter((check) => !check.passed),
  }
}

async function evaluateDeterministic(templatePath) {
  const startedAt = Date.now()
  const expected = expectedProfileFor(templatePath)
  try {
    const analysis = await CashFlowService.analyzeTemplateWorkbook({ templatePath })
    const configSummary = summarizeConfig(analysis.suggested_config_json)
    const validation = summarizeValidation(analysis.suggested_config_json)
    const summary = {
      runtime_ms: Date.now() - startedAt,
      detected_layout_type: analysis.detected_layout_type || configSummary.layout_type,
      confidence: Number(analysis.confidence || 0),
      needs_human_review: Boolean(analysis.needs_human_review),
      issues: analysis.issues || [],
      required_anchors: analysis.required_anchors || [],
      v3_validation_success: validation.success,
      v3_validation_error: validation.error,
      ...configSummary,
    }
    summary.layout_accuracy = scoreExpected(summary, expected)
    return summary
  } catch (error) {
    return {
      runtime_ms: Date.now() - startedAt,
      skipped: true,
      error: error.message,
      v3_validation_success: false,
      v3_validation_error: error.message,
      layout_accuracy: {
        status: "error",
        profile: expected?.name || null,
        passed: [],
        failed: [
          {
            key: "workbook_read",
            expected: "valid readable workbook",
            actual: error.message,
            passed: false,
          },
        ],
      },
    }
  }
}

async function evaluateModel(templatePath, modelName) {
  const originalOllama = { ...config.ollama }
  const originalOpenAi = { ...config.openaiLlm }
  const startedAt = Date.now()

  config.ollama.model = modelName
  config.ollama.modelCandidates = []
  config.ollama.deterministicBypassConfidence = Number.parseFloat(
    process.env.TEMPLATE_EVAL_BYPASS_CONFIDENCE || "1.01",
  )
  config.openaiLlm.enabled = parseBoolean(process.env.TEMPLATE_EVAL_ALLOW_HOSTED, false) && originalOpenAi.enabled

  try {
    const result = await TemplateIngestion.ingestTemplateSchema({
      templatePath,
      sourceFileName: path.basename(templatePath),
    })
    const configSummary = summarizeConfig(result.suggested_config_json)
    const validation = summarizeValidation(result.suggested_config_json)
    const attempts = result.llm_meta_json?.attempts || []
    const expected = expectedProfileFor(templatePath)
    const summary = {
      model: result.llm_meta_json?.model || modelName,
      provider: result.llm_meta_json?.provider || "ollama",
      analysis_source: result.analysis_source,
      runtime_ms: Date.now() - startedAt,
      retry_count: Math.max(0, attempts.length - 1),
      attempt_count: attempts.length,
      json_parse_success: ["llm_layout_decision", "openai_layout_decision"].includes(result.analysis_source),
      v3_validation_success: validation.success,
      v3_validation_error: validation.error,
      needs_human_review: Boolean(result.needs_human_review),
      failure_reason: result.llm_failure_reason || result.llm_meta_json?.failure_reason || null,
      schema_constrained: Boolean(result.llm_meta_json?.schema_constrained),
      skill_version: result.llm_meta_json?.skill_version || null,
      ...configSummary,
    }
    summary.layout_accuracy = scoreExpected(summary, expected)
    return summary
  } catch (error) {
    return {
      model: modelName,
      provider: "ollama",
      runtime_ms: Date.now() - startedAt,
      error: error.message,
      json_parse_success: false,
      v3_validation_success: false,
    }
  } finally {
    Object.assign(config.ollama, originalOllama)
    Object.assign(config.openaiLlm, originalOpenAi)
  }
}

async function main() {
  const templateFiles = resolveTemplateFiles()
  if (templateFiles.length === 0) {
    console.error(
      [
        "No templates found.",
        "Pass file paths as arguments, set TEMPLATE_EVAL_FILES, or place workbooks under uploads/cash-flow/template-analyses.",
      ].join(" "),
    )
    process.exitCode = 1
    return
  }

  const runLlm = parseBoolean(process.env.TEMPLATE_EVAL_RUN_LLM, false)
  const models = unique(
    parseList(process.env.TEMPLATE_EVAL_MODELS).length > 0
      ? parseList(process.env.TEMPLATE_EVAL_MODELS)
      : [config.ollama.model, ...(config.ollama.modelCandidates || [])],
  )

  const report = {
    generated_at: new Date().toISOString(),
    run_llm: runLlm,
    models: runLlm ? models : [],
    templates: [],
  }

  for (const templatePath of templateFiles) {
    const deterministic = await evaluateDeterministic(templatePath)
    const entry = {
      file_path: templatePath,
      file_name: path.basename(templatePath),
      deterministic,
      model_results: [],
    }

    if (deterministic.skipped) {
      entry.skipped = true
      entry.skip_reason = deterministic.error || "Template could not be evaluated"
    } else if (runLlm) {
      for (const modelName of models) {
        entry.model_results.push(await evaluateModel(templatePath, modelName))
      }
    }

    report.templates.push(entry)
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
