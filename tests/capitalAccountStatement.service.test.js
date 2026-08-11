const ExcelJS = require("exceljs")

const mockCommitmentFindAll = jest.fn()
const mockCapitalCallLineFindAll = jest.fn()
const mockDistributionLineFindAll = jest.fn()
const mockPortfolioFindByPk = jest.fn()

jest.mock("../src/models", () => ({
  Portfolio: { findByPk: (...args) => mockPortfolioFindByPk(...args) },
  Commitment: { findAll: (...args) => mockCommitmentFindAll(...args) },
  InvestorProfile: { name: "InvestorProfile" },
  ShareClass: { name: "ShareClass" },
  CapitalCall: { name: "CapitalCall" },
  CapitalCallLine: { findAll: (...args) => mockCapitalCallLineFindAll(...args) },
  Distribution: { name: "Distribution" },
  DistributionLine: { findAll: (...args) => mockDistributionLineFindAll(...args) },
}))

const CapitalAccountStatementService = require("../src/services/capitalAccountStatement.service")
const ReportService = require("../src/services/report.service")

describe("CapitalAccountStatementService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPortfolioFindByPk.mockResolvedValue({ id: "fund-1", name: "Example Fund", base_currency: "USD", toJSON() { return { ...this } } })
    mockCommitmentFindAll.mockResolvedValue([
      {
        id: "commitment-1",
        investor_profile_id: "investor-1",
        share_class_id: "class-1",
        commitment_amount: "500.00",
        commitment_date: "2025-01-01",
        investor: { id: "investor-1", legal_name: "Alpha Investor", investor_type: "corporate" },
        shareClass: { id: "class-1", class_name: "Class A", currency: "USD" },
      },
      {
        id: "commitment-2",
        investor_profile_id: "investor-2",
        share_class_id: "class-1",
        commitment_amount: "300.00",
        commitment_date: "2025-06-01",
        investor: { id: "investor-2", legal_name: "Beta Investor", investor_type: "individual" },
        shareClass: { id: "class-1", class_name: "Class A", currency: "USD" },
      },
    ])
    mockCapitalCallLineFindAll.mockResolvedValue([
      {
        commitment_id: "commitment-1",
        called_amount: "100.00",
        paid_amount: "100.00",
        paid_date: "2025-12-15",
        capitalCall: { id: "call-1", call_date: "2025-12-10", status: "closed", memo: "Initial close" },
      },
      {
        commitment_id: "commitment-1",
        called_amount: "75.00",
        paid_amount: "50.00",
        paid_date: "2026-02-10",
        capitalCall: { id: "call-2", call_date: "2026-02-01", status: "issued", memo: "Follow-on call" },
      },
      {
        commitment_id: "commitment-2",
        called_amount: "100.00",
        paid_amount: "100.00",
        paid_date: "2026-03-01",
        capitalCall: { id: "call-3", call_date: "2026-02-20", status: "closed", memo: null },
      },
    ])
    mockDistributionLineFindAll.mockResolvedValue([
      {
        commitment_id: "commitment-1",
        gross_amount: "20.00",
        withholding: "0.00",
        net_amount: "20.00",
        paid_date: "2025-12-20",
        distribution: { id: "dist-1", distribution_date: "2025-12-20", status: "paid", distribution_type: "profit" },
      },
      {
        commitment_id: "commitment-1",
        gross_amount: "30.00",
        withholding: "5.00",
        net_amount: "25.00",
        paid_date: "2026-04-15",
        distribution: { id: "dist-2", distribution_date: "2026-04-15", status: "paid", distribution_type: "return_of_capital" },
      },
    ])
  })

  test("builds investor/share-class rollforwards and commitment reconciliations", async () => {
    const result = await CapitalAccountStatementService.buildStatementData({
      portfolioId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      currency: "USD",
    })

    expect(result.accounting_basis).toBe("transactional_capital")
    expect(result.statements).toHaveLength(2)
    expect(result.totals).toMatchObject({
      investors: 2,
      statements: 2,
      commitment_amount: 800,
      beginning_capital: 80,
      contributions: 150,
      distributions: 30,
      ending_capital: 200,
      called_capital: 275,
      paid_capital: 250,
      outstanding_called_capital: 25,
      unfunded_commitment: 525,
      rollforward_variance: 0,
    })

    const alpha = result.statements.find((statement) => statement.investor_profile_id === "investor-1")
    expect(alpha).toMatchObject({
      beginning_capital: 80,
      contributions: 50,
      distributions: 30,
      distribution_withholding: 5,
      net_distributions_paid: 25,
      ending_capital: 100,
      called_capital: 175,
      paid_capital: 150,
      outstanding_called_capital: 25,
      unfunded_commitment: 325,
      ownership_percentage: 50,
      rollforward_variance: 0,
    })
    expect(alpha.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "Capital contribution", amount: 50 }),
        expect.objectContaining({ type: "Return of capital", amount: -30 }),
      ]),
    )
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "capital_account_allocations_not_available" }),
      ]),
    )
  })

  test("renders a consolidated summary and one worksheet per statement", async () => {
    const data = await CapitalAccountStatementService.buildStatementData({
      portfolioId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    const workbook = new ExcelJS.Workbook()
    CapitalAccountStatementService.addWorkbookSheets(workbook, data, { fundName: "Example Fund" })

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Capital Account Summary",
      "Alpha Investor Class A",
      "Beta Investor Class A",
    ])
    expect(workbook.getWorksheet("Capital Account Summary").getCell("A1").value).toBe(
      "Example Fund - Capital Account Statements",
    )
    expect(workbook.getWorksheet("Alpha Investor Class A").getCell("A1").value).toBe(
      "Capital Account Statement",
    )
  })

  test("is wired into the generic reporting data contract", async () => {
    const report = await ReportService.buildReportData({
      type: "capital_account_statement",
      portfolioId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      investorProfileId: "investor-1",
    })

    expect(report.fund.name).toBe("Example Fund")
    expect(report.capitalAccountStatements.report_type).toBe("capital_account_statement")
    expect(report.capitalAccountStatements.filters.investor_profile_id).toBe("investor-1")
  })

  test("rejects an inverted statement period", async () => {
    await expect(
      CapitalAccountStatementService.buildStatementData({
        portfolioId: "fund-1",
        periodStart: "2026-12-31",
        periodEnd: "2026-01-01",
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCommitmentFindAll).not.toHaveBeenCalled()
  })
})
