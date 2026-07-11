const {
  AgentWorkflowRun,
  AgentWorkflowStep,
  AgentToolInvocation,
  AgentPrincipal,
  ReportingProject,
  sequelize,
} = require("../../../models")
const AppError = require("../../../utils/AppError")
const AuditService = require("../../audit/services/audit.service")
const AgentPrincipalService = require("./agentPrincipal.service")

const WORKFLOW_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  COMPLETED_WITH_ERRORS: "completed_with_errors",
  FAILED: "failed",
}

const STEP_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
}

const WORKFLOW_TYPES = {
  REPORTING_DRAFT_VALIDATION: "reporting_draft_validation",
  VALIDATION_AND_EXCEPTION_REVIEW: "validation_and_exception_review",
  CUSTOM_TOOL_SEQUENCE: "custom_tool_sequence",
}

const WORKFLOW_TOOL_NAMES = new Set(["start_agent_workflow", "get_agent_workflow"])
const FINALIZING_KEYS = new Set([
  "approved_by",
  "approved_at",
  "approval_id",
  "activate",
  "activation_mode",
  "exported_at",
  "is_active",
  "review_status",
  "waiver",
  "waived_by",
])
const FINALIZING_VALUES = ["approved", "activated", "active", "exported", "final", "waived"]

function asPlain(record) {
  if (!record) return null
  return typeof record.toJSON === "function" ? record.toJSON() : { ...record }
}

function normalizeString(value) {
  return String(value || "").trim()
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

function parseObject(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback
    } catch (error) {
      return fallback
    }
  }
  return fallback
}

function publicStep(record) {
  const step = asPlain(record) || {}
  return {
    id: step.id,
    workflowRunId: step.workflow_run_id,
    agentToolInvocationId: step.agent_tool_invocation_id || null,
    stepOrder: step.step_order,
    stepName: step.step_name,
    toolName: step.tool_name,
    status: step.status,
    continueOnError: Boolean(step.continue_on_error),
    dryRun: Boolean(step.dry_run),
    input: step.input_json || null,
    resolvedInput: step.resolved_input_json || null,
    output: step.output_json || null,
    error: step.error_json || null,
    startedAt: step.started_at || null,
    completedAt: step.completed_at || null,
    metadata: step.metadata_json || null,
  }
}

function publicRun(record) {
  const run = asPlain(record) || {}
  return {
    id: run.id,
    agentPrincipalId: run.agent_principal_id,
    workflowType: run.workflow_type,
    status: run.status,
    triggerType: run.trigger_type,
    fundId: run.portfolio_id || null,
    projectId: run.reporting_project_id || null,
    initiatedBy: run.initiated_by || null,
    idempotencyKey: run.idempotency_key || null,
    externalCorrelationId: run.external_correlation_id || null,
    workflowPlan: run.workflow_plan_json || null,
    policy: run.policy_json || null,
    schedule: run.schedule_json || null,
    summary: run.summary_json || null,
    error: run.error_json || null,
    startedAt: run.started_at || null,
    completedAt: run.completed_at || null,
    metadata: run.metadata_json || null,
    createdAt: run.created_at || run.createdAt || null,
    updatedAt: run.updated_at || run.updatedAt || null,
    steps: Array.isArray(run.steps) ? run.steps.map(publicStep) : [],
  }
}

function getByPath(source, rawPath) {
  const path = String(rawPath || "").replace(/^\$\.?/, "")
  if (!path) return source
  return path.split(".").reduce((current, segment) => {
    if (current === undefined || current === null) return null
    return current[segment]
  }, source)
}

function resolveReferences(value, context) {
  if (typeof value === "string" && value.startsWith("$")) {
    return getByPath(context, value)
  }
  if (Array.isArray(value)) return value.map((entry) => resolveReferences(entry, context))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, resolveReferences(nested, context)]),
    )
  }
  return value
}

function defaultStepsFor({ workflowType, fundId, projectId, runId }) {
  if (workflowType === WORKFLOW_TYPES.REPORTING_DRAFT_VALIDATION) {
    return [
      {
        step_name: "readiness",
        tool_name: "get_project_readiness",
        input: { fund_id: "$context.fund_id", project_id: "$context.project_id" },
      },
      {
        step_name: "run_report",
        tool_name: "run_report",
        input: { fund_id: "$context.fund_id", project_id: "$context.project_id" },
      },
      {
        step_name: "validate",
        tool_name: "run_validation_checks",
        input: { run_id: "$steps.run_report.result.reportRun.id" },
      },
      {
        step_name: "exceptions",
        tool_name: "get_exceptions",
        input: { fund_id: "$context.fund_id", run_id: "$steps.run_report.result.reportRun.id" },
      },
    ]
  }

  if (workflowType === WORKFLOW_TYPES.VALIDATION_AND_EXCEPTION_REVIEW) {
    return [
      {
        step_name: "validate",
        tool_name: "run_validation_checks",
        input: { run_id: runId || "$context.run_id" },
      },
      {
        step_name: "exceptions",
        tool_name: "get_exceptions",
        input: { fund_id: fundId || "$context.fund_id", run_id: runId || "$context.run_id" },
      },
    ]
  }

  if (workflowType === WORKFLOW_TYPES.CUSTOM_TOOL_SEQUENCE) {
    return []
  }

  return projectId ? defaultStepsFor({ workflowType: WORKFLOW_TYPES.REPORTING_DRAFT_VALIDATION }) : []
}

