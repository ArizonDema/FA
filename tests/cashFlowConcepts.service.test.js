const CashFlowConcepts = require("../src/services/cashFlowConcepts.service")

describe("cashFlowConcepts.service", () => {
  test("exposes the direct concepts needed for adversarial cash-flow mapping", () => {
    const keys = CashFlowConcepts.getAllowedDirectConcepts().map((concept) => concept.key)

    expect(keys).toEqual(
      expect.arrayContaining([
        "customer_receipts",
        "supplier_payments",
        "payroll",
        "rent_facilities",
        "sales_marketing",
        "general_admin",
        "income_taxes",
        "capital_expenditures",
        "capitalized_software",
        "asset_sale_proceeds",
        "debt_drawdown",
        "debt_repayment",
        "interest_paid",
        "equity_injection",
        "dividends_distributions",
        "other_operating_outflows",
        "restricted_cash_investment",
        "restricted_cash_release",
      ]),
    )
  })

  test("maps common indirect labels to their direct runtime concepts where the mapping is specific", () => {
    expect(CashFlowConcepts.normalizeDirectConceptKey("capital_contributions")).toBe("equity_injection")
    expect(CashFlowConcepts.normalizeDirectConceptKey("debt_issued")).toBe("debt_drawdown")
    expect(CashFlowConcepts.normalizeDirectConceptKey("debt_repaid")).toBe("debt_repayment")
    expect(CashFlowConcepts.normalizeDirectConceptKey("dividends_paid")).toBe("dividends_distributions")
  })

  test("does not collapse broad operating cash flow into one arbitrary direct bucket", () => {
    expect(CashFlowConcepts.normalizeDirectConceptKey("operating_cash_flow")).toBe("operating_cash_flow")
    expect(CashFlowConcepts.getDirectConcept("operating_cash_flow")).toBeNull()
  })

  test("detects novel account/template wording through canonical concepts", () => {
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Founder funding received from members", "inflow")).toEqual(
      expect.objectContaining({ key: "equity_injection" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Growth campaign demand generation spend", "outflow")).toEqual(
      expect.objectContaining({ key: "sales_marketing" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Finance charges paid to lender", "outflow")).toEqual(
      expect.objectContaining({ key: "interest_paid" }),
    )
  })

  test("classifies unfamiliar template row wording from the liquidity flight-plan fixture", () => {
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Marketplace partner settlements")).toEqual(
      expect.objectContaining({ key: "supplier_payments", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("People runway spend")).toEqual(
      expect.objectContaining({ key: "payroll", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Audience acquisition cash")).toEqual(
      expect.objectContaining({ key: "sales_marketing", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Borrowing cost cash")).toEqual(
      expect.objectContaining({ key: "interest_paid", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Workshop kit purchases")).toEqual(
      expect.objectContaining({ key: "capital_expenditures", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Equipment resale receipts")).toEqual(
      expect.objectContaining({ key: "asset_sale_proceeds", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Sponsor oxygen")).toEqual(
      expect.objectContaining({ key: "equity_injection", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Owner cash sweeps")).toEqual(
      expect.objectContaining({ key: "dividends_distributions", direction: "outflow" }),
    )
  })

  test("classifies independent agent challenge wording without relying on exact app labels", () => {
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Receipts: settlement-lagged trade takings")).toEqual(
      expect.objectContaining({ key: "customer_receipts", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Receipts: insurance recovery cash")).toEqual(
      expect.objectContaining({ key: "other_operating_inflows", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Payments: rostered crew disbursements")).toEqual(
      expect.objectContaining({ key: "payroll", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Payments: premises and yard occupancy")).toEqual(
      expect.objectContaining({ key: "rent_facilities", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Borrowing draws booked at treasury")).toEqual(
      expect.objectContaining({ key: "debt_drawdown", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Lender principal retirements")).toEqual(
      expect.objectContaining({ key: "debt_repayment", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Member capital subscriptions banked")).toEqual(
      expect.objectContaining({ key: "equity_injection", direction: "inflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Partner preference redemptions paid")).toEqual(
      expect.objectContaining({ key: "dividends_distributions", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Payments: tax authority sweeps")).toEqual(
      expect.objectContaining({ key: "income_taxes", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Payments: claims, refunds, and make-good credits", "outflow")).toEqual(
      expect.objectContaining({ key: "other_operating_outflows", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Investment in pledged term deposits", "outflow")).toEqual(
      expect.objectContaining({ key: "restricted_cash_investment", direction: "outflow" }),
    )
    expect(CashFlowConcepts.bestDirectCashFlowConcept("Release of pledged term deposits", "inflow")).toEqual(
      expect.objectContaining({ key: "restricted_cash_release", direction: "inflow" }),
    )
  })
})
