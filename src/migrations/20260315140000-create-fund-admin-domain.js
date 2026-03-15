"use strict"

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("fund_profiles", {
      portfolio_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      legal_name: { type: Sequelize.STRING(255), allowNull: true },
      domicile: { type: Sequelize.STRING(120), allowNull: true },
      regulator: { type: Sequelize.STRING(120), allowNull: true },
      fiscal_year_end: { type: Sequelize.STRING(20), allowNull: true },
      reporting_currency: { type: Sequelize.STRING(3), allowNull: true },
      administrator: { type: Sequelize.STRING(255), allowNull: true },
      auditor: { type: Sequelize.STRING(255), allowNull: true },
      investment_manager: { type: Sequelize.STRING(255), allowNull: true },
      strategy_summary: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("fund_governance", {
      portfolio_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      board_members: { type: Sequelize.TEXT, allowNull: true },
      general_partner: { type: Sequelize.STRING(255), allowNull: true },
      investment_manager: { type: Sequelize.STRING(255), allowNull: true },
      administrator: { type: Sequelize.STRING(255), allowNull: true },
      auditor: { type: Sequelize.STRING(255), allowNull: true },
      depositary: { type: Sequelize.STRING(255), allowNull: true },
      legal_advisor: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("fund_accounting_policies", {
      portfolio_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      revenue_recognition_policy: { type: Sequelize.TEXT, allowNull: true },
      valuation_policy: { type: Sequelize.TEXT, allowNull: true },
      foreign_currency_policy: { type: Sequelize.TEXT, allowNull: true },
      financial_instrument_policy: { type: Sequelize.TEXT, allowNull: true },
      impairment_policy: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("fund_tax_profiles", {
      portfolio_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      tax_residency: { type: Sequelize.STRING(120), allowNull: true },
      tax_identification_number: { type: Sequelize.STRING(120), allowNull: true },
      vat_number: { type: Sequelize.STRING(120), allowNull: true },
      tax_advisor: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("fund_bank_accounts", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      bank_name: { type: Sequelize.STRING(255), allowNull: true },
      account_number: { type: Sequelize.STRING(120), allowNull: true },
      iban: { type: Sequelize.STRING(120), allowNull: true },
      currency: { type: Sequelize.STRING(3), allowNull: true },
      swift: { type: Sequelize.STRING(50), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("share_classes", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      class_name: { type: Sequelize.STRING(120), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: true },
      management_fee: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      performance_fee: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      hurdle_rate: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      catch_up: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      min_commitment: { type: Sequelize.DECIMAL(18, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("investor_profiles", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      investor_type: {
        type: Sequelize.ENUM("individual", "corporate"),
        allowNull: false,
        defaultValue: "individual",
      },
      legal_name: { type: Sequelize.STRING(255), allowNull: false },
      contact_email: { type: Sequelize.STRING(255), allowNull: true },
      contact_phone: { type: Sequelize.STRING(100), allowNull: true },
      country: { type: Sequelize.STRING(120), allowNull: true },
      tax_id: { type: Sequelize.STRING(120), allowNull: true },
      address: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("investor_user_links", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      investor_profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "investor_profiles", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.addIndex("investor_user_links", ["investor_profile_id", "user_id"], {
      unique: true,
      name: "investor_user_links_unique",
    })

    await queryInterface.createTable("commitments", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      investor_profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "investor_profiles", key: "id" },
        onDelete: "CASCADE",
      },
      share_class_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "share_classes", key: "id" },
        onDelete: "CASCADE",
      },
      commitment_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      commitment_date: { type: Sequelize.DATEONLY, allowNull: false },
      status: {
        type: Sequelize.ENUM("active", "closed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("capital_calls", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      portfolio_round_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "portfolio_rounds", key: "id" },
        onDelete: "SET NULL",
      },
      call_date: { type: Sequelize.DATEONLY, allowNull: false },
      due_date: { type: Sequelize.DATEONLY, allowNull: true },
      memo: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM("draft", "issued", "closed"),
        allowNull: false,
        defaultValue: "issued",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("capital_call_lines", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      capital_call_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "capital_calls", key: "id" },
        onDelete: "CASCADE",
      },
      commitment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "commitments", key: "id" },
        onDelete: "CASCADE",
      },
      called_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      paid_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      paid_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("distributions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      portfolio_round_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "portfolio_rounds", key: "id" },
        onDelete: "SET NULL",
      },
      distribution_date: { type: Sequelize.DATEONLY, allowNull: false },
      distribution_type: {
        type: Sequelize.ENUM("return_of_capital", "profit", "other"),
        allowNull: false,
        defaultValue: "return_of_capital",
      },
      status: {
        type: Sequelize.ENUM("draft", "paid", "closed"),
        allowNull: false,
        defaultValue: "paid",
      },
      memo: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("distribution_lines", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      distribution_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "distributions", key: "id" },
        onDelete: "CASCADE",
      },
      commitment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "commitments", key: "id" },
        onDelete: "CASCADE",
      },
      gross_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      withholding: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      net_amount: { type: Sequelize.DECIMAL(18, 2), allowNull: false },
      paid_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("gl_accounts", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      type: {
        type: Sequelize.ENUM("asset", "liability", "equity", "income", "expense"),
        allowNull: false,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("journal_entries", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      portfolio_round_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "portfolio_rounds", key: "id" },
        onDelete: "SET NULL",
      },
      entry_date: { type: Sequelize.DATEONLY, allowNull: false },
      memo: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM("draft", "posted", "void"),
        allowNull: false,
        defaultValue: "posted",
      },
      posted_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("journal_lines", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      journal_entry_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "journal_entries", key: "id" },
        onDelete: "CASCADE",
      },
      gl_account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "gl_accounts", key: "id" },
        onDelete: "RESTRICT",
      },
      debit: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      credit: { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: true },
      fx_rate: { type: Sequelize.DECIMAL(18, 6), allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("report_templates", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      type: {
        type: Sequelize.ENUM("cash_flow", "shareholder_register", "financial_statements"),
        allowNull: false,
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      template_body: { type: Sequelize.TEXT, allowNull: true },
      version: { type: Sequelize.STRING(50), allowNull: true },
      assigned_share_class_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "share_classes", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("report_runs", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      type: {
        type: Sequelize.ENUM("cash_flow", "shareholder_register", "financial_statements"),
        allowNull: false,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "portfolios", key: "id" },
        onDelete: "CASCADE",
      },
      period_start: { type: Sequelize.DATEONLY, allowNull: true },
      period_end: { type: Sequelize.DATEONLY, allowNull: true },
      inputs_json: { type: Sequelize.JSON, allowNull: true },
      output_paths: { type: Sequelize.JSON, allowNull: true },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("fund_documents", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      portfolio_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "portfolios", key: "id" },
        onDelete: "SET NULL",
      },
      investor_profile_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "investor_profiles", key: "id" },
        onDelete: "SET NULL",
      },
      document_type: { type: Sequelize.STRING(120), allowNull: false },
      file_name: { type: Sequelize.STRING(255), allowNull: false },
      file_path: { type: Sequelize.STRING(500), allowNull: false },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      uploaded_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })

    await queryInterface.createTable("audit_logs", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      entity_type: { type: Sequelize.STRING(120), allowNull: false },
      entity_id: { type: Sequelize.STRING(120), allowNull: true },
      action: { type: Sequelize.STRING(120), allowNull: false },
      before_json: { type: Sequelize.JSON, allowNull: true },
      after_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_logs")
    await queryInterface.dropTable("fund_documents")
    await queryInterface.dropTable("report_runs")
    await queryInterface.dropTable("report_templates")
    await queryInterface.dropTable("journal_lines")
    await queryInterface.dropTable("journal_entries")
    await queryInterface.dropTable("gl_accounts")
    await queryInterface.dropTable("distribution_lines")
    await queryInterface.dropTable("distributions")
    await queryInterface.dropTable("capital_call_lines")
    await queryInterface.dropTable("capital_calls")
    await queryInterface.dropTable("commitments")
    await queryInterface.dropTable("investor_user_links")
    await queryInterface.dropTable("investor_profiles")
    await queryInterface.dropTable("share_classes")
    await queryInterface.dropTable("fund_bank_accounts")
    await queryInterface.dropTable("fund_tax_profiles")
    await queryInterface.dropTable("fund_accounting_policies")
    await queryInterface.dropTable("fund_governance")
    await queryInterface.dropTable("fund_profiles")
  },
}
