const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockReviewTaskService = {
  listReviewTasks: jest.fn(),
  getReviewTask: jest.fn(),
  getTaskTargetType: jest.fn(),
  approveGenericTask: jest.fn(),
  rejectGenericTask: jest.fn(),
  deferGenericTask: jest.fn(),
}

const mockMappingReviewService = {
  approveTask: jest.fn(),
  rejectTask: jest.fn(),
  overrideTask: jest.fn(),
  deferTask: jest.fn(),
}

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-1", role: "admin" }
    next()
  },
  authorize:
    () =>
    (req, res, next) => {
      next()
    },
}))

jest.mock("../src/modules/reviews/services/reviewTask.service", () => mockReviewTaskService)
jest.mock("../src/modules/reviews/services/mappingReview.service", () => mockMappingReviewService)

const reviewRoutes = require("../src/modules/reviews/routes/review.routes")

describe("Review workflow API", () => {
  const app = express()
  app.use(express.json())
  app.use("/review-tasks", reviewRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockReviewTaskService.listReviewTasks.mockResolvedValue({
      total: 1,
      tasks: [
        {
          id: "task-1",
          status: "open",
          priority: "high",
          reviewReason: "llm_disagreement",
          target: {
            id: "row-1",
            label: "Management fee accrual",
          },
        },
      ],
    })
    mockReviewTaskService.getReviewTask.mockResolvedValue({
      id: "task-1",
      status: "open",
      reviewContext: {
        deterministicCandidates: [{ semanticConceptKey: "management_fees" }],
        llmAssistedCandidates: [{ semanticConceptKey: "accrued_expenses" }],
      },
    })
    mockReviewTaskService.getTaskTargetType.mockResolvedValue("template_row")
    mockReviewTaskService.approveGenericTask.mockResolvedValue({
      id: "task-export",
      status: "approved",
      targetType: "report_export",
    })
    mockReviewTaskService.rejectGenericTask.mockResolvedValue({
      id: "task-export",
      status: "rejected",
      targetType: "report_export",
    })
    mockReviewTaskService.deferGenericTask.mockResolvedValue({
      id: "task-export",
      status: "deferred",
      targetType: "report_export",
    })
    mockMappingReviewService.approveTask.mockResolvedValue({
      id: "task-1",
      status: "approved",
      currentApprovedMapping: {
        id: "mapping-1",
        semanticConceptKey: "management_fees",
      },
    })
    mockMappingReviewService.rejectTask.mockResolvedValue({
      id: "task-1",
      status: "rejected",
    })
    mockMappingReviewService.overrideTask.mockResolvedValue({
      id: "task-1",
      status: "overridden",
      currentApprovedMapping: {
        id: "mapping-2",
        semanticConceptKey: "accrued_expenses",
      },
    })
    mockMappingReviewService.deferTask.mockResolvedValue({
      id: "task-1",
      status: "deferred",
    })
  })

  test("lists review tasks", async () => {
    const response = await request(app).get("/review-tasks?status=open")

    expect(response.status).toBe(200)
    expect(response.body.data.total).toBe(1)
    expect(response.body.data.review_tasks[0].priority).toBe("high")
  })

  test("retrieves a review task with context", async () => {
    const response = await request(app).get("/review-tasks/task-1?mark_in_review=true")

    expect(response.status).toBe(200)
    expect(response.body.data.review_task.reviewContext.deterministicCandidates[0].semanticConceptKey).toBe(
      "management_fees",
    )
    expect(mockReviewTaskService.getReviewTask).toHaveBeenCalledWith({
      taskId: "task-1",
      actorId: "admin-1",
      markInReview: true,
    })
  })

  test("approves a review task and returns the durable mapping context", async () => {
    const response = await request(app).post("/review-tasks/task-1/approve").send({
      suggestion_id: "suggestion-1",
      rationale: "Matches the row label exactly.",
    })

    expect(response.status).toBe(200)
    expect(response.body.data.review_task.status).toBe("approved")
    expect(response.body.data.review_task.currentApprovedMapping.semanticConceptKey).toBe("management_fees")
  })

  test("approves generic review tasks through the generic workflow", async () => {
    mockReviewTaskService.getTaskTargetType.mockResolvedValueOnce("report_export")

    const response = await request(app).post("/review-tasks/task-export/approve").send({
      rationale: "Validated and ready for final export.",
    })

    expect(response.status).toBe(200)
    expect(response.body.data.review_task.targetType).toBe("report_export")
    expect(mockReviewTaskService.approveGenericTask).toHaveBeenCalledWith({
      taskId: "task-export",
      actorId: "admin-1",
      rationale: "Validated and ready for final export.",
    })
    expect(mockMappingReviewService.approveTask).not.toHaveBeenCalled()
  })

  test("overrides a review task", async () => {
    const response = await request(app).post("/review-tasks/task-1/override").send({
      semantic_concept_id: "concept-2",
      rationale: "This row is an accrual, not a cash expense.",
    })

    expect(response.status).toBe(200)
    expect(response.body.data.review_task.status).toBe("overridden")
    expect(response.body.data.review_task.currentApprovedMapping.semanticConceptKey).toBe("accrued_expenses")
  })
})
