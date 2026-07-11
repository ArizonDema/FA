const ResponseHandler = require("../../../utils/responseHandler")
const ReportingProjectService = require("../services/reportingProject.service")

class ReportingProjectController {
  static async listProjects(req, res, next) {
    try {
      const projects = await ReportingProjectService.listProjects({
        fundId: req.params.fundId,
        filters: req.query || {},
      })
      return ResponseHandler.success(res, { projects }, "Reporting projects retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createProject(req, res, next) {
    try {
      const project = await ReportingProjectService.createProject({
        fundId: req.params.fundId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.created(res, { project }, "Reporting project created")
    } catch (error) {
      return next(error)
    }
  }

  static async getProject(req, res, next) {
    try {
      const project = await ReportingProjectService.getProject({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
      })
      return ResponseHandler.success(res, { project }, "Reporting project retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async updateProject(req, res, next) {
    try {
      const project = await ReportingProjectService.updateProject({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.success(res, { project }, "Reporting project updated")
    } catch (error) {
      return next(error)
    }
  }

  static async attachSource(req, res, next) {
    try {
      const result = await ReportingProjectService.attachSource({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.created(res, result, "Reporting project source attached")
    } catch (error) {
      return next(error)
    }
  }

  static async removeSource(req, res, next) {
    try {
      const project = await ReportingProjectService.removeSource({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
        sourceId: req.params.sourceId,
        actorId: req.user?.id || null,
      })
      return ResponseHandler.success(res, { project }, "Reporting project source removed")
    } catch (error) {
      return next(error)
    }
  }

  static async runDraft(req, res, next) {
    try {
      const project = await ReportingProjectService.getProject({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
      })
      const AgentReportingToolService = require("../services/agentReportingTool.service")
      const input = {
        fund_id: req.params.fundId,
        project_id: req.params.projectId,
        run_validation: req.body?.run_validation !== false,
        ...(project.report_type === "cash_flow" ? { output_format: "xlsx" } : {}),
      }
      const result = await AgentReportingToolService.runReport(input, {
        delegatedUserId: req.user?.id || null,
        toolName: "reporting_workbench_run_draft",
      })

      const readinessStatus = result?.validationResult?.readinessStatus
      const status = readinessStatus === "ready" ? "validation_ready" : "mapping_review"
      const updatedProject = await ReportingProjectService.updateProject({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
        actorId: req.user?.id || null,
        fields: {
          status,
          metadata_json: {
            coverage_exception: null,
            coverage_exception_resolved_at: new Date().toISOString(),
          },
        },
      })

      return ResponseHandler.success(
        res,
        { result, project: updatedProject },
        "Draft reporting project output generated",
      )
    } catch (error) {
      if (
        error?.name === "CashFlowValidationError" ||
        error?.details?.code === "cash_flow_template_coverage_failed"
      ) {
        try {
          await ReportingProjectService.updateProject({
            fundId: req.params.fundId,
            projectId: req.params.projectId,
            actorId: req.user?.id || null,
            fields: {
              status: "mapping_review",
              metadata_json: {
                coverage_exception: error.details || null,
                coverage_exception_recorded_at: new Date().toISOString(),
              },
            },
          })
        } catch (persistenceError) {
          void persistenceError
        }
        return ResponseHandler.badRequest(res, error.message, error.details || null)
      }
      return next(error)
    }
  }

  static async getReadiness(req, res, next) {
    try {
      const readiness = await ReportingProjectService.getProjectReadiness({
        fundId: req.params.fundId,
        projectId: req.params.projectId,
      })
      return ResponseHandler.success(res, { readiness }, "Reporting project readiness retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = ReportingProjectController
