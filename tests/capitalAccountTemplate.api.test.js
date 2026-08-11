const express = require("express")
const request = require("supertest")

const mockListTemplates = jest.fn()
const mockActivateTemplate = jest.fn()

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-1", role: "admin" }
    next()
  },
  authorize: () => (req, res, next) => next(),
}))

jest.mock("../src/models", () => ({
  Fund: { findByPk: jest.fn() },
  Portfolio: { findByPk: jest.fn() },
  CashFlowTemplateAnalysis: { findByPk: jest.fn() },
}))

jest.mock("../src/modules/templates/services/template.service", () => ({
  listTemplates: (...args) => mockListTemplates(...args),
  activateTemplate: (...args) => mockActivateTemplate(...args),
  decorateTemplatePayload: (template) => template,
  summarizeWorkbookStructure: jest.fn(),
}))

jest.mock("../src/modules/templates/services/templateAnalysis.service", () => ({
  parseConfigJson: jest.fn(),
  createAnalysisRecord: jest.fn(),
}))

jest.mock("../src/modules/templates/services/capitalAccountTemplate.service", () => ({
  analyzeTemplate: jest.fn(),
  validateConfig: jest.fn((config) => config),
  evaluateReadiness: jest.fn(() => ({ can_activate: true, review_state: "ready", required_anchors: [] })),
}))

const routes = require("../src/routes/capital-account-statement.routes")

describe("capital account statement template API", () => {
  const app = express()
  app.use(express.json())
  app.use("/capital-account-statements", routes)

  beforeEach(() => {
    jest.clearAllMocks()
    mockListTemplates.mockResolvedValue([{ id: "cas-template-1", template_kind: "capital_account_statement" }])
    mockActivateTemplate.mockResolvedValue({
      template: { id: "cas-template-1", template_kind: "capital_account_statement" },
      readiness: { can_activate: true, review_state: "ready", required_anchors: [], anchor_statuses: [] },
      savedAsDraft: false,
    })
  })

  test("lists only the CAS template kind for a fund", async () => {
    const response = await request(app)
      .get("/capital-account-statements/templates")
      .query({ portfolio_id: "fund-1" })

    expect(response.status).toBe(200)
    expect(response.body.data.templates).toHaveLength(1)
    expect(mockListTemplates).toHaveBeenCalledWith("fund-1", "capital_account_statement")
  })

  test("activates through the CAS-scoped lifecycle", async () => {
    const response = await request(app)
      .put("/capital-account-statements/templates/cas-template-1/activate")
      .send({})

    expect(response.status).toBe(200)
    expect(mockActivateTemplate).toHaveBeenCalledWith({
      templateId: "cas-template-1",
      templateKind: "capital_account_statement",
      actorId: "admin-1",
    })
  })
})
