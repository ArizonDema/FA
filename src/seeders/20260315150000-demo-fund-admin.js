module.exports = {
  async up(queryInterface, Sequelize) {
    const fundId = "660e8400-e29b-41d4-a716-446655440001"
    const shareClassA = "880e8400-e29b-41d4-a716-446655440001"
    const shareClassB = "880e8400-e29b-41d4-a716-446655440002"
    const investorA = "990e8400-e29b-41d4-a716-446655440001"
    const investorB = "990e8400-e29b-41d4-a716-446655440002"
    const investorC = "990e8400-e29b-41d4-a716-446655440003"
    const commitmentA = "aa0e8400-e29b-41d4-a716-446655440001"
    const commitmentB = "aa0e8400-e29b-41d4-a716-446655440002"
    const commitmentC = "aa0e8400-e29b-41d4-a716-446655440003"
    const capitalCallId = "bb0e8400-e29b-41d4-a716-446655440001"
    const distributionId = "cc0e8400-e29b-41d4-a716-446655440001"

    await queryInterface.bulkInsert("fund_profiles", [
      {
        portfolio_id: fundId,
        legal_name: "CSS Growth Fund I, L.P.",
        domicile: "Delaware, US",
        regulator: "SEC",
        fiscal_year_end: "31 Dec",
        reporting_currency: "USD",
        administrator: "CSS Fund Services",
        auditor: "FinAudit LLP",
        investment_manager: "CSS Investments",
        strategy_summary: "Growth equity with diversification across technology and healthcare.",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("fund_governance", [
      {
        portfolio_id: fundId,
        board_members: "Alice Brown; Mark Johnson",
        general_partner: "CSS GP LLC",
        investment_manager: "CSS Investments",
        administrator: "CSS Fund Services",
        auditor: "FinAudit LLP",
        depositary: "Global Custody Bank",
        legal_advisor: "LegalWorks",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("fund_accounting_policies", [
      {
        portfolio_id: fundId,
        revenue_recognition_policy: "Recognize investment income when earned.",
        valuation_policy: "Quarterly fair value pricing with observable inputs.",
        foreign_currency_policy: "Translate FX at period-end spot rates.",
        financial_instrument_policy: "Classify at fair value through profit or loss.",
        impairment_policy: "Review for impairment annually or when indicators arise.",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("fund_tax_profiles", [
      {
        portfolio_id: fundId,
        tax_residency: "United States",
        tax_identification_number: "12-3456789",
        vat_number: "",
        tax_advisor: "TaxPro Partners",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("fund_bank_accounts", [
      {
        id: "770e8400-e29b-41d4-a716-446655440010",
        portfolio_id: fundId,
        bank_name: "Global Custody Bank",
        account_number: "US123456789",
        iban: "US00GCBK000000123456",
        currency: "USD",
        swift: "GCBKUS33",
        notes: "Primary operating account",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("share_classes", [
      {
        id: shareClassA,
        portfolio_id: fundId,
        class_name: "Class A",
        currency: "USD",
        management_fee: 2.0,
        performance_fee: 20.0,
        hurdle_rate: 5.0,
        catch_up: 100.0,
        min_commitment: 100000.0,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: shareClassB,
        portfolio_id: fundId,
        class_name: "Class B",
        currency: "USD",
        management_fee: 1.5,
        performance_fee: 15.0,
        hurdle_rate: 4.0,
        catch_up: 100.0,
        min_commitment: 50000.0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("investor_profiles", [
      {
        id: investorA,
        investor_type: "corporate",
        legal_name: "Alpha Capital",
        contact_email: "alpha@investors.com",
        contact_phone: "+1 212 555 0101",
        country: "United States",
        tax_id: "ALPHA-123",
        address: "100 Finance St, New York, NY",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: investorB,
        investor_type: "corporate",
        legal_name: "Beta Holdings",
        contact_email: "beta@investors.com",
        contact_phone: "+1 415 555 0202",
        country: "United States",
        tax_id: "BETA-456",
        address: "200 Market St, San Francisco, CA",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: investorC,
        investor_type: "individual",
        legal_name: "Jane Smith Family",
        contact_email: "jane@investors.com",
        contact_phone: "+1 312 555 0303",
        country: "United States",
        tax_id: "JANE-789",
        address: "300 Lakeview Ave, Chicago, IL",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("commitments", [
      {
        id: commitmentA,
        investor_profile_id: investorA,
        share_class_id: shareClassA,
        commitment_amount: 500000,
        commitment_date: new Date(),
        status: "active",
        notes: "Anchor investor",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: commitmentB,
        investor_profile_id: investorB,
        share_class_id: shareClassA,
        commitment_amount: 250000,
        commitment_date: new Date(),
        status: "active",
        notes: "",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: commitmentC,
        investor_profile_id: investorC,
        share_class_id: shareClassB,
        commitment_amount: 100000,
        commitment_date: new Date(),
        status: "active",
        notes: "",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("capital_calls", [
      {
        id: capitalCallId,
        portfolio_id: fundId,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
        call_date: new Date(),
        due_date: new Date(),
        memo: "Initial capital call",
        status: "issued",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("capital_call_lines", [
      {
        id: "bb0e8400-e29b-41d4-a716-446655440010",
        capital_call_id: capitalCallId,
        commitment_id: commitmentA,
        called_amount: 200000,
        paid_amount: 200000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "bb0e8400-e29b-41d4-a716-446655440011",
        capital_call_id: capitalCallId,
        commitment_id: commitmentB,
        called_amount: 100000,
        paid_amount: 100000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "bb0e8400-e29b-41d4-a716-446655440012",
        capital_call_id: capitalCallId,
        commitment_id: commitmentC,
        called_amount: 50000,
        paid_amount: 50000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("distributions", [
      {
        id: distributionId,
        portfolio_id: fundId,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
        distribution_date: new Date(),
        distribution_type: "profit",
        status: "paid",
        memo: "Year-end distribution",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("distribution_lines", [
      {
        id: "cc0e8400-e29b-41d4-a716-446655440010",
        distribution_id: distributionId,
        commitment_id: commitmentA,
        gross_amount: 30000,
        withholding: 0,
        net_amount: 30000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "cc0e8400-e29b-41d4-a716-446655440011",
        distribution_id: distributionId,
        commitment_id: commitmentB,
        gross_amount: 15000,
        withholding: 0,
        net_amount: 15000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "cc0e8400-e29b-41d4-a716-446655440012",
        distribution_id: distributionId,
        commitment_id: commitmentC,
        gross_amount: 5000,
        withholding: 0,
        net_amount: 5000,
        paid_date: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("gl_accounts", [
      {
        id: "dd0e8400-e29b-41d4-a716-446655440001",
        code: "1000",
        name: "Cash",
        type: "asset",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "dd0e8400-e29b-41d4-a716-446655440002",
        code: "2000",
        name: "Accrued Expenses",
        type: "liability",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "dd0e8400-e29b-41d4-a716-446655440003",
        code: "3000",
        name: "Contributed Capital",
        type: "equity",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "dd0e8400-e29b-41d4-a716-446655440004",
        code: "4000",
        name: "Investment Income",
        type: "income",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "dd0e8400-e29b-41d4-a716-446655440005",
        code: "5000",
        name: "Operating Expenses",
        type: "expense",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("journal_entries", [
      {
        id: "ee0e8400-e29b-41d4-a716-446655440001",
        portfolio_id: fundId,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
        entry_date: new Date(),
        memo: "Capital call receipts",
        status: "posted",
        posted_by: "550e8400-e29b-41d4-a716-446655440001",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "ee0e8400-e29b-41d4-a716-446655440002",
        portfolio_id: fundId,
        portfolio_round_id: "770e8400-e29b-41d4-a716-446655440001",
        entry_date: new Date(),
        memo: "Distribution payout",
        status: "posted",
        posted_by: "550e8400-e29b-41d4-a716-446655440001",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("journal_lines", [
      {
        id: "ff0e8400-e29b-41d4-a716-446655440001",
        journal_entry_id: "ee0e8400-e29b-41d4-a716-446655440001",
        gl_account_id: "dd0e8400-e29b-41d4-a716-446655440001",
        debit: 350000,
        credit: 0,
        currency: "USD",
        fx_rate: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "ff0e8400-e29b-41d4-a716-446655440002",
        journal_entry_id: "ee0e8400-e29b-41d4-a716-446655440001",
        gl_account_id: "dd0e8400-e29b-41d4-a716-446655440003",
        debit: 0,
        credit: 350000,
        currency: "USD",
        fx_rate: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "ff0e8400-e29b-41d4-a716-446655440003",
        journal_entry_id: "ee0e8400-e29b-41d4-a716-446655440002",
        gl_account_id: "dd0e8400-e29b-41d4-a716-446655440003",
        debit: 50000,
        credit: 0,
        currency: "USD",
        fx_rate: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "ff0e8400-e29b-41d4-a716-446655440004",
        journal_entry_id: "ee0e8400-e29b-41d4-a716-446655440002",
        gl_account_id: "dd0e8400-e29b-41d4-a716-446655440001",
        debit: 0,
        credit: 50000,
        currency: "USD",
        fx_rate: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])

    await queryInterface.bulkInsert("report_templates", [
      {
        id: "120e8400-e29b-41d4-a716-446655440001",
        type: "cash_flow",
        name: "Standard Cash Flow Template",
        template_body: "<h1>Cash Flow Report</h1><pre>{{json this}}</pre>",
        version: "v1",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "120e8400-e29b-41d4-a716-446655440002",
        type: "shareholder_register",
        name: "Shareholder Register Template",
        template_body: "<h1>Shareholder Register</h1><pre>{{json this}}</pre>",
        version: "v1",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "120e8400-e29b-41d4-a716-446655440003",
        type: "financial_statements",
        name: "Financial Statements Template",
        template_body: "<h1>Financial Statements</h1><pre>{{json this}}</pre>",
        version: "v1",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("report_templates", null, {})
    await queryInterface.bulkDelete("journal_lines", null, {})
    await queryInterface.bulkDelete("journal_entries", null, {})
    await queryInterface.bulkDelete("gl_accounts", null, {})
    await queryInterface.bulkDelete("distribution_lines", null, {})
    await queryInterface.bulkDelete("distributions", null, {})
    await queryInterface.bulkDelete("capital_call_lines", null, {})
    await queryInterface.bulkDelete("capital_calls", null, {})
    await queryInterface.bulkDelete("commitments", null, {})
    await queryInterface.bulkDelete("investor_profiles", null, {})
    await queryInterface.bulkDelete("share_classes", null, {})
    await queryInterface.bulkDelete("fund_bank_accounts", null, {})
    await queryInterface.bulkDelete("fund_tax_profiles", null, {})
    await queryInterface.bulkDelete("fund_accounting_policies", null, {})
    await queryInterface.bulkDelete("fund_governance", null, {})
    await queryInterface.bulkDelete("fund_profiles", null, {})
  },
}