function assertDraftOnlyPayload(payload = {}) {
  const keys = Object.keys(payload || {}).map((key) => key.toLowerCase())
  const blockedKey = keys.find((key) => FINALIZING_KEYS.has(key))
  if (blockedKey) {
    throw new AppError("Agent workflows cannot approve, activate, waive, or finalize reporting work", 403)
  }

  const serialized = JSON.stringify(payload || {}).toLowerCase()
  const blockedValue = FINALIZING_VALUES.find((value) => serialized.includes(`"${value}"`))
  if (blockedValue) {
    throw new AppError("Agent workflows can only create draft or review-request reporting work", 403)
  }
}

function normalizePolicy(policyInput = {}) {
  const policy = parseObject(policyInput, {})
  const normalized = {
    ...policy,
    min_confidence: policy.min_confidence ?? policy.minConfidence ?? null,
    materiality_threshold: policy.materiality_threshold ?? policy.materialityThreshold ?? null,
    allow_approval_requests: parseBoolean(policy.allow_approval_requests ?? policy.allowApprovalRequests, false),
    continue_on_error: parseBoolean(policy.continue_on_error ?? policy.continueOnError, false),
  }

  if (normalized.min_confidence !== null) {
    const minConfidence = Number(normalized.min_confidence)
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      throw new AppError("Workflow policy min_confidence must be between 0 and 1", 400)
    }
    normalized.min_confidence = minConfidence
  }

  if (normalized.materiality_threshold !== null) {
    const materialityThreshold = Number(normalized.materiality_threshold)
    if (!Number.isFinite(materialityThreshold) || materialityThreshold < 0) {
      throw new AppError("Workflow policy materiality_threshold must be a non-negative number", 400)
    }
    normalized.materiality_threshold = materialityThreshold
  }

  return normalized
}

function normalizeWorkflowType(value) {
  const workflowType = normalizeString(value || WORKFLOW_TYPES.REPORTING_DRAFT_VALIDATION)
  if (!Object.values(WORKFLOW_TYPES).includes(workflowType)) {
    throw new AppError("Unsupported agent workflow type", 400)
  }
  return workflowType
}

function normalizeStepPlan({ workflowType, fundId, projectId, runId, steps, policy }) {
  const providedSteps = Array.isArray(steps) ? steps : []
  const plan = providedSteps.length
    ? providedSteps
    : defaultStepsFor({ workflowType, fundId, projectId, runId })

  if (!plan.length) {
    throw new AppError("Workflow requires at least one tool step", 400)
  }

  return plan.map((step, index) => {
    const toolName = normalizeString(step.tool_name || step.toolName)
    if (!toolName) throw new AppError("Workflow step tool_name is required", 400)
    if (WORKFLOW_TOOL_NAMES.has(toolName)) {
      throw new AppError("Workflow steps cannot invoke workflow orchestration tools", 400)
    }
    if (toolName === "export_report" && !policy.allow_approval_requests) {
      throw new AppError("Workflow export approval requests require policy.allow_approval_requests", 403)
    }

    const input = parseObject(step.input || step.arguments, {})
    assertDraftOnlyPayload(input)

    return {
      step_order: Number.parseInt(step.step_order || step.stepOrder || index + 1, 10),
      step_name: normalizeString(step.step_name || step.stepName || step.name || `${toolName}_${index + 1}`),
      tool_name: toolName,
      input_json: input,
      continue_on_error: parseBoolean(step.continue_on_error ?? step.continueOnError, policy.continue_on_error),
      dry_run: parseBoolean(step.dry_run ?? step.dryRun, false),
      metadata_json: parseObject(step.metadata_json || step.metadata, null),
    }
  })
}

