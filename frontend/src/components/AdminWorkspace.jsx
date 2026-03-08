import { useCallback, useEffect, useMemo, useState } from "react"
import { apiRequest, currency, shortDate } from "../api"
import { AppShell } from "./AppShell"
import { StatCard } from "./StatCard"
import { Sparkline } from "./Sparkline"

export function AdminWorkspace({ token, user, onLogout }) {
  const navItems = [
    { key: "overview", label: "Overview" },
    { key: "portfolios", label: "Portfolios + Rounds" },
    { key: "users", label: "Users + KYC" },
    { key: "withdrawals", label: "Withdrawals Queue" },
    { key: "operations", label: "Operations Data" },
  ]

  const [activePage, setActivePage] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [aum, setAum] = useState(null)
  const [users, setUsers] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [rounds, setRounds] = useState([])
  const [selectedRoundId, setSelectedRoundId] = useState("")
  const [navHistory, setNavHistory] = useState([])
  const [operations, setOperations] = useState({
    cashLedger: [],
    feeRecords: [],
    contracts: [],
    stockAssets: [],
  })
  const [portfolioForm, setPortfolioForm] = useState({
    name: "",
    description: "",
    strategy_type: "balanced",
    management_fee_percent: "2",
    performance_fee_percent: "20",
    lock_up_period_months: "12",
    early_withdrawal_penalty_percent: "5",
    minimum_investment: "1000",
    risk_level: "medium",
    base_currency: "USD",
  })
  const [roundForm, setRoundForm] = useState({ portfolio_id: "", start_date: "" })
  const [cashForm, setCashForm] = useState({
    id: "",
    portfolio_round_id: "",
    amount: "",
    type: "deposit",
    description: "",
    recorded_at: "",
  })
  const [assetForm, setAssetForm] = useState({
    id: "",
    ticker: "",
    exchange: "",
    company_name: "",
    sector: "",
    currency: "USD",
    status: "active",
  })

  const navValues = useMemo(
    () =>
      [...navHistory]
        .reverse()
        .map((entry) => Number(entry.nav))
        .filter((value) => Number.isFinite(value)),
    [navHistory],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [aumData, userData, withdrawalData, portfolioData, roundData] = await Promise.all([
        apiRequest("/admin/aum", { token }),
        apiRequest("/admin/users", { token }),
        apiRequest("/admin/withdrawals", { token }),
        apiRequest("/investor/portfolios", { token }),
        apiRequest("/investor/rounds", { token }),
      ])

      const nextRounds = roundData.data.rounds || []
      setAum(aumData.data || null)
      setUsers(userData.data.users || [])
      setWithdrawals(withdrawalData.data.withdrawals || [])
      setPortfolios(portfolioData.data.portfolios || [])
      setRounds(nextRounds)

      if (!selectedRoundId && nextRounds.length > 0) {
        setSelectedRoundId(nextRounds[0].id)
      }

      const ops = await Promise.allSettled([
        apiRequest("/admin/cash-ledger", { token }),
        apiRequest("/admin/fee-records", { token }),
        apiRequest("/admin/investment-contracts", { token }),
        apiRequest("/admin/stock-assets", { token }),
      ])

      setOperations({
        cashLedger: ops[0].status === "fulfilled" ? ops[0].value.data.records || [] : [],
        feeRecords: ops[1].status === "fulfilled" ? ops[1].value.data.records || [] : [],
        contracts: ops[2].status === "fulfilled" ? ops[2].value.data.contracts || [] : [],
        stockAssets: ops[3].status === "fulfilled" ? ops[3].value.data.assets || [] : [],
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [token, selectedRoundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedRoundId) return
    apiRequest(`/investor/nav-history/${selectedRoundId}`, { token })
      .then((response) => setNavHistory(response.data.history || []))
      .catch(() => setNavHistory([]))
  }, [token, selectedRoundId])

  async function createPortfolio(event) {
    event.preventDefault()
    setError("")
    setNote("")
    try {
      await apiRequest("/admin/portfolios", {
        method: "POST",
        token,
        body: {
          ...portfolioForm,
          management_fee_percent: Number(portfolioForm.management_fee_percent),
          performance_fee_percent: Number(portfolioForm.performance_fee_percent),
          lock_up_period_months: Number(portfolioForm.lock_up_period_months),
          early_withdrawal_penalty_percent: Number(portfolioForm.early_withdrawal_penalty_percent),
          minimum_investment: Number(portfolioForm.minimum_investment),
        },
      })
      setNote("Portfolio created.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createRound(event) {
    event.preventDefault()
    setError("")
    setNote("")
    try {
      await apiRequest("/admin/rounds", {
        method: "POST",
        token,
        body: {
          portfolio_id: roundForm.portfolio_id,
          ...(roundForm.start_date ? { start_date: roundForm.start_date } : {}),
        },
      })
      setNote("Round created.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateKyc(userId, kycStatus) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/users/${userId}/kyc`, {
        method: "PUT",
        token,
        body: { kyc_status: kycStatus },
      })
      setNote("KYC updated.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function processWithdrawal(id, action) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/withdrawals/${id}/${action}`, {
        method: "PUT",
        token,
        body:
          action === "approve"
            ? { admin_notes: "Approved from admin workspace" }
            : { reason: "Rejected from admin workspace" },
      })
      setNote(`Withdrawal ${action}d.`)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function calculateNav(roundId) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/nav/calculate/${roundId}`, {
        method: "POST",
        token,
      })
      setNote("NAV calculated and recorded.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function closeRound(roundId) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/rounds/${roundId}/close`, {
        method: "PUT",
        token,
      })
      setNote("Round closed.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveCashLedger(event) {
    event.preventDefault()
    setError("")
    setNote("")

    const body = {
      portfolio_round_id: cashForm.portfolio_round_id,
      amount: Number(cashForm.amount),
      type: cashForm.type,
      description: cashForm.description || null,
      ...(cashForm.recorded_at ? { recorded_at: new Date(cashForm.recorded_at).toISOString() } : {}),
    }

    try {
      if (cashForm.id) {
        await apiRequest(`/admin/cash-ledger/${cashForm.id}`, {
          method: "PUT",
          token,
          body,
        })
        setNote("Cash ledger entry updated.")
      } else {
        await apiRequest("/admin/cash-ledger", {
          method: "POST",
          token,
          body,
        })
        setNote("Cash ledger entry created.")
      }

      setCashForm({
        id: "",
        portfolio_round_id: "",
        amount: "",
        type: "deposit",
        description: "",
        recorded_at: "",
      })
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteCashLedger(id) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/cash-ledger/${id}`, { method: "DELETE", token })
      setNote("Cash ledger entry deleted.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveStockAsset(event) {
    event.preventDefault()
    setError("")
    setNote("")

    const body = {
      ticker: assetForm.ticker.toUpperCase(),
      exchange: assetForm.exchange,
      company_name: assetForm.company_name,
      sector: assetForm.sector || null,
      currency: assetForm.currency.toUpperCase(),
      status: assetForm.status,
    }

    try {
      if (assetForm.id) {
        await apiRequest(`/admin/stock-assets/${assetForm.id}`, {
          method: "PUT",
          token,
          body,
        })
        setNote("Stock asset updated.")
      } else {
        await apiRequest("/admin/stock-assets", {
          method: "POST",
          token,
          body,
        })
        setNote("Stock asset created.")
      }

      setAssetForm({
        id: "",
        ticker: "",
        exchange: "",
        company_name: "",
        sector: "",
        currency: "USD",
        status: "active",
      })
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteStockAsset(id) {
    setError("")
    setNote("")
    try {
      await apiRequest(`/admin/stock-assets/${id}`, { method: "DELETE", token })
      setNote("Stock asset deleted.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      navItems={navItems}
      activePage={activePage}
      setActivePage={setActivePage}
    >
      {loading ? <p className="panel">Loading admin data...</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      {note ? <p className="alert ok">{note}</p> : null}

      {activePage === "overview" ? (
        <div className="stack">
          <section className="stats-grid">
            <StatCard label="AUM" value={currency(aum?.totalAUM)} tone="positive" />
            <StatCard label="Open Rounds" value={aum?.activeRounds || 0} />
            <StatCard label="Users" value={users.length} />
            <StatCard
              label="Pending Withdrawals"
              value={withdrawals.filter((row) => row.status === "pending").length}
              tone="attention"
            />
          </section>

          <section className="split-2">
            <article className="panel">
              <h3>Round NAV Trend</h3>
              <form className="form-grid compact">
                <label>
                  Select Round
                  <select
                    value={selectedRoundId}
                    onChange={(event) => setSelectedRoundId(event.target.value)}
                  >
                    <option value="">Select round</option>
                    {rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.portfolio?.name || "Portfolio"} - Round {round.round_number}
                      </option>
                    ))}
                  </select>
                </label>
              </form>
              <Sparkline values={navValues} />
            </article>

            <article className="panel">
              <h3>Latest Withdrawal Requests</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Units</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td>{row.user?.full_name || "-"}</td>
                        <td>{row.status}</td>
                        <td>{Number(row.units_to_redeem).toFixed(4)}</td>
                        <td>{currency(row.net_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {activePage === "portfolios" ? (
        <div className="stack">
          <section className="split-2">
            <article className="panel">
              <h3>Create Portfolio</h3>
              <form className="form-grid" onSubmit={createPortfolio}>
                <label>
                  Name
                  <input
                    required
                    value={portfolioForm.name}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Strategy
                  <input
                    required
                    value={portfolioForm.strategy_type}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        strategy_type: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Mgmt Fee %
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={portfolioForm.management_fee_percent}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        management_fee_percent: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Perf Fee %
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={portfolioForm.performance_fee_percent}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        performance_fee_percent: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Lockup Months
                  <input
                    type="number"
                    min="0"
                    value={portfolioForm.lock_up_period_months}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        lock_up_period_months: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Penalty %
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={portfolioForm.early_withdrawal_penalty_percent}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        early_withdrawal_penalty_percent: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Minimum Investment
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={portfolioForm.minimum_investment}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        minimum_investment: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Risk
                  <select
                    value={portfolioForm.risk_level}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({ ...current, risk_level: event.target.value }))
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Currency
                  <input
                    value={portfolioForm.base_currency}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        base_currency: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label className="full">
                  Description
                  <textarea
                    rows={2}
                    value={portfolioForm.description}
                    onChange={(event) =>
                      setPortfolioForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <button className="primary" type="submit">
                  Create Portfolio
                </button>
              </form>
            </article>

            <article className="panel">
              <h3>Create Round</h3>
              <form className="form-grid" onSubmit={createRound}>
                <label>
                  Portfolio
                  <select
                    required
                    value={roundForm.portfolio_id}
                    onChange={(event) =>
                      setRoundForm((current) => ({ ...current, portfolio_id: event.target.value }))
                    }
                  >
                    <option value="">Select portfolio</option>
                    {portfolios.map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>
                        {portfolio.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={roundForm.start_date}
                    onChange={(event) =>
                      setRoundForm((current) => ({ ...current, start_date: event.target.value }))
                    }
                  />
                </label>
                <button className="primary secondary-tone" type="submit">
                  Create Round
                </button>
              </form>
            </article>
          </section>

          <section className="panel">
            <h3>Rounds + NAV Actions</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Portfolio</th>
                    <th>Round</th>
                      <th>Status</th>
                      <th>Units</th>
                      <th>Cash</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map((round) => (
                      <tr key={round.id}>
                      <td>{round.portfolio?.name || "-"}</td>
                      <td>{round.round_number}</td>
                      <td>{round.status}</td>
                      <td>{Number(round.total_units_issued).toFixed(2)}</td>
                      <td>{currency(round.total_cash_collected)}</td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" onClick={() => calculateNav(round.id)}>
                            Calc NAV
                          </button>
                          {round.status === "open" ? (
                            <button type="button" onClick={() => closeRound(round.id)}>
                              Close
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activePage === "users" ? (
        <section className="panel">
          <h3>User Management + KYC</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>KYC</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.full_name}</td>
                    <td>{row.email}</td>
                    <td>{row.role}</td>
                    <td>{row.status}</td>
                    <td>{row.kyc_status}</td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" onClick={() => updateKyc(row.id, "verified")}>
                          Verify
                        </button>
                        <button type="button" onClick={() => updateKyc(row.id, "pending")}>
                          Pending
                        </button>
                        <button type="button" onClick={() => updateKyc(row.id, "rejected")}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activePage === "withdrawals" ? (
        <section className="panel">
          <h3>Withdrawal Queue</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Units</th>
                  <th>Gross</th>
                  <th>Fees</th>
                  <th>Net</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user?.full_name || "-"}</td>
                    <td>{row.status}</td>
                    <td>{Number(row.units_to_redeem).toFixed(4)}</td>
                    <td>{currency(row.gross_amount)}</td>
                    <td>{currency(row.total_fees)}</td>
                    <td>{currency(row.net_amount)}</td>
                    <td>
                      {row.status === "pending" ? (
                        <div className="inline-actions">
                          <button type="button" onClick={() => processWithdrawal(row.id, "approve")}>
                            Approve
                          </button>
                          <button type="button" onClick={() => processWithdrawal(row.id, "reject")}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        "Processed"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activePage === "operations" ? (
        <div className="stack">
          <section className="stats-grid">
            <StatCard label="Cash Ledger Rows" value={operations.cashLedger.length} />
            <StatCard label="Fee Records" value={operations.feeRecords.length} />
            <StatCard label="Contracts" value={operations.contracts.length} />
            <StatCard label="Stock Assets" value={operations.stockAssets.length} />
          </section>

          <section className="split-2">
            <article className="panel">
              <h3>Cash Ledger CRUD</h3>
              <form className="form-grid" onSubmit={saveCashLedger}>
                <label>
                  Round
                  <select
                    required
                    value={cashForm.portfolio_round_id}
                    onChange={(event) =>
                      setCashForm((current) => ({ ...current, portfolio_round_id: event.target.value }))
                    }
                  >
                    <option value="">Select round</option>
                    {rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.portfolio?.name || "Portfolio"} - Round {round.round_number}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cashForm.amount}
                    onChange={(event) =>
                      setCashForm((current) => ({ ...current, amount: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Type
                  <select
                    value={cashForm.type}
                    onChange={(event) =>
                      setCashForm((current) => ({ ...current, type: event.target.value }))
                    }
                  >
                    <option value="deposit">deposit</option>
                    <option value="withdrawal">withdrawal</option>
                    <option value="fee">fee</option>
                    <option value="trade">trade</option>
                    <option value="dividend">dividend</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label>
                  Recorded At
                  <input
                    type="datetime-local"
                    value={cashForm.recorded_at}
                    onChange={(event) =>
                      setCashForm((current) => ({ ...current, recorded_at: event.target.value }))
                    }
                  />
                </label>
                <label className="full">
                  Description
                  <input
                    value={cashForm.description}
                    onChange={(event) =>
                      setCashForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </label>
                <button className="primary" type="submit">
                  {cashForm.id ? "Update Entry" : "Create Entry"}
                </button>
              </form>
            </article>

            <article className="panel">
              <h3>Stock Asset CRUD</h3>
              <form className="form-grid" onSubmit={saveStockAsset}>
                <label>
                  Ticker
                  <input
                    required
                    value={assetForm.ticker}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, ticker: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Exchange
                  <input
                    required
                    value={assetForm.exchange}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, exchange: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Company Name
                  <input
                    required
                    value={assetForm.company_name}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, company_name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Sector
                  <input
                    value={assetForm.sector}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, sector: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Currency
                  <input
                    value={assetForm.currency}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, currency: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={assetForm.status}
                    onChange={(event) =>
                      setAssetForm((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="delisted">delisted</option>
                  </select>
                </label>
                <button className="primary secondary-tone" type="submit">
                  {assetForm.id ? "Update Asset" : "Create Asset"}
                </button>
              </form>
            </article>
          </section>

          <section className="split-2">
            <article className="panel">
              <h3>Latest Cash Ledger</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Round</th>
                      <th>Amount</th>
                      <th>Recorded</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.cashLedger.slice(0, 8).map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.type}</td>
                        <td>{entry.portfolio_round_id?.slice(0, 8)}</td>
                        <td>{currency(entry.amount)}</td>
                        <td>{shortDate(entry.recorded_at)}</td>
                        <td>
                          <div className="inline-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setCashForm({
                                  id: entry.id,
                                  portfolio_round_id: entry.portfolio_round_id,
                                  amount: String(entry.amount),
                                  type: entry.type,
                                  description: entry.description || "",
                                  recorded_at: entry.recorded_at
                                    ? new Date(entry.recorded_at).toISOString().slice(0, 16)
                                    : "",
                                })
                              }
                            >
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteCashLedger(entry.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <h3>Latest Fee Records</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Charged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.feeRecords.slice(0, 8).map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.fee_type}</td>
                        <td>{currency(entry.amount)}</td>
                        <td>{shortDate(entry.charged_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="panel">
            <h3>Stock Assets</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Exchange</th>
                    <th>Company</th>
                    <th>Sector</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.stockAssets.slice(0, 20).map((asset) => (
                    <tr key={asset.id}>
                      <td>{asset.ticker}</td>
                      <td>{asset.exchange}</td>
                      <td>{asset.company_name}</td>
                      <td>{asset.sector || "-"}</td>
                      <td>{asset.status}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setAssetForm({
                                id: asset.id,
                                ticker: asset.ticker,
                                exchange: asset.exchange,
                                company_name: asset.company_name,
                                sector: asset.sector || "",
                                currency: asset.currency || "USD",
                                status: asset.status || "active",
                              })
                            }
                          >
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteStockAsset(asset.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  )
}
