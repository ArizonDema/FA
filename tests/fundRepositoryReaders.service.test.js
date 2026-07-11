const fs = require("fs")
const os = require("os")
const path = require("path")
const ExcelJS = require("exceljs")
const JSZip = require("jszip")
const AccrualScheduleReader = require("../src/modules/repository/readers/accrualSchedule.reader")
const AuditAdjustmentScheduleReader = require("../src/modules/repository/readers/auditAdjustmentSchedule.reader")
const AuditReportReader = require("../src/modules/repository/readers/auditReport.reader")
const BankReconciliationReader = require("../src/modules/repository/readers/bankReconciliation.reader")
const BankStatementReader = require("../src/modules/repository/readers/bankStatement.reader")
const CapitalAccountStatementReader = require("../src/modules/repository/readers/capitalAccountStatement.reader")
const CapitalCallNoticeReader = require("../src/modules/repository/readers/capitalCallNotice.reader")
const CommitmentScheduleReader = require("../src/modules/repository/readers/commitmentSchedule.reader")
const CreditFacilityReader = require("../src/modules/repository/readers/creditFacility.reader")
const CustodianStatementReader = require("../src/modules/repository/readers/custodianStatement.reader")
const DistributionNoticeReader = require("../src/modules/repository/readers/distributionNotice.reader")
const ExpenseInvoiceReader = require("../src/modules/repository/readers/expenseInvoice.reader")
const FinancialStatementReader = require("../src/modules/repository/readers/financialStatement.reader")
const GovernanceMinutesReader = require("../src/modules/repository/readers/governanceMinutes.reader")
const HoldingsRegisterReader = require("../src/modules/repository/readers/holdingsRegister.reader")
const InvestorActivityStatementReader = require("../src/modules/repository/readers/investorActivityStatement.reader")
const LpaReader = require("../src/modules/repository/readers/lpa.reader")
const LpaAmendmentReader = require("../src/modules/repository/readers/lpaAmendment.reader")
const ManagementFeeStatementReader = require("../src/modules/repository/readers/managementFeeStatement.reader")
const NavPackageReader = require("../src/modules/repository/readers/navPackage.reader")
const PpmReader = require("../src/modules/repository/readers/ppm.reader")
const PortfolioTransactionReader = require("../src/modules/repository/readers/portfolioTransaction.reader")
const RedemptionNoticeReader = require("../src/modules/repository/readers/redemptionNotice.reader")
const ServiceAgreementReader = require("../src/modules/repository/readers/serviceAgreement.reader")
const ShareholderRegisterReader = require("../src/modules/repository/readers/shareholderRegister.reader")
const SideLetterReader = require("../src/modules/repository/readers/sideLetter.reader")
const SubscriptionAgreementReader = require("../src/modules/repository/readers/subscriptionAgreement.reader")
const TaxDocumentReader = require("../src/modules/repository/readers/taxDocument.reader")
const TransferNoticeReader = require("../src/modules/repository/readers/transferNotice.reader")
const ValuationReader = require("../src/modules/repository/readers/valuation.reader")
const WaterfallStatementReader = require("../src/modules/repository/readers/waterfallStatement.reader")
const RepositoryReaderRegistryService = require("../src/modules/repository/services/repositoryReaderRegistry.service")
const RepositorySourceReaderService = require("../src/modules/repository/services/repositorySourceReader.service")