function applyPolicyToInput({ input, toolName, policy }) {
  const next = { ...(input || {}) }
  if (
    ["suggest_tb_mapping", "suggest_gl_mapping"].includes(toolName) &&
    policy.min_confidence !== null &&
    next.min_confidence === undefined &&
    next.minConfidence === undefined
  ) {
    next.min_confidence = policy.min_confidence
  }
  if (policy.materiality_threshold !== null && next.materiality_threshold === undefined) {
    next.materiality_threshold = policy.materiality_threshold
  }
  return next
}

function workflowInclude() {
  return [
    {
      model: AgentWorkflowStep,
      as: "steps",
      separate: true,
      order: [["step_order", "ASC"]],
      include: [{ model: AgentToolInvocation, as: "agentToolInvocation" }],
    },
    { model: AgentPrincipal, as: "agentPrincipal" },
    { model: ReportingProject, as: "reportingProject" },
  ]
}

async function executeToolSafely(args) {
  const AgentToolExecutionService = require("./agentToolExecution.service")
  return await AgentToolExecutionService.executeTool(args)
}

class AgentWorkflowService {
  static async findIdempotentRun({ agentPrincipalId, idempotencyKey }) {
    if (!idempotencyKey) return null
    return await AgentWorkflowRun.findOne({
      where: {
        agent_principal_id: agentPrincipalId,
        idempotency_key: idempotencyKey,
      },
      include: workflowInclude(),
    })
  }

  static async createWorkflowRun({
    agentPrincipalId,
    actorId = null,
    workflowType = WORKFLOW_TYPES.REPORTING_DRAFT_VALIDATION,
    fundId = null,
    projectId = null,
    runId = null,
    triggerType = "manual",
    idempotencyKey = null,
    externalCorrelationId = null,
    steps = [],
    policy = {},
    schedule = null,
    metadata = null,
    startImmediately = true,
  }) {
    const principal = await AgentPrincipalService.requireActivePrincipal({ principalId: agentPrincipalId })
    const normalizedWorkflowType = normalizeWorkflowType(workflowType)
    const normalizedPolicy = normalizePolicy(policy)
    const stepPlan = normalizeStepPlan({
      workflowType: normalizedWorkflowType,
      fundId,
      projectId,
      runId,
      steps,
      policy: normalizedPolicy,
    })

    const existing = await this.findIdempotentRun({ agentPrincipalId: principal.id, idempotencyKey })
    if (existing) {
      return {
        workflowRun: publicRun(existing),
        idempotentReplay: true,
      }
    }

    const createRecords = async (transaction = null) => {
      const workflowRun = await AgentWorkflowRun.create(
        {
          agent_principal_id: principal.id,
          workflow_type: normalizedWorkflowType,
          status: WORKFLOW_STATUSES.PENDING,
          trigger_type: normalizeString(triggerType || "manual"),
          portfolio_id: fundId || null,
          reporting_project_id: projectId || null,
          initiated_by: actorId,
          idempotency_key: idempotencyKey || null,
          external_correlation_id: externalCorrelationId || null,
          workflow_plan_json: stepPlan,
          policy_json: normalizedPolicy,
          schedule_json: schedule || null,
          metadata_json: metadata || null,
        },
        { transaction },
      )

      for (const step of stepPlan) {
        await AgentWorkflowStep.create(
          {
            workflow_run_id: workflowRun.id,
            status: STEP_STATUSES.PENDING,
            ...step,
          },
          { transaction },
        )
      }

      return workflowRun
    }

    const workflowRun =
      sequelize && typeof sequelize.transaction === "function"
        ? await sequelize.transaction((transaction) => createRecords(transaction))
        : await createRecords()

    await AuditService.logEvent({
      actorId,
      eventType: "agent_workflow_created",
      entityType: "agent_workflow_run",
      entityId: workflowRun.id,
      metadata: {
        agent_principal_id: principal.id,
        workflow_type: normalizedWorkflowType,
        fund_id: fundId,
        reporting_project_id: projectId,
        trigger_type: triggerType,
      },
      after: asPlain(workflowRun),
    })

    if (!startImmediately) {
      return {
        workflowRun: await this.getWorkflowRun({ workflowRunId: workflowRun.id }),
        idempotentReplay: false,
      }
    }

    return {
      workflowRun: await this.startWorkflowRun({ workflowRunId: workflowRun.id, actorId }),
      idempotentReplay: false,
    }
  }

  static async listWorkflowRuns({ agentPrincipalId = null, fundId = null, projectId = null, status = null } = {}) {
    const where = {}
    if (agentPrincipalId) where.agent_principal_id = agentPrincipalId
    if (fundId) where.portfolio_id = fundId
    if (projectId) where.reporting_project_id = projectId
    if (status) where.status = status
    const runs = await AgentWorkflowRun.findAll({
      where,
      include: workflowInclude(),
      order: [["created_at", "DESC"]],
    })
    return runs.map(publicRun)
  }

