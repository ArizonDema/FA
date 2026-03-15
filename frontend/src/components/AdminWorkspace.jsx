import { useCallback, useEffect, useMemo, useState } from "react"
import { apiRequest, apiUrl, currency, percent, shortDate } from "../api"
import { AppShell } from "./AppShell"

const emptyBank = {
  bank_name: "",
  account_number: "",
  iban: "",
  currency: "USD",
  swift: "",
  notes: "",
}

export function AdminWorkspace({ token, user, onLogout }) {
  const navItems = [
    { key: "overview", label: "Fund Overview" },
    { key: "fund-setup", label: "Fund Setup" },
    { key: "share-classes", label: "Share Classes" },
    { key: "investors", label: "Investor Registry" },
    { key: "commitments", label: "Commitments" },
    { key: "capital-calls", label: "Capital Calls" },
    { key: "distributions", label: "Distributions" },
    { key: "ledger", label: "Ledger & Bank" },
    { key: "journal", label: "Journal Entries" },
    { key: "reports", label: "Reports" },
    { key: "documents", label: "Documents" },
  ]

  const [activePage, setActivePage] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")

  const [funds, setFunds] = useState([])
  const [selectedFundId, setSelectedFundId] = useState("")
  const [fundProfile, setFundProfile] = useState(null)
  const [shareClasses, setShareClasses] = useState([])
  const [investors, setInvestors] = useState([])
  const [commitments, setCommitments] = useState([])
  const [capitalCalls, setCapitalCalls] = useState([])
  const [distributions, setDistributions] = useState([])
  const [glAccounts, setGlAccounts] = useState([])
  const [journalEntries, setJournalEntries] = useState([])
  const [documents, setDocuments] = useState([])
  const [reportTemplates, setReportTemplates] = useState([])
  const [reportHistory, setReportHistory] = useState([])
  const [reportPreview, setReportPreview] = useState(null)
  const [reportRun, setReportRun] = useState(null)
  const [reportOutputs, setReportOutputs] = useState(null)
  const [cashLedger, setCashLedger] = useState([])

  const [fundCreateForm, setFundCreateForm] = useState({
    name: "",
    description: "",
    strategy_type: "closed_end",
    management_fee_percent: "2",
    performance_fee_percent: "20",
    lock_up_period_months: "12",
    early_withdrawal_penalty_percent: "5",
    minimum_investment: "1000",
    risk_level: "medium",
    base_currency: "USD",
  })

  const [fundForm, setFundForm] = useState({
    name: "",
    description: "",
    strategy_type: "closed_end",
    management_fee_percent: "",
    performance_fee_percent: "",
    lock_up_period_months: "",
    early_withdrawal_penalty_percent: "",
    minimum_investment: "",
    risk_level: "medium",
    base_currency: "USD",
  })
  const [profileForm, setProfileForm] = useState({
    legal_name: "",
    domicile: "",
    regulator: "",
    fiscal_year_end: "",
    reporting_currency: "USD",
    administrator: "",
    auditor: "",
    investment_manager: "",
    strategy_summary: "",
  })
  const [governanceForm, setGovernanceForm] = useState({
    board_members: "",
    general_partner: "",
    investment_manager: "",
    administrator: "",
    auditor: "",
    depositary: "",
    legal_advisor: "",
  })
  const [policyForm, setPolicyForm] = useState({
    revenue_recognition_policy: "",
    valuation_policy: "",
    foreign_currency_policy: "",
    financial_instrument_policy: "",
    impairment_policy: "",
  })
  const [taxForm, setTaxForm] = useState({
    tax_residency: "",
    tax_identification_number: "",
    vat_number: "",
    tax_advisor: "",
  })
  const [bankAccounts, setBankAccounts] = useState([{ ...emptyBank }])

  const [shareClassForm, setShareClassForm] = useState({
    class_name: "",
    currency: "USD",
    management_fee: "",
    performance_fee: "",
    hurdle_rate: "",
    catch_up: "",
    min_commitment: "",
  })

  const [investorForm, setInvestorForm] = useState({
    investor_type: "individual",
    legal_name: "",
    contact_email: "",
    contact_phone: "",
    country: "",
    tax_id: "",
    address: "",
    status: "active",
  })

  const [commitmentForm, setCommitmentForm] = useState({
    investor_profile_id: "",
    share_class_id: "",
    commitment_amount: "",
    commitment_date: "",
    status: "active",
    notes: "",
  })

  const [capitalCallForm, setCapitalCallForm] = useState({
    call_date: "",
    due_date: "",
    memo: "",
    status: "issued",
    total_call_amount: "",
  })

  const [distributionForm, setDistributionForm] = useState({
    distribution_date: "",
    distribution_type: "return_of_capital",
    memo: "",
    status: "paid",
    total_amount: "",
  })

  const [glAccountForm, setGlAccountForm] = useState({
    code: "",
    name: "",
    type: "asset",
  })

  const [journalForm, setJournalForm] = useState({
    entry_date: "",
    memo: "",
    status: "posted",
    line_one_account: "",
    line_one_debit: "",
    line_two_account: "",
    line_two_credit: "",
  })

  const [reportForm, setReportForm] = useState({
    type: "cash_flow",
    period_start: "",
    period_end: "",
    format: "both",
    template_id: "",
  })

  const [documentForm, setDocumentForm] = useState({
    document_type: "LPA",
    investor_profile_id: "",
    file: null,
  })

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.id === selectedFundId) || null,
    [funds, selectedFundId],
  )

  const loadFunds = useCallback(async () => {
    const response = await apiRequest("/funds", { token })
    const nextFunds = response.data.funds || []
    setFunds(nextFunds)
    if (!selectedFundId && nextFunds.length > 0) {
      setSelectedFundId(nextFunds[0].id)
    }
  }, [token, selectedFundId])

  const loadFundProfile = useCallback(async () => {
    if (!selectedFundId) return
    const response = await apiRequest(`/funds/${selectedFundId}/profile`, { token })
    const payload = response.data
    setFundProfile(payload)

    if (payload?.fund) {
      setFundForm({
        name: payload.fund.name || "",
        description: payload.fund.description || "",
        strategy_type: payload.fund.strategy_type || "closed_end",
        management_fee_percent: payload.fund.management_fee_percent || "",
        performance_fee_percent: payload.fund.performance_fee_percent || "",
        lock_up_period_months: payload.fund.lock_up_period_months || "",
        early_withdrawal_penalty_percent: payload.fund.early_withdrawal_penalty_percent || "",
        minimum_investment: payload.fund.minimum_investment || "",
        risk_level: payload.fund.risk_level || "medium",
        base_currency: payload.fund.base_currency || "USD",
      })
    }

    setProfileForm({
      legal_name: payload?.profile?.legal_name || "",
      domicile: payload?.profile?.domicile || "",
      regulator: payload?.profile?.regulator || "",
      fiscal_year_end: payload?.profile?.fiscal_year_end || "",
      reporting_currency: payload?.profile?.reporting_currency || "USD",
      administrator: payload?.profile?.administrator || "",
      auditor: payload?.profile?.auditor || "",
      investment_manager: payload?.profile?.investment_manager || "",
      strategy_summary: payload?.profile?.strategy_summary || "",
    })

    setGovernanceForm({
      board_members: payload?.governance?.board_members || "",
      general_partner: payload?.governance?.general_partner || "",
      investment_manager: payload?.governance?.investment_manager || "",
      administrator: payload?.governance?.administrator || "",
      auditor: payload?.governance?.auditor || "",
      depositary: payload?.governance?.depositary || "",
      legal_advisor: payload?.governance?.legal_advisor || "",
    })

    setPolicyForm({
      revenue_recognition_policy: payload?.policies?.revenue_recognition_policy || "",
      valuation_policy: payload?.policies?.valuation_policy || "",
      foreign_currency_policy: payload?.policies?.foreign_currency_policy || "",
      financial_instrument_policy: payload?.policies?.financial_instrument_policy || "",
      impairment_policy: payload?.policies?.impairment_policy || "",
    })

    setTaxForm({
      tax_residency: payload?.tax?.tax_residency || "",
      tax_identification_number: payload?.tax?.tax_identification_number || "",
      vat_number: payload?.tax?.vat_number || "",
      tax_advisor: payload?.tax?.tax_advisor || "",
    })

    const banks = payload?.bank_accounts && payload.bank_accounts.length ? payload.bank_accounts : [{ ...emptyBank }]
    setBankAccounts(banks)
  }, [selectedFundId, token])

  const loadFundScoped = useCallback(async () => {
    if (!selectedFundId) return
    const [shareClassData, commitmentData, callData, distData, documentData, historyData] = await Promise.all([
      apiRequest(`/share-classes?portfolio_id=${selectedFundId}`, { token }),
      apiRequest(`/commitments?portfolio_id=${selectedFundId}`, { token }),
      apiRequest(`/capital-calls?portfolio_id=${selectedFundId}`, { token }),
      apiRequest(`/distributions?portfolio_id=${selectedFundId}`, { token }),
      apiRequest(`/documents?portfolio_id=${selectedFundId}`, { token }),
      apiRequest(`/reports/history?portfolio_id=${selectedFundId}`, { token }),
    ])

    setShareClasses(shareClassData.data.share_classes || [])
    setCommitments(commitmentData.data.commitments || [])
    setCapitalCalls(callData.data.capital_calls || [])
    setDistributions(distData.data.distributions || [])
    setDocuments(documentData.data.documents || [])
    setReportHistory(historyData.data.runs || [])
  }, [selectedFundId, token])

  const loadGlobal = useCallback(async () => {
    const [investorData, glData, journalData, templateData, ledgerData] = await Promise.all([
      apiRequest("/investors", { token }),
      apiRequest("/gl-accounts", { token }),
      apiRequest("/journal-entries", { token }),
      apiRequest("/report-templates", { token }),
      apiRequest("/admin/cash-ledger", { token }),
    ])

    setInvestors(investorData.data.investors || [])
    setGlAccounts(glData.data.accounts || [])
    setJournalEntries(journalData.data.entries || [])
    setReportTemplates(templateData.data.templates || [])
    setCashLedger(ledgerData.data.records || [])
  }, [token])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      await loadFunds()
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [loadFunds, loadGlobal])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!selectedFundId) return
    loadFundProfile()
    loadFundScoped()
  }, [selectedFundId, loadFundProfile, loadFundScoped])

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(""), 8000)
    return () => window.clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(""), 4000)
    return () => window.clearTimeout(timer)
  }, [note])
  const handleSaveFundProfile = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      await apiRequest(`/funds/${selectedFundId}/profile`, {
        method: "PUT",
        token,
        body: {
          fund: fundForm,
          profile: profileForm,
          governance: governanceForm,
          policies: policyForm,
          tax: taxForm,
          bank_accounts: bankAccounts,
        },
      })
      setNote("Fund profile saved.")
      await loadFundProfile()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateFund = async (event) => {
    event.preventDefault()
    setNote("")
    try {
      await apiRequest("/funds", { method: "POST", token, body: fundCreateForm })
      setNote("Fund created.")
      setFundCreateForm({
        name: "",
        description: "",
        strategy_type: "closed_end",
        management_fee_percent: "2",
        performance_fee_percent: "20",
        lock_up_period_months: "12",
        early_withdrawal_penalty_percent: "5",
        minimum_investment: "1000",
        risk_level: "medium",
        base_currency: "USD",
      })
      await loadFunds()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateShareClass = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      await apiRequest("/share-classes", {
        method: "POST",
        token,
        body: { ...shareClassForm, portfolio_id: selectedFundId },
      })
      setNote("Share class created.")
      setShareClassForm({
        class_name: "",
        currency: "USD",
        management_fee: "",
        performance_fee: "",
        hurdle_rate: "",
        catch_up: "",
        min_commitment: "",
      })
      await loadFundScoped()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateInvestor = async (event) => {
    event.preventDefault()
    setNote("")
    try {
      await apiRequest("/investors", { method: "POST", token, body: investorForm })
      setNote("Investor created.")
      setInvestorForm({
        investor_type: "individual",
        legal_name: "",
        contact_email: "",
        contact_phone: "",
        country: "",
        tax_id: "",
        address: "",
        status: "active",
      })
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateCommitment = async (event) => {
    event.preventDefault()
    setNote("")
    try {
      await apiRequest("/commitments", {
        method: "POST",
        token,
        body: commitmentForm,
      })
      setNote("Commitment created.")
      setCommitmentForm({
        investor_profile_id: "",
        share_class_id: "",
        commitment_amount: "",
        commitment_date: "",
        status: "active",
        notes: "",
      })
      await loadFundScoped()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateCapitalCall = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      await apiRequest("/capital-calls", {
        method: "POST",
        token,
        body: { ...capitalCallForm, portfolio_id: selectedFundId },
      })
      setNote("Capital call created.")
      setCapitalCallForm({ call_date: "", due_date: "", memo: "", status: "issued", total_call_amount: "" })
      await loadFundScoped()
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateDistribution = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      await apiRequest("/distributions", {
        method: "POST",
        token,
        body: { ...distributionForm, portfolio_id: selectedFundId },
      })
      setNote("Distribution created.")
      setDistributionForm({
        distribution_date: "",
        distribution_type: "return_of_capital",
        memo: "",
        status: "paid",
        total_amount: "",
      })
      await loadFundScoped()
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateGLAccount = async (event) => {
    event.preventDefault()
    setNote("")
    try {
      await apiRequest("/gl-accounts", { method: "POST", token, body: glAccountForm })
      setNote("GL account created.")
      setGlAccountForm({ code: "", name: "", type: "asset" })
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateJournalEntry = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      await apiRequest("/journal-entries", {
        method: "POST",
        token,
        body: {
          portfolio_id: selectedFundId,
          entry_date: journalForm.entry_date,
          memo: journalForm.memo,
          status: journalForm.status,
          lines: [
            {
              gl_account_id: journalForm.line_one_account,
              debit: journalForm.line_one_debit,
              credit: 0,
              currency: "USD",
              fx_rate: 1,
            },
            {
              gl_account_id: journalForm.line_two_account,
              debit: 0,
              credit: journalForm.line_two_credit,
              currency: "USD",
              fx_rate: 1,
            },
          ],
        },
      })
      setNote("Journal entry created.")
      setJournalForm({
        entry_date: "",
        memo: "",
        status: "posted",
        line_one_account: "",
        line_one_debit: "",
        line_two_account: "",
        line_two_credit: "",
      })
      await loadGlobal()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRunReport = async (event) => {
    event.preventDefault()
    if (!selectedFundId) return
    setNote("")
    try {
      const response = await apiRequest("/reports/run", {
        method: "POST",
        token,
        body: { ...reportForm, portfolio_id: selectedFundId },
      })
      setReportPreview(response.data.preview)
      setReportRun(response.data.run)
      setReportOutputs(response.data.outputs || null)
      setNote("Report generated.")
      await loadFundScoped()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUploadDocument = async (event) => {
    event.preventDefault()
    if (!documentForm.file) {
      setError("Select a file to upload.")
      return
    }
    const formData = new FormData()
    formData.append("file", documentForm.file)
    formData.append("document_type", documentForm.document_type)
    if (selectedFundId) {
      formData.append("portfolio_id", selectedFundId)
    }
    if (documentForm.investor_profile_id) {
      formData.append("investor_profile_id", documentForm.investor_profile_id)
    }

    try {
      const response = await fetch(apiUrl("/documents"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload?.message || "Document upload failed")
      }
      setNote("Document uploaded.")
      setDocumentForm({ document_type: "LPA", investor_profile_id: "", file: null })
      await loadFundScoped()
    } catch (err) {
      setError(err.message)
    }
  }

  const downloadReport = (format) => {
    if (!reportRun || !reportOutputs?.[format]) return
    window.open(apiUrl(`/reports/download/${reportRun.id}/${format}`), "_blank")
  }

  if (loading) {
    return <main className="auth-root">Loading fund admin workspace...</main>
  }
  return (
    <AppShell user={user} onLogout={onLogout} navItems={navItems} activePage={activePage} setActivePage={setActivePage}>
      <div className="stack">
        {error && (
          <div className="alert error inline-actions" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {note && (
          <div className="alert ok inline-actions" role="status">
            <span>{note}</span>
            <button type="button" onClick={() => setNote("")}>
              ×
            </button>
          </div>
        )}

        <section className="panel">
          <p className="kicker">Active Fund</p>
          <div className="split-2">
            <div>
              <h2>{selectedFund?.name || "Select a fund"}</h2>
              <p className="muted small">{selectedFund?.description || ""}</p>
            </div>
            <label>
              Fund
              <select value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)}>
                <option value="">Select fund</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {activePage === "overview" && (
          <section className="panel stack">
            <h2>Fund Overview</h2>
            <div className="cards-grid">
              <div className="mini-card">
                <p className="kicker">Share Classes</p>
                <h3>{shareClasses.length}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Investors</p>
                <h3>{investors.length}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Commitments</p>
                <h3>{commitments.length}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Capital Calls</p>
                <h3>{capitalCalls.length}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Distributions</p>
                <h3>{distributions.length}</h3>
              </div>
              <div className="mini-card">
                <p className="kicker">Reports</p>
                <h3>{reportHistory.length}</h3>
              </div>
            </div>
          </section>
        )}

        {activePage === "fund-setup" && (
          <section className="panel stack">
            <h2>Fund Setup</h2>
            <form className="panel stack" onSubmit={handleCreateFund}>
              <h3>Create New Fund</h3>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={fundCreateForm.name}
                    onChange={(e) => setFundCreateForm({ ...fundCreateForm, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Strategy Type
                  <input
                    value={fundCreateForm.strategy_type}
                    onChange={(e) => setFundCreateForm({ ...fundCreateForm, strategy_type: e.target.value })}
                  />
                </label>
                <label>
                  Management Fee %
                  <input
                    value={fundCreateForm.management_fee_percent}
                    onChange={(e) =>
                      setFundCreateForm({ ...fundCreateForm, management_fee_percent: e.target.value })
                    }
                  />
                </label>
                <label>
                  Performance Fee %
                  <input
                    value={fundCreateForm.performance_fee_percent}
                    onChange={(e) =>
                      setFundCreateForm({ ...fundCreateForm, performance_fee_percent: e.target.value })
                    }
                  />
                </label>
                <label>
                  Lock-up Months
                  <input
                    value={fundCreateForm.lock_up_period_months}
                    onChange={(e) =>
                      setFundCreateForm({ ...fundCreateForm, lock_up_period_months: e.target.value })
                    }
                  />
                </label>
                <label>
                  Early Withdrawal Penalty %
                  <input
                    value={fundCreateForm.early_withdrawal_penalty_percent}
                    onChange={(e) =>
                      setFundCreateForm({ ...fundCreateForm, early_withdrawal_penalty_percent: e.target.value })
                    }
                  />
                </label>
                <label>
                  Minimum Investment
                  <input
                    value={fundCreateForm.minimum_investment}
                    onChange={(e) =>
                      setFundCreateForm({ ...fundCreateForm, minimum_investment: e.target.value })
                    }
                  />
                </label>
                <label>
                  Base Currency
                  <input
                    value={fundCreateForm.base_currency}
                    onChange={(e) => setFundCreateForm({ ...fundCreateForm, base_currency: e.target.value })}
                  />
                </label>
                <label>
                  Risk Level
                  <select
                    value={fundCreateForm.risk_level}
                    onChange={(e) => setFundCreateForm({ ...fundCreateForm, risk_level: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="full">
                  Description
                  <textarea
                    rows="2"
                    value={fundCreateForm.description}
                    onChange={(e) => setFundCreateForm({ ...fundCreateForm, description: e.target.value })}
                  />
                </label>
              </div>
              <button className="primary" type="submit">
                Create Fund
              </button>
            </form>

            <form className="panel stack" onSubmit={handleSaveFundProfile}>
              <h3>Fund Profile</h3>
              <div className="form-grid">
                <label>
                  Fund Name
                  <input value={fundForm.name} onChange={(e) => setFundForm({ ...fundForm, name: e.target.value })} />
                </label>
                <label>
                  Strategy Type
                  <input value={fundForm.strategy_type} onChange={(e) => setFundForm({ ...fundForm, strategy_type: e.target.value })} />
                </label>
                <label>
                  Management Fee %
                  <input
                    value={fundForm.management_fee_percent}
                    onChange={(e) => setFundForm({ ...fundForm, management_fee_percent: e.target.value })}
                  />
                </label>
                <label>
                  Performance Fee %
                  <input
                    value={fundForm.performance_fee_percent}
                    onChange={(e) => setFundForm({ ...fundForm, performance_fee_percent: e.target.value })}
                  />
                </label>
                <label>
                  Lock-up (Months)
                  <input
                    value={fundForm.lock_up_period_months}
                    onChange={(e) => setFundForm({ ...fundForm, lock_up_period_months: e.target.value })}
                  />
                </label>
                <label>
                  Early Withdrawal Penalty %
                  <input
                    value={fundForm.early_withdrawal_penalty_percent}
                    onChange={(e) =>
                      setFundForm({ ...fundForm, early_withdrawal_penalty_percent: e.target.value })
                    }
                  />
                </label>
                <label>
                  Minimum Investment
                  <input
                    value={fundForm.minimum_investment}
                    onChange={(e) => setFundForm({ ...fundForm, minimum_investment: e.target.value })}
                  />
                </label>
                <label>
                  Risk Level
                  <select value={fundForm.risk_level} onChange={(e) => setFundForm({ ...fundForm, risk_level: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Base Currency
                  <input value={fundForm.base_currency} onChange={(e) => setFundForm({ ...fundForm, base_currency: e.target.value })} />
                </label>
                <label className="full">
                  Description
                  <textarea rows="2" value={fundForm.description} onChange={(e) => setFundForm({ ...fundForm, description: e.target.value })} />
                </label>
              </div>

              <h3>Legal & Reporting</h3>
              <div className="form-grid">
                <label>
                  Legal Name
                  <input value={profileForm.legal_name} onChange={(e) => setProfileForm({ ...profileForm, legal_name: e.target.value })} />
                </label>
                <label>
                  Domicile
                  <input value={profileForm.domicile} onChange={(e) => setProfileForm({ ...profileForm, domicile: e.target.value })} />
                </label>
                <label>
                  Regulator
                  <input value={profileForm.regulator} onChange={(e) => setProfileForm({ ...profileForm, regulator: e.target.value })} />
                </label>
                <label>
                  Fiscal Year End
                  <input value={profileForm.fiscal_year_end} onChange={(e) => setProfileForm({ ...profileForm, fiscal_year_end: e.target.value })} />
                </label>
                <label>
                  Reporting Currency
                  <input value={profileForm.reporting_currency} onChange={(e) => setProfileForm({ ...profileForm, reporting_currency: e.target.value })} />
                </label>
                <label>
                  Administrator
                  <input value={profileForm.administrator} onChange={(e) => setProfileForm({ ...profileForm, administrator: e.target.value })} />
                </label>
                <label>
                  Auditor
                  <input value={profileForm.auditor} onChange={(e) => setProfileForm({ ...profileForm, auditor: e.target.value })} />
                </label>
                <label>
                  Investment Manager
                  <input value={profileForm.investment_manager} onChange={(e) => setProfileForm({ ...profileForm, investment_manager: e.target.value })} />
                </label>
                <label className="full">
                  Strategy Summary
                  <textarea rows="2" value={profileForm.strategy_summary} onChange={(e) => setProfileForm({ ...profileForm, strategy_summary: e.target.value })} />
                </label>
              </div>

              <h3>Governance</h3>
              <div className="form-grid">
                <label>
                  Board Members
                  <input value={governanceForm.board_members} onChange={(e) => setGovernanceForm({ ...governanceForm, board_members: e.target.value })} />
                </label>
                <label>
                  General Partner
                  <input value={governanceForm.general_partner} onChange={(e) => setGovernanceForm({ ...governanceForm, general_partner: e.target.value })} />
                </label>
                <label>
                  Depositary
                  <input value={governanceForm.depositary} onChange={(e) => setGovernanceForm({ ...governanceForm, depositary: e.target.value })} />
                </label>
                <label>
                  Legal Advisor
                  <input value={governanceForm.legal_advisor} onChange={(e) => setGovernanceForm({ ...governanceForm, legal_advisor: e.target.value })} />
                </label>
              </div>

              <h3>Accounting Policies</h3>
              <div className="form-grid">
                <label className="full">
                  Revenue Recognition Policy
                  <textarea rows="2" value={policyForm.revenue_recognition_policy} onChange={(e) => setPolicyForm({ ...policyForm, revenue_recognition_policy: e.target.value })} />
                </label>
                <label className="full">
                  Valuation Policy
                  <textarea rows="2" value={policyForm.valuation_policy} onChange={(e) => setPolicyForm({ ...policyForm, valuation_policy: e.target.value })} />
                </label>
                <label className="full">
                  FX Policy
                  <textarea rows="2" value={policyForm.foreign_currency_policy} onChange={(e) => setPolicyForm({ ...policyForm, foreign_currency_policy: e.target.value })} />
                </label>
                <label className="full">
                  Financial Instrument Policy
                  <textarea rows="2" value={policyForm.financial_instrument_policy} onChange={(e) => setPolicyForm({ ...policyForm, financial_instrument_policy: e.target.value })} />
                </label>
                <label className="full">
                  Impairment Policy
                  <textarea rows="2" value={policyForm.impairment_policy} onChange={(e) => setPolicyForm({ ...policyForm, impairment_policy: e.target.value })} />
                </label>
              </div>

              <h3>Tax</h3>
              <div className="form-grid">
                <label>
                  Tax Residency
                  <input value={taxForm.tax_residency} onChange={(e) => setTaxForm({ ...taxForm, tax_residency: e.target.value })} />
                </label>
                <label>
                  Tax ID
                  <input value={taxForm.tax_identification_number} onChange={(e) => setTaxForm({ ...taxForm, tax_identification_number: e.target.value })} />
                </label>
                <label>
                  VAT Number
                  <input value={taxForm.vat_number} onChange={(e) => setTaxForm({ ...taxForm, vat_number: e.target.value })} />
                </label>
                <label>
                  Tax Advisor
                  <input value={taxForm.tax_advisor} onChange={(e) => setTaxForm({ ...taxForm, tax_advisor: e.target.value })} />
                </label>
              </div>

              <h3>Bank Accounts</h3>
              {bankAccounts.map((account, index) => (
                <div key={`bank-${index}`} className="form-grid">
                  <label>
                    Bank Name
                    <input
                      value={account.bank_name || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], bank_name: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                  <label>
                    Account Number
                    <input
                      value={account.account_number || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], account_number: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                  <label>
                    IBAN
                    <input
                      value={account.iban || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], iban: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                  <label>
                    Currency
                    <input
                      value={account.currency || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], currency: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                  <label>
                    Swift
                    <input
                      value={account.swift || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], swift: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                  <label className="full">
                    Notes
                    <input
                      value={account.notes || ""}
                      onChange={(e) => {
                        const next = [...bankAccounts]
                        next[index] = { ...next[index], notes: e.target.value }
                        setBankAccounts(next)
                      }}
                    />
                  </label>
                </div>
              ))}

              <button className="primary" type="submit">
                Save Fund Profile
              </button>
            </form>
          </section>
        )}
        {activePage === "share-classes" && (
          <section className="panel stack">
            <h2>Share Classes</h2>
            <form className="form-grid" onSubmit={handleCreateShareClass}>
              <label>
                Class Name
                <input
                  value={shareClassForm.class_name}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, class_name: e.target.value })}
                  required
                />
              </label>
              <label>
                Currency
                <input
                  value={shareClassForm.currency}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, currency: e.target.value })}
                />
              </label>
              <label>
                Management Fee %
                <input
                  value={shareClassForm.management_fee}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, management_fee: e.target.value })}
                />
              </label>
              <label>
                Performance Fee %
                <input
                  value={shareClassForm.performance_fee}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, performance_fee: e.target.value })}
                />
              </label>
              <label>
                Hurdle Rate %
                <input
                  value={shareClassForm.hurdle_rate}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, hurdle_rate: e.target.value })}
                />
              </label>
              <label>
                Catch Up %
                <input
                  value={shareClassForm.catch_up}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, catch_up: e.target.value })}
                />
              </label>
              <label>
                Minimum Commitment
                <input
                  value={shareClassForm.min_commitment}
                  onChange={(e) => setShareClassForm({ ...shareClassForm, min_commitment: e.target.value })}
                />
              </label>
              <button className="primary" type="submit">
                Add Share Class
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Currency</th>
                    <th>Mgmt Fee</th>
                    <th>Perf Fee</th>
                    <th>Min Commitment</th>
                  </tr>
                </thead>
                <tbody>
                  {shareClasses.map((cls) => (
                    <tr key={cls.id}>
                      <td>{cls.class_name}</td>
                      <td>{cls.currency || "-"}</td>
                      <td>{cls.management_fee ? percent(cls.management_fee) : "-"}</td>
                      <td>{cls.performance_fee ? percent(cls.performance_fee) : "-"}</td>
                      <td>{cls.min_commitment ? currency(cls.min_commitment) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "investors" && (
          <section className="panel stack">
            <h2>Investor Registry</h2>
            <form className="form-grid" onSubmit={handleCreateInvestor}>
              <label>
                Investor Type
                <select
                  value={investorForm.investor_type}
                  onChange={(e) => setInvestorForm({ ...investorForm, investor_type: e.target.value })}
                >
                  <option value="individual">Individual</option>
                  <option value="corporate">Corporate</option>
                </select>
              </label>
              <label>
                Legal Name
                <input
                  value={investorForm.legal_name}
                  onChange={(e) => setInvestorForm({ ...investorForm, legal_name: e.target.value })}
                  required
                />
              </label>
              <label>
                Contact Email
                <input
                  value={investorForm.contact_email}
                  onChange={(e) => setInvestorForm({ ...investorForm, contact_email: e.target.value })}
                />
              </label>
              <label>
                Contact Phone
                <input
                  value={investorForm.contact_phone}
                  onChange={(e) => setInvestorForm({ ...investorForm, contact_phone: e.target.value })}
                />
              </label>
              <label>
                Country
                <input
                  value={investorForm.country}
                  onChange={(e) => setInvestorForm({ ...investorForm, country: e.target.value })}
                />
              </label>
              <label>
                Tax ID
                <input value={investorForm.tax_id} onChange={(e) => setInvestorForm({ ...investorForm, tax_id: e.target.value })} />
              </label>
              <label className="full">
                Address
                <textarea rows="2" value={investorForm.address} onChange={(e) => setInvestorForm({ ...investorForm, address: e.target.value })} />
              </label>
              <button className="primary" type="submit">
                Add Investor
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Country</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((investor) => (
                    <tr key={investor.id}>
                      <td>{investor.legal_name}</td>
                      <td>{investor.investor_type}</td>
                      <td>{investor.country || "-"}</td>
                      <td>{investor.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "commitments" && (
          <section className="panel stack">
            <h2>Commitments</h2>
            <form className="form-grid" onSubmit={handleCreateCommitment}>
              <label>
                Investor
                <select
                  value={commitmentForm.investor_profile_id}
                  onChange={(e) => setCommitmentForm({ ...commitmentForm, investor_profile_id: e.target.value })}
                  required
                >
                  <option value="">Select investor</option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.legal_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Share Class
                <select
                  value={commitmentForm.share_class_id}
                  onChange={(e) => setCommitmentForm({ ...commitmentForm, share_class_id: e.target.value })}
                  required
                >
                  <option value="">Select share class</option>
                  {shareClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Commitment Amount
                <input value={commitmentForm.commitment_amount} onChange={(e) => setCommitmentForm({ ...commitmentForm, commitment_amount: e.target.value })} required />
              </label>
              <label>
                Commitment Date
                <input type="date" value={commitmentForm.commitment_date} onChange={(e) => setCommitmentForm({ ...commitmentForm, commitment_date: e.target.value })} required />
              </label>
              <label className="full">
                Notes
                <input value={commitmentForm.notes} onChange={(e) => setCommitmentForm({ ...commitmentForm, notes: e.target.value })} />
              </label>
              <button className="primary" type="submit">
                Add Commitment
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Share Class</th>
                    <th>Commitment</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map((commitment) => (
                    <tr key={commitment.id}>
                      <td>{commitment.investor?.legal_name || "-"}</td>
                      <td>{commitment.shareClass?.class_name || "-"}</td>
                      <td>{currency(commitment.commitment_amount)}</td>
                      <td>{shortDate(commitment.commitment_date)}</td>
                      <td>{commitment.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {activePage === "capital-calls" && (
          <section className="panel stack">
            <h2>Capital Calls</h2>
            <form className="form-grid" onSubmit={handleCreateCapitalCall}>
              <label>
                Call Date
                <input type="date" value={capitalCallForm.call_date} onChange={(e) => setCapitalCallForm({ ...capitalCallForm, call_date: e.target.value })} required />
              </label>
              <label>
                Due Date
                <input type="date" value={capitalCallForm.due_date} onChange={(e) => setCapitalCallForm({ ...capitalCallForm, due_date: e.target.value })} />
              </label>
              <label>
                Total Call Amount
                <input value={capitalCallForm.total_call_amount} onChange={(e) => setCapitalCallForm({ ...capitalCallForm, total_call_amount: e.target.value })} required />
              </label>
              <label>
                Status
                <select value={capitalCallForm.status} onChange={(e) => setCapitalCallForm({ ...capitalCallForm, status: e.target.value })}>
                  <option value="issued">Issued</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="full">
                Memo
                <input value={capitalCallForm.memo} onChange={(e) => setCapitalCallForm({ ...capitalCallForm, memo: e.target.value })} />
              </label>
              <button className="primary" type="submit">
                Issue Capital Call
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Memo</th>
                    <th>Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalCalls.map((call) => (
                    <tr key={call.id}>
                      <td>{shortDate(call.call_date)}</td>
                      <td>{call.status}</td>
                      <td>{call.memo || "-"}</td>
                      <td>{call.lines?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "distributions" && (
          <section className="panel stack">
            <h2>Distributions</h2>
            <form className="form-grid" onSubmit={handleCreateDistribution}>
              <label>
                Distribution Date
                <input type="date" value={distributionForm.distribution_date} onChange={(e) => setDistributionForm({ ...distributionForm, distribution_date: e.target.value })} required />
              </label>
              <label>
                Distribution Type
                <select value={distributionForm.distribution_type} onChange={(e) => setDistributionForm({ ...distributionForm, distribution_type: e.target.value })}>
                  <option value="return_of_capital">Return of Capital</option>
                  <option value="profit">Profit</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Total Amount
                <input value={distributionForm.total_amount} onChange={(e) => setDistributionForm({ ...distributionForm, total_amount: e.target.value })} required />
              </label>
              <label>
                Status
                <select value={distributionForm.status} onChange={(e) => setDistributionForm({ ...distributionForm, status: e.target.value })}>
                  <option value="paid">Paid</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="full">
                Memo
                <input value={distributionForm.memo} onChange={(e) => setDistributionForm({ ...distributionForm, memo: e.target.value })} />
              </label>
              <button className="primary" type="submit">
                Create Distribution
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Memo</th>
                    <th>Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist) => (
                    <tr key={dist.id}>
                      <td>{shortDate(dist.distribution_date)}</td>
                      <td>{dist.status}</td>
                      <td>{dist.memo || "-"}</td>
                      <td>{dist.lines?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "ledger" && (
          <section className="panel stack">
            <h2>Cash Ledger</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {cashLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{shortDate(entry.recorded_at)}</td>
                      <td>{entry.type}</td>
                      <td>{currency(entry.amount)}</td>
                      <td>{entry.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "journal" && (
          <section className="panel stack">
            <h2>Journal Entries</h2>
            <form className="form-grid" onSubmit={handleCreateJournalEntry}>
              <label>
                Entry Date
                <input type="date" value={journalForm.entry_date} onChange={(e) => setJournalForm({ ...journalForm, entry_date: e.target.value })} required />
              </label>
              <label>
                Status
                <select value={journalForm.status} onChange={(e) => setJournalForm({ ...journalForm, status: e.target.value })}>
                  <option value="posted">Posted</option>
                  <option value="draft">Draft</option>
                  <option value="void">Void</option>
                </select>
              </label>
              <label className="full">
                Memo
                <input value={journalForm.memo} onChange={(e) => setJournalForm({ ...journalForm, memo: e.target.value })} />
              </label>
              <label>
                Debit Account
                <select value={journalForm.line_one_account} onChange={(e) => setJournalForm({ ...journalForm, line_one_account: e.target.value })} required>
                  <option value="">Select account</option>
                  {glAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Debit Amount
                <input value={journalForm.line_one_debit} onChange={(e) => setJournalForm({ ...journalForm, line_one_debit: e.target.value })} required />
              </label>
              <label>
                Credit Account
                <select value={journalForm.line_two_account} onChange={(e) => setJournalForm({ ...journalForm, line_two_account: e.target.value })} required>
                  <option value="">Select account</option>
                  {glAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Credit Amount
                <input value={journalForm.line_two_credit} onChange={(e) => setJournalForm({ ...journalForm, line_two_credit: e.target.value })} required />
              </label>
              <button className="primary" type="submit">
                Post Journal Entry
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Memo</th>
                    <th>Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{shortDate(entry.entry_date)}</td>
                      <td>{entry.status}</td>
                      <td>{entry.memo || "-"}</td>
                      <td>{entry.lines?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="form-grid" onSubmit={handleCreateGLAccount}>
              <h3 className="full">Add GL Account</h3>
              <label>
                Code
                <input value={glAccountForm.code} onChange={(e) => setGlAccountForm({ ...glAccountForm, code: e.target.value })} required />
              </label>
              <label>
                Name
                <input value={glAccountForm.name} onChange={(e) => setGlAccountForm({ ...glAccountForm, name: e.target.value })} required />
              </label>
              <label>
                Type
                <select value={glAccountForm.type} onChange={(e) => setGlAccountForm({ ...glAccountForm, type: e.target.value })}>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <button className="primary" type="submit">
                Add Account
              </button>
            </form>
          </section>
        )}

        {activePage === "reports" && (
          <section className="panel stack">
            <h2>Reports</h2>
            <form className="form-grid" onSubmit={handleRunReport}>
              <label>
                Report Type
                <select value={reportForm.type} onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}>
                  <option value="cash_flow">Cash Flow</option>
                  <option value="shareholder_register">Shareholder Register</option>
                  <option value="financial_statements">Financial Statements</option>
                </select>
              </label>
              <label>
                Period Start
                <input type="date" value={reportForm.period_start} onChange={(e) => setReportForm({ ...reportForm, period_start: e.target.value })} />
              </label>
              <label>
                Period End
                <input type="date" value={reportForm.period_end} onChange={(e) => setReportForm({ ...reportForm, period_end: e.target.value })} />
              </label>
              <label>
                Template
                <select value={reportForm.template_id} onChange={(e) => setReportForm({ ...reportForm, template_id: e.target.value })}>
                  <option value="">Default Template</option>
                  {reportTemplates
                    .filter((tpl) => tpl.type === reportForm.type)
                    .map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Output Format
                <select value={reportForm.format} onChange={(e) => setReportForm({ ...reportForm, format: e.target.value })}>
                  <option value="both">PDF + XLSX</option>
                  <option value="pdf">PDF only</option>
                  <option value="xlsx">XLSX only</option>
                </select>
              </label>
              <button className="primary" type="submit">
                Run Report
              </button>
            </form>

            {reportRun && (
              <div className="panel stack">
                <h3>Latest Report</h3>
                <div className="inline-actions">
                  {reportOutputs?.pdf && (
                    <button type="button" onClick={() => downloadReport("pdf")}>
                      PDF
                    </button>
                  )}
                  {reportOutputs?.xlsx && (
                    <button type="button" onClick={() => downloadReport("xlsx")}>
                      XLSX
                    </button>
                  )}
                </div>
                {reportPreview && (
                  <pre className="mini-card" style={{ overflow: "auto" }}>
                    {JSON.stringify(reportPreview, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {reportHistory.map((run) => (
                    <tr key={run.id}>
                      <td>{run.type}</td>
                      <td>
                        {run.period_start || ""} - {run.period_end || ""}
                      </td>
                      <td>{shortDate(run.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activePage === "documents" && (
          <section className="panel stack">
            <h2>Documents</h2>
            <form className="form-grid" onSubmit={handleUploadDocument}>
              <label>
                Document Type
                <input value={documentForm.document_type} onChange={(e) => setDocumentForm({ ...documentForm, document_type: e.target.value })} />
              </label>
              <label>
                Investor (optional)
                <select value={documentForm.investor_profile_id} onChange={(e) => setDocumentForm({ ...documentForm, investor_profile_id: e.target.value })}>
                  <option value="">Fund-level</option>
                  {investors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.legal_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                File
                <input type="file" onChange={(e) => setDocumentForm({ ...documentForm, file: e.target.files[0] })} required />
              </label>
              <button className="primary" type="submit">
                Upload Document
              </button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>File</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.document_type}</td>
                      <td>{doc.file_name}</td>
                      <td>{shortDate(doc.uploaded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  )
}
