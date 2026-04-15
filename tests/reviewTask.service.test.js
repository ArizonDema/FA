const mockTemplateFindByPk = jest.fn()
const mockTemplateVersionFindOne = jest.fn()
const mockTemplateRowFindAll = jest.fn()
const mockTemplateRowSuggestionFindAll = jest.fn()
const mockTemplateRowMappingFindAll = jest.fn()
const mockReviewTaskFindAll = jest.fn()
const mockReviewTaskCreate = jest.fn()
const mockReviewDecisionFindAll = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockGroupTemplateRowSuggestions = jest.fn()

jest.mock("../src/models", () => ({
  Template: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
  },
  CashFlowTemplate: {
    findByPk: (...args) => mockTemplateFindByPk(...args),
  },
  TemplateVersion: {
    findOne: (...args) => mockTemplateVersionFindOne(...args),
  },
  TemplateRow: {
    findAll: (...args) => mockTemplateRowFindAll(...args),
  },
  TemplateRowMappingSuggestion: {
    findAll: (...args) => mockTemplateRowSuggestionFindAll(...args),
  },
  TemplateRowSemanticMapping: {
    findAll: (...args) => mockTemplateRowMappingFindAll(...args),
  },
  ReviewTask: {
    findAll: (...args) => mockReviewTaskFindAll(...args),
    create: (...args) => mockReviewTaskCreate(...args),
    findByPk: jest.fn(),
  },
  ReviewDecision: {
    findAll: (...args) => mockReviewDecisionFindAll(...args),
  },
  SemanticConcept: {},
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

jest.mock("../src/modules/mappings/services/mappingReliability.service", () => ({
  groupTemplateRowSuggestions: (...args) => mockGroupTemplateRowSuggestions(...args),
}))

const ReviewTaskService = require("../src/modules/reviews/services/reviewTask.service")

function createTaskRecord(overrides = {}) {
  return {
    id: "task-1",
    target_id: "row-1",
    target_type: "template_row",
    template_version_id: "version-1",
    portfolio_id: "fund-1",
    status: "open",
    priority: "medium",
    review_reason: "approval_required",
    metadata_json: {},
    toJSON() {
      return {
        id: this.id,
        target_id: this.target_id,
        target_type: this.target_type,
        template_version_id: this.template_version_id,
        portfolio_id: this.portfolio_id,
        status: this.status,
        priority: this.priority,
        review_reason: this.review_reason,
        metadata_json: this.metadata_json,
      }
    },
    ...overrides,
  }
}

describe("ReviewTaskService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTemplateFindByPk.mockResolvedValue({ id: "template-1", portfolio_id: "fund-1" })
    mockTemplateVersionFindOne.mockResolvedValue({ id: "version-1", template_id: "template-1", portfolio_id: "fund-1" })
    mockTemplateRowFindAll.mockResolvedValue([
      {
        id: "row-1",
        template_version_id: "version-1",
        label: "Management Fees",
        row_type: "data_row",
        row_order: 1,
        row_index: 1,
        section_name: "Operating Activities",
      },
      {
        id: "row-2",
        template_version_id: "version-1",
        label: "",
        row_type: "blank",
        row_order: 2,
        row_index: 2,
        section_name: null,
      },
    ])
    mockTemplateRowSuggestionFindAll.mockResolvedValue([
      {
        id: "suggestion-1",
        template_row_id: "row-1",
        template_version_id: "version-1",
        semantic_concept_id: "concept-1",
        rank: 1,
        confidence_score: 0.91,
        source: "deterministic_engine",
        status: "suggested",
        metadata_json: {},
        semanticConcept: {
          stable_key: "management_fees",
          label: "Management Fees",
          description: "Management fee expense",
        },
      },
    ])
    mockTemplateRowMappingFindAll.mockResolvedValue([])
    mockReviewTaskFindAll.mockResolvedValue([])
    mockReviewTaskCreate.mockImplementation(async (payload) => createTaskRecord(payload))
    mockReviewDecisionFindAll.mockResolvedValue([])
    mockAuditLogEvent.mockResolvedValue(null)
    mockGroupTemplateRowSuggestions.mockResolvedValue([
      {
        templateRowId: "row-1",
        templateRow: {
          id: "row-1",
          label: "Management Fees",
          rowType: "data_row",
          rowOrder: 1,
        },
        assessment: {
          semanticConfidence: 0.91,
          accountCoverageScore: 0,
          evidenceScore: 0,
          reportReliabilityStatus: "semantically_matched_ungrounded",
          humanReviewRequired: true,
          reviewReasons: ["no_account_grounding", "no_approved_account_mappings"],
          explainability: {
            approvedAccountMappingsCount: 0,
          },
        },
        suggestions: [
          {
            id: "suggestion-1",
            source: "deterministic_engine",
            semanticConceptKey: "management_fees",
            semanticConfidence: 0.91,
            accountCoverageScore: 0,
            evidenceScore: 0,
            reportReliabilityStatus: "semantically_matched_ungrounded",
            humanReviewRequired: true,
            reviewReasons: ["no_account_grounding", "no_approved_account_mappings"],
          },
        ],
      },
    ])
  })

  test("creates review tasks for unmapped reviewable template rows", async () => {
    const result = await ReviewTaskService.generateTemplateVersionReviewTasks({
      templateId: "template-1",
      versionId: "version-1",
      actorId: "admin-1",
    })

    expect(result.summary.tasksCreated).toBe(1)
    expect(result.reviewTasks[0].target.label).toBe("Management Fees")
    expect(result.reviewTasks[0].reviewReason).toBe("no_account_grounding")
    expect(mockReviewTaskCreate).toHaveBeenCalled()
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "review_task_created",
      }),
    )
  })

  test("skips rows that already have active review tasks", async () => {
    mockReviewTaskFindAll.mockResolvedValue([
      {
        id: "task-existing",
        target_id: "row-1",
      },
    ])

    const result = await ReviewTaskService.generateTemplateVersionReviewTasks({
      templateId: "template-1",
      versionId: "version-1",
      actorId: "admin-1",
    })

    expect(result.summary.tasksCreated).toBe(0)
    expect(result.summary.rowsSkippedActiveTask).toBe(1)
    expect(mockReviewTaskCreate).not.toHaveBeenCalled()
  })
})