  static async getWorkflowRun({ workflowRunId, agentPrincipalId = null }) {
    const where = { id: workflowRunId }
    if (agentPrincipalId) where.agent_principal_id = agentPrincipalId
    const run = await AgentWorkflowRun.findOne({
      where,
      include: workflowInclude(),
    })
    if (!run) throw new AppError("Agent workflow run not found", 404)
    return publicRun(run)
  }

  static async loadWorkflowRunRecord(workflowRunId) {
    const run = await AgentWorkflowRun.findOne({
      where: { id: workflowRunId },
      include: workflowInclude(),
    })
    if (!run) throw new AppError("Agent workflow run not found", 404)
    return run
  }

  static async startWorkflowRun({ workflowRunId, actorId = null }) {
    const run = await this.loadWorkflowRunRecord(workflowRunId)
    if (![WORKFLOW_STATUSES.PENDING, WORKFLOW_STATUSES.FAILED].includes(run.status)) {
      throw new AppError("Only pending or failed workflows can be started", 409)
    }

    await run.update({
      status: WORKFLOW_STATUSES.RUNNING,
      started_at: run.started_at || new Date(),
      completed_at: null,
      error_json: null,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "agent_workflow_started",
      entityType: "agent_workflow_run",
      entityId: run.id,
      metadata: {
        agent_principal_id: run.agent_principal_id,
        workflow_type: run.workflow_type,
      },
    })

    const policy = normalizePolicy(run.policy_json || {})
    const context = {
      context: {
        workflow_run_id: run.id,
        agent_principal_id: run.agent_principal_id,
        fund_id: run.portfolio_id || null,
        project_id: run.reporting_project_id || null,
        run_id: run.metadata_json?.run_id || null,
        policy,
      },
      steps: {},
    }

    const steps = [...(run.steps || [])].sort((left, right) => left.step_order - right.step_order)
    let failedCount = 0
    let completedCount = 0

    for (const step of steps) {
      await step.update({
        status: STEP_STATUSES.RUNNING,
        started_at: new Date(),
        error_json: null,
      })

      const resolvedInput = applyPolicyToInput({
        input: resolveReferences(step.input_json || {}, context),
        toolName: step.tool_name,
        policy,
      })

      try {
        const execution = await executeToolSafely({
          agentPrincipalId: run.agent_principal_id,
          toolName: step.tool_name,
          input: resolvedInput,
          idempotencyKey: `workflow:${run.id}:${step.step_order}:${step.tool_name}`,
          dryRun: Boolean(step.dry_run),
          actorId,
        })

        await step.update({
          status: STEP_STATUSES.COMPLETED,
          resolved_input_json: resolvedInput,
          output_json: execution,
          agent_tool_invocation_id: execution.invocation?.id || null,
          completed_at: new Date(),
        })
        context.steps[step.step_name] = execution
        completedCount += 1
      } catch (error) {
        const errorPayload = {
          message: error.message,
          statusCode: error.statusCode || 500,
          code: error.code || null,
          errors: error.errors || null,
        }
        await step.update({
          status: STEP_STATUSES.FAILED,
          resolved_input_json: resolvedInput,
          error_json: errorPayload,
          completed_at: new Date(),
        })
        context.steps[step.step_name] = { error: errorPayload }
        failedCount += 1
        if (!step.continue_on_error) break
      }
    }

    const finalStatus =
      failedCount === 0
        ? WORKFLOW_STATUSES.COMPLETED
        : completedCount > 0
          ? WORKFLOW_STATUSES.COMPLETED_WITH_ERRORS
          : WORKFLOW_STATUSES.FAILED
    const summary = {
      total_steps: steps.length,
      completed_steps: completedCount,
      failed_steps: failedCount,
      policy,
    }

    await run.update({
      status: finalStatus,
      summary_json: summary,
      error_json: failedCount ? { failed_steps: failedCount } : null,
      completed_at: new Date(),
    })

    await AuditService.logEvent({
      actorId,
      eventType: finalStatus === WORKFLOW_STATUSES.COMPLETED ? "agent_workflow_completed" : "agent_workflow_failed",
      entityType: "agent_workflow_run",
      entityId: run.id,
      metadata: {
        agent_principal_id: run.agent_principal_id,
        workflow_type: run.workflow_type,
        summary,
      },
      after: {
        status: finalStatus,
        summary,
      },
    })

    return await this.getWorkflowRun({ workflowRunId: run.id })
  }
}

AgentWorkflowService.constants = {
  WORKFLOW_STATUSES,
  STEP_STATUSES,
  WORKFLOW_TYPES,
}

module.exports = AgentWorkflowService
