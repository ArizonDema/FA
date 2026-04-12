const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockListConcepts = jest.fn()
const mockListAccountMappings = jest.fn()
const mockCreateAccountMapping = jest.fn()
const mockUpdateAccountMappingStatus = jest.fn()
const mockListTemplateRowMappings = jest.fn()
const mockCreateTemplateRowMapping = jest.fn()
const mockUpdateTemplateRowMappingStatus = jest.fn()
const mockAuditFindAll = jest.fn()

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

jest.mock("../src/modules/semantic/services/semanticConcept.service", () => ({
  list: (...args) => mockListConcepts(...args),
}))

jest.mock("../src/modules/mappings/services/mapping.service", () => ({
  listAccountMappings: (...args) => mockListAccountMappings(...args),
  createAccountMapping: (...args) => mockCreateAccountMapping(...args),
  updateAccountMappingStatus: (...args) => mockUpdateAccountMappingStatus(...args),
  listTemplateRowMappings: (...args) => mockListTemplateRowMappings(...args),
  createTemplateRowMapping: (...args) => mockCreateTemplateRowMapping(...args),
  updateTemplateRowMappingStatus: (...args) => mockUpdateTemplateRowMappingStatus(...args),
}))

jest.mock("../src/models", () => ({
  AuditEvent: {
    findAll: (...args) => mockAuditFindAll(...args),
  },
}))

const semanticRoutes = require("../src/modules/semantic/routes/semantic.routes")
const mappingRoutes = require("../src/modules/mappings/routes/mappings.routes")
const auditRoutes = require("../src/modules/audit/routes/audit.routes")

describe("Phase 1 foundation API routes", () => {
  const app = express()
  app.use(express.json())
  app.use("/semantic-concepts", semanticRoutes)
  app.use("/mappings", mappingRoutes)
  app.use("/audit-events", auditRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockListConcepts.mockResolvedValue([{ id: "concept-1", stable_key: "opening_cash" }])
    mockListAccountMappings.mockResolvedValue([{ id: "mapping-1" }])
    mockCreateAccountMapping.mockResolvedValue({ id: "mapping-1", status: "suggested" })
    mockUpdateAccountMappingStatus.mockResolvedValue({ id: "mapping-1", status: "approved" })
    mockListTemplateRowMappings.mockResolvedValue([{ id: "row-mapping-1" }])
    mockCreateTemplateRowMapping.mockResolvedValue({ id: "row-mapping-1", status: "suggested" })
    mockUpdateTemplateRowMappingStatus.mockResolvedValue({ id: "row-mapping-1", status: "approved" })
    mockAuditFindAll.mockResolvedValue([{ id: "audit-1", event_type: "template_created" }])
  })

  test("lists semantic concepts", async () => {
    const response = await request(app).get("/semantic-concepts")
    expect(response.status).toBe(200)
    expect(response.body.data.concepts).toHaveLength(1)
  })

  test("creates and updates account mappings", async () => {
    const createResponse = await request(app).post("/mappings/accounts").send({
      fund_id: "fund-1",
      account: { name: "Cash" },
      semantic_concept_key: "opening_cash",
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data.mapping.id).toBe("mapping-1")

    const updateResponse = await request(app).patch("/mappings/accounts/mapping-1/status").send({
      status: "approved",
    })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.mapping.status).toBe("approved")
  })

  test("creates and updates template row mappings", async () => {
    const createResponse = await request(app).post("/mappings/template-rows").send({
      fund_id: "fund-1",
      template_version_id: "version-1",
      template_row: { row_index: 2, label: "Subscriptions" },
      semantic_concept_key: "subscriptions",
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data.mapping.id).toBe("row-mapping-1")

    const updateResponse = await request(app).patch("/mappings/template-rows/row-mapping-1/status").send({
      status: "approved",
    })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.mapping.status).toBe("approved")
  })

  test("lists audit events", async () => {
    const response = await request(app).get("/audit-events")
    expect(response.status).toBe(200)
    expect(response.body.data.events).toHaveLength(1)
  })
})
