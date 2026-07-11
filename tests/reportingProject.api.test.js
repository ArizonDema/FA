const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockReportingProjectService = {
  listProjects: jest.fn(),
  createProject: jest.fn(),
  getProject: jest.fn(),
  updateProject: jest.fn(),
  attachSource: jest.fn(),
  removeSource: jest.fn(),
  getProjectReadiness: jest.fn(),
}
const mockAgentReportingToolService = {
  runReport: jest.fn(),
}

jest.mock("../src/modules/reporting-projects/services/reportingProject.service", () => mockReportingProjectService)
jest.mock("../src/modules/reporting-projects/services/agentReportingTool.service", () => mockAgentReportingToolService)

const ReportingProjectController = require("../src/modules/reporting-projects/controllers/reportingProject.controller")

describe("ReportingProjectController API", () => {
  const app = express()
  app.use(express.json())
  app.get("/funds/:fundId/reporting-projects", ReportingProjectController.listProjects)
  app.post("/funds/:fundId/reporting-projects", (req, res, next) => {
    req.user = { id: "admin-1" }
    return ReportingProjectController.createProject(req, res, next)
  })
  app.get("/funds/:fundId/reporting-projects/:projectId", ReportingProjectController.getProject)
  app.patch("/funds/:fundId/reporting-projects/:projectId", (req, res, next) => {
    req.user = { id: "admin-1" }
    return ReportingProjectController.updateProject(req, res, next)
  })
  app.post("/funds/:fundId/reporting-projects/:projectId/run", (req, res, next) => {
    req.user = { id: "admin-1" }
    return ReportingProjectController.runDraft(req, res, next)
  })
  app.post("/funds/:fundId/reporting-projects/:projectId/sources", (req, res, next) => {
    req.user = { id: "admin-1" }
    return ReportingProjectController.attachSource(req, res, next)
  })
  app.get("/funds/:fundId/reporting-projects/:projectId/readiness", ReportingProjectController.getReadiness)
  app.delete("/funds/:fundId/reporting-projects/:projectId/sources/:sourceId", (req, res, next) => {
    req.user = { id: "admin-1" }
    return ReportingProjectController.removeSource(req, res, next)
  })
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockReportingProjectService.listProjects.mockResolvedValue([{ id: "project-1", name: "Q1 Cash Flow" }])
    mockReportingProjectService.createProject.mockResolvedValue({ id: "project-1", status: "draft" })
    mockReportingProjectService.getProject.mockResolvedValue({ id: "project-1", report_type: "cash_flow", sources: [] })
    mockReportingProjectService.updateProject.mockResolvedValue({ id: "project-1", status: "inputs_ready" })
    mockReportingProjectService.attachSource.mockResolvedValue({
      source: { id: "source-1", source_role: "trial_balance" },
      project: { id: "project-1" },
    })
    mockReportingProjectService.getProjectReadiness.mockResolvedValue({
      project_id: "project-1",
      status: "inputs_missing",
      missing_source_roles: ["general_ledger"],
    })
    mockReportingProjectService.removeSource.mockResolvedValue({ id: "project-1", sources: [] })
    mockAgentReportingToolService.runReport.mockResolvedValue({
      run: { id: "run-1" },
      validationResult: { readinessStatus: "ready" },
    })
  })

  test("creates, lists, reads, attaches sources, and returns readiness", async () => {
    const listResponse = await request(app).get("/funds/fund-1/reporting-projects?status=draft")
    const createResponse = await request(app)
      .post("/funds/fund-1/reporting-projects")
      .send({ name: "Q1 Cash Flow", report_type: "cash_flow" })
    const readResponse = await request(app).get("/funds/fund-1/reporting-projects/project-1")
    const updateResponse = await request(app)
      .patch("/funds/fund-1/reporting-projects/project-1")
      .send({ owner_name: "Avery", due_date: "2026-04-15", status: "inputs_ready" })
    const attachResponse = await request(app)
      .post("/funds/fund-1/reporting-projects/project-1/sources")
      .send({ source_role: "trial_balance", repository_version_id: "version-1" })
    const readinessResponse = await request(app).get("/funds/fund-1/reporting-projects/project-1/readiness")
    const removeResponse = await request(app).delete(
      "/funds/fund-1/reporting-projects/project-1/sources/source-1",
    )

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(201)
    expect(readResponse.body.data.project.id).toBe("project-1")
    expect(updateResponse.body.data.project.status).toBe("inputs_ready")
    expect(attachResponse.status).toBe(201)
    expect(readinessResponse.body.data.readiness.missing_source_roles).toEqual(["general_ledger"])
    expect(removeResponse.status).toBe(200)
    expect(mockReportingProjectService.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1", actorId: "admin-1" }),
    )
    expect(mockReportingProjectService.attachSource).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        projectId: "project-1",
        actorId: "admin-1",
      }),
    )
    expect(mockReportingProjectService.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1", projectId: "project-1", actorId: "admin-1" }),
    )
    expect(mockReportingProjectService.removeSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "source-1", actorId: "admin-1" }),
    )
  })

  test("preserves actionable template coverage details when draft generation is blocked", async () => {
    const coverageError = new Error("Template is missing cash-flow rows")
    coverageError.name = "CashFlowValidationError"
    coverageError.details = {
      code: "cash_flow_template_coverage_failed",
      title: "Template needs rows before this report can run",
      message: "Template is missing cash-flow rows",
      missing_items: [
        {
          display_name: "Marketing spend",
          total_amount: 1200,
          suggested_template_row_label: "Marketing spend",
        },
      ],
    }
    mockAgentReportingToolService.runReport.mockRejectedValueOnce(coverageError)

    const response = await request(app)
      .post("/funds/fund-1/reporting-projects/project-1/run")
      .send({ run_validation: true })

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual(
      expect.objectContaining({
        code: "cash_flow_template_coverage_failed",
        missing_items: [expect.objectContaining({ display_name: "Marketing spend" })],
      }),
    )
    expect(mockReportingProjectService.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-1",
        projectId: "project-1",
        fields: expect.objectContaining({
          status: "mapping_review",
          metadata_json: expect.objectContaining({
            coverage_exception: expect.objectContaining({
              code: "cash_flow_template_coverage_failed",
            }),
          }),
        }),
      }),
    )
  })
})
