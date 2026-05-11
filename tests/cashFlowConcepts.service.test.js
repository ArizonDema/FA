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
})
