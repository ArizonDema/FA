const mockTransaction = jest.fn(async (callback) => callback({}))
const mockReviewTaskFindByPk = jest.fn()
const mockSuggestionFindByPk = jest.fn()
const mockSuggestionFindOne = jest.fn()
const mockConceptFindByPk = jest.fn()
const mockReviewDecisionCreate = jest.fn()
const mockTemplateRowMappingFindAll = jest.fn()
const mockTemplateRowMappingCreate = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockGetReviewTask = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: (...args) => mockTransaction(...args),
  },
  ReviewTask: {
    findByPk: (...args) => mockReviewTaskFindByPk(...args),
  },
  ReviewDecision: {
    create: (...args) => mockReviewDecisionCreate(...args),
  },
  TemplateRowMappingSuggestion: {
    findByPk: (...args) => mockSuggestionFindByPk(...args),
    findOne: (...args) => mockSuggestionFindOne(...args),
  },
  SemanticConcept: {
    findByPk: (...args) => mockConceptFindByPk(...args),
  },
  TemplateRowSemanticMapping: {
    findAll: (...args) => mockTemplateRowMappingFindAll(...args),
    create: (...args) => mockTemplateRowMappingCreate(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

jest.mock("../src/modules/reviews/services/reviewTask.service", () => ({
  getReviewTask: (...args) => mockGetReviewTask(...args),
}))

const MappingReviewService = require("../src/modules/reviews/services/mappingReview.service")

function createTaskRecord() {
  return {
    id: "task-1",
    target_id: "row-1",
    target_type: "template_row",
    template_version_id: "version-1",
    portfolio_id: "fund-1",
    status: "open",
    metadata_json: {},
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return {
        id: this.id,
        target_id: this.target_id,
        target_type: this.target_type,
        template_version_id: this.template_version_id,
        portfolio_id: this.portfolio_id,
        status: this.status,
        metadata_json: this.metadata_json,
      }
    },
  }
}

describe("MappingReviewService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReviewTaskFindByPk.mockResolvedValue(createTaskRecord())
    mockSuggestionFindByPk.mockResolvedValue({
      id: "suggestion-1",
      template_row_id: "row-1",
      semantic_concept_id: "concept-1",
      source: "llm_assisted",
      rank: 1,
      merged_score: 0.88,
      confidence_score: 0.72,
      generated_by: "system",
    })
    mockSuggestionFindOne.mockResolvedValue(null)
    mockConceptFindByPk.mockResolvedValue({
      id: "concept-1",
      stable_key: "management_fees",
      label: "Management Fees",
    })
    mockReviewDecisionCreate.mockResolvedValue({
      id: "decision-1",
      update: jest.fn(async function update(values) {
        Object.assign(this, values)
        return this
      }),
    })
    mockTemplateRowMappingFindAll.mockResolvedValue([
      {
        id: "mapping-old",
        metadata_json: {},
        update: jest.fn(async function update(values) {
          Object.assign(this, values)
          return this
        }),
      },
    ])
    mockTemplateRowMappingCreate.mockResolvedValue({
      id: "mapping-new",
    })
    mockAuditLogEvent.mockResolvedValue(null)
    mockGetReviewTask.mockResolvedValue({
      id: "task-1",
      status: "approved",
      currentApprovedMapping: {
        id: "mapping-new",
      },
    })
  })

  test("approves a suggestion and writes a durable approved mapping", async () => {
    const result = await MappingReviewService.approveTask({
      taskId: "task-1",
      actorId: "admin-1",
      suggestionId: "suggestion-1",
      rationale: "Matches the line item.",
    })

    expect(mockTemplateRowMappingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        template_row_id: "row-1",
        semantic_concept_id: "concept-1",
        status: "approved",
        review_task_id: "task-1",
        review_decision_id: "decision-1",
      }),
      expect.any(Object),
    )
    expect(mockTemplateRowMappingFindAll).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "mapping_approved",
      }),
    )
    expect(result.currentApprovedMapping.id).toBe("mapping-new")
  })

  test("requires rationale for overrides", async () => {
    await expect(
      MappingReviewService.overrideTask({
        taskId: "task-1",
        actorId: "admin-1",
        semanticConceptId: "concept-1",
      }),
    ).rejects.toMatchObject({
      code: "review_validation",
    })
  })
})
