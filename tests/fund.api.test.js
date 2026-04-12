const express = require("express")
const request = require("supertest")
const errorHandler = require("../src/middlewares/errorHandler")

const mockListFunds = jest.fn()
const mockCreateFund = jest.fn()
const mockGetFundProfile = jest.fn()
const mockUpdateFundProfile = jest.fn()

jest.mock("../src/modules/funds/services/fund.service", () => ({
  listFunds: (...args) => mockListFunds(...args),
  createFund: (...args) => mockCreateFund(...args),
  getFundProfile: (...args) => mockGetFundProfile(...args),
  updateFundProfile: (...args) => mockUpdateFundProfile(...args),
}))

const FundController = require("../src/modules/funds/controllers/fund.controller")

describe("FundController API", () => {
  const app = express()
  app.use(express.json())
  app.get("/funds", FundController.getFunds)
  app.post("/funds", (req, res, next) => {
    req.user = { id: "admin-1" }
    return FundController.createFund(req, res, next)
  })
  app.get("/funds/:id/profile", FundController.getFundProfile)
  app.put("/funds/:id/profile", (req, res, next) => {
    req.user = { id: "admin-1" }
    return FundController.updateFundProfile(req, res, next)
  })
  app.use(errorHandler)

  beforeEach(() => {
    jest.clearAllMocks()
    mockListFunds.mockResolvedValue([{ id: "fund-1", fund_id: "fund-1", name: "Fund One" }])
    mockCreateFund.mockResolvedValue({ id: "fund-1", fund_id: "fund-1", name: "Fund One" })
    mockGetFundProfile.mockResolvedValue({ fund: { id: "fund-1", fund_id: "fund-1", name: "Fund One" } })
    mockUpdateFundProfile.mockResolvedValue({ id: "fund-1", fund_id: "fund-1", name: "Fund Updated" })
  })

  test("lists funds", async () => {
    const response = await request(app).get("/funds")
    expect(response.status).toBe(200)
    expect(response.body.data.funds).toHaveLength(1)
  })

  test("creates a fund", async () => {
    const response = await request(app).post("/funds").send({ name: "Fund One" })
    expect(response.status).toBe(201)
    expect(response.body.data.fund.fund_id).toBe("fund-1")
  })

  test("retrieves a fund profile", async () => {
    const response = await request(app).get("/funds/fund-1/profile")
    expect(response.status).toBe(200)
    expect(response.body.data.fund.fund_id).toBe("fund-1")
  })
})