describe("repository specialized readers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repository-reader-tests-"))

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("reads a DOCX LPA and extracts reporting terms", async () => {
    const filePath = path.join(tempDir, "agreement.docx")
    const zip = new JSZip()
    zip.file(
      "word/document.xml",
      [
        "<w:document><w:body>",
        "<w:p><w:r><w:t>Limited Partnership Agreement</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Fund Term: 10 years with two one-year extensions.</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Management Fee: 2.00% of committed capital.</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Carried Interest: 20% after an 8% preferred return.</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Governing Law: Delaware</w:t></w:r></w:p>",
        "</w:body></w:document>",
      ].join(""),
    )
    fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }))

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".docx" })
    const result = LpaReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(source.extraction_method).toBe("docx_xml_text")
    expect(extracted.management_fee).toContain("2.00%")
    expect(extracted.carried_interest).toContain("20%")
    expect(extracted.preferred_return).toContain("8%")
    expect(extracted.governing_law).toContain("Delaware")
  })

  test("reads DOCX key-value tables for specialist term extraction", async () => {
    const filePath = path.join(tempDir, "agreement-table.docx")
    const zip = new JSZip()
    const tableRows = [
      ["Fund Term", "10 years with two one-year extensions"],
      ["Management Fee (%)", "2.00% of committed capital"],
      ["Carried Interest", "20% after return of capital"],
      ["Hurdle Rate", "8% preferred return"],
    ]
      .map(
        (row) =>
          `<w:tr>${row
            .map((cell) => `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`)
            .join("")}</w:tr>`,
      )
      .join("")
    zip.file(
      "word/document.xml",
      [
        "<w:document><w:body>",
        "<w:p><w:r><w:t>Limited Partnership Agreement</w:t></w:r></w:p>",
        `<w:tbl>${tableRows}</w:tbl>`,
        "</w:body></w:document>",
      ].join(""),
    )
    fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }))

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".docx" })
    const result = LpaReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(source.tables).toHaveLength(1)
    expect(source.tables[0].rows[0]).toEqual(["Fund Term", "10 years with two one-year extensions"])
    expect(extracted.fund_term).toContain("10 years")
    expect(extracted.management_fee).toContain("2.00%")
    expect(extracted.carried_interest).toContain("20%")
    expect(extracted.preferred_return).toContain("8%")
  })

  test("reads an XLSX shareholder register and calculates totals", async () => {
    const filePath = path.join(tempDir, "register.xlsx")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Register")
    sheet.addRow(["Shareholder Name", "Share Class", "Units", "Ownership %", "Commitment Amount"])
    sheet.addRow(["Alpha LP", "Class A", 600, 60, 1200000])
    sheet.addRow(["Beta LP", "Class B", 400, 40, 800000])
    sheet.addRow(["Total", "", 1000, 100, 2000000])
    await workbook.xlsx.writeFile(filePath)

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".xlsx" })
    const result = ShareholderRegisterReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.registered_holders).toBe("2")
    expect(extracted.total_units).toBe("1,000")
    expect(extracted.total_commitments).toBe("2,000,000.00")
    expect(extracted.largest_holder_by_ownership).toBe("Alpha LP")
    expect(extracted.largest_holder_ownership).toBe("60.00%")
    expect(extracted.largest_holder_by_commitment).toBe("Alpha LP")
    expect(extracted.largest_holder_commitment).toBe("1,200,000.00")
    expect(extracted.top_5_ownership_percent).toBe("100.00%")
    expect(extracted.top_5_commitment_percent).toBe("100.00%")
    expect(extracted.ownership_reconciliation).toBe("100.00%")
    expect(result.structured_data_json.holders).toHaveLength(2)
    expect(result.structured_data_json.summary_rows).toBe(1)
    expect(result.structured_data_json.totals.top_5_ownership_percent).toBe(100)
    expect(result.structured_data_json.declared_totals).toEqual(expect.objectContaining({ units: 1000, commitments: 2000000 }))
  })

  test("reads investor register status, tax residency, and commitment rollforward without exposing tax IDs", async () => {
    const filePath = path.join(tempDir, "investor-register.xlsx")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Investor Register")
    sheet.addRow([
      "Investor ID",
      "Investor Name",
      "Investor Type",
      "Status",
      "Tax Residency",
      "Domicile",
      "Admission Date",
      "Share Class",
      "Units",
      "Ownership %",
      "Commitment Amount",
      "Called Capital",
      "Unfunded Commitment",
      "NAV",
      "Tax ID",
    ])
    sheet.addRow(["INV-1", "Alpha LP", "Institutional", "Active", "US", "Delaware", "2025-01-15", "Class A", 600, 60, 1200000, 720000, 480000, 1250000, "12-3456789"])
    sheet.addRow(["INV-2", "Beta Trust", "Individual", "Active", "UK", "England", "2025-02-20", "Class B", 400, 40, 800000, 480000, 320000, 850000, "987-65-4321"])
    sheet.addRow(["Total", "", "", "", "", "", "", "", 1000, 100, 2000000, 1200000, 800000, 2100000, ""])
    await workbook.xlsx.writeFile(filePath)

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".xlsx" })
    const result = ShareholderRegisterReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Investor / Shareholder Register")
    expect(extracted.active_registered_holders).toBe("2")
    expect(extracted.investor_types).toBe("Institutional, Individual")
    expect(extracted.investor_status_counts).toBe("Active: 2")
    expect(extracted.tax_residencies).toBe("US, UK")
    expect(extracted.total_called_capital).toBe("1,200,000.00")
    expect(extracted.total_unfunded_commitment).toBe("800,000.00")
    expect(extracted.commitment_called_percent).toBe("60.00%")
    expect(extracted.unfunded_commitment_percent).toBe("40.00%")
    expect(extracted.commitment_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.holders).toHaveLength(2)
    expect(result.structured_data_json.holders[0]).toEqual(expect.objectContaining({
      investor_id: "INV-1",
      investor_type: "Institutional",
      tax_residency: "US",
      called_capital: 720000,
      unfunded_commitment: 480000,
    }))
    expect(result.structured_data_json.totals.commitment_rollforward_variance).toBe(0)
    expect(result.structured_data_json.holders[0].tax_id).toBeUndefined()
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("987-65-4321")
  })

  test("reads an XLSX holdings register as investee assets and fair-value totals", async () => {
    const filePath = path.join(tempDir, "portfolio-holdings.xlsx")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Holdings")
    sheet.addRow(["Investment Name", "Asset Class", "Cost Basis", "Fair Value", "Currency", "Valuation Date"])
    sheet.addRow(["North Harbor Infrastructure", "Private Equity", "USD 1,000,000.00", "USD 1,260,000.00", "USD", "2026-03-31"])
    sheet.addRow(["Riverside Credit Note", "Private Credit", "USD 500,000.00", "USD 490,000.00", "USD", "2026-03-31"])
    sheet.addRow(["Total", "", "USD 1,500,000.00", "USD 1,750,000.00", "USD", "2026-03-31"])
    await workbook.xlsx.writeFile(filePath)

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".xlsx" })
    const result = HoldingsRegisterReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.portfolio_holdings).toBe("2")
    expect(extracted.asset_classes).toContain("Private Equity")
    expect(extracted.asset_class_counts).toContain("Private Equity: 1")
    expect(extracted.largest_holding).toBe("North Harbor Infrastructure")
    expect(extracted.largest_holding_fair_value).toBe("1,260,000.00")
    expect(extracted.largest_holding_percent_of_fair_value).toBe("72.00%")
    expect(extracted.top_5_fair_value_percent).toBe("100.00%")
    expect(extracted.total_cost).toBe("1,500,000.00")
    expect(extracted.total_fair_value).toBe("1,750,000.00")
    expect(extracted.total_unrealized_gain_loss).toBe("250,000.00")
    expect(result.structured_data_json.holdings[0].holding_name).toContain("North Harbor")
    expect(result.structured_data_json.holdings).toHaveLength(2)
    expect(result.structured_data_json.summary_rows).toBe(1)
    expect(result.structured_data_json.asset_class_counts).toEqual({ "Private Equity": 1, "Private Credit": 1 })
    expect(result.structured_data_json.totals.top_5_fair_value_percent).toBe(100)
    expect(result.structured_data_json.declared_totals).toEqual(expect.objectContaining({ cost: 1500000, fair_value: 1750000 }))
  })

  test("extracts holdings register sectors, valuation methods, commitments, and unrealized reconciliation", () => {
    const result = HoldingsRegisterReader.analyze({
      source: {
        text: "Portfolio Holdings Register",
        tables: [
          {
            name: "Holdings",
            rows: [
              [
                "Investment Name",
                "Security ID",
                "Asset Class",
                "Sector",
                "Geography",
                "Investment Stage",
                "Quantity",
                "Cost Basis",
                "Fair Value",
                "Unrealized Gain/Loss",
                "Commitment",
                "Unfunded Commitment",
                "Currency",
                "Ownership %",
                "Valuation Date",
                "Valuation Method",
                "Fair Value Level",
                "Liquidity Status",
                "Maturity Date",
                "Interest Rate",
              ],
              [
                "North Harbor Infrastructure",
                "NH-001",
                "Private Equity",
                "Infrastructure",
                "United States",
                "Growth",
                "1,000",
                "USD 1,000,000.00",
                "USD 1,260,000.00",
                "USD 260,000.00",
                "USD 1,500,000.00",
                "USD 250,000.00",
                "USD",
                "12.50%",
                "2026-03-31",
                "Market approach",
                "Level 3",
                "Illiquid",
                "",
                "",
              ],
              [
                "Riverside Credit Note",
                "RC-002",
                "Private Credit",
                "Credit",
                "Canada",
                "Performing",
                "500",
                "USD 500,000.00",
                "USD 490,000.00",
                "USD (10,000.00)",
                "USD 500,000.00",
                "USD 0.00",
                "USD",
                "5.00%",
                "2026-03-31",
                "Income approach",
                "Level 2",
                "Restricted",
                "2028-06-30",
                "SOFR + 5.00%",
              ],
              [
                "Total",
                "",
                "",
                "",
                "",
                "",
                "1,500",
                "USD 1,500,000.00",
                "USD 1,750,000.00",
                "USD 250,000.00",
                "USD 2,000,000.00",
                "USD 250,000.00",
                "USD",
                "",
                "2026-03-31",
                "",
                "",
                "",
                "",
                "",
              ],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.sector_counts).toContain("Infrastructure: 1")
    expect(extracted.geography_counts).toContain("United States: 1")
    expect(extracted.valuation_method_counts).toContain("Market approach: 1")
    expect(extracted.fair_value_level_counts).toContain("Level 3: 1")
    expect(extracted.liquidity_status_counts).toContain("Illiquid: 1")
    expect(extracted.fair_value_by_asset_class).toContain("Private Equity: 1,260,000.00")
    expect(extracted.fair_value_by_geography).toContain("Canada: 490,000.00")
    expect(extracted.total_quantity).toBe("1,500.0000")
    expect(extracted.total_commitment).toBe("2,000,000.00")
    expect(extracted.total_unfunded_commitment).toBe("250,000.00")
    expect(extracted.largest_unrealized_holding).toBe("North Harbor Infrastructure")
    expect(extracted.largest_unrealized_gain_loss).toBe("260,000.00")
    expect(extracted.unrealized_gain_loss_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.holdings[0]).toEqual(expect.objectContaining({
      security_identifier: "NH-001",
      sector: "Infrastructure",
      geography: "United States",
      valuation_method: "Market approach",
      fair_value_level: "Level 3",
      liquidity_status: "Illiquid",
    }))
    expect(result.structured_data_json.fair_value_by_asset_class).toEqual({ "Private Equity": 1260000, "Private Credit": 490000 })
    expect(result.structured_data_json.totals.unrealized_gain_loss_reconciliation_variance).toBe(0)
  })

  test("extracts portfolio transaction facts and reconciles realized gain", () => {
    const result = PortfolioTransactionReader.analyze({
      source: {
        text: "Portfolio Transaction Notice",
        tables: [
          {
            name: "Transaction Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investment Name", "North Harbor Infrastructure"],
              ["Transaction Type", "Sale"],
              ["Asset Class", "Private Equity"],
              ["Trade Date", "March 15, 2026"],
              ["Settlement Date", "March 20, 2026"],
              ["Currency", "USD"],
              ["Quantity", "50,000"],
              ["Price Per Unit", "USD 12.500000"],
              ["Sale Proceeds", "USD 625,000.00"],
              ["Cost Basis", "USD 500,000.00"],
              ["Transaction Fees", "USD 5,000.00"],
              ["Net Proceeds", "USD 620,000.00"],
              ["Realized Gain/Loss", "USD 125,000.00"],
              ["Counterparty", "Harbor Buyer LLC"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Portfolio Transaction Notice")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.investment_name).toBe("North Harbor Infrastructure")
    expect(extracted.transaction_type).toBe("Sale")
    expect(extracted.trade_date).toBe("March 15, 2026")
    expect(extracted.settlement_date).toBe("March 20, 2026")
    expect(extracted.quantity).toBe("50,000")
    expect(extracted.price_per_unit).toBe("USD 12.500000")
    expect(extracted.sale_proceeds).toBe("USD 625,000.00")
    expect(extracted.cost_basis).toBe("USD 500,000.00")
    expect(extracted.transaction_fees).toBe("USD 5,000.00")
    expect(extracted.net_proceeds).toBe("USD 620,000.00")
    expect(extracted.realized_gain_loss).toBe("USD 125,000.00")
    expect(extracted.net_proceeds_reconciliation).toBe("Reconciled")
    expect(extracted.realized_gain_loss_reconciliation).toBe("Reconciled")
    expect(extracted.unit_price_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.net_proceeds_variance).toBe(0)
    expect(result.structured_data_json.realized_gain_loss_variance).toBe(0)
    expect(result.structured_data_json.unit_price_variance).toBe(0)
  })

  test("reads investor activity statements as reusable subscription and redemption facts", () => {
    const result = InvestorActivityStatementReader.analyze({
      source: {
        text: "Investor Activity Statement",
        tables: [
          {
            name: "Activity",
            rows: [
              ["Investor Name", "Share Class", "Transaction Type", "Effective Date", "Subscriptions", "Redemptions", "Units", "NAV Per Unit"],
              ["Alpha LP", "Class A", "Subscription", "2026-01-15", "USD 200,000.00", "", "19,900.4975", "10.0500"],
              ["Beta LP", "Class A", "Redemption", "2026-02-20", "", "USD 50,000.00", "(4,975.1244)", "10.0500"],
              ["Total", "", "", "", "USD 200,000.00", "USD 50,000.00", "14,925.3731", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Investor Activity Statement")
    expect(extracted.activity_transactions).toBe("2")
    expect(extracted.investor_count).toBe("2")
    expect(extracted.share_classes).toBe("Class A")
    expect(extracted.subscription_amount).toBe("200,000.00")
    expect(extracted.redemption_amount).toBe("50,000.00")
    expect(extracted.net_activity_amount).toBe("150,000.00")
    expect(extracted.net_unit_activity).toBe("14,925.3731")
    expect(extracted.nav_per_unit).toBe("10.0500")
    expect(result.structured_data_json.transactions).toHaveLength(2)
    expect(result.structured_data_json.summary_rows).toBe(1)
    expect(result.structured_data_json.declared_totals).toEqual(
      expect.objectContaining({ subscriptions: 200000, redemptions: 50000, units: 14925.3731 }),
    )
  })

  test("extracts investor activity context, settlement status, cash checks, and unit rollforward", () => {
    const result = InvestorActivityStatementReader.analyze({
      source: {
        text: "Shareholder Activity Statement for Meridian Fund LP.",
        tables: [
          {
            name: "Investor Activity",
            rows: [
              [
                "Fund Name",
                "Investor Name",
                "Investor Type",
                "Investor Status",
                "Share Class",
                "Notice Reference",
                "Transaction Type",
                "Trade Date",
                "Effective Date",
                "Settlement Date",
                "Subscriptions",
                "Redemptions",
                "Transfer In",
                "Transfer Out",
                "Gross Amount",
                "Fees",
                "Holdback",
                "Net Amount",
                "Beginning Units",
                "Units",
                "Ending Units",
                "NAV Per Unit",
                "Currency",
                "Settlement Status",
                "Approval Status",
              ],
              [
                "Meridian Fund LP",
                "Alpha LP",
                "Institutional",
                "Active",
                "Class A",
                "SUB-2026-04",
                "Subscription",
                "2026-04-05",
                "2026-04-30",
                "2026-05-02",
                "USD 100,000.00",
                "",
                "",
                "",
                "USD 100,000.00",
                "USD 0.00",
                "USD 0.00",
                "USD 100,000.00",
                "100,000.0000",
                "10,000.0000",
                "",
                "USD 10.000000",
                "USD",
                "Settled",
                "Approved",
              ],
              [
                "Meridian Fund LP",
                "Beta LP",
                "Family Office",
                "Active",
                "Class A",
                "RED-2026-04",
                "Redemption",
                "2026-04-12",
                "2026-04-30",
                "2026-05-05",
                "",
                "USD 50,000.00",
                "",
                "",
                "USD 50,000.00",
                "USD 1,000.00",
                "USD 2,000.00",
                "USD 47,000.00",
                "",
                "5,000.0000",
                "",
                "USD 10.000000",
                "USD",
                "Settled",
                "Approved",
              ],
              [
                "Meridian Fund LP",
                "Gamma LP",
                "Fund of Funds",
                "Active",
                "Class B",
                "TRI-2026-04",
                "Transfer In",
                "2026-04-15",
                "2026-04-30",
                "2026-05-06",
                "",
                "",
                "USD 20,000.00",
                "",
                "USD 20,000.00",
                "USD 0.00",
                "USD 0.00",
                "USD 20,000.00",
                "",
                "2,000.0000",
                "",
                "USD 10.000000",
                "USD",
                "Pending",
                "Approved",
              ],
              [
                "Meridian Fund LP",
                "Delta LP",
                "Institutional",
                "Active",
                "Class B",
                "TRO-2026-04",
                "Transfer Out",
                "2026-04-20",
                "2026-04-30",
                "2026-05-07",
                "",
                "",
                "",
                "USD 10,000.00",
                "USD 10,000.00",
                "USD 0.00",
                "USD 0.00",
                "USD 10,000.00",
                "",
                "1,000.0000",
                "106,000.0000",
                "USD 10.000000",
                "USD",
                "Settled",
                "Approved",
              ],
              [
                "",
                "Total",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "USD 100,000.00",
                "USD 50,000.00",
                "USD 20,000.00",
                "USD 10,000.00",
                "USD 180,000.00",
                "USD 1,000.00",
                "USD 2,000.00",
                "USD 177,000.00",
                "100,000.0000",
                "6,000.0000",
                "106,000.0000",
                "",
                "",
                "",
                "",
              ],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Investor Activity Statement")
    expect(extracted.funds).toBe("Meridian Fund LP")
    expect(extracted.activity_transactions).toBe("4")
    expect(extracted.investor_count).toBe("4")
    expect(extracted.investor_types).toContain("Institutional")
    expect(extracted.investor_statuses).toBe("Active")
    expect(extracted.share_classes).toContain("Class B")
    expect(extracted.settlement_status_counts).toContain("Settled: 3")
    expect(extracted.approval_status_counts).toContain("Approved: 4")
    expect(extracted.subscription_amount).toBe("100,000.00")
    expect(extracted.redemption_amount).toBe("50,000.00")
    expect(extracted.transfer_in_amount).toBe("20,000.00")
    expect(extracted.transfer_out_amount).toBe("10,000.00")
    expect(extracted.gross_activity_amount).toBe("180,000.00")
    expect(extracted.activity_fee_amount).toBe("1,000.00")
    expect(extracted.holdback_amount).toBe("2,000.00")
    expect(extracted.net_cash_activity_amount).toBe("177,000.00")
    expect(extracted.net_activity_amount).toBe("60,000.00")
    expect(extracted.beginning_units).toBe("100,000.0000")
    expect(extracted.net_unit_activity).toBe("6,000.0000")
    expect(extracted.ending_units).toBe("106,000.0000")
    expect(extracted.largest_subscription_investor).toBe("Alpha LP")
    expect(extracted.largest_redemption_investor).toBe("Beta LP")
    expect(extracted.net_cash_activity_reconciliation).toBe("Reconciled")
    expect(extracted.ending_units_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.transactions).toHaveLength(4)
    expect(result.structured_data_json.totals.net_cash_variance).toBe(0)
    expect(result.structured_data_json.totals.ending_units_variance).toBe(0)
  })

  test("reads a valid PDF through the installed PDF text extractor", async () => {
    const filePath = path.resolve("node_modules/pdf-parse/test/data/01-valid.pdf")
    const source = await RepositorySourceReaderService.read({ filePath, extension: ".pdf" })

    expect(source.extraction_method).toBe("pdf_parse")
    expect(source.text.length).toBeGreaterThan(0)
  })

  test("returns actionable conversion guidance for accepted legacy and image formats", async () => {
    const legacyWord = await RepositorySourceReaderService.read({ filePath: "stored.doc", extension: ".doc" })
    const legacySpreadsheet = await RepositorySourceReaderService.read({ filePath: "stored.xls", extension: ".xls" })
    const image = await RepositorySourceReaderService.read({ filePath: "scan.jpg", extension: ".jpg" })

    expect(legacyWord).toEqual(
      expect.objectContaining({
        status: "requires_reader",
        issues: [expect.objectContaining({ code: "legacy_word_requires_conversion" })],
      }),
    )
    expect(legacySpreadsheet.issues[0]).toEqual(expect.objectContaining({ code: "legacy_excel_requires_conversion" }))
    expect(image.issues[0]).toEqual(expect.objectContaining({ code: "image_requires_ocr" }))
  })

  test("marks a PDF without searchable text as requiring OCR", async () => {
    const filePath = path.join(tempDir, "blank-scan.pdf")
    fs.writeFileSync(filePath, "scanned-pdf-placeholder")
    jest.doMock("pdf-parse", () => jest.fn(async () => ({ text: "" })))
    try {
      const source = await RepositorySourceReaderService.read({ filePath, extension: ".pdf" })

      expect(source.status).toBe("requires_reader")
      expect(source.extraction_method).toBe("pdf_parse")
      expect(source.issues[0]).toEqual(expect.objectContaining({ code: "pdf_text_not_detected" }))
    } finally {
      jest.dontMock("pdf-parse")
    }
  })

  test("extracts offering terms from a private placement memorandum", () => {
    const result = PpmReader.analyze({
      source: {
        text: [
          "Private Placement Memorandum.",
          "Target Fund Size: USD 250,000,000.",
          "Minimum Commitment: USD 1,000,000.",
          "Management Fee: 1.50% of committed capital.",
          "Carried Interest: 20%.",
          "Final Closing Date: June 30, 2026.",
        ].join(" "),
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.target_fund_size).toContain("USD 250,000,000")
    expect(extracted.minimum_commitment).toContain("USD 1,000,000")
    expect(extracted.management_fee).toContain("1.50%")
  })

  test("extracts LPA terms from key-value spreadsheet rows", async () => {
    const filePath = path.join(tempDir, "lpa-terms-table.xlsx")
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("LPA Terms")
    sheet.addRow(["Limited Partnership Agreement"])
    sheet.addRow(["Fund Term", "10 years with two one-year extensions"])
    sheet.addRow(["Management Fee (%)", "2.00% of committed capital"])
    sheet.addRow(["Carried Interest", "20% after return of capital"])
    sheet.addRow(["Hurdle Rate", "8% preferred return"])
    await workbook.xlsx.writeFile(filePath)

    const source = await RepositorySourceReaderService.read({ filePath, extension: ".xlsx" })
    const result = LpaReader.analyze({ source })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(extracted.fund_term).toContain("10 years")
    expect(extracted.management_fee).toContain("2.00%")
    expect(extracted.carried_interest).toContain("20%")
    expect(extracted.preferred_return).toContain("8%")
    expect(result.structured_data_json.extracted_clause_keys).toEqual(
      expect.arrayContaining(["fund_term", "management_fee", "carried_interest", "preferred_return"]),
    )
  })

  test("extracts LPA reporting controls and operating constraints from key-value rows", () => {
    const result = LpaReader.analyze({
      source: {
        text: "Limited Partnership Agreement",
        tables: [
          {
            name: "LPA Reporting Terms",
            rows: [
              ["Fund Term", "12 years with two one-year extensions"],
              ["Investment Period", "5 years after final closing"],
              ["Management Fee", "1.75% of committed capital"],
              ["Carried Interest", "20% after return of capital"],
              ["Preferred Return", "8% compounded annually"],
              ["General Partner", "Meridian GP LLC"],
              ["Governing Law", "Delaware"],
              ["Audit Requirement", "audited financial statements prepared annually"],
              ["Financial Statement Deadline", "within 90 days after fiscal year end"],
              ["Quarterly Reporting Deadline", "within 45 days after quarter end"],
              ["Reporting Frequency", "quarterly investor reporting packages"],
              ["NAV Frequency", "quarterly NAV calculation"],
              ["Valuation Policy", "fair value in accordance with ASC 820"],
              ["Capital Call Notice Period", "10 business days prior notice"],
              ["Distribution Notice Period", "5 business days prior notice"],
              ["Tax Reporting Deadline", "within 90 days after fiscal year end"],
              ["Partnership Representative", "Meridian GP LLC"],
              ["Transfer Restriction", "requires prior written consent of the General Partner"],
              ["LPAC Consent", "conflict transactions require LPAC approval"],
              ["Key Person Event", "suspends the investment period until advisory committee waiver"],
              ["Recycling", "recallable capital may be recycled during the investment period"],
              ["Fund Expenses", "borne by the partnership subject to the annual expense cap"],
              ["Borrowing Limit", "not to exceed 20% of aggregate commitments"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Limited Partnership Agreement")
    expect(extracted.financial_statement_deadline).toBe("within 90 days after fiscal year end")
    expect(extracted.quarterly_reporting_deadline).toBe("within 45 days after quarter end")
    expect(extracted.reporting_frequency).toBe("quarterly investor reporting packages")
    expect(extracted.nav_frequency).toBe("quarterly NAV calculation")
    expect(extracted.valuation_policy).toBe("fair value in accordance with ASC 820")
    expect(extracted.capital_call_notice_period).toBe("10 business days prior notice")
    expect(extracted.distribution_notice_period).toBe("5 business days prior notice")
    expect(extracted.tax_reporting_deadline).toBe("within 90 days after fiscal year end")
    expect(extracted.partnership_representative).toBe("Meridian GP LLC")
    expect(extracted.transfer_restriction).toContain("General Partner")
    expect(extracted.lpac_consent).toContain("LPAC approval")
    expect(extracted.key_person_event).toContain("investment period")
    expect(extracted.recycling_right).toContain("recycled")
    expect(extracted.expense_allocation).toContain("annual expense cap")
    expect(extracted.borrowing_limit).toContain("20%")
    expect(result.structured_data_json.missing_expected_terms).toEqual([])
    expect(result.structured_data_json.extracted_clause_keys).toEqual(
      expect.arrayContaining([
        "financial_statement_deadline",
        "quarterly_reporting_deadline",
        "reporting_frequency",
        "nav_frequency",
        "valuation_policy",
        "capital_call_notice_period",
        "tax_reporting_deadline",
        "transfer_restriction",
        "lpac_consent",
      ]),
    )
  })

  test("extracts LPA amendment overrides as separate governing-term facts", () => {
    const result = LpaAmendmentReader.analyze({
      source: {
        text: "First Amendment to Limited Partnership Agreement.",
        tables: [
          {
            name: "Amendment Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Amendment Number", "First Amendment"],
              ["Effective Date", "April 1, 2026"],
              ["Amended Agreement Date", "January 1, 2024"],
              ["Amended Sections", "Section 5.1 Management Fee; Section 8.2 Reporting"],
              ["Fund Term", "12 years including two one-year extensions"],
              ["Management Fee", "1.75% of net asset value during the extension period"],
              ["Preferred Return", "8% cumulative preferred return"],
              ["Reporting Obligation", "quarterly ESG and portfolio exposure reporting"],
              ["Transfer Restriction", "GP consent required for transfers"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("LPA Amendment")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.amendment_number).toBe("First Amendment")
    expect(extracted.effective_date).toBe("April 1, 2026")
    expect(extracted.amended_agreement_date).toBe("January 1, 2024")
    expect(extracted.amended_sections).toContain("Section 5.1")
    expect(extracted.fund_term).toContain("12 years")
    expect(extracted.management_fee).toContain("1.75%")
    expect(extracted.preferred_return).toContain("8%")
    expect(extracted.reporting_obligation).toContain("quarterly ESG")
    expect(extracted.transfer_restriction).toContain("GP consent")
    expect(result.structured_data_json.changed_term_keys).toEqual(
      expect.arrayContaining(["fund_term", "management_fee", "preferred_return", "reporting_obligation", "transfer_restriction"]),
    )
  })

  test("extracts LPA amendment reporting, consent, operating, and liquidity changes", () => {
    const result = LpaAmendmentReader.analyze({
      source: {
        text: [
          "Second Amendment to Amended and Restated Limited Partnership Agreement.",
          "Tax ID: 12-3456789.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Amendment Control",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Amendment Number", "Second Amendment"],
              ["Effective Date", "2026-06-01"],
              ["Approval Date", "May 20, 2026"],
              ["Amended Agreement Date", "January 1, 2024"],
              ["Affected Sections", "Section 3.2; Section 6.4; Section 9.1"],
              ["Effective Scope", "applies to all Class B limited partners"],
              ["Affected Class", "Class B"],
              ["Management Fee Waiver", "waived during the extension period"],
              ["Waterfall Change", "adds GP catch-up after preferred return"],
              ["Clawback", "GP clawback calculated annually"],
              ["Financial Statement Deadline", "audited statements delivered within 90 days"],
              ["Tax Reporting Deadline", "Schedule K-1 packages delivered within 75 days"],
              ["NAV Frequency", "quarterly NAV reporting"],
              ["Valuation Policy", "illiquid investments valued under ASC 820"],
              ["Capital Call Notice Period", "10 business days"],
              ["Distribution Notice Period", "5 business days"],
              ["Capital Call Mechanics", "capital calls may be issued electronically"],
              ["Recycling", "recallable distributions permitted for 18 months"],
              ["Borrowing Limit", "borrowings limited to USD 5,000,000"],
              ["Redemption", "regulatory withdrawal permitted on 30 days notice"],
              ["Default Remedy", "defaulting partner interest may be diluted"],
              ["Consent Threshold", "majority in interest of limited partners"],
              ["Consent Status", "Approved"],
              ["Approving Parties", "General Partner and LPAC"],
              ["LPAC Consent", "LPAC approval obtained"],
              ["Side Letter", "MFN elections apply to revised economics"],
              ["Tax Change", "FATCA certifications must be refreshed annually"],
              ["Governing Law", "Delaware"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("LPA Amendment")
    expect(extracted.amended_section_count).toBe("3")
    expect(extracted.effective_scope).toContain("Class B")
    expect(extracted.management_fee_waiver).toContain("waived")
    expect(extracted.waterfall_change).toContain("GP catch-up")
    expect(extracted.clawback_or_giveback).toContain("annually")
    expect(extracted.financial_statement_deadline).toContain("90 days")
    expect(extracted.tax_reporting_deadline).toContain("75 days")
    expect(extracted.nav_frequency).toBe("quarterly NAV reporting")
    expect(extracted.valuation_policy).toContain("ASC 820")
    expect(extracted.capital_call_notice_period).toBe("10 business days")
    expect(extracted.distribution_notice_period).toBe("5 business days")
    expect(extracted.recycling_or_reinvestment).toContain("18 months")
    expect(extracted.borrowing_limit).toContain("USD 5,000,000")
    expect(extracted.redemption_or_withdrawal).toContain("regulatory withdrawal")
    expect(extracted.default_remedy).toContain("diluted")
    expect(extracted.consent_threshold).toContain("majority")
    expect(extracted.consent_status).toBe("Approved")
    expect(extracted.approving_parties).toContain("LPAC")
    expect(extracted.lpac_consent).toContain("approval obtained")
    expect(extracted.side_letter_or_mfn).toContain("MFN")
    expect(extracted.tax_or_regulatory_change).toContain("FATCA")
    expect(extracted.economic_terms_changed).toContain("waterfall_change")
    expect(extracted.reporting_terms_changed).toContain("tax_reporting_deadline")
    expect(extracted.governance_terms_changed).toContain("lpac_consent")
    expect(extracted.operating_terms_changed).toContain("borrowing_limit")
    expect(extracted.liquidity_terms_changed).toContain("redemption_or_withdrawal")
    expect(result.structured_data_json.changed_term_keys).toEqual(
      expect.arrayContaining(["management_fee_waiver", "tax_reporting_deadline", "lpac_consent", "borrowing_limit", "redemption_or_withdrawal"]),
    )
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts governance approvals from minutes and written consents", () => {
    const result = GovernanceMinutesReader.analyze({
      source: {
        text: [
          "Unanimous Written Consent of the Board of Directors of Meridian Fund LP.",
          "The Board approved the March 31, 2026 NAV and valuation package.",
          "The Board approved the Q1 2026 capital call and distribution notices.",
          "The audited financial statements and audit report were approved.",
        ].join(" "),
        tables: [
          {
            name: "Governance Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Governance Body", "Board of Directors"],
              ["Consent Date", "April 15, 2026"],
              ["Meeting Type", "Unanimous Written Consent"],
              ["Quorum", "All directors consented"],
            ],
          },
          {
            name: "Resolutions",
            rows: [
              ["Topic", "Resolution", "Status", "Effective Date", "Approved Amount"],
              ["NAV", "Approved March 31, 2026 NAV and valuation package", "Approved", "March 31, 2026", "USD 11,750,000.00"],
              ["Financial Statements", "Approved audited financial statements", "Approved", "April 15, 2026", ""],
              ["Capital Call", "Approved Q1 2026 capital call notices", "Approved", "April 20, 2026", "USD 250,000.00"],
              ["Distribution", "Approved Q1 2026 distribution notice", "Approved", "April 25, 2026", "USD 125,000.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Governance Minutes / Consent")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.governance_body).toBe("Board of Directors")
    expect(extracted.meeting_date).toBe("April 15, 2026")
    expect(extracted.meeting_type).toBe("Unanimous Written Consent")
    expect(extracted.nav_approval).toBe("Approved")
    expect(extracted.financial_statement_approval).toBe("Approved")
    expect(extracted.capital_call_approval).toBe("Approved")
    expect(extracted.distribution_approval).toBe("Approved")
    expect(extracted.resolution_count).toBe("4")
    expect(extracted.approved_actions).toBe("4")
    expect(extracted.governance_approval_topics).toContain("NAV")
    expect(result.structured_data_json.resolution_rows).toHaveLength(4)
    expect(result.structured_data_json.approvals_detected).toEqual(
      expect.arrayContaining(["nav_approval", "financial_statement_approval", "capital_call_approval", "distribution_approval"]),
    )
  })

  test("classifies governance approvals across reporting, capital activity, and operating controls", () => {
    const result = GovernanceMinutesReader.analyze({
      source: {
        text: [
          "LPAC Minutes and Written Consent for Meridian Fund LP.",
          "Tax ID: 12-3456789.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Meeting Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Governance Body", "Limited Partner Advisory Committee"],
              ["Meeting Date", "May 15, 2026"],
              ["Meeting Type", "LPAC Minutes"],
              ["Meeting Location", "Video conference"],
              ["Attendees", "All LPAC members and the General Partner"],
              ["Reporting Period", "Quarter ended March 31, 2026"],
              ["Approval Method", "unanimous written consent"],
              ["Dissenting Votes", "None"],
              ["Minutes Preparer", "Northfield Administration LLC"],
              ["Quorum", "Quorum satisfied"],
            ],
          },
          {
            name: "Resolution Log",
            rows: [
              ["Topic", "Resolution", "Status", "Effective Date", "Approved Amount", "Owner", "Deadline", "Notes"],
              ["Valuation Policy", "Adopted updated ASC 820 valuation procedures", "Approved", "May 15, 2026", "", "Controller", "May 20, 2026", "supporting memo reviewed"],
              ["Tax Reporting", "Approved 2025 Schedule K-1 tax package release", "Approved", "May 15, 2026", "", "Tax advisor", "June 1, 2026", ""],
              ["Subscription", "Approved admission of Delta LP subscription", "Approved", "May 20, 2026", "USD 2,000,000", "Investor relations", "May 31, 2026", ""],
              ["Redemption", "Approved partial redemption for Echo LP", "Approved", "June 30, 2026", "USD 500,000", "Administrator", "July 5, 2026", ""],
              ["Transfer", "Consented to transfer from Beta LP to Gamma LP", "Approved", "June 30, 2026", "", "General Partner", "July 1, 2026", ""],
              ["LPA Amendment", "Approved Second Amendment to the Limited Partnership Agreement", "Approved", "June 1, 2026", "", "Legal counsel", "June 1, 2026", ""],
              ["Side Letter", "Approved investor side letter and MFN elections", "Approved", "June 1, 2026", "", "Legal counsel", "June 5, 2026", ""],
              ["Expense", "Approved audit fee invoice and expense accrual", "Approved", "May 15, 2026", "USD 75,000", "Controller", "May 31, 2026", ""],
              ["Conflict", "Approved affiliate transaction conflict after LPAC review", "Approved", "May 15, 2026", "", "LPAC", "May 20, 2026", ""],
              ["Budget", "Approved operating budget", "Approved", "May 15, 2026", "USD 950,000", "Controller", "June 1, 2026", ""],
              ["Borrowing", "Authorized NAV facility borrowing", "Approved", "May 15, 2026", "USD 1,500,000", "Treasurer", "May 18, 2026", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Governance Minutes / Consent")
    expect(extracted.governance_body).toBe("Limited Partner Advisory Committee")
    expect(extracted.meeting_location).toBe("Video conference")
    expect(extracted.reporting_period).toBe("Quarter ended March 31, 2026")
    expect(extracted.approval_method).toBe("unanimous written consent")
    expect(extracted.dissenting_votes).toBe("None")
    expect(extracted.minutes_preparer).toBe("Northfield Administration LLC")
    expect(extracted.valuation_policy_approval).toBe("Approved")
    expect(extracted.tax_reporting_approval).toBe("Approved")
    expect(extracted.subscription_approval).toBe("Approved")
    expect(extracted.redemption_approval).toBe("Approved")
    expect(extracted.transfer_approval).toBe("Approved")
    expect(extracted.lpa_amendment_approval).toBe("Approved")
    expect(extracted.side_letter_approval).toBe("Approved")
    expect(extracted.expense_approval).toBe("Approved")
    expect(extracted.conflict_approval).toBe("Approved")
    expect(extracted.budget_approval).toBe("Approved")
    expect(extracted.borrowing_approval).toBe("Approved")
    expect(extracted.reporting_approvals_detected).toContain("tax_reporting_approval")
    expect(extracted.capital_activity_approvals_detected).toContain("transfer_approval")
    expect(extracted.operating_approvals_detected).toContain("conflict_approval")
    expect(result.structured_data_json.reporting_approvals).toEqual(
      expect.arrayContaining(["valuation_policy_approval", "tax_reporting_approval"]),
    )
    expect(result.structured_data_json.capital_activity_approvals).toEqual(
      expect.arrayContaining(["subscription_approval", "redemption_approval", "transfer_approval"]),
    )
    expect(result.structured_data_json.operating_approvals).toEqual(
      expect.arrayContaining(["lpa_amendment_approval", "side_letter_approval", "expense_approval", "conflict_approval", "budget_approval", "borrowing_approval"]),
    )
    expect(result.structured_data_json.resolution_rows[0]).toEqual(
      expect.objectContaining({ owner: "Controller", deadline: "May 20, 2026" }),
    )
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts offering and subscription facts from key-value table labels", () => {
    const ppmResult = PpmReader.analyze({
      source: {
        text: "Private Placement Memorandum",
        tables: [
          {
            name: "Offering Terms",
            rows: [
              ["Target Fund Size (USD)", "250,000,000"],
              ["Minimum Initial Commitment", "1,000,000"],
              ["Management Fee (%)", "1.50% of committed capital"],
              ["Final Close", "June 30, 2026"],
            ],
          },
        ],
      },
    })
    const subscriptionResult = SubscriptionAgreementReader.analyze({
      source: {
        text: "Subscription Agreement",
        tables: [
          {
            name: "Subscriber Details",
            rows: [
              ["Subscriber Legal Name", "Silver Lake LP"],
              ["Capital Commitment", "USD 5,000,000"],
              ["Share Class", "Class A"],
              ["Investor Eligibility", "qualified purchaser"],
              ["Tax Identification Number", "12-3456789"],
            ],
          },
        ],
      },
    })
    const ppmFields = Object.fromEntries(ppmResult.key_points.map((entry) => [entry.point_key, entry.value_text]))
    const subscriptionFields = Object.fromEntries(subscriptionResult.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(ppmResult.status).toBe("completed")
    expect(ppmFields.target_fund_size).toBe("250,000,000")
    expect(ppmFields.minimum_commitment).toBe("1,000,000")
    expect(ppmFields.management_fee).toContain("1.50%")
    expect(subscriptionResult.status).toBe("completed")
    expect(subscriptionFields.subscriber_name).toBe("Silver Lake LP")
    expect(subscriptionFields.commitment_amount).toContain("USD 5,000,000")
    expect(subscriptionFields.tax_identification_number).toBeUndefined()
  })

  test("extracts broader PPM offering, reporting, and risk context from table rows", () => {
    const result = PpmReader.analyze({
      source: {
        text: "Private Placement Memorandum.",
        tables: [
          {
            name: "Offering Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investment Manager", "Meridian Advisors LLC"],
              ["General Partner", "Meridian GP LLC"],
              ["Administrator", "Northfield Administration LLC"],
              ["Auditor", "Meridian Assurance LLP"],
              ["Investment Strategy", "lower middle-market private credit investments"],
              ["Asset Classes", "senior secured loans, mezzanine debt, and preferred equity"],
              ["Geographic Focus", "North America"],
              ["Target Fund Size", "USD 250,000,000"],
              ["Hard Cap", "USD 300,000,000"],
              ["Minimum Initial Commitment", "USD 1,000,000"],
              ["Fund Term", "10 years with two one-year extensions"],
              ["Investment Period", "5 years after final closing"],
              ["Management Fee", "1.50% of committed capital"],
              ["Carried Interest", "20% after return of capital"],
              ["Preferred Return", "8% compounded annually"],
              ["Initial Closing Date", "March 31, 2026"],
              ["Final Closing Date", "June 30, 2026"],
              ["Eligible Investors", "accredited investors and qualified purchasers"],
              ["Reporting Frequency", "quarterly investor reports"],
              ["NAV Frequency", "quarterly NAV calculation"],
              ["Valuation Policy", "fair value in accordance with ASC 820"],
              ["Tax Reporting", "Schedule K-1s delivered annually"],
              ["ERISA Limit", "benefit plan investors limited to 25%"],
              ["Expense Cap", "organizational expenses capped at USD 1,000,000"],
              ["Borrowing Limit", "not to exceed 20% of aggregate commitments"],
              ["Transfer Restriction", "requires prior written consent of the General Partner"],
              ["Redemption Terms", "no voluntary redemptions during the fund term"],
              ["Risk Factors", "illiquidity, leverage, credit losses, and valuation uncertainty"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Private Placement Memorandum")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.sponsor).toBe("Meridian Advisors LLC")
    expect(extracted.general_partner).toBe("Meridian GP LLC")
    expect(extracted.administrator).toBe("Northfield Administration LLC")
    expect(extracted.auditor).toBe("Meridian Assurance LLP")
    expect(extracted.investment_strategy).toContain("private credit")
    expect(extracted.asset_classes).toContain("senior secured loans")
    expect(extracted.geographic_focus).toBe("North America")
    expect(extracted.hard_cap).toBe("USD 300,000,000")
    expect(extracted.fund_term).toContain("10 years")
    expect(extracted.investment_period).toContain("5 years")
    expect(extracted.initial_close).toBe("March 31, 2026")
    expect(extracted.final_close).toBe("June 30, 2026")
    expect(extracted.reporting_frequency).toBe("quarterly investor reports")
    expect(extracted.valuation_frequency).toBe("quarterly NAV calculation")
    expect(extracted.valuation_policy).toBe("fair value in accordance with ASC 820")
    expect(extracted.tax_reporting).toBe("Schedule K-1s delivered annually")
    expect(extracted.erisa_limit).toContain("25%")
    expect(extracted.expense_cap).toContain("USD 1,000,000")
    expect(extracted.borrowing_limit).toContain("20%")
    expect(extracted.transfer_restriction).toContain("General Partner")
    expect(extracted.redemption_liquidity).toContain("no voluntary redemptions")
    expect(extracted.risk_factors).toContain("illiquidity")
    expect(result.structured_data_json.extracted_term_keys).toEqual(
      expect.arrayContaining([
        "fund_name",
        "sponsor",
        "target_fund_size",
        "hard_cap",
        "reporting_frequency",
        "valuation_frequency",
        "tax_reporting",
        "risk_factors",
      ]),
    )
  })

  test("extracts subscribed investor facts without storing sensitive identifiers", () => {
    const result = SubscriptionAgreementReader.analyze({
      source: {
        text: "Subscriber Name: Silver Lake LP. Subscription Amount: USD 5,000,000. Share Class: Class A. Subscription Date: May 24, 2026. The Subscriber is a qualified purchaser.",
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.subscriber_name).toContain("Silver Lake LP")
    expect(extracted.commitment_amount).toContain("USD 5,000,000")
    expect(extracted.investor_status).toBe("qualified purchaser")
    expect(extracted.tin).toBeUndefined()
  })

  test("extracts subscription package onboarding context while redacting tax and wire identifiers", () => {
    const result = SubscriptionAgreementReader.analyze({
      source: {
        text: [
          "Subscription Agreement.",
          "Tax Identification Number: 12-3456789.",
          "Wire Instructions: Routing Number: 021000021. Account Number: 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Subscription Details",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Subscriber Legal Name", "Silver Lake LP"],
              ["Subscriber Type", "Limited Partnership"],
              ["Capital Commitment", "USD 5,000,000"],
              ["Minimum Commitment", "USD 1,000,000"],
              ["Share Class", "Class A"],
              ["Subscription Date", "May 24, 2026"],
              ["Admission Date", "June 1, 2026"],
              ["Investor Eligibility", "qualified purchaser"],
              ["Tax Residency", "Delaware"],
              ["Tax Form", "Form W-9"],
              ["AML/KYC Status", "complete"],
              ["Source of Funds", "capital reserves"],
              ["ERISA Status", "not a benefit plan investor"],
              ["FATCA/CRS Status", "U.S. reportable account"],
              ["Side Letter Requested", "yes"],
              ["Placement Agent", "North Harbor Securities LLC"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Subscription Agreement")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.subscriber_name).toBe("Silver Lake LP")
    expect(extracted.subscriber_type).toBe("Limited Partnership")
    expect(extracted.commitment_amount).toBe("USD 5,000,000")
    expect(extracted.minimum_commitment).toBe("USD 1,000,000")
    expect(extracted.admission_date).toBe("June 1, 2026")
    expect(extracted.tax_residency).toBe("Delaware")
    expect(extracted.tax_form).toBe("Form W-9")
    expect(extracted.aml_kyc_status).toBe("complete")
    expect(extracted.source_of_funds).toBe("capital reserves")
    expect(extracted.erisa_status).toBe("not a benefit plan investor")
    expect(extracted.fatca_crs_status).toBe("U.S. reportable account")
    expect(extracted.side_letter).toBe("yes")
    expect(extracted.placement_agent).toBe("North Harbor Securities LLC")
    expect(extracted.wire_instructions_present).toBe("Present (details redacted)")
    expect(extracted.tax_identification_number).toBeUndefined()
    expect(extracted.account_number).toBeUndefined()
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("reads spreadsheet-like bank statement and valuation context for later review", async () => {
    const bankPath = path.join(tempDir, "bank-statement.csv")
    fs.writeFileSync(
      bankPath,
      [
        "Statement Period,January 1 2026 to March 31 2026",
        "Account Currency,USD",
        "Opening Balance,USD 1200000.00",
        "Closing Balance,USD 1375000.00",
        "Transaction Date,Description,Debit,Credit,Balance",
        "2026-01-15,Capital contribution,,USD 200000.00,USD 1400000.00",
        "2026-02-10,Administration fee,USD 25000.00,,USD 1375000.00",
      ].join("\n"),
    )
    const bankSource = await RepositorySourceReaderService.read({ filePath: bankPath, extension: ".csv" })
    const bankResult = BankStatementReader.analyze({ source: bankSource })
    const bankFields = Object.fromEntries(bankResult.key_points.map((entry) => [entry.point_key, entry.value_text]))

    const valuationResult = ValuationReader.analyze({
      source: { text: "Valuation Date | March 31, 2026\nValuation Currency | USD\nNet Asset Value | USD 45,250,000.00\nNAV Per Unit | USD 10.052500" },
    })
    const valuationFields = Object.fromEntries(valuationResult.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(bankResult.status).toBe("completed")
    expect(bankFields.closing_balance).toContain("USD 1375000.00")
    expect(bankFields.transaction_count).toBe("2")
    expect(bankFields.total_credits).toBe("200,000.00")
    expect(bankFields.total_debits).toBe("25,000.00")
    expect(bankFields.net_transaction_movement).toBe("175,000.00")
    expect(bankFields.balance_reconciliation).toBe("Reconciled")
    expect(bankResult.structured_data_json.transaction_summary.transaction_count).toBe(2)
    expect(valuationResult.status).toBe("completed")
    expect(valuationFields.net_asset_value).toContain("USD 45,250,000.00")
    expect(valuationFields.unit_price).toContain("USD 10.052500")
  })

  test("extracts valuation package methodology, approval, and reconciliation facts", () => {
    const result = ValuationReader.analyze({
      source: {
        text: "Quarterly Valuation Package",
        tables: [
          {
            name: "Valuation Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Valuation Period", "Q1 2026"],
              ["Valuation Date", "March 31, 2026"],
              ["Prepared By", "Northfield Administration LLC"],
              ["Reporting Currency", "USD"],
              ["Gross Asset Value", "USD 12,500,000.00"],
              ["Total Liabilities", "USD 750,000.00"],
              ["Net Asset Value", "USD 11,750,000.00"],
              ["Cash Balance", "USD 1,750,000.00"],
              ["Investments at Fair Value", "USD 10,500,000.00"],
              ["Cost Basis", "USD 9,800,000.00"],
              ["Unrealized Gain/Loss", "USD 700,000.00"],
              ["Units Outstanding", "1,175,000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Valuation Basis", "fair value in accordance with ASC 820"],
              ["Valuation Methodology", "market approach using recent financing rounds"],
              ["Pricing Source", "independent valuation agent and broker quotes"],
              ["Fair Value Level", "Level 3"],
              ["Approval Status", "Approved"],
              ["Approved By", "Valuation Committee"],
              ["Approval Date", "April 10, 2026"],
              ["Stale Price Count", "0"],
              ["Material Assumptions", "discount rate and comparable company multiples"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Valuation Package")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.valuation_period).toBe("Q1 2026")
    expect(extracted.prepared_by).toBe("Northfield Administration LLC")
    expect(extracted.gross_asset_value).toBe("USD 12,500,000.00")
    expect(extracted.total_liabilities).toBe("USD 750,000.00")
    expect(extracted.investments_at_fair_value).toBe("USD 10,500,000.00")
    expect(extracted.cost_basis).toBe("USD 9,800,000.00")
    expect(extracted.unrealized_gain_loss).toBe("USD 700,000.00")
    expect(extracted.units_outstanding).toBe("1,175,000")
    expect(extracted.valuation_basis).toBe("fair value in accordance with ASC 820")
    expect(extracted.valuation_methodology).toBe("market approach using recent financing rounds")
    expect(extracted.pricing_source).toBe("independent valuation agent and broker quotes")
    expect(extracted.valuation_level).toBe("Level 3")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.approved_by).toBe("Valuation Committee")
    expect(extracted.approval_date).toBe("April 10, 2026")
    expect(extracted.stale_price_count).toBe("0")
    expect(extracted.material_assumptions).toContain("discount rate")
    expect(extracted.nav_reconciliation).toBe("Reconciled")
    expect(extracted.unrealized_gain_loss_reconciliation).toBe("Reconciled")
    expect(extracted.unit_price_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.nav_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.unrealized_gain_loss_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.unit_price_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.extracted_fields).toEqual(
      expect.arrayContaining([
        "valuation_methodology",
        "approval_status",
        "nav_reconciliation",
        "unrealized_gain_loss_reconciliation",
        "unit_price_reconciliation",
      ]),
    )
  })

  test("extracts capital account statement balances and rollforward totals", () => {
    const result = CapitalAccountStatementReader.analyze({
      source: {
        text: "Capital Account Statement",
        tables: [
          {
            name: "Capital Accounts",
            rows: [
              [
                "Investor Name",
                "Reporting Period",
                "Beginning Capital",
                "Contributions",
                "Distributions",
                "Net Income (Loss)",
                "Ending Capital",
                "Capital Commitment",
                "Unfunded Commitment",
              ],
              ["Alpha LP", "Q1 2026", "USD 1,000,000.00", "USD 200,000.00", "USD 50,000.00", "USD 25,000.00", "USD 1,175,000.00", "USD 2,000,000.00", "USD 800,000.00"],
              ["Beta LP", "Q1 2026", "USD 500,000.00", "USD 100,000.00", "USD 25,000.00", "(USD 10,000.00)", "USD 565,000.00", "USD 1,000,000.00", "USD 400,000.00"],
              ["Total", "", "USD 1,500,000.00", "USD 300,000.00", "USD 75,000.00", "USD 15,000.00", "USD 1,740,000.00", "USD 3,000,000.00", "USD 1,200,000.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.capital_account_investors).toBe("2")
    expect(extracted.total_beginning_capital).toBe("1,500,000.00")
    expect(extracted.total_contributions).toBe("300,000.00")
    expect(extracted.total_distributions).toBe("75,000.00")
    expect(extracted.total_net_income_loss).toBe("15,000.00")
    expect(extracted.total_ending_capital).toBe("1,740,000.00")
    expect(extracted.capital_rollforward_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.accounts).toHaveLength(2)
    expect(result.structured_data_json.summary_rows).toBe(1)
  })

  test("extracts capital account classes, allocations, transfers, and commitment checks", () => {
    const result = CapitalAccountStatementReader.analyze({
      source: {
        text: "Investor Capital Account Statement for Meridian Fund LP.",
        tables: [
          {
            name: "Partner Capital Accounts",
            rows: [
              [
                "Fund Name",
                "Investor Name",
                "Investor Type",
                "Share Class",
                "Reporting Period",
                "Statement Date",
                "Reporting Currency",
                "Capital Account Method",
                "Ownership %",
                "Beginning Capital",
                "Contributions",
                "Transfer In",
                "Transfer Out",
                "Distributions",
                "Recallable Distributions",
                "Investment Income",
                "Realized Gain/Loss",
                "Unrealized Gain/Loss",
                "Management Fees",
                "Incentive Allocation",
                "Other Expenses",
                "Net Income (Loss)",
                "Ending Capital",
                "Capital Commitment",
                "Called Capital",
                "Unfunded Commitment",
                "Withholding",
              ],
              [
                "Meridian Fund LP",
                "Alpha LP",
                "Institutional",
                "Class A",
                "Q2 2026",
                "June 30, 2026",
                "USD",
                "U.S. GAAP capital",
                "60.0000%",
                "USD 1,175,000.00",
                "USD 150,000.00",
                "USD 25,000.00",
                "USD 0.00",
                "USD 40,000.00",
                "USD 10,000.00",
                "USD 90,000.00",
                "USD 30,000.00",
                "USD 70,000.00",
                "USD 20,000.00",
                "USD 15,000.00",
                "USD 15,000.00",
                "USD 140,000.00",
                "USD 1,450,000.00",
                "USD 2,500,000.00",
                "USD 1,500,000.00",
                "USD 1,000,000.00",
                "USD 3,000.00",
              ],
              [
                "Meridian Fund LP",
                "Beta LP",
                "Family Office",
                "Class B",
                "Q2 2026",
                "June 30, 2026",
                "USD",
                "U.S. GAAP capital",
                "40.0000%",
                "USD 565,000.00",
                "USD 50,000.00",
                "USD 0.00",
                "USD 25,000.00",
                "USD 20,000.00",
                "USD 5,000.00",
                "USD 60,000.00",
                "USD 10,000.00",
                "USD 30,000.00",
                "USD 10,000.00",
                "USD 5,000.00",
                "USD 5,000.00",
                "USD 80,000.00",
                "USD 650,000.00",
                "USD 1,500,000.00",
                "USD 900,000.00",
                "USD 600,000.00",
                "USD 1,500.00",
              ],
              [
                "Total",
                "Total",
                "",
                "",
                "",
                "",
                "",
                "",
                "100.0000%",
                "USD 1,740,000.00",
                "USD 200,000.00",
                "USD 25,000.00",
                "USD 25,000.00",
                "USD 60,000.00",
                "USD 15,000.00",
                "USD 150,000.00",
                "USD 40,000.00",
                "USD 100,000.00",
                "USD 30,000.00",
                "USD 20,000.00",
                "USD 20,000.00",
                "USD 220,000.00",
                "USD 2,100,000.00",
                "USD 4,000,000.00",
                "USD 2,400,000.00",
                "USD 1,600,000.00",
                "USD 4,500.00",
              ],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Capital Account Statement")
    expect(extracted.funds).toBe("Meridian Fund LP")
    expect(extracted.share_classes).toContain("Class A")
    expect(extracted.investor_types).toContain("Institutional")
    expect(extracted.statement_dates).toBe("June 30, 2026")
    expect(extracted.reporting_currencies).toBe("USD")
    expect(extracted.capital_account_methods).toBe("U.S. GAAP capital")
    expect(extracted.ownership_percentage_total).toBe("100.0000")
    expect(extracted.total_transfer_in).toBe("25,000.00")
    expect(extracted.total_transfer_out).toBe("25,000.00")
    expect(extracted.total_recallable_distributions).toBe("15,000.00")
    expect(extracted.total_investment_income).toBe("150,000.00")
    expect(extracted.total_realized_gain_loss).toBe("40,000.00")
    expect(extracted.total_unrealized_gain_loss).toBe("100,000.00")
    expect(extracted.total_management_fees).toBe("30,000.00")
    expect(extracted.total_incentive_allocation).toBe("20,000.00")
    expect(extracted.total_other_expenses).toBe("20,000.00")
    expect(extracted.total_called_capital).toBe("2,400,000.00")
    expect(extracted.total_unfunded_commitment).toBe("1,600,000.00")
    expect(extracted.total_withholding).toBe("4,500.00")
    expect(extracted.largest_capital_investor).toBe("Alpha LP")
    expect(extracted.largest_capital_amount).toBe("1,450,000.00")
    expect(extracted.capital_rollforward_reconciliation).toBe("Reconciled")
    expect(extracted.commitment_reconciliation).toBe("Reconciled")
    expect(extracted.allocation_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.accounts).toHaveLength(2)
    expect(result.structured_data_json.rollforward_variance).toBe(0)
    expect(result.structured_data_json.commitment_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.allocation_reconciliation_variance).toBe(0)
  })

  test("extracts commitment schedule called and unfunded capital facts", () => {
    const result = CommitmentScheduleReader.analyze({
      source: {
        text: "Capital Commitment Schedule",
        tables: [
          {
            name: "Commitments",
            rows: [
              [
                "Investor Name",
                "Share Class",
                "Capital Commitment",
                "Called Capital",
                "Unfunded Commitment",
                "Recallable Amount",
                "Ownership %",
                "Close Date",
              ],
              ["Alpha LP", "Class A", "USD 2,000,000.00", "USD 1,200,000.00", "USD 800,000.00", "USD 100,000.00", "66.6667%", "2025-12-31"],
              ["Beta LP", "Class B", "USD 1,000,000.00", "USD 600,000.00", "USD 400,000.00", "USD 50,000.00", "33.3333%", "2026-01-31"],
              ["Total", "", "USD 3,000,000.00", "USD 1,800,000.00", "USD 1,200,000.00", "USD 150,000.00", "100.0000%", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Commitment Schedule")
    expect(extracted.commitment_schedule_investors).toBe("2")
    expect(extracted.total_commitment).toBe("3,000,000.00")
    expect(extracted.total_called_capital).toBe("1,800,000.00")
    expect(extracted.total_unfunded_commitment).toBe("1,200,000.00")
    expect(extracted.total_recallable_amount).toBe("150,000.00")
    expect(extracted.called_commitment_percent).toBe("60.00%")
    expect(extracted.unfunded_commitment_percent).toBe("40.00%")
    expect(extracted.largest_investor_by_commitment).toBe("Alpha LP")
    expect(extracted.largest_unfunded_investor).toBe("Alpha LP")
    expect(extracted.commitment_schedule_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.commitments).toHaveLength(2)
    expect(result.structured_data_json.totals.reconciliation_variance).toBe(0)
  })

  test("extracts commitment schedule investor context, changes, statuses, and percentage controls", () => {
    const result = CommitmentScheduleReader.analyze({
      source: {
        text: "Unfunded Commitment Schedule for Meridian Fund LP.",
        tables: [
          {
            name: "Commitment Rollforward",
            rows: [
              [
                "Fund Name",
                "Investor Name",
                "Investor Type",
                "Investor Status",
                "Tax Residency",
                "Domicile",
                "Share Class",
                "Side Letter Status",
                "Prior Commitment",
                "Commitment Increase",
                "Commitment Decrease",
                "Capital Commitment",
                "Called Capital",
                "Unfunded Commitment",
                "Recallable Amount",
                "Defaulted Commitment",
                "Excluded Commitment",
                "Ownership %",
                "Called %",
                "Unfunded %",
                "Close Date",
                "Effective Date",
              ],
              [
                "Meridian Fund LP",
                "Alpha LP",
                "Institutional",
                "Active",
                "United States",
                "Delaware",
                "Class A",
                "Yes",
                "USD 2,000,000.00",
                "USD 500,000.00",
                "USD 0.00",
                "USD 2,500,000.00",
                "USD 1,500,000.00",
                "USD 1,000,000.00",
                "USD 100,000.00",
                "USD 0.00",
                "USD 0.00",
                "50.0000%",
                "60.0000%",
                "40.0000%",
                "2025-12-31",
                "2026-04-01",
              ],
              [
                "Meridian Fund LP",
                "Beta LP",
                "Family Office",
                "Active",
                "United Kingdom",
                "England",
                "Class B",
                "No",
                "USD 1,500,000.00",
                "USD 0.00",
                "USD 250,000.00",
                "USD 1,250,000.00",
                "USD 500,000.00",
                "USD 750,000.00",
                "USD 50,000.00",
                "USD 0.00",
                "USD 0.00",
                "25.0000%",
                "40.0000%",
                "60.0000%",
                "2026-01-31",
                "2026-04-01",
              ],
              [
                "Meridian Fund LP",
                "Gamma LP",
                "Fund of Funds",
                "Defaulted",
                "Canada",
                "Ontario",
                "Class A",
                "MFN",
                "USD 1,000,000.00",
                "USD 0.00",
                "USD 0.00",
                "USD 1,000,000.00",
                "USD 250,000.00",
                "USD 750,000.00",
                "USD 0.00",
                "USD 50,000.00",
                "USD 100,000.00",
                "25.0000%",
                "25.0000%",
                "75.0000%",
                "2026-02-28",
                "2026-04-01",
              ],
              [
                "Total",
                "Total",
                "",
                "",
                "",
                "",
                "",
                "",
                "USD 4,500,000.00",
                "USD 500,000.00",
                "USD 250,000.00",
                "USD 4,750,000.00",
                "USD 2,250,000.00",
                "USD 2,500,000.00",
                "USD 150,000.00",
                "USD 50,000.00",
                "USD 100,000.00",
                "100.0000%",
                "47.3684%",
                "52.6316%",
                "",
                "",
              ],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Commitment Schedule")
    expect(extracted.funds).toBe("Meridian Fund LP")
    expect(extracted.active_commitment_investors).toBe("2")
    expect(extracted.investor_types).toContain("Institutional")
    expect(extracted.investor_statuses).toContain("Defaulted")
    expect(extracted.investor_status_counts).toContain("Active: 2")
    expect(extracted.tax_residencies).toContain("United Kingdom")
    expect(extracted.domiciles).toContain("Ontario")
    expect(extracted.side_letter_counts).toContain("MFN: 1")
    expect(extracted.effective_dates).toBe("2026-04-01")
    expect(extracted.total_prior_commitment).toBe("4,500,000.00")
    expect(extracted.total_commitment_increase).toBe("500,000.00")
    expect(extracted.total_commitment_decrease).toBe("250,000.00")
    expect(extracted.total_commitment).toBe("4,750,000.00")
    expect(extracted.total_called_capital).toBe("2,250,000.00")
    expect(extracted.total_unfunded_commitment).toBe("2,500,000.00")
    expect(extracted.total_defaulted_commitment).toBe("50,000.00")
    expect(extracted.total_excluded_commitment).toBe("100,000.00")
    expect(extracted.ownership_percent_total).toBe("100.0000")
    expect(extracted.reported_called_percent_total).toBe("47.3684")
    expect(extracted.reported_unfunded_percent_total).toBe("52.6316")
    expect(extracted.called_commitment_percent).toBe("47.37%")
    expect(extracted.unfunded_commitment_percent).toBe("52.63%")
    expect(extracted.largest_investor_by_commitment).toBe("Alpha LP")
    expect(extracted.largest_defaulted_investor).toBe("Gamma LP")
    expect(extracted.commitment_change_reconciliation).toBe("Reconciled")
    expect(extracted.commitment_schedule_reconciliation).toBe("Reconciled")
    expect(extracted.called_percent_reconciliation).toBe("Reconciled")
    expect(extracted.unfunded_percent_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.commitments).toHaveLength(3)
    expect(result.structured_data_json.totals.commitment_change_variance).toBe(0)
    expect(result.structured_data_json.totals.reconciliation_variance).toBe(0)
    expect(result.structured_data_json.totals.called_percent_variance).toBeCloseTo(0, 3)
    expect(result.structured_data_json.totals.unfunded_percent_variance).toBeCloseTo(0, 3)
  })

  test("extracts capital call notice facts without storing wire details", () => {
    const result = CapitalCallNoticeReader.analyze({
      source: {
        text: [
          "Capital Call Notice.",
          "Fund: Meridian Fund LP.",
          "Investor Name: Alpha LP.",
          "Notice Reference: CC-2026-01.",
          "Notice Date: March 15, 2026.",
          "Funding Due Date: March 31, 2026.",
          "Capital Call Amount: USD 250,000.00.",
          "Drawdown Percentage: 12.5%.",
          "Remaining Unfunded Commitment: USD 750,000.00.",
          "Use of Proceeds: follow-on investment funding.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Capital Call Notice")
    expect(extracted.fund_name).toContain("Meridian Fund LP")
    expect(extracted.investor_name).toContain("Alpha LP")
    expect(extracted.funding_due_date).toBe("March 31, 2026")
    expect(extracted.call_amount).toContain("USD 250,000.00")
    expect(extracted.call_percentage).toBe("12.5%")
    expect(result.structured_data_json.wire_instructions_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts capital call commitment rollforward, proceeds components, and status checks", () => {
    const result = CapitalCallNoticeReader.analyze({
      source: {
        text: "Drawdown Notice. Wire Instructions: Account Number 987654321. ABA 021000021.",
        tables: [
          {
            name: "Capital Call Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investor Name", "Alpha LP"],
              ["Investor Type", "Institutional"],
              ["Share Class", "Class A"],
              ["Notice Reference", "CC-2026-02"],
              ["Notice Date", "June 10, 2026"],
              ["Call Period", "Q2 2026"],
              ["Funding Due Date", "June 24, 2026"],
              ["Capital Commitment", "USD 2,000,000.00"],
              ["Drawdown Percentage", "12.50%"],
              ["Capital Call Amount", "USD 250,000.00"],
              ["Called Capital Before Call", "USD 750,000.00"],
              ["Called Capital After Call", "USD 1,000,000.00"],
              ["Unfunded Commitment Before Call", "USD 1,250,000.00"],
              ["Unfunded Commitment After Call", "USD 1,000,000.00"],
              ["Investment Funding", "USD 200,000.00"],
              ["Management Fee", "USD 25,000.00"],
              ["Fund Expenses", "USD 20,000.00"],
              ["Equalization Interest", "USD 5,000.00"],
              ["Late Interest", "USD 0.00"],
              ["Recallable Amount Applied", "USD 0.00"],
              ["Payment Status", "Pending"],
              ["Approval Status", "Approved"],
              ["Use of Proceeds", "new platform investment and quarterly expenses"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Capital Call Notice")
    expect(extracted.investor_type).toBe("Institutional")
    expect(extracted.share_class).toBe("Class A")
    expect(extracted.call_period).toBe("Q2 2026")
    expect(extracted.commitment_amount).toBe("USD 2,000,000.00")
    expect(extracted.call_percentage).toBe("12.50%")
    expect(extracted.call_amount).toBe("USD 250,000.00")
    expect(extracted.called_capital_before_call).toBe("USD 750,000.00")
    expect(extracted.called_capital_after_call).toBe("USD 1,000,000.00")
    expect(extracted.unfunded_commitment_before_call).toBe("USD 1,250,000.00")
    expect(extracted.unfunded_commitment_after_call).toBe("USD 1,000,000.00")
    expect(extracted.investment_funding_amount).toBe("USD 200,000.00")
    expect(extracted.management_fee_amount).toBe("USD 25,000.00")
    expect(extracted.expense_amount).toBe("USD 20,000.00")
    expect(extracted.equalization_interest).toBe("USD 5,000.00")
    expect(extracted.payment_status).toBe("Pending")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.call_drawdown_reconciliation).toBe("Reconciled")
    expect(extracted.called_capital_reconciliation).toBe("Reconciled")
    expect(extracted.unfunded_commitment_reconciliation).toBe("Reconciled")
    expect(extracted.commitment_reconciliation).toBe("Reconciled")
    expect(extracted.call_component_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.call_drawdown_variance).toBe(0)
    expect(result.structured_data_json.called_capital_variance).toBe(0)
    expect(result.structured_data_json.unfunded_commitment_variance).toBe(0)
    expect(result.structured_data_json.commitment_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.call_component_variance).toBe(0)
    expect(result.structured_data_json.wire_instructions_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("987654321")
  })

  test("extracts distribution notice facts from key-value rows", () => {
    const result = DistributionNoticeReader.analyze({
      source: {
        text: "Distribution Notice",
        tables: [
          {
            name: "Distribution Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investor", "Beta LP"],
              ["Notice Reference", "DIST-2026-02"],
              ["Payment Date", "April 15, 2026"],
              ["Distribution Amount", "USD 125,000.00"],
              ["Return of Capital", "USD 100,000.00"],
              ["Recallable Amount", "USD 40,000.00"],
              ["Withholding Tax", "USD 0.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Distribution Notice")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.investor_name).toBe("Beta LP")
    expect(extracted.payment_date).toBe("April 15, 2026")
    expect(extracted.distribution_amount).toBe("USD 125,000.00")
    expect(extracted.return_of_capital).toBe("USD 100,000.00")
    expect(extracted.recallable_amount).toBe("USD 40,000.00")
    expect(result.structured_data_json.extracted_fields).toEqual(expect.arrayContaining(["distribution_amount", "payment_date"]))
  })

  test("extracts distribution notice character, net cash, per-unit, and recallable controls", () => {
    const result = DistributionNoticeReader.analyze({
      source: {
        text: "Cash Distribution Notice. Wire Instructions: Account Number 987654321. Routing Number 021000021.",
        tables: [
          {
            name: "Distribution Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investor", "Beta LP"],
              ["Investor Type", "Family Office"],
              ["Share Class", "Class B"],
              ["Notice Reference", "DIST-2026-03"],
              ["Notice Date", "June 28, 2026"],
              ["Record Date", "June 30, 2026"],
              ["Payment Date", "July 15, 2026"],
              ["Distribution Period", "Q2 2026"],
              ["Gross Distribution Amount", "USD 125,000.00"],
              ["Return of Capital", "USD 80,000.00"],
              ["Income Distribution", "USD 20,000.00"],
              ["Realized Gain Distribution", "USD 15,000.00"],
              ["Tax Distribution", "USD 10,000.00"],
              ["Recallable Amount", "USD 40,000.00"],
              ["Withholding Tax", "USD 5,000.00"],
              ["Distribution Expense", "USD 2,500.00"],
              ["Net Distribution Amount", "USD 117,500.00"],
              ["Units", "10,000.0000"],
              ["Amount Per Unit", "USD 12.500000"],
              ["Payment Status", "Settled"],
              ["Approval Status", "Approved"],
              ["Distribution Type", "capital gain distribution"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Distribution Notice")
    expect(extracted.investor_type).toBe("Family Office")
    expect(extracted.share_class).toBe("Class B")
    expect(extracted.record_date).toBe("June 30, 2026")
    expect(extracted.distribution_period).toBe("Q2 2026")
    expect(extracted.gross_distribution_amount).toBe("USD 125,000.00")
    expect(extracted.return_of_capital).toBe("USD 80,000.00")
    expect(extracted.income_distribution).toBe("USD 20,000.00")
    expect(extracted.realized_gain_distribution).toBe("USD 15,000.00")
    expect(extracted.tax_distribution).toBe("USD 10,000.00")
    expect(extracted.withholding_amount).toBe("USD 5,000.00")
    expect(extracted.distribution_expense).toBe("USD 2,500.00")
    expect(extracted.net_distribution_amount).toBe("USD 117,500.00")
    expect(extracted.amount_per_unit).toBe("USD 12.500000")
    expect(extracted.payment_status).toBe("Settled")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.distribution_component_reconciliation).toBe("Reconciled")
    expect(extracted.net_distribution_reconciliation).toBe("Reconciled")
    expect(extracted.distribution_per_unit_reconciliation).toBe("Reconciled")
    expect(extracted.recallable_distribution_coverage).toBe("Non-recallable ROC 40,000.00")
    expect(result.structured_data_json.distribution_component_variance).toBe(0)
    expect(result.structured_data_json.net_distribution_variance).toBe(0)
    expect(result.structured_data_json.distribution_per_unit_variance).toBe(0)
    expect(result.structured_data_json.recallable_coverage_amount).toBe(40000)
    expect(result.structured_data_json.wire_instructions_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("987654321")
  })

  test("extracts redemption notice facts and reconciles net proceeds", () => {
    const result = RedemptionNoticeReader.analyze({
      source: {
        text: "Redemption Notice. Wire instructions include Routing Number 123456789.",
        tables: [
          {
            name: "Redemption Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investor", "Beta LP"],
              ["Notice Reference", "RED-2026-01"],
              ["Notice Date", "March 20, 2026"],
              ["Redemption Effective Date", "March 31, 2026"],
              ["Payment Date", "April 10, 2026"],
              ["Share Class", "Class A"],
              ["Redemption Amount", "USD 100,000.00"],
              ["Redemption Fee", "USD 1,000.00"],
              ["Holdback Amount", "USD 4,000.00"],
              ["Net Redemption Amount", "USD 95,000.00"],
              ["Units Redeemed", "10,000.0000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Redemption Status", "Approved"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Redemption Notice")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.investor_name).toBe("Beta LP")
    expect(extracted.notice_reference).toBe("RED-2026-01")
    expect(extracted.redemption_effective_date).toBe("March 31, 2026")
    expect(extracted.payment_date).toBe("April 10, 2026")
    expect(extracted.share_class).toBe("Class A")
    expect(extracted.redemption_amount).toBe("USD 100,000.00")
    expect(extracted.redemption_fee).toBe("USD 1,000.00")
    expect(extracted.holdback_amount).toBe("USD 4,000.00")
    expect(extracted.net_redemption_amount).toBe("USD 95,000.00")
    expect(extracted.units_redeemed).toBe("10,000.0000")
    expect(extracted.nav_per_unit).toBe("USD 10.000000")
    expect(extracted.redemption_net_reconciliation).toBe("Reconciled")
    expect(extracted.redemption_unit_price_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.net_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.unit_price_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.wire_instructions_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts redemption remaining balance, units, withholding, and percentage controls", () => {
    const result = RedemptionNoticeReader.analyze({
      source: {
        text: "Repurchase Notice. Wire Instructions: Account Number 987654321. ABA 021000021.",
        tables: [
          {
            name: "Redemption Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investor", "Beta LP"],
              ["Investor Type", "Family Office"],
              ["Notice Reference", "RED-2026-02"],
              ["Notice Date", "June 20, 2026"],
              ["Redemption Effective Date", "June 30, 2026"],
              ["Payment Date", "July 10, 2026"],
              ["Share Class", "Class B"],
              ["Redemption Type", "Partial Redemption"],
              ["Beginning Balance", "USD 1,000,000.00"],
              ["Redemption Amount", "USD 250,000.00"],
              ["Redemption Percentage", "25.00%"],
              ["Redemption Fee", "USD 5,000.00"],
              ["Holdback Amount", "USD 10,000.00"],
              ["Withholding Tax", "USD 15,000.00"],
              ["Net Redemption Amount", "USD 220,000.00"],
              ["Beginning Units", "100,000.0000"],
              ["Units Redeemed", "25,000.0000"],
              ["Remaining Units", "75,000.0000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Remaining Balance", "USD 750,000.00"],
              ["Redemption Status", "Approved"],
              ["Payment Status", "Pending"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Redemption Notice")
    expect(extracted.investor_type).toBe("Family Office")
    expect(extracted.redemption_type).toBe("Partial Redemption")
    expect(extracted.beginning_balance).toBe("USD 1,000,000.00")
    expect(extracted.redemption_amount).toBe("USD 250,000.00")
    expect(extracted.redemption_percentage).toBe("25.00%")
    expect(extracted.withholding_amount).toBe("USD 15,000.00")
    expect(extracted.net_redemption_amount).toBe("USD 220,000.00")
    expect(extracted.beginning_units).toBe("100,000.0000")
    expect(extracted.units_redeemed).toBe("25,000.0000")
    expect(extracted.remaining_units).toBe("75,000.0000")
    expect(extracted.remaining_balance).toBe("USD 750,000.00")
    expect(extracted.payment_status).toBe("Pending")
    expect(extracted.redemption_net_reconciliation).toBe("Reconciled")
    expect(extracted.redemption_unit_price_reconciliation).toBe("Reconciled")
    expect(extracted.remaining_balance_reconciliation).toBe("Reconciled")
    expect(extracted.remaining_units_reconciliation).toBe("Reconciled")
    expect(extracted.redemption_percentage_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.net_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.unit_price_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.remaining_balance_variance).toBe(0)
    expect(result.structured_data_json.remaining_units_variance).toBe(0)
    expect(result.structured_data_json.redemption_percentage_variance).toBe(0)
    expect(result.structured_data_json.wire_instructions_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("987654321")
  })

  test("extracts investor transfer notice facts and reconciles transfer value", () => {
    const result = TransferNoticeReader.analyze({
      source: {
        text: "Investor Transfer Notice",
        tables: [
          {
            name: "Transfer Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Transferor", "Beta LP"],
              ["Transferee", "Gamma LP"],
              ["Notice Reference", "TRF-2026-03"],
              ["Notice Date", "March 25, 2026"],
              ["Transfer Effective Date", "April 1, 2026"],
              ["Approval Date", "March 30, 2026"],
              ["Share Class", "Class A"],
              ["Transfer Type", "Partial Transfer"],
              ["Transfer Amount", "USD 250,000.00"],
              ["Units Transferred", "25,000.0000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Transfer Percentage", "25.00%"],
              ["Consent Status", "Approved"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Investor Transfer Notice")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.transferor_name).toBe("Beta LP")
    expect(extracted.transferee_name).toBe("Gamma LP")
    expect(extracted.notice_reference).toBe("TRF-2026-03")
    expect(extracted.transfer_effective_date).toBe("April 1, 2026")
    expect(extracted.approval_date).toBe("March 30, 2026")
    expect(extracted.share_class).toBe("Class A")
    expect(extracted.transfer_type).toBe("Partial Transfer")
    expect(extracted.transfer_amount).toBe("USD 250,000.00")
    expect(extracted.units_transferred).toBe("25,000.0000")
    expect(extracted.nav_per_unit).toBe("USD 10.000000")
    expect(extracted.consent_status).toBe("Approved")
    expect(extracted.transfer_value_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.transfer_value_variance).toBe(0)
  })

  test("extracts investor transfer parties, consent workflow, consideration, and remaining balances", () => {
    const result = TransferNoticeReader.analyze({
      source: {
        text: "Assignment Agreement and Notice of Transfer.",
        tables: [
          {
            name: "Transfer Control",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Transferor", "Beta LP"],
              ["Transferor Type", "Family Office"],
              ["Transferee", "Gamma LP"],
              ["Transferee Type", "Institutional"],
              ["Notice Reference", "TRF-2026-04"],
              ["Notice Date", "June 25, 2026"],
              ["Transfer Effective Date", "July 1, 2026"],
              ["Approval Date", "June 28, 2026"],
              ["Settlement Date", "July 5, 2026"],
              ["Share Class", "Class B"],
              ["Transfer Type", "Secondary Sale"],
              ["Beginning Transferor Balance", "USD 1,000,000.00"],
              ["Transfer Amount", "USD 250,000.00"],
              ["Transfer Fee", "USD 2,500.00"],
              ["Consideration Amount", "USD 247,500.00"],
              ["Remaining Transferor Balance", "USD 750,000.00"],
              ["Beginning Transferor Units", "100,000.0000"],
              ["Units Transferred", "25,000.0000"],
              ["Remaining Transferor Units", "75,000.0000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Transfer Percentage", "25.00%"],
              ["Consent Status", "Approved"],
              ["Side Letter Status", "Assigned"],
              ["KYC Status", "Complete"],
              ["Settlement Status", "Settled"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Investor Transfer Notice")
    expect(extracted.transferor_type).toBe("Family Office")
    expect(extracted.transferee_type).toBe("Institutional")
    expect(extracted.settlement_date).toBe("July 5, 2026")
    expect(extracted.transfer_type).toBe("Secondary Sale")
    expect(extracted.beginning_transferor_balance).toBe("USD 1,000,000.00")
    expect(extracted.transfer_amount).toBe("USD 250,000.00")
    expect(extracted.transfer_fee).toBe("USD 2,500.00")
    expect(extracted.consideration_amount).toBe("USD 247,500.00")
    expect(extracted.remaining_transferor_balance).toBe("USD 750,000.00")
    expect(extracted.beginning_transferor_units).toBe("100,000.0000")
    expect(extracted.units_transferred).toBe("25,000.0000")
    expect(extracted.remaining_transferor_units).toBe("75,000.0000")
    expect(extracted.transfer_percentage).toBe("25.00%")
    expect(extracted.side_letter_status).toBe("Assigned")
    expect(extracted.kyc_status).toBe("Complete")
    expect(extracted.settlement_status).toBe("Settled")
    expect(extracted.transfer_value_reconciliation).toBe("Reconciled")
    expect(extracted.transfer_consideration_reconciliation).toBe("Reconciled")
    expect(extracted.transferor_balance_reconciliation).toBe("Reconciled")
    expect(extracted.transferor_units_reconciliation).toBe("Reconciled")
    expect(extracted.transfer_percentage_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.transfer_value_variance).toBe(0)
    expect(result.structured_data_json.transfer_consideration_variance).toBe(0)
    expect(result.structured_data_json.transferor_balance_variance).toBe(0)
    expect(result.structured_data_json.transferor_units_variance).toBe(0)
    expect(result.structured_data_json.transfer_percentage_variance).toBe(0)
  })

  test("extracts management fee statement calculation facts from key-value rows", () => {
    const result = ManagementFeeStatementReader.analyze({
      source: {
        text: "Management Fee Statement",
        tables: [
          {
            name: "Fee Calculation",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Fee Calculation Period", "Q1 2026"],
              ["Calculation Date", "March 31, 2026"],
              ["Payment Due Date", "April 10, 2026"],
              ["Management Fee Rate", "1.75%"],
              ["Fee Basis", "committed capital"],
              ["Fee Basis Amount", "USD 100,000,000.00"],
              ["Gross Management Fee", "USD 437,500.00"],
              ["Fee Offset", "USD 25,000.00"],
              ["Net Management Fee Due", "USD 412,500.00"],
              ["Calculation Method", "quarterly fee based on committed capital"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Management Fee Statement")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.fee_period).toBe("Q1 2026")
    expect(extracted.calculation_date).toBe("March 31, 2026")
    expect(extracted.payment_due_date).toBe("April 10, 2026")
    expect(extracted.management_fee_rate).toBe("1.75%")
    expect(extracted.fee_basis).toBe("committed capital")
    expect(extracted.basis_amount).toBe("USD 100,000,000.00")
    expect(extracted.gross_management_fee).toBe("USD 437,500.00")
    expect(extracted.fee_offset).toBe("USD 25,000.00")
    expect(extracted.net_management_fee).toBe("USD 412,500.00")
    expect(result.structured_data_json.extracted_fields).toEqual(
      expect.arrayContaining(["management_fee_rate", "fee_basis", "basis_amount", "net_management_fee"]),
    )
    expect(result.structured_data_json.reconciliation_variance).toBe(0)
  })

  test("extracts management fee accruals, approvals, reductions, and reconciliation controls", () => {
    const result = ManagementFeeStatementReader.analyze({
      source: {
        text: "Management Fee Invoice for quarterly billing and approval review.",
        tables: [
          {
            name: "Management Fee Control",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Investment Manager", "Northstar Capital Management LLC"],
              ["Invoice Number", "MF-2026-Q2"],
              ["Invoice Date", "June 30, 2026"],
              ["Fee Calculation Period", "Q2 2026"],
              ["Billing Frequency", "Quarterly"],
              ["Reporting Currency", "USD"],
              ["Management Fee Rate", "2.00%"],
              ["Fee Basis", "net asset value"],
              ["Fee Basis Amount", "USD 80,000,000.00"],
              ["Gross Management Fee", "USD 400,000.00"],
              ["Fee Waiver", "USD 20,000.00"],
              ["Transaction Fee Offset", "USD 15,000.00"],
              ["Expense Offset", "USD 5,000.00"],
              ["Rebate Amount", "USD 10,000.00"],
              ["True-Up Adjustment", "USD 2,500.00"],
              ["Net Management Fee Due", "USD 352,500.00"],
              ["Accrued Management Fee", "USD 352,500.00"],
              ["Paid Management Fee", "USD 100,000.00"],
              ["Payable Management Fee", "USD 252,500.00"],
              ["Payment Status", "Partially Paid"],
              ["Approval Status", "Approved"],
              ["Approved By", "Jane Controller"],
              ["Approval Date", "July 2, 2026"],
              ["Investor Class", "Class A"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Management Fee Statement")
    expect(extracted.investment_manager).toBe("Northstar Capital Management LLC")
    expect(extracted.invoice_date).toBe("June 30, 2026")
    expect(extracted.billing_frequency).toBe("Quarterly")
    expect(extracted.reporting_currency).toBe("USD")
    expect(extracted.waiver_amount).toBe("USD 20,000.00")
    expect(extracted.transaction_fee_offset).toBe("USD 15,000.00")
    expect(extracted.expense_offset).toBe("USD 5,000.00")
    expect(extracted.rebate_amount).toBe("USD 10,000.00")
    expect(extracted.catch_up_adjustment).toBe("USD 2,500.00")
    expect(extracted.payment_status).toBe("Partially Paid")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.approved_by).toBe("Jane Controller")
    expect(extracted.investor_class).toBe("Class A")
    expect(extracted.gross_fee_reconciliation).toBe("Reconciled")
    expect(extracted.net_fee_reconciliation).toBe("Reconciled")
    expect(extracted.payable_fee_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.period_fraction).toBe(0.25)
    expect(result.structured_data_json.gross_fee_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.net_fee_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.payable_fee_reconciliation_variance).toBe(0)
  })

  test("extracts expense invoice facts and reconciles line-item totals", () => {
    const result = ExpenseInvoiceReader.analyze({
      source: {
        text: "Fund Expense Invoice",
        tables: [
          {
            name: "Invoice Summary",
            rows: [
              ["Service Provider", "Northfield Administration LLC"],
              ["Invoice Number", "INV-2026-004"],
              ["Invoice Date", "April 2, 2026"],
              ["Payment Due Date", "April 20, 2026"],
              ["Service Period", "Q1 2026"],
              ["Fund Name", "Meridian Fund LP"],
              ["Subtotal", "USD 60,000.00"],
              ["Tax", "USD 0.00"],
              ["Amount Due", "USD 60,000.00"],
            ],
          },
          {
            name: "Line Items",
            rows: [
              ["Description", "Expense Category", "Service Period", "Amount", "Currency"],
              ["Fund administration and NAV preparation", "Administration fee", "Q1 2026", "USD 45,000.00", "USD"],
              ["Audit support schedule preparation", "Audit fee", "Q1 2026", "USD 15,000.00", "USD"],
              ["Total", "", "", "USD 60,000.00", "USD"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Expense Invoice")
    expect(extracted.service_provider).toBe("Northfield Administration LLC")
    expect(extracted.invoice_number).toBe("INV-2026-004")
    expect(extracted.invoice_date).toBe("April 2, 2026")
    expect(extracted.due_date).toBe("April 20, 2026")
    expect(extracted.service_period).toBe("Q1 2026")
    expect(extracted.amount_due).toBe("USD 60,000.00")
    expect(extracted.invoice_line_items).toBe("2")
    expect(extracted.invoice_line_item_total).toBe("USD 60,000.00")
    expect(extracted.invoice_expense_categories).toContain("Administration fee")
    expect(result.structured_data_json.line_items).toHaveLength(2)
    expect(result.structured_data_json.line_item_total).toBe(60000)
    expect(result.structured_data_json.subtotal_variance).toBe(0)
  })

  test("extracts invoice approval, payment, accrual, coding, tax, and amount-due controls", () => {
    const result = ExpenseInvoiceReader.analyze({
      source: {
        text: [
          "Service Provider Invoice.",
          "Tax ID: 12-3456789.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Invoice Control",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Service Provider", "Summit Legal Advisors LLP"],
              ["Provider Role", "legal counsel"],
              ["Invoice Number", "LEGAL-2026-07"],
              ["Purchase Order", "ENG-2026-LGL"],
              ["Invoice Date", "July 5, 2026"],
              ["Due Date", "July 30, 2026"],
              ["Payment Terms", "Net 25"],
              ["Service Period", "Q2 2026"],
              ["Invoice Currency", "USD"],
              ["Functional Currency", "USD"],
              ["FX Rate", "1.0000"],
              ["Subtotal", "USD 65,000.00"],
              ["Tax", "USD 3,900.00"],
              ["Reimbursable Expenses", "USD 1,100.00"],
              ["Total Amount", "USD 70,000.00"],
              ["Paid Amount", "USD 20,000.00"],
              ["Credit", "USD 5,000.00"],
              ["Withholding Tax", "USD 2,000.00"],
              ["Amount Due", "USD 43,000.00"],
              ["Accrued Amount", "USD 70,000.00"],
              ["Payment Status", "Partially Paid"],
              ["Payment Date", "July 15, 2026"],
              ["Approval Status", "Approved"],
              ["Approved By", "Jane Controller"],
              ["Approval Date", "July 7, 2026"],
              ["Accrual Status", "Posted"],
            ],
          },
          {
            name: "Invoice Lines",
            rows: [
              ["Description", "Expense Category", "Service Period", "Amount", "Tax", "Currency", "GL Account", "Cost Center", "Approval Status"],
              ["Fund formation advice", "Legal fee", "Q2 2026", "USD 40,000.00", "USD 2,400.00", "USD", "6100 Legal", "Fund Ops", "Approved"],
              ["Tax structuring memo", "Tax preparation fee", "Q2 2026", "USD 25,000.00", "USD 1,500.00", "USD", "6200 Tax", "Fund Ops", "Approved"],
              ["Total", "", "", "USD 65,000.00", "USD 3,900.00", "USD", "", "", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Expense Invoice")
    expect(extracted.provider_role).toBe("legal counsel")
    expect(extracted.purchase_order).toBe("ENG-2026-LGL")
    expect(extracted.payment_terms).toBe("Net 25")
    expect(extracted.invoice_currency).toBe("USD")
    expect(extracted.functional_currency).toBe("USD")
    expect(extracted.payment_status).toBe("Partially Paid")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.approved_by).toBe("Jane Controller")
    expect(extracted.accrual_status).toBe("Posted")
    expect(extracted.invoice_line_tax_total).toBe("USD 3,900.00")
    expect(extracted.invoice_category_totals).toContain("Legal fee: 40,000.00")
    expect(extracted.invoice_gl_accounts).toContain("6100 Legal")
    expect(extracted.invoice_cost_centers).toBe("Fund Ops")
    expect(extracted.invoice_largest_line_item).toContain("Legal fee: USD 40,000.00")
    expect(extracted.invoice_subtotal_reconciliation).toBe("Reconciled")
    expect(extracted.invoice_tax_reconciliation).toBe("Reconciled")
    expect(extracted.invoice_total_reconciliation).toBe("Reconciled")
    expect(extracted.invoice_amount_due_reconciliation).toBe("Reconciled")
    expect(extracted.invoice_accrual_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.category_totals).toEqual(
      expect.objectContaining({ "Legal fee": 40000, "Tax preparation fee": 25000 }),
    )
    expect(result.structured_data_json.gl_accounts).toEqual(expect.arrayContaining(["6100 Legal", "6200 Tax"]))
    expect(result.structured_data_json.amount_due_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts accrual schedule facts and reconciles declared totals", () => {
    const result = AccrualScheduleReader.analyze({
      source: {
        text: "Expense Accrual Schedule",
        tables: [
          {
            name: "Accruals",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Accrual Period", "Q1 2026"],
              ["Reporting Date", "March 31, 2026"],
            ],
          },
          {
            name: "Accrual Detail",
            rows: [
              ["Service Provider", "Expense Category", "Service Period", "Invoice Number", "Due Date", "Accrued Amount", "Currency", "Status"],
              ["Northfield Administration LLC", "Administration fee", "Q1 2026", "INV-2026-004", "April 20, 2026", "USD 45,000.00", "USD", "Open"],
              ["Meridian Audit LLP", "Audit fee", "Q1 2026", "", "May 15, 2026", "USD 15,000.00", "USD", "Accrued"],
              ["Total", "", "", "", "", "USD 60,000.00", "USD", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Accrual Schedule")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.accrual_period).toBe("Q1 2026")
    expect(extracted.reporting_date).toBe("March 31, 2026")
    expect(extracted.accrual_items).toBe("2")
    expect(extracted.total_accrued_expenses).toBe("USD 60,000.00")
    expect(extracted.total_payables).toBe("USD 60,000.00")
    expect(extracted.open_accruals).toBe("2")
    expect(extracted.largest_accrual_provider).toBe("Northfield Administration LLC")
    expect(extracted.largest_accrual_amount).toBe("USD 45,000.00")
    expect(extracted.expense_categories).toContain("Administration fee")
    expect(extracted.expense_category_counts).toContain("Audit fee: 1")
    expect(extracted.due_dates).toContain("April 20, 2026")
    expect(extracted.accrual_schedule_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.items).toHaveLength(2)
    expect(result.structured_data_json.declared_totals.total_accrued_expenses).toBe(60000)
    expect(result.structured_data_json.totals.total_accrued_expenses).toBe(60000)
    expect(result.structured_data_json.totals.total_payables).toBe(60000)
  })

  test("extracts accrual aging, invoice-link, reversal, approval, and coding controls", () => {
    const result = AccrualScheduleReader.analyze({
      source: {
        text: [
          "Accounts Payable Schedule.",
          "Tax ID: 12-3456789.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Accrual Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Accrual Period", "Q2 2026"],
              ["Reporting Date", "June 30, 2026"],
              ["Total Accrued Expenses", "USD 50,000.00"],
              ["Total Payables", "USD 45,000.00"],
              ["Prepared By", "Jane Controller"],
              ["Reviewed By", "Mark Reviewer"],
              ["Review Date", "July 3, 2026"],
              ["Approval Status", "Approved"],
            ],
          },
          {
            name: "Accrual Detail",
            rows: [
              [
                "Service Provider",
                "Expense Category",
                "Service Period",
                "Invoice Number",
                "Invoice Received Date",
                "Due Date",
                "Payment Date",
                "Reversal Date",
                "Accrued Amount",
                "Currency",
                "Status",
                "Approval Status",
                "Reviewed By",
                "GL Account",
                "Cost Center",
                "Accrual Basis",
              ],
              ["Northfield Administration LLC", "Administration fee", "Q2 2026", "INV-2026-004", "June 1, 2026", "June 15, 2026", "", "July 1, 2026", "USD 12,000.00", "USD", "Open", "Approved", "Jane Controller", "6100 Admin", "Fund Ops", "invoice received"],
              ["Meridian Audit LLP", "Audit fee", "Q2 2026", "", "", "May 15, 2026", "", "July 1, 2026", "USD 20,000.00", "USD", "Pending Approval", "In Review", "Jane Controller", "6200 Audit", "Fund Ops", "prior year audit estimate"],
              ["Tax Advisors LLC", "Tax preparation fee", "Q2 2026", "TAX-2026-01", "June 20, 2026", "July 15, 2026", "", "July 31, 2026", "USD 13,000.00", "USD", "Accrued", "Approved", "Mark Reviewer", "6300 Tax", "Tax", "engagement letter estimate"],
              ["Custody Bank", "Custody fee", "Q2 2026", "CUST-2026-02", "May 1, 2026", "April 30, 2026", "June 10, 2026", "", "USD 5,000.00", "USD", "Paid", "Approved", "Mark Reviewer", "6400 Custody", "Fund Ops", "invoice paid after period end"],
              ["Total", "", "", "", "", "", "", "", "USD 50,000.00", "USD", "", "", "", "", "", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Accrual Schedule")
    expect(extracted.total_accrued_expenses).toBe("USD 50,000.00")
    expect(extracted.total_payables).toBe("USD 45,000.00")
    expect(extracted.accrual_status_counts).toContain("Paid: 1")
    expect(extracted.accrual_approval_status_counts).toContain("Approved: 3")
    expect(extracted.accrual_aging_buckets).toContain("31-60 days: 1")
    expect(extracted.overdue_accruals).toBe("2")
    expect(extracted.invoice_linked_accruals).toBe("3")
    expect(extracted.unlinked_accruals).toBe("1")
    expect(extracted.reversal_dates).toContain("July 1, 2026")
    expect(extracted.accrual_gl_accounts).toContain("6100 Admin")
    expect(extracted.accrual_cost_centers).toContain("Fund Ops")
    expect(extracted.row_reviewers).toContain("Mark Reviewer")
    expect(extracted.accrual_category_totals).toContain("Audit fee: 20,000.00")
    expect(extracted.accrual_schedule_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.totals.total_payables).toBe(45000)
    expect(result.structured_data_json.totals.overdue_accruals).toBe(2)
    expect(result.structured_data_json.aging_bucket_counts).toEqual(
      expect.objectContaining({ "1-30 days": 1, "31-60 days": 1, "61-90 days": 1, "Not due": 1 }),
    )
    expect(result.structured_data_json.category_totals).toEqual(
      expect.objectContaining({ "Audit fee": 20000, "Tax preparation fee": 13000 }),
    )
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts credit facility and covenant facts from financing documents", () => {
    const result = CreditFacilityReader.analyze({
      source: {
        text: "Credit Facility Agreement and Covenant Certificate",
        tables: [
          {
            name: "Facility Summary",
            rows: [
              ["Borrower", "Meridian Fund LP"],
              ["Administrative Agent", "North Bank N.A."],
              ["Facility Type", "subscription line"],
              ["Facility Amount", "USD 50,000,000.00"],
              ["Outstanding Principal", "USD 12,500,000.00"],
              ["Undrawn Commitment", "USD 37,500,000.00"],
              ["Borrowing Base", "USD 80,000,000.00"],
              ["Interest Rate", "SOFR + 2.25%"],
              ["Maturity Date", "June 30, 2027"],
              ["Reporting Date", "March 31, 2026"],
              ["Current LTV", "15.63%"],
              ["Maximum LTV", "35.00%"],
              ["Covenant Status", "In Compliance"],
              ["Collateral", "uncalled capital commitments"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Credit Facility / Debt Document")
    expect(extracted.borrower_name).toBe("Meridian Fund LP")
    expect(extracted.lender_name).toBe("North Bank N.A.")
    expect(extracted.facility_type).toBe("subscription line")
    expect(extracted.facility_amount).toBe("USD 50,000,000.00")
    expect(extracted.outstanding_principal).toBe("USD 12,500,000.00")
    expect(extracted.borrowing_base).toBe("USD 80,000,000.00")
    expect(extracted.interest_rate).toBe("SOFR + 2.25%")
    expect(extracted.maturity_date).toBe("June 30, 2027")
    expect(extracted.current_ltv).toBe("15.63%")
    expect(extracted.covenant_status).toBe("In Compliance")
    expect(result.structured_data_json.extracted_fields).toEqual(
      expect.arrayContaining(["facility_amount", "outstanding_principal", "borrowing_base", "maturity_date"]),
    )
  })

  test("extracts credit facility availability, reporting terms, and covenant headroom checks", () => {
    const result = CreditFacilityReader.analyze({
      source: {
        text: "Compliance Certificate for subscription line credit facility. Account Number: 123456789.",
        tables: [
          {
            name: "Debt Terms",
            rows: [
              ["Borrower", "Meridian Fund LP"],
              ["Lender", "North Bank N.A."],
              ["Facility Type", "revolving credit facility"],
              ["Agreement Date", "January 15, 2025"],
              ["Amendment Date", "February 10, 2026"],
              ["Facility Currency", "USD"],
              ["Facility Amount", "USD 60,000,000.00"],
              ["Outstanding Principal", "USD 18,000,000.00"],
              ["Undrawn Commitment", "USD 42,000,000.00"],
              ["Eligible Commitments", "USD 100,000,000.00"],
              ["Borrowing Base", "USD 90,000,000.00"],
              ["Advance Rate", "60.00%"],
              ["Interest Rate", "SOFR + 2.25%"],
              ["Interest Margin", "2.25%"],
              ["Benchmark Rate", "Term SOFR"],
              ["Commitment Fee", "0.35% on unused commitment"],
              ["Interest Payment Frequency", "monthly in arrears"],
              ["Maturity Date", "June 30, 2027"],
              ["Commitment Termination Date", "May 31, 2027"],
            ],
          },
          {
            name: "Covenant Certificate",
            rows: [
              ["Reporting Date", "March 31, 2026"],
              ["Reporting Frequency", "Quarterly"],
              ["Reporting Deadline", "30 days after quarter end"],
              ["Current NAV", "USD 120,000,000.00"],
              ["Minimum NAV", "USD 100,000,000.00"],
              ["Current LTV", "20.00%"],
              ["Maximum LTV", "35.00%"],
              ["Asset Coverage Ratio", "3.50x"],
              ["Minimum Asset Coverage", "2.00x"],
              ["Current Liquidity", "USD 25,000,000.00"],
              ["Liquidity Requirement", "USD 10,000,000.00"],
              ["Covenant Status", "In Compliance"],
              ["Waiver Status", "Not Required"],
              ["Collateral", "uncalled capital commitments and pledged collection account"],
              ["Pledged Account", "North Bank blocked collection account"],
              ["Guarantor", "none"],
              ["Purpose", "short-term bridge financing and fund expenses"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Credit Facility / Debt Document")
    expect(extracted.agreement_date).toBe("January 15, 2025")
    expect(extracted.amendment_date).toBe("February 10, 2026")
    expect(extracted.facility_currency).toBe("USD")
    expect(extracted.eligible_commitments).toBe("USD 100,000,000.00")
    expect(extracted.advance_rate).toBe("60.00%")
    expect(extracted.interest_margin).toBe("2.25%")
    expect(extracted.benchmark_rate).toBe("Term SOFR")
    expect(extracted.commitment_fee).toBe("0.35% on unused commitment")
    expect(extracted.interest_payment_frequency).toBe("monthly in arrears")
    expect(extracted.commitment_termination_date).toBe("May 31, 2027")
    expect(extracted.reporting_frequency).toBe("Quarterly")
    expect(extracted.reporting_deadline).toBe("30 days after quarter end")
    expect(extracted.current_nav).toBe("USD 120,000,000.00")
    expect(extracted.minimum_nav).toBe("USD 100,000,000.00")
    expect(extracted.asset_coverage_ratio).toBe("3.50x")
    expect(extracted.minimum_asset_coverage).toBe("2.00x")
    expect(extracted.current_liquidity).toBe("USD 25,000,000.00")
    expect(extracted.liquidity_requirement).toBe("USD 10,000,000.00")
    expect(extracted.waiver_status).toBe("Not Required")
    expect(extracted.pledged_account).toBe("North Bank blocked collection account")
    expect(extracted.facility_availability_reconciliation).toBe("Reconciled")
    expect(extracted.ltv_calculation_reconciliation).toBe("Reconciled")
    expect(extracted.ltv_covenant_headroom).toBe("Headroom 15.00%")
    expect(extracted.minimum_nav_headroom).toBe("Headroom 20,000,000.00")
    expect(extracted.asset_coverage_headroom).toBe("Headroom 1.50x")
    expect(extracted.liquidity_headroom).toBe("Headroom 15,000,000.00")
    expect(result.structured_data_json.facility_availability_variance).toBe(0)
    expect(result.structured_data_json.ltv_calculation_variance).toBe(0)
    expect(result.structured_data_json.ltv_covenant_headroom).toBe(15)
    expect(result.structured_data_json.minimum_nav_headroom).toBe(20000000)
    expect(result.source_text_excerpt).toContain("[redacted]")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts custodian statement balances and position support without exposing account numbers", () => {
    const result = CustodianStatementReader.analyze({
      source: {
        text: "Custodian Statement. Account Number: 123456789.",
        tables: [
          {
            name: "Custody Summary",
            rows: [
              ["Custodian", "North Bank Custody"],
              ["Account Name", "Meridian Fund LP Custody"],
              ["Account Number", "123456789"],
              ["Statement Period", "April 1 2026 to April 30 2026"],
              ["Base Currency", "USD"],
              ["Cash Balance", "USD 240,000.00"],
              ["Securities Market Value", "USD 1,760,000.00"],
              ["Total Account Value", "USD 2,000,000.00"],
            ],
          },
          {
            name: "Positions",
            rows: [
              ["Security Name", "Asset Class", "Quantity", "Market Value", "Cost", "Currency"],
              ["North Harbor Infrastructure", "Private Equity", "1,000", "USD 1,260,000.00", "USD 1,000,000.00", "USD"],
              ["Treasury Fund", "Cash Equivalent", "500,000", "USD 500,000.00", "USD 500,000.00", "USD"],
              ["Total", "", "", "USD 1,760,000.00", "", "USD"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Custodian Statement")
    expect(extracted.custodian_name).toBe("North Bank Custody")
    expect(extracted.account_name).toBe("Meridian Fund LP Custody")
    expect(extracted.account_tail).toBe("6789")
    expect(extracted.cash_balance).toBe("USD 240,000.00")
    expect(extracted.securities_market_value).toBe("USD 1,760,000.00")
    expect(extracted.total_account_value).toBe("USD 2,000,000.00")
    expect(extracted.custody_positions).toBe("2")
    expect(extracted.position_market_value_total).toBe("1,760,000.00")
    expect(extracted.largest_custody_position).toBe("North Harbor Infrastructure")
    expect(extracted.largest_custody_position_percent).toBe("71.59%")
    expect(extracted.top_5_custody_market_value_percent).toBe("100.00%")
    expect(extracted.custody_value_reconciliation).toBe("Reconciled")
    expect(extracted.custody_positions_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.positions).toHaveLength(2)
    expect(result.structured_data_json.asset_class_counts).toEqual({ "Private Equity": 1, "Cash Equivalent": 1 })
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts waterfall allocation and carry facts from key-value rows", () => {
    const result = WaterfallStatementReader.analyze({
      source: {
        text: "Distribution Waterfall Statement",
        tables: [
          {
            name: "Waterfall",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Waterfall Period", "Q1 2026"],
              ["Distribution Date", "April 15, 2026"],
              ["Investment", "North Harbor Infrastructure"],
              ["Total Distribution", "USD 1,000,000.00"],
              ["Return of Capital", "USD 700,000.00"],
              ["Preferred Return", "USD 100,000.00"],
              ["GP Catch-up", "USD 50,000.00"],
              ["Carried Interest", "USD 50,000.00"],
              ["LP Distribution", "USD 900,000.00"],
              ["GP Distribution", "USD 100,000.00"],
              ["Recallable Amount", "USD 250,000.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Waterfall Statement")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.waterfall_period).toBe("Q1 2026")
    expect(extracted.distribution_date).toBe("April 15, 2026")
    expect(extracted.total_distribution).toBe("USD 1,000,000.00")
    expect(extracted.return_of_capital).toBe("USD 700,000.00")
    expect(extracted.preferred_return).toBe("USD 100,000.00")
    expect(extracted.gp_catch_up).toBe("USD 50,000.00")
    expect(extracted.carried_interest_distribution).toBe("USD 50,000.00")
    expect(extracted.lp_distribution).toBe("USD 900,000.00")
    expect(extracted.gp_distribution).toBe("USD 100,000.00")
    expect(extracted.allocation_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.allocation_reconciliation_variance).toBe(0)
  })

  test("extracts bank statement header facts from key-value summary tables", () => {
    const result = BankStatementReader.analyze({
      source: {
        text: "Bank Statement",
        tables: [
          {
            name: "Statement Summary",
            rows: [
              ["Statement Date Range", "April 1 2026 to April 30 2026"],
              ["Account Number", "****9876"],
              ["Base Currency", "USD"],
              ["Beginning Balance", "USD 1,000.00"],
              ["Ending Balance", "USD 1,125.00"],
            ],
          },
          {
            name: "Transactions",
            rows: [
              ["Transaction Date", "Narrative", "Amount", "Running Balance"],
              ["2026-04-05", "Capital call receipt", "USD 200.00", "USD 1,200.00"],
              ["2026-04-15", "Administration fee", "USD -75.00", "USD 1,125.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.statement_period).toBe("April 1 2026 to April 30 2026")
    expect(extracted.account_tail).toBe("9876")
    expect(extracted.currency).toBe("USD")
    expect(extracted.closing_balance).toContain("USD 1,125.00")
    expect(extracted.transaction_count).toBe("2")
    expect(extracted.balance_reconciliation).toBe("Reconciled")
  })

  test("extracts bank statement transaction categories, largest flows, and redacts account details", () => {
    const result = BankStatementReader.analyze({
      source: {
        text: "Bank Statement. Account Number: 123456789. Routing Number: 021000021.",
        tables: [
          {
            name: "Statement Summary",
            rows: [
              ["Bank Name", "North Bank N.A."],
              ["Account Name", "Meridian Fund LP Operating"],
              ["Statement Date", "May 31, 2026"],
              ["Statement Date Range", "May 1 2026 to May 31 2026"],
              ["Account Number", "123456789"],
              ["Base Currency", "USD"],
              ["Opening Balance", "USD 1,000.00"],
              ["Closing Balance", "USD 1,600.00"],
            ],
          },
          {
            name: "Transactions",
            rows: [
              ["Transaction Date", "Reference Number", "Narrative", "Debit", "Credit", "Running Balance"],
              ["2026-05-01", "DEP-1", "Capital contribution from Alpha LP", "", "USD 1,000.00", "USD 2,000.00"],
              ["2026-05-05", "WIRE-2", "Management fee wire", "USD 250.00", "", "USD 1,750.00"],
              ["2026-05-10", "FEE-3", "Bank charge", "USD 25.00", "", "USD 1,725.00"],
              ["2026-05-12", "INT-4", "Interest income", "", "USD 5.00", "USD 1,730.00"],
              ["2026-05-20", "DIST-5", "Distribution payment", "USD 130.00", "", "USD 1,600.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.bank_name).toBe("North Bank N.A.")
    expect(extracted.account_name).toBe("Meridian Fund LP Operating")
    expect(extracted.account_tail).toBe("6789")
    expect(extracted.statement_date).toBe("May 31, 2026")
    expect(extracted.transaction_count).toBe("5")
    expect(extracted.transaction_date_range).toBe("2026-05-01 to 2026-05-20")
    expect(extracted.transaction_category_summary).toContain("capital_call_receipt: 1 (1,000.00)")
    expect(extracted.transaction_category_summary).toContain("fund_expense: 1 (250.00)")
    expect(extracted.transaction_category_summary).toContain("bank_fee: 1 (25.00)")
    expect(extracted.transaction_category_summary).toContain("interest_income: 1 (5.00)")
    expect(extracted.transaction_category_summary).toContain("distribution_payment: 1 (130.00)")
    expect(extracted.largest_credit).toBe("1,000.00")
    expect(extracted.largest_credit_description).toBe("Capital contribution from Alpha LP")
    expect(extracted.largest_debit).toBe("250.00")
    expect(extracted.largest_debit_description).toBe("Management fee wire")
    expect(extracted.balance_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.transaction_summary.categories.capital_call_receipt).toEqual(
      expect.objectContaining({ count: 1, credit: 1000 }),
    )
    expect(result.structured_data_json.transaction_summary.largest_debit).toEqual(
      expect.objectContaining({ debit: 250, category: "fund_expense" }),
    )
    expect(result.source_text_excerpt).not.toContain("123456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
  })

  test("extracts bank reconciliation facts and validates adjusted balances", () => {
    const result = BankReconciliationReader.analyze({
      source: {
        text: "Bank Reconciliation Statement",
        tables: [
          {
            name: "Reconciliation Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Bank Name", "North Bank N.A."],
              ["Account Ending", "4321"],
              ["Currency", "USD"],
              ["Reconciliation Date", "March 31, 2026"],
              ["Bank Statement Balance", "USD 1,350,000.00"],
              ["Book Balance", "USD 1,375,000.00"],
              ["Adjusted Bank Balance", "USD 1,375,000.00"],
              ["Adjusted Book Balance", "USD 1,375,000.00"],
            ],
          },
          {
            name: "Reconciling Items",
            rows: [
              ["Item Type", "Description", "Amount", "Status"],
              ["Deposit in Transit", "Investor subscription received April 1", "USD 50,000.00", "Outstanding"],
              ["Outstanding Check", "Management fee wire", "USD 25,000.00", "Outstanding"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Bank Reconciliation")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.bank_name).toBe("North Bank N.A.")
    expect(extracted.account_tail).toBe("4321")
    expect(extracted.reconciliation_date).toBe("March 31, 2026")
    expect(extracted.bank_balance).toBe("USD 1,350,000.00")
    expect(extracted.book_balance).toBe("USD 1,375,000.00")
    expect(extracted.outstanding_deposits).toBe("USD 50,000.00")
    expect(extracted.outstanding_checks).toBe("USD 25,000.00")
    expect(extracted.reconciling_item_count).toBe("2")
    expect(extracted.adjusted_bank_reconciliation).toBe("Reconciled")
    expect(extracted.book_bank_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.reconciling_items).toHaveLength(2)
    expect(result.structured_data_json.computed_adjusted_bank_balance).toBe(1375000)
    expect(result.structured_data_json.book_bank_variance).toBe(0)
  })

  test("extracts bank reconciliation review controls, stale items, and largest reconciling item", () => {
    const result = BankReconciliationReader.analyze({
      source: {
        text: "Bank Reconciliation Statement. Account Number: 123456789. Routing Number: 021000021.",
        tables: [
          {
            name: "Reconciliation Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Bank Name", "North Bank N.A."],
              ["Account Ending", "6789"],
              ["Currency", "USD"],
              ["Reconciliation Date", "March 31, 2026"],
              ["Statement Period", "March 1 2026 to March 31 2026"],
              ["Prepared By", "Fund Accounting Team"],
              ["Prepared Date", "April 2, 2026"],
              ["Reviewed By", "Controller"],
              ["Reviewed Date", "April 3, 2026"],
              ["Review Status", "Approved"],
              ["Variance Threshold", "USD 1.00"],
              ["Bank Statement Balance", "USD 1,000,000.00"],
              ["Book Balance", "USD 1,075,000.00"],
              ["Outstanding Deposits", "USD 100,000.00"],
              ["Outstanding Checks", "USD 25,000.00"],
              ["Adjusted Bank Balance", "USD 1,075,000.00"],
              ["Adjusted Book Balance", "USD 1,075,000.00"],
            ],
          },
          {
            name: "Reconciling Items",
            rows: [
              ["Item Date", "Item Type", "Description", "Amount", "Status", "Cleared Date"],
              ["2026-01-15", "Deposit in Transit", "Investor subscription received after cutoff", "USD 100,000.00", "Open", ""],
              ["2026-02-01", "Outstanding Payment", "Audit fee check not presented", "USD 25,000.00", "Open", ""],
              ["2026-03-20", "Bank Fee", "Monthly account service charge", "USD 75.00", "Cleared", "2026-03-22"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.prepared_by).toBe("Fund Accounting Team")
    expect(extracted.prepared_date).toBe("April 2, 2026")
    expect(extracted.reviewed_by).toBe("Controller")
    expect(extracted.reviewed_date).toBe("April 3, 2026")
    expect(extracted.review_status).toBe("Approved")
    expect(extracted.variance_threshold).toBe("USD 1.00")
    expect(extracted.reconciling_item_count).toBe("3")
    expect(extracted.reconciling_item_status_counts).toBe("open: 2, cleared: 1")
    expect(extracted.reconciling_item_type_counts).toContain("outstanding_deposits: 1")
    expect(extracted.reconciling_item_type_counts).toContain("outstanding_checks: 1")
    expect(extracted.reconciling_item_type_counts).toContain("bank_fees: 1")
    expect(extracted.open_reconciling_items).toBe("2")
    expect(extracted.cleared_reconciling_items).toBe("1")
    expect(extracted.stale_reconciling_items).toBe("2")
    expect(extracted.largest_reconciling_item).toBe("USD 100,000.00")
    expect(extracted.largest_reconciling_item_description).toBe("Investor subscription received after cutoff")
    expect(extracted.bank_fees).toBe("USD 75.00")
    expect(extracted.adjusted_bank_reconciliation).toBe("Reconciled")
    expect(extracted.book_bank_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.status_counts).toEqual({ open: 2, cleared: 1 })
    expect(result.structured_data_json.open_item_count).toBe(2)
    expect(result.structured_data_json.stale_item_count).toBe(2)
    expect(result.structured_data_json.largest_reconciling_item).toEqual(
      expect.objectContaining({ amount: 100000, bucket: "outstanding_deposits", stale: true }),
    )
    expect(result.source_text_excerpt).not.toContain("123456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
  })

  test("keeps a bank statement with unreconciled transaction movement in review", () => {
    const result = BankStatementReader.analyze({
      source: {
        text: "Statement Period: January 1 2026 to March 31 2026. Opening Balance: USD 100.00. Closing Balance: USD 150.00.",
        tables: [
          {
            name: "Transactions",
            rows: [
              ["Date", "Description", "Debit", "Credit"],
              ["2026-01-05", "Deposit", "", "USD 40.00"],
            ],
          },
        ],
      },
    })

    expect(result.status).toBe("partial")
    expect(result.issues_json).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "bank_statement_not_reconciled" })]),
    )
  })

  test("extracts statement totals and investment-result metrics for later report analysis", () => {
    const result = FinancialStatementReader.analyze({
      source: {
        text: [
          "Statement of Assets and Liabilities as of December 31, 2025.",
          "Reporting Currency | USD.",
          "Total Assets | USD 12,500,000.00.",
          "Total Liabilities | USD 750,000.00.",
          "Net Assets | USD 11,750,000.00.",
          "Cash and Cash Equivalents | USD 1,250,000.00.",
          "Net Investment Income | USD 450,000.00.",
          "Net Realized Gain | USD 125,000.00.",
          "Net Unrealized Loss | (USD 20,000.00).",
        ].join(" "),
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.net_assets).toContain("USD 11,750,000.00")
    expect(extracted.total_assets).toContain("USD 12,500,000.00")
    expect(extracted.cash_and_cash_equivalents).toContain("USD 1,250,000.00")
    expect(extracted.net_investment_income).toContain("USD 450,000.00")
    expect(extracted.net_unrealized_gain_loss).toContain("(USD 20,000.00)")
  })

  test("extracts and reconciles financial statement package tables", () => {
    const result = FinancialStatementReader.analyze({
      source: {
        text: "Audited financial statements for Meridian Fund LP.",
        tables: [
          {
            name: "Statement of Assets and Liabilities",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Reporting Period", "December 31, 2025"],
              ["Reporting Currency", "USD"],
              ["Basis of Accounting", "U.S. GAAP"],
              ["Cash and Cash Equivalents", "USD 1,250,000.00"],
              ["Investments at Fair Value", "USD 11,250,000.00"],
              ["Receivables", "USD 0.00"],
              ["Total Assets", "USD 12,500,000.00"],
              ["Payables and Accruals", "USD 750,000.00"],
              ["Total Liabilities", "USD 750,000.00"],
              ["Net Assets", "USD 11,750,000.00"],
            ],
          },
          {
            name: "Statement of Operations",
            rows: [
              ["Investment Income", "USD 600,000.00"],
              ["Management Fees", "USD 100,000.00"],
              ["Professional Fees", "USD 50,000.00"],
              ["Total Expenses", "USD 150,000.00"],
              ["Net Investment Income", "USD 450,000.00"],
              ["Net Realized Gain (Loss)", "USD 125,000.00"],
              ["Net Unrealized Gain (Loss)", "USD (20,000.00)"],
              ["Net Increase (Decrease) from Operations", "USD 555,000.00"],
            ],
          },
          {
            name: "Statement of Changes in Partners' Capital",
            rows: [
              ["Beginning Net Assets", "USD 10,000,000.00"],
              ["Capital Contributions", "USD 1,500,000.00"],
              ["Redemptions", "USD 100,000.00"],
              ["Distributions", "USD 205,000.00"],
              ["Ending Net Assets", "USD 11,750,000.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Financial Statements")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.basis_of_accounting).toBe("U.S. GAAP")
    expect(extracted.investments_at_fair_value).toBe("USD 11,250,000.00")
    expect(extracted.payables_and_accruals).toBe("USD 750,000.00")
    expect(extracted.total_expenses).toBe("USD 150,000.00")
    expect(extracted.net_increase_from_operations).toBe("USD 555,000.00")
    expect(extracted.beginning_net_assets).toBe("USD 10,000,000.00")
    expect(extracted.capital_contributions).toBe("USD 1,500,000.00")
    expect(extracted.redemptions_withdrawals).toBe("USD 100,000.00")
    expect(extracted.distributions).toBe("USD 205,000.00")
    expect(extracted.ending_net_assets).toBe("USD 11,750,000.00")
    expect(extracted.balance_sheet_reconciliation).toBe("Reconciled")
    expect(extracted.operations_reconciliation).toBe("Reconciled")
    expect(extracted.net_assets_rollforward_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.balance_sheet_variance).toBe(0)
    expect(result.structured_data_json.operations_variance).toBe(0)
    expect(result.structured_data_json.net_assets_rollforward_variance).toBe(0)
    expect(result.structured_data_json.extracted_fields).toEqual(
      expect.arrayContaining([
        "investments_at_fair_value",
        "net_increase_from_operations",
        "beginning_net_assets",
        "ending_net_assets",
        "balance_sheet_reconciliation",
      ]),
    )
  })

  test("extracts NAV package rollforward and unit price facts", () => {
    const result = NavPackageReader.analyze({
      source: {
        text: "Quarterly NAV Package prepared by Northfield Administration LLC",
        tables: [
          {
            name: "NAV Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Administrator", "Northfield Administration LLC"],
              ["Reporting Period", "Q1 2026"],
              ["Valuation Date", "March 31, 2026"],
              ["Reporting Currency", "USD"],
              ["Beginning NAV", "USD 10,000,000.00"],
              ["Subscriptions", "USD 2,000,000.00"],
              ["Redemptions", "USD 500,000.00"],
              ["Net Investment Income", "USD 150,000.00"],
              ["Realized Gain/Loss", "USD 100,000.00"],
              ["Unrealized Gain/Loss", "USD 250,000.00"],
              ["Management Fees", "USD 75,000.00"],
              ["Fund Expenses", "USD 50,000.00"],
              ["Distributions", "USD 125,000.00"],
              ["Ending NAV", "USD 11,750,000.00"],
              ["Units Outstanding", "1,175,000"],
              ["NAV Per Unit", "USD 10.000000"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("NAV Package")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.administrator).toBe("Northfield Administration LLC")
    expect(extracted.reporting_period).toBe("Q1 2026")
    expect(extracted.valuation_date).toBe("March 31, 2026")
    expect(extracted.beginning_nav).toBe("USD 10,000,000.00")
    expect(extracted.subscriptions).toBe("USD 2,000,000.00")
    expect(extracted.redemptions).toBe("USD 500,000.00")
    expect(extracted.ending_nav).toBe("USD 11,750,000.00")
    expect(extracted.units_outstanding).toBe("1,175,000")
    expect(extracted.nav_per_unit).toBe("USD 10.000000")
    expect(extracted.nav_rollforward_reconciliation).toBe("Reconciled")
    expect(extracted.nav_per_unit_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.nav_rollforward_variance).toBe(0)
    expect(result.structured_data_json.nav_per_unit_variance).toBe(0)
  })

  test("extracts NAV package controls, valuation support, and balance sheet checks", () => {
    const result = NavPackageReader.analyze({
      source: {
        text: "Monthly NAV Report and administrator report for approval controls.",
        tables: [
          {
            name: "NAV Control",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Administrator", "Northfield Administration LLC"],
              ["Reporting Period", "April 2026"],
              ["Report Date", "May 12, 2026"],
              ["Valuation Date", "April 30, 2026"],
              ["NAV Frequency", "Monthly"],
              ["Reporting Currency", "USD"],
              ["Accounting Basis", "U.S. GAAP"],
              ["Valuation Policy", "fair value using administrator pricing committee review"],
              ["Price Source", "administrator marks and third-party pricing"],
              ["Approval Status", "Approved"],
              ["Approved By", "Jane Controller"],
              ["Approval Date", "May 13, 2026"],
            ],
          },
          {
            name: "NAV Rollforward",
            rows: [
              ["Beginning NAV", "USD 10,000,000.00"],
              ["Subscriptions", "USD 2,000,000.00"],
              ["Redemptions", "USD 300,000.00"],
              ["Distributions", "USD 125,000.00"],
              ["Net Capital Activity", "USD 1,575,000.00"],
              ["Net Investment Income", "USD 250,000.00"],
              ["Realized Gain/Loss", "USD 50,000.00"],
              ["Unrealized Gain/Loss", "USD 400,000.00"],
              ["Management Fees", "USD 75,000.00"],
              ["Fund Expenses", "USD 200,000.00"],
              ["Ending NAV", "USD 12,000,000.00"],
            ],
          },
          {
            name: "Balance Sheet Support",
            rows: [
              ["Gross Asset Value", "USD 12,750,000.00"],
              ["Investments at Fair Value", "USD 11,000,000.00"],
              ["Investment Cost", "USD 9,800,000.00"],
              ["Cash Balance", "USD 1,250,000.00"],
              ["Restricted Cash", "USD 50,000.00"],
              ["Receivables", "USD 500,000.00"],
              ["Total Liabilities", "USD 750,000.00"],
              ["Payables and Accruals", "USD 500,000.00"],
              ["Management Fee Accrual", "USD 75,000.00"],
              ["Incentive Allocation", "USD 25,000.00"],
              ["Level 3 Investments", "USD 1,500,000.00"],
              ["Illiquid Investments", "USD 2,250,000.00"],
              ["Unfunded Commitments", "USD 3,000,000.00"],
              ["Units Outstanding", "1,200,000"],
              ["NAV Per Unit", "USD 10.000000"],
              ["Share Class", "Class A"],
              ["Class NAV", "USD 12,000,000.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("NAV Package")
    expect(extracted.report_date).toBe("May 12, 2026")
    expect(extracted.nav_frequency).toBe("Monthly")
    expect(extracted.accounting_basis).toBe("U.S. GAAP")
    expect(extracted.valuation_policy).toBe("fair value using administrator pricing committee review")
    expect(extracted.price_source).toBe("administrator marks and third-party pricing")
    expect(extracted.approval_status).toBe("Approved")
    expect(extracted.approved_by).toBe("Jane Controller")
    expect(extracted.net_capital_activity).toBe("USD 1,575,000.00")
    expect(extracted.gross_asset_value).toBe("USD 12,750,000.00")
    expect(extracted.investments_at_fair_value).toBe("USD 11,000,000.00")
    expect(extracted.investment_cost).toBe("USD 9,800,000.00")
    expect(extracted.restricted_cash).toBe("USD 50,000.00")
    expect(extracted.receivables).toBe("USD 500,000.00")
    expect(extracted.payables_and_accruals).toBe("USD 500,000.00")
    expect(extracted.management_fee_accrual).toBe("USD 75,000.00")
    expect(extracted.incentive_allocation).toBe("USD 25,000.00")
    expect(extracted.level_3_investments).toBe("USD 1,500,000.00")
    expect(extracted.illiquid_investments).toBe("USD 2,250,000.00")
    expect(extracted.unfunded_commitments).toBe("USD 3,000,000.00")
    expect(extracted.share_class).toBe("Class A")
    expect(extracted.class_nav).toBe("USD 12,000,000.00")
    expect(extracted.nav_rollforward_reconciliation).toBe("Reconciled")
    expect(extracted.nav_balance_sheet_reconciliation).toBe("Reconciled")
    expect(extracted.net_capital_activity_reconciliation).toBe("Reconciled")
    expect(extracted.nav_per_unit_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.nav_rollforward_variance).toBe(0)
    expect(result.structured_data_json.nav_balance_sheet_variance).toBe(0)
    expect(result.structured_data_json.net_capital_activity_variance).toBe(0)
  })

  test("extracts useful tax context without retaining tax identification numbers", () => {
    const result = TaxDocumentReader.analyze({
      source: {
        text: "Tax Year: 2025. Form 1065. Tax Residency: Delaware. Entity Classification: partnership. Tax Identification Number: 12-3456789.",
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.tax_year).toBe("2025")
    expect(extracted.tax_form).toBe("Form 1065")
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(extracted.tax_identification_number).toBeUndefined()
    expect(result.source_text_excerpt).toContain("[redacted]")
    expect(result.source_text_excerpt).not.toContain("12-3456789")
  })

  test("extracts Schedule K-1 allocation and capital account facts without retaining identifiers", () => {
    const result = TaxDocumentReader.analyze({
      source: {
        text: "Schedule K-1 (Form 1065). Taxpayer Identification Number: 98-7654321.",
        tables: [
          {
            name: "K-1 Summary",
            rows: [
              ["Tax Year", "2025"],
              ["Tax Form", "Schedule K-1 (Form 1065)"],
              ["Partnership Name", "Meridian Fund LP"],
              ["Partner Name", "Silver Lake LP"],
              ["Tax Jurisdiction", "Delaware"],
              ["Entity Classification", "partnership"],
              ["Capital Account Method", "tax basis capital"],
              ["Beginning Capital Account", "USD 1,000,000.00"],
              ["Capital Contributed During Year", "USD 200,000.00"],
              ["Current Year Net Income (Loss)", "USD 50,000.00"],
              ["Other Increase (Decrease)", "USD 0.00"],
              ["Withdrawals and Distributions", "USD 125,000.00"],
              ["Ending Capital Account", "USD 1,125,000.00"],
              ["Ordinary Business Income (Loss)", "USD 30,000.00"],
              ["Interest Income", "USD 5,000.00"],
              ["Net Long-Term Capital Gain (Loss)", "USD 15,000.00"],
              ["Section 199A Income", "USD 12,000.00"],
              ["Foreign Tax Paid", "USD 1,000.00"],
              ["Withholding Amount", "USD 2,500.00"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Schedule K-1")
    expect(extracted.tax_year).toBe("2025")
    expect(extracted.tax_form).toBe("Schedule K-1 (Form 1065)")
    expect(extracted.partnership_name).toBe("Meridian Fund LP")
    expect(extracted.partner_name).toBe("Silver Lake LP")
    expect(extracted.capital_account_method).toBe("tax basis capital")
    expect(extracted.beginning_capital_account).toBe("USD 1,000,000.00")
    expect(extracted.capital_contributed).toBe("USD 200,000.00")
    expect(extracted.current_year_net_income_loss).toBe("USD 50,000.00")
    expect(extracted.withdrawals_distributions).toBe("USD 125,000.00")
    expect(extracted.ending_capital_account).toBe("USD 1,125,000.00")
    expect(extracted.ordinary_business_income_loss).toBe("USD 30,000.00")
    expect(extracted.net_long_term_capital_gain_loss).toBe("USD 15,000.00")
    expect(extracted.section_199a_income).toBe("USD 12,000.00")
    expect(extracted.withholding_amount).toBe("USD 2,500.00")
    expect(extracted.tax_capital_account_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.capital_account_reconciliation_variance).toBe(0)
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(extracted.tax_identification_number).toBeUndefined()
    expect(result.source_text_excerpt).toContain("[redacted]")
    expect(result.source_text_excerpt).not.toContain("98-7654321")
  })

  test("extracts valuation and financial statement facts from key-value tables with decorated labels", () => {
    const valuationResult = ValuationReader.analyze({
      source: {
        text: "Quarterly valuation workbook",
        tables: [
          {
            name: "NAV",
            rows: [
              ["Valuation Date", "March 31, 2026"],
              ["Valuation Currency", "USD"],
              ["Net Asset Value (NAV)", "USD 45,250,000.00"],
              ["NAV Per Share", "USD 10.052500"],
            ],
          },
        ],
      },
    })
    const statementResult = FinancialStatementReader.analyze({
      source: {
        text: "Financial Statements",
        tables: [
          {
            name: "Statement of Assets and Liabilities",
            rows: [
              ["Reporting Period", "December 31, 2025"],
              ["Reporting Currency", "USD"],
              ["Total Assets", "USD 12,500,000.00"],
              ["Total Liabilities", "USD 750,000.00"],
              ["Net Assets Attributable to Partners", "USD 11,750,000.00"],
            ],
          },
        ],
      },
    })
    const valuationFields = Object.fromEntries(valuationResult.key_points.map((entry) => [entry.point_key, entry.value_text]))
    const statementFields = Object.fromEntries(statementResult.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(valuationResult.status).toBe("completed")
    expect(valuationFields.net_asset_value).toContain("USD 45,250,000.00")
    expect(valuationFields.unit_price).toContain("USD 10.052500")
    expect(statementResult.status).toBe("completed")
    expect(statementFields.reporting_period).toBe("December 31, 2025")
    expect(statementFields.net_assets).toContain("USD 11,750,000.00")
  })

  test("extracts material terms from a service agreement", () => {
    const result = ServiceAgreementReader.analyze({
      source: {
        text: "Service Provider: Northfield Administration LLC. Services Provided: fund administration and NAV preparation. Effective Date: January 1, 2026. Service Fee: USD 85,000 annually. Termination Notice: 90 days written notice.",
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.service_provider).toContain("Northfield Administration LLC")
    expect(extracted.effective_date).toContain("January 1, 2026")
    expect(extracted.service_fee).toContain("USD 85,000")
  })

  test("extracts service agreement oversight, reporting, and control terms with redacted payment details", () => {
    const result = ServiceAgreementReader.analyze({
      source: {
        text: "Fund Administration Agreement. Wire Instructions: Account Number: 123456789. Routing Number: 021000021.",
        tables: [
          {
            name: "Service Terms",
            rows: [
              ["Agreement Type", "Fund Administration Agreement"],
              ["Service Provider", "Northfield Administration LLC"],
              ["Fund Name", "Meridian Fund LP"],
              ["Services Provided", "fund administration, NAV preparation, investor services, and transfer agency"],
              ["Effective Date", "January 1, 2026"],
              ["Initial Term", "3 years"],
              ["Renewal Term", "automatic one-year renewals"],
              ["Service Fee", "USD 85,000 annually"],
              ["Fee Basis", "quarterly in arrears based on net assets"],
              ["Billing Frequency", "quarterly invoices"],
              ["Expense Reimbursement", "reasonable out-of-pocket expenses approved by the Fund"],
              ["Deliverables", "monthly NAV files and quarterly investor statements"],
              ["NAV Frequency", "monthly NAV calculation"],
              ["Financial Reporting", "quarterly financial statements and annual audit support"],
              ["Tax Reporting", "Schedule K-1 support and investor tax reporting"],
              ["Books and Records", "maintained in accordance with U.S. GAAP"],
              ["Service Level", "NAV package delivered within 15 business days"],
              ["SOC Report", "SOC 1 Type 2 report delivered annually"],
              ["Data Security", "encryption, access controls, and incident notification"],
              ["Confidentiality", "provider must protect confidential investor information"],
              ["Indemnification", "mutual indemnity for gross negligence and willful misconduct"],
              ["Liability Cap", "fees paid during the prior 12 months"],
              ["Termination Notice", "90 days written notice"],
              ["Termination For Cause", "immediate termination for material breach"],
              ["Governing Law", "Delaware"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Service Agreement")
    expect(extracted.agreement_type).toBe("Fund Administration Agreement")
    expect(extracted.service_provider).toBe("Northfield Administration LLC")
    expect(extracted.related_fund).toBe("Meridian Fund LP")
    expect(extracted.service_role).toContain("NAV preparation")
    expect(extracted.initial_term).toBe("3 years")
    expect(extracted.renewal_term).toBe("automatic one-year renewals")
    expect(extracted.fee_basis).toContain("net assets")
    expect(extracted.billing_frequency).toBe("quarterly invoices")
    expect(extracted.expense_reimbursement).toContain("out-of-pocket")
    expect(extracted.deliverables).toContain("monthly NAV files")
    expect(extracted.nav_frequency).toBe("monthly NAV calculation")
    expect(extracted.financial_reporting_obligation).toContain("annual audit support")
    expect(extracted.tax_reporting_obligation).toContain("Schedule K-1")
    expect(extracted.books_and_records).toContain("U.S. GAAP")
    expect(extracted.service_level).toContain("15 business days")
    expect(extracted.soc_report).toContain("SOC 1 Type 2")
    expect(extracted.data_security).toContain("encryption")
    expect(extracted.confidentiality).toContain("confidential investor information")
    expect(extracted.indemnification).toContain("gross negligence")
    expect(extracted.liability_cap).toContain("prior 12 months")
    expect(extracted.termination_for_cause).toContain("material breach")
    expect(extracted.governing_law).toBe("Delaware")
    expect(result.source_text_excerpt).not.toContain("123456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
  })

  test("extracts investor-specific reporting and economics from a side letter", () => {
    const result = SideLetterReader.analyze({
      source: {
        text: [
          "Investor Side Letter.",
          "Investor Name: Silver Lake LP.",
          "Effective Date: April 1, 2026.",
          "Related Fund: Meridian Fund LP.",
          "Management Fee: 1.25% of committed capital for this investor.",
          "Carried Interest: 10% for co-investment interests.",
          "The Investor receives most favored nation rights.",
          "Enhanced Reporting: quarterly portfolio exposure schedules.",
          "Confidentiality obligations apply to confidential information.",
        ].join(" "),
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Side Letter")
    expect(extracted.investor_name).toContain("Silver Lake LP")
    expect(extracted.management_fee).toContain("1.25%")
    expect(extracted.carried_interest).toContain("10%")
    expect(extracted.mfn_rights).toMatch(/most favored nation/i)
    expect(extracted.reporting_obligation).toContain("quarterly portfolio exposure schedules")
  })

  test("extracts side-letter waivers, rights, reporting, and compliance controls without identifiers", () => {
    const result = SideLetterReader.analyze({
      source: {
        text: [
          "Investor Letter Agreement.",
          "Tax ID: 12-3456789.",
          "Wire Instructions: ABA 021000021 Account Number 123456789.",
        ].join(" "),
        tables: [
          {
            name: "Side Letter Terms",
            rows: [
              ["Investor Legal Name", "Evergreen Pension Trust"],
              ["Investor Type", "ERISA plan"],
              ["Investor Domicile", "Ontario"],
              ["Effective Date", "2026-05-15"],
              ["Related Fund", "Meridian Fund LP"],
              ["Interest Class", "Class B"],
              ["Commitment Amount", "USD 20,000,000"],
              ["Management Fee Waiver", "50% waiver for the first year"],
              ["Expense Cap", "0.15% of aggregate commitments"],
              ["MFN Election Period", "within 30 days after notice"],
              ["Tax Reporting", "deliver Schedule K-1 packages within 75 days"],
              ["Transparency Reporting", "quarterly look-through portfolio holdings"],
              ["LPAC Seat", "observer right without vote"],
              ["Consent Right", "investor consent required for affiliate transactions"],
              ["Excuse Right", "may be excused from prohibited investments"],
              ["Transfer Rights", "permitted to affiliate with GP consent"],
              ["Withdrawal Right", "regulatory withdrawal right on 30 days notice"],
              ["Co-Investment Right", "priority co-investment allocations"],
              ["AML/KYC Status", "Complete"],
              ["FATCA/CRS", "annual certifications required"],
              ["Publicity Restriction", "shall not use investor name"],
              ["Governing Law", "Delaware"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Side Letter")
    expect(extracted.investor_name).toBe("Evergreen Pension Trust")
    expect(extracted.investor_type).toBe("ERISA plan")
    expect(extracted.related_fund).toBe("Meridian Fund LP")
    expect(extracted.commitment_amount).toBe("USD 20,000,000")
    expect(extracted.management_fee_waiver).toContain("50% waiver")
    expect(extracted.expense_cap).toContain("0.15%")
    expect(extracted.mfn_election_period).toContain("30 days")
    expect(extracted.tax_reporting_obligation).toContain("Schedule K-1")
    expect(extracted.transparency_reporting).toContain("portfolio holdings")
    expect(extracted.advisory_committee_right).toContain("observer right")
    expect(extracted.consent_right).toContain("affiliate transactions")
    expect(extracted.excuse_right).toContain("prohibited investments")
    expect(extracted.transfer_rights).toContain("GP consent")
    expect(extracted.withdrawal_or_liquidity_right).toContain("regulatory withdrawal")
    expect(extracted.co_investment_right).toContain("priority co-investment")
    expect(extracted.aml_kyc_status).toBe("Complete")
    expect(extracted.fatca_crs_obligation).toContain("annual certifications")
    expect(extracted.publicity_restriction).toContain("investor name")
    expect(extracted.governing_law).toBe("Delaware")
    expect(extracted.economics_terms_detected).toContain("management_fee_waiver")
    expect(extracted.reporting_terms_detected).toContain("tax_reporting_obligation")
    expect(extracted.investor_rights_detected).toContain("transfer_rights")
    expect(extracted.compliance_terms_detected).toContain("fatca_crs_obligation")
    expect(result.structured_data_json.sensitive_identifiers_excluded).toBe(true)
    expect(result.source_text_excerpt).not.toContain("12-3456789")
    expect(result.source_text_excerpt).not.toContain("021000021")
    expect(result.source_text_excerpt).not.toContain("123456789")
  })

  test("extracts opinion and material audit warnings through a dedicated audit report reader", () => {
    const result = AuditReportReader.analyze({
      source: {
        text: [
          "Independent Auditor's Report.",
          "We have audited the financial statements of Meridian Fund LP for the year ended December 31, 2025.",
          "In our opinion, the financial statements present fairly, in all material respects.",
          "Independent Auditor: Meridian Assurance LLP.",
          "Report Date: March 20, 2026.",
          "We conducted our audit in accordance with International Standards on Auditing.",
          "Key Audit Matters.",
          "A material uncertainty exists that may cast substantial doubt on the Fund's ability to continue as a going concern.",
        ].join(" "),
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.audit_opinion).toBe("Unmodified opinion")
    expect(extracted.audited_period).toContain("December 31, 2025")
    expect(extracted.independent_auditor).toContain("Meridian Assurance LLP")
    expect(extracted.auditing_standard).toBe("International Standards on Auditing")
    expect(extracted.going_concern_warning).toBe("Material uncertainty identified")
    expect(result.structured_data_json.going_concern_warning_detected).toBe(true)
  })

  test("extracts audit report metadata from key-value review tables", () => {
    const result = AuditReportReader.analyze({
      source: {
        text: "Independent Auditor's Report",
        tables: [
          {
            name: "Audit Review",
            rows: [
              ["Opinion Type", "Unqualified"],
              ["Fiscal Year End", "December 31, 2025"],
              ["Audit Firm", "Meridian Assurance LLP"],
              ["Date of Report", "March 20, 2026"],
              ["Audit Basis", "International Standards on Auditing"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.audit_opinion).toBe("Unmodified opinion")
    expect(extracted.audited_period).toBe("December 31, 2025")
    expect(extracted.independent_auditor).toBe("Meridian Assurance LLP")
    expect(extracted.auditing_standard).toBe("International Standards on Auditing")
  })

  test("extracts audit scope, accounting framework, and review warning flags", () => {
    const result = AuditReportReader.analyze({
      source: {
        text: [
          "Independent Auditor's Report.",
          "Emphasis of Matter: valuation uncertainty related to Level 3 investments.",
          "Key Audit Matters include valuation of private investments.",
        ].join(" "),
        tables: [
          {
            name: "Audit Review",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Report Addressee", "Limited Partners"],
              ["Opinion Type", "Qualified"],
              ["Fiscal Year End", "December 31, 2025"],
              ["Audit Firm", "Meridian Assurance LLP"],
              ["Date of Report", "March 20, 2026"],
              ["Audit Basis", "International Standards on Auditing"],
              ["Accounting Framework", "U.S. GAAP"],
              ["Statements Audited", "statement of assets and liabilities, statement of operations, and statement of changes in partners' capital"],
              ["Management Responsibility", "preparation and fair presentation of the financial statements"],
              ["Auditor Responsibility", "express an opinion on the financial statements"],
              ["Internal Control Scope", "we do not express an opinion on internal control"],
              ["Material Weakness", "segregation of duties over cash disbursements"],
              ["Subsequent Events", "evaluated through March 20, 2026"],
              ["Restatement Disclosure", "prior period adjustment disclosed in Note 8"],
              ["Related Party Disclosure", "management fee transactions with the investment adviser"],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Audit Report")
    expect(extracted.audit_opinion).toBe("Qualified opinion")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.report_addressee).toBe("Limited Partners")
    expect(extracted.accounting_framework).toBe("U.S. GAAP")
    expect(extracted.statements_audited).toContain("statement of operations")
    expect(extracted.management_responsibility).toContain("fair presentation")
    expect(extracted.auditor_responsibility).toContain("express an opinion")
    expect(extracted.internal_control_scope).toContain("internal control")
    expect(extracted.material_weakness).toContain("cash disbursements")
    expect(extracted.emphasis_of_matter).toContain("valuation uncertainty")
    expect(extracted.emphasis_of_matter_section).toBe("Section present")
    expect(extracted.key_audit_matters_section).toBe("Section present")
    expect(extracted.subsequent_events).toContain("March 20, 2026")
    expect(extracted.restatement_disclosure).toContain("prior period adjustment")
    expect(extracted.related_party_disclosure).toContain("management fee")
    expect(result.structured_data_json.non_clean_opinion_detected).toBe(true)
    expect(result.structured_data_json.internal_control_warning_detected).toBe(true)
    expect(result.structured_data_json.emphasis_of_matter_detected).toBe(true)
  })

  test("extracts audit adjustment schedules and validates debit-credit balance", () => {
    const result = AuditAdjustmentScheduleReader.analyze({
      source: {
        text: "Audit Adjustment Schedule",
        tables: [
          {
            name: "Schedule Summary",
            rows: [
              ["Fund Name", "Meridian Fund LP"],
              ["Audit Period", "Year ended December 31, 2025"],
              ["Schedule Date", "March 20, 2026"],
              ["Auditor", "Meridian Assurance LLP"],
            ],
          },
          {
            name: "Adjustments",
            rows: [
              ["Adjustment ID", "Adjustment Type", "Account", "Description", "Debit", "Credit", "Statement Area", "Status", "Posted Date"],
              ["AJE-1", "Reclassification", "Management fee expense", "Reclass accrued management fee", "USD 25,000.00", "", "Expenses", "Posted", "March 20, 2026"],
              ["AJE-1", "Reclassification", "Accrued expenses", "Reclass accrued management fee", "", "USD 25,000.00", "Liabilities", "Posted", "March 20, 2026"],
              ["PAJE-2", "Proposed", "Audit fee expense", "Record audit fee accrual", "USD 15,000.00", "", "Expenses", "Passed", ""],
              ["PAJE-2", "Proposed", "Accrued expenses", "Record audit fee accrual", "", "USD 15,000.00", "Liabilities", "Passed", ""],
            ],
          },
        ],
      },
    })
    const extracted = Object.fromEntries(result.key_points.map((entry) => [entry.point_key, entry.value_text]))

    expect(result.status).toBe("completed")
    expect(extracted.document_identity).toBe("Audit Adjustment Schedule")
    expect(extracted.fund_name).toBe("Meridian Fund LP")
    expect(extracted.audit_period).toBe("Year ended December 31, 2025")
    expect(extracted.auditor).toBe("Meridian Assurance LLP")
    expect(extracted.audit_adjustment_count).toBe("2")
    expect(extracted.affected_accounts).toContain("Management fee expense")
    expect(extracted.affected_statement_areas).toContain("Expenses")
    expect(extracted.adjustment_status_counts).toContain("posted: 2")
    expect(extracted.adjustment_status_counts).toContain("unposted: 2")
    expect(extracted.posted_adjustments).toBe("2")
    expect(extracted.unposted_adjustments).toBe("2")
    expect(extracted.total_adjustment_debits).toBe("40,000.00")
    expect(extracted.total_adjustment_credits).toBe("40,000.00")
    expect(extracted.adjustment_balance_reconciliation).toBe("Reconciled")
    expect(result.structured_data_json.adjustments).toHaveLength(4)
    expect(result.structured_data_json.adjustment_ids).toEqual(["AJE-1", "PAJE-2"])
    expect(result.structured_data_json.totals.debit_credit_variance).toBe(0)
  })

  test("assigns specialized automatic readers without making TB and GL analysis inputs", () => {
    expect(RepositoryReaderRegistryService.resolve({ category: "ppm" }).key).toBe("ppm")
    expect(RepositoryReaderRegistryService.resolve({ category: "subscription_agreement" }).key).toBe("subscription_agreement")
    expect(RepositoryReaderRegistryService.resolve({ category: "financial_statement" }).key).toBe("financial_statement")
    expect(RepositoryReaderRegistryService.resolve({ category: "audit_report" }).key).toBe("audit_report")
    expect(RepositoryReaderRegistryService.resolve({ category: "bank_statement" }).key).toBe("bank_statement")
    expect(RepositoryReaderRegistryService.resolve({ category: "valuation" }).key).toBe("valuation")
    expect(RepositoryReaderRegistryService.resolve({ category: "tax_document" }).key).toBe("tax_document")
    expect(RepositoryReaderRegistryService.resolve({
      kind: "document",
      category: "other_document",
      source: { text: "Schedule K-1 (Form 1065). Tax Year: 2025. Partner Name: Silver Lake LP." },
    }).key).toBe("tax_document")
    expect(RepositoryReaderRegistryService.resolve({ category: "service_agreement" }).key).toBe("service_agreement")
    expect(RepositoryReaderRegistryService.resolve({ category: "investor_register" }).key).toBe("shareholder_register")
    expect(RepositoryReaderRegistryService.resolve({ category: "holdings_register" }).key).toBe("holdings_register")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "accrual_schedule" }).key).toBe("accrual_schedule")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "audit_adjustment_schedule" }).key).toBe("audit_adjustment_schedule")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "bank_reconciliation" }).key).toBe("bank_reconciliation")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "portfolio_transaction" }).key).toBe("portfolio_transaction")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "lpa_amendment" }).key).toBe("lpa_amendment")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "governance_minutes" }).key).toBe("governance_minutes")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "capital_call_notice" }).key).toBe("capital_call_notice")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "commitment_schedule" }).key).toBe("commitment_schedule")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "credit_facility" }).key).toBe("credit_facility")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "custodian_statement" }).key).toBe("custodian_statement")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "distribution_notice" }).key).toBe("distribution_notice")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "redemption_notice" }).key).toBe("redemption_notice")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "transfer_notice" }).key).toBe("transfer_notice")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "investor_activity_statement" }).key).toBe("investor_activity_statement")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "management_fee_statement" }).key).toBe("management_fee_statement")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_dataset", readerKey: "nav_package" }).key).toBe("nav_package")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "expense_invoice" }).key).toBe("expense_invoice")
    expect(RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "waterfall_statement" }).key).toBe("waterfall_statement")
    expect(RepositoryReaderRegistryService.supportsAutomaticAnalysis({ kind: "dataset", category: "bank_statement" })).toBe(true)
    expect(RepositoryReaderRegistryService.supportsAutomaticAnalysis({ kind: "dataset", category: "valuation" })).toBe(true)
    expect(RepositoryReaderRegistryService.supportsAutomaticAnalysis({ kind: "dataset", category: "other_dataset" })).toBe(true)
    expect(RepositoryReaderRegistryService.supportsAutomaticAnalysis({ kind: "dataset", category: "trial_balance" })).toBe(false)
    expect(RepositoryReaderRegistryService.supportsAutomaticAnalysis({ kind: "dataset", category: "general_ledger" })).toBe(false)
  })

  test("exposes a reader catalog and rejects unknown manual reader overrides", () => {
    const readers = RepositoryReaderRegistryService.availableReaders()

    expect(readers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "accrual_schedule", label: "Accrual Schedule", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "audit_adjustment_schedule", label: "Audit Adjustment Schedule", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "bank_reconciliation", label: "Bank Reconciliation", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "lpa", label: "Limited Partnership Agreement", categories: expect.arrayContaining(["lpa"]) }),
        expect.objectContaining({ key: "lpa_amendment", label: "LPA Amendment", kinds: ["document"] }),
        expect.objectContaining({ key: "capital_call_notice", label: "Capital Call Notice", kinds: ["document"] }),
        expect.objectContaining({ key: "commitment_schedule", label: "Commitment Schedule", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "credit_facility", label: "Credit Facility / Debt", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "custodian_statement", label: "Custodian Statement", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "distribution_notice", label: "Distribution Notice", kinds: ["document"] }),
        expect.objectContaining({ key: "expense_invoice", label: "Expense Invoice", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "governance_minutes", label: "Governance Minutes / Consent", kinds: ["document"] }),
        expect.objectContaining({ key: "investor_activity_statement", label: "Investor Activity Statement", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "management_fee_statement", label: "Management Fee Statement", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "nav_package", label: "NAV Package / Administrator Report", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "portfolio_transaction", label: "Portfolio Transaction Notice", kinds: ["document", "dataset"] }),
        expect.objectContaining({ key: "redemption_notice", label: "Redemption Notice", kinds: ["document"] }),
        expect.objectContaining({ key: "transfer_notice", label: "Investor Transfer Notice", kinds: ["document"] }),
        expect.objectContaining({ key: "waterfall_statement", label: "Waterfall / Carry Statement", kinds: ["document", "dataset"] }),
      ]),
    )
    expect(() =>
      RepositoryReaderRegistryService.resolve({ category: "other_document", readerKey: "invented_reader" }),
    ).toThrow("Unsupported repository reader")
    expect(RepositoryReaderRegistryService.readerInfo("lpa")).toEqual(
      expect.objectContaining({ key: "lpa", label: "Limited Partnership Agreement", version: "lpa.v2" }),
    )
    expect(() =>
      RepositoryReaderRegistryService.resolve({ kind: "dataset", category: "other_dataset", readerKey: "lpa" }),
    ).toThrow("does not support this item type")
  })

  test("infers specialist readers for unclassified readable repository sources", () => {
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Limited Partnership Agreement. Management Fee: 2.00% of committed capital." },
      }).key,
    ).toBe("lpa")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "First Amendment to Limited Partnership Agreement. Section 5.1 is amended. Management Fee: 1.75% of net asset value." },
      }).key,
    ).toBe("lpa_amendment")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Unanimous Written Consent of the Board of Directors. Resolved that the March 31, 2026 NAV and financial statements are approved." },
      }).key,
    ).toBe("governance_minutes")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Independent Auditor's Report. We have audited the financial statements. In our opinion, they present fairly." },
      }).key,
    ).toBe("audit_report")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: { text: "Audit Adjustment Schedule. Adjustment ID, Account, Debit, Credit, Statement Area and Posting Status." },
      }).key,
    ).toBe("audit_adjustment_schedule")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "",
          tables: [
            {
              name: "Register",
              rows: [
                ["Investor Name", "Share Class", "Ownership %", "Commitment Amount"],
                ["Alpha LP", "Class A", "60%", "USD 1,200,000"],
              ],
            },
          ],
        },
      }).key,
    ).toBe("shareholder_register")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: { text: "Portfolio Transaction Notice. Investment Name: North Harbor Infrastructure. Sale Proceeds: USD 625,000. Settlement Date: March 20, 2026. Realized Gain: USD 125,000." },
      }).key,
    ).toBe("portfolio_transaction")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Investor Activity Statement",
          tables: [
            {
              name: "Activity",
              rows: [
                ["Investor Name", "Share Class", "Activity Type", "Subscriptions", "Redemptions", "NAV Per Unit"],
                ["Alpha LP", "Class A", "Subscription", "USD 200,000", "", "10.0500"],
              ],
            },
          ],
        },
      }).key,
    ).toBe("investor_activity_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Statement Period: January 2026. Opening Balance: USD 10. Closing Balance: USD 15.",
        },
      }).key,
    ).toBe("bank_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Bank Reconciliation Statement. Adjusted Bank Balance: USD 1,375,000. Adjusted Book Balance: USD 1,375,000. Outstanding Deposits: USD 50,000.",
        },
      }).key,
    ).toBe("bank_reconciliation")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Capital Account Statement. Beginning Capital, Contributions, Distributions, Ending Capital and Unfunded Commitment.",
        },
      }).key,
    ).toBe("capital_account_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Capital Commitment Schedule. Called Capital and Unfunded Commitment by investor.",
        },
      }).key,
    ).toBe("commitment_schedule")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Capital Call Notice. Funding Due Date: March 31, 2026. Amount Due: USD 250,000.00." },
      }).key,
    ).toBe("capital_call_notice")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Distribution Notice. Payment Date: April 15, 2026. Amount Distributed: USD 125,000.00." },
      }).key,
    ).toBe("distribution_notice")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Redemption Notice. Redemption Effective Date: March 31, 2026. Net Redemption Amount: USD 95,000.00. Units Redeemed: 10,000." },
      }).key,
    ).toBe("redemption_notice")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Investor Transfer Notice. Transferor: Beta LP. Transferee: Gamma LP. Transfer Effective Date: April 1, 2026. Units Transferred: 25,000." },
      }).key,
    ).toBe("transfer_notice")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Management Fee Calculation. Fee Basis Amount: USD 100,000,000. Net Management Fee: USD 412,500." },
      }).key,
    ).toBe("management_fee_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: { text: "Quarterly NAV Package. Beginning NAV: USD 10,000,000. Ending NAV: USD 11,750,000. Units Outstanding: 1,175,000." },
      }).key,
    ).toBe("nav_package")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: { text: "Expense Accrual Schedule. Service Provider, Expense Category, Accrued Amount, Due Date." },
      }).key,
    ).toBe("accrual_schedule")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Fund Expense Invoice. Invoice Number: INV-2026-004. Vendor: Northfield Administration LLC. Amount Due: USD 60,000." },
      }).key,
    ).toBe("expense_invoice")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Credit Facility Agreement. Facility Amount: USD 50,000,000. Maturity Date: June 30, 2027." },
      }).key,
    ).toBe("credit_facility")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: {
          text: "Custodian Statement. Custodian: North Bank Custody. Total Account Value: USD 2,000,000. Securities Market Value: USD 1,760,000.",
        },
      }).key,
    ).toBe("custodian_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Distribution Waterfall Statement. Return of Capital: USD 700,000. Preferred Return: USD 100,000. Carried Interest: USD 50,000." },
      }).key,
    ).toBe("waterfall_statement")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Investor Side Letter. Most Favored Nation rights and reduced management fee apply." },
      }).key,
    ).toBe("side_letter")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "General correspondence with no recognizable reporting terms." },
      }).key,
    ).toBe("generic")
  })

  test("uses scored and kind-aware inference to avoid ambiguous reader assignments", () => {
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Please include invoice number INV-2026-004 in any correspondence. No invoice is attached." },
      }).key,
    ).toBe("generic")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: {
          text: "Service Provider: Northfield Administration LLC. Vendor: Northfield Administration LLC. Invoice Number: INV-2026-004. Amount Due: USD 60,000.",
        },
      }).key,
    ).toBe("expense_invoice")
    expect(
      RepositoryReaderRegistryService.resolveWithMetadata({
        kind: "document",
        category: "other_document",
        source: {
          text: "Service Provider: Northfield Administration LLC. Vendor: Northfield Administration LLC. Invoice Number: INV-2026-004. Amount Due: USD 60,000.",
        },
      }),
    ).toEqual(expect.objectContaining({ reader_key: "expense_invoice", selection_type: "inferred" }))
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "dataset",
        category: "other_dataset",
        source: { text: "Capital Call Notice. Funding Due Date: March 31, 2026. Amount Due: USD 250,000.00." },
      }).key,
    ).toBe("generic")
    expect(
      RepositoryReaderRegistryService.resolve({
        kind: "document",
        category: "other_document",
        source: { text: "Investment Name | Cost | Fair Value | Currency" },
      }).key,
    ).toBe("generic")
  })
})
