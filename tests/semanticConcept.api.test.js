const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockList = jest.fn()
const mockGetById = jest.fn()
const mockGetByKey = jest.fn()
const mockListCategories = jest.fn()
const mockCreate = jest.fn()

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

jest.mock("../src/modules/semantic/services/semanticConcept.service", () => {
  class ValidationError extends Error {}

  return {
    list: (...args) => mockList(...args),
    getById: (...args) => mockGetById(...args),
    getByKey: (...args) => mockGetByKey(...args),
    listCategories: (...args) => mockListCategories(...args),
    create: (...args) => mockCreate(...args),
    ValidationError,
  }
})

const semanticRoutes = require("../src/modules/semantic/routes/semantic.routes")

describe("SemanticConcept API", () => {
  const app = express()
  app.use(express.json())
  app.use("/semantic-concepts", semanticRoutes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockList.mockResolvedValue([{ id: "concept-1", key: "opening_cash" }])
    mockGetById.mockResolvedValue({ id: "concept-1", key: "opening_cash" })
    mockGetByKey.mockResolvedValue({ id: "concept-1", key: "opening_cash" })
    mockListCategories.mockResolvedValue([{ key: "cash_position", conceptCount: 2 }])
    mockCreate.mockResolvedValue({ id: "concept-2", key: "capital_calls" })
  })

  test("lists concepts", async () => {
    const response = await request(app).get("/semantic-concepts?category=cash_position&statement_type=cash_flow")
    expect(response.status).toBe(200)
    expect(response.body.data.concepts[0].key).toBe("opening_cash")
  })

  test("lists categories", async () => {
    const response = await request(app).get("/semantic-concepts/categories")
    expect(response.status).toBe(200)
    expect(response.body.data.categories[0].key).toBe("cash_position")
  })

  test("gets a concept by key", async () => {
    const response = await request(app).get("/semantic-concepts/key/opening_cash")
    expect(response.status).toBe(200)
    expect(response.body.data.concept.key).toBe("opening_cash")
  })

  test("gets a concept by id", async () => {
    const response = await request(app).get("/semantic-concepts/concept-1")
    expect(response.status).toBe(200)
    expect(response.body.data.concept.id).toBe("concept-1")
  })

  test("creates a concept", async () => {
    const response = await request(app).post("/semantic-concepts").send({
      key: "capital_calls",
      label: "Capital Calls",
      category: "capital_activity",
    })

    expect(response.status).toBe(201)
    expect(response.body.data.concept.key).toBe("capital_calls")
  })
})
