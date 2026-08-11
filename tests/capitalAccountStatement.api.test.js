const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockPortfolioFindByPk = jest.fn()
const mockReportRunFindByPk = jest.fn()
const mockRunGenericReport = jest.fn()
const mockGetHistory = jest.fn()

jest.mock("../src/middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: "admin-1", role: "admin" }
    next()
  },
  authorize: () => (req, res, next) => next(),
}))

jest.mock("../src/models", () => ({
  Portfolio: { findByPk: (...args) => mockPortfolioFindByPk(...args) },
  ReportRun: { findByPk: (...args) => mockReportRunFindByPk(...args) },
}))

jest.mock("../src/modules/reports/services/reportRun.service", () => ({
  runGenericReport: (...args) => mockRunGenericReport(...args),
  getHistory: (...args) => mockGetHistory(...args),
}))

const routes = require("../src/routes/capital-account-statement.routes")

describe("capital account statement API", () => {
  const app = express()
  app.use(express.json())
  app.use("/capital-account-statements", routes)
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockPortfolioFindByPk.mockResolvedValue({ id: "fund-1" })
    mockRunGenericReport.mockResolvedValue({
      run: { id: "run-1", type: "capital_account_statement" },
      preview: { capitalAccountStatements: { statements: [] } },
      outputs: { xlsx: "report.xlsx" },
    })
    mockGetHistory.mockResolvedValue([{ id: "run-1", type: "capital_account_statement" }])
  })

  test("forces the specialized report type and XLSX output", async () => {
    const response = await request(app)
      .post("/capital-account-statements/reports/run")
      .send({
        portfolio_id: "fund-1",
        period_start: "2026-01-01",
        period_end: "2026-06-30",
        investor_profile_id: "investor-1",
        type: "cash_flow",
        format: "pdf",
      })

    expect(response.status).toBe(200)
    expect(response.body.data.run.id).toBe("run-1")
    expect(mockRunGenericReport).toHaveBeenCalledWith({
      actorId: "admin-1",
      payload: expect.objectContaining({
        portfolio_id: "fund-1",
        investor_profile_id: "investor-1",
        type: "capital_account_statement",
        format: "xlsx",
      }),
    })
  })

  test("returns only capital account statement history for the selected fund", async () => {
    const response = await request(app)
      .get("/capital-account-statements/reports/history")
      .query({ portfolio_id: "fund-1" })

    expect(response.status).toBe(200)
    expect(response.body.data.runs).toHaveLength(1)
    expect(mockGetHistory).toHaveBeenCalledWith({
      fundId: "fund-1",
      type: "capital_account_statement",
    })
  })

  test("validates required fund and statement dates", async () => {
    const response = await request(app)
      .post("/capital-account-statements/reports/run")
      .send({ portfolio_id: "fund-1", period_start: "2026-07-01", period_end: "2026-01-01" })

    expect(response.status).toBe(400)
    expect(mockRunGenericReport).not.toHaveBeenCalled()
  })
})
