import { useCallback, useEffect, useMemo, useState } from "react"
import { apiRequest, currency, percent, shortDate } from "../api"
import { AppShell } from "./AppShell"
import { StatCard } from "./StatCard"
import { Sparkline } from "./Sparkline"

export function InvestorWorkspace({ token, user, onLogout, onUserUpdate }) {
  const navItems = [
    { key: "overview", label: "Overview" },
    { key: "invest", label: "Invest" },
    { key: "portfolios", label: "Portfolios + NAV" },
    { key: "withdrawals", label: "Withdrawals" },
    { key: "account", label: "Account" },
  ]

  const [activePage, setActivePage] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [portfolios, setPortfolios] = useState([])
  const [rounds, setRounds] = useState([])
  const [investments, setInvestments] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedRoundId, setSelectedRoundId] = useState("")
  const [navHistory, setNavHistory] = useState([])
  const [selectedInvestmentId, setSelectedInvestmentId] = useState("")
  const [investmentDetail, setInvestmentDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [investForm, setInvestForm] = useState({ portfolio_round_id: "", amount: "1000" })
  const [withdrawForm, setWithdrawForm] = useState({ investment_contract_id: "", units_to_redeem: "1" })
  const [profileForm, setProfileForm] = useState({
    full_name: user.full_name || "",
    phone_number: user.phone_number || "",
    country: user.country || "",
    state: user.state || "",
    residential_address: user.residential_address || "",
    next_of_kin_name: user.next_of_kin_name || "",
    next_of_kin_contact: user.next_of_kin_contact || "",
    source_of_funds: user.source_of_funds || "",
  })

  const availableContracts = useMemo(
    () => investments.filter((investment) => Number(investment.units_remaining) > 0),
    [investments],
  )

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
      const [portfolioData, roundData, investmentData, statsData, withdrawalData, meData] =
        await Promise.all([
          apiRequest("/investor/portfolios", { token }),
          apiRequest("/investor/rounds", { token }),
          apiRequest("/investor/investments", { token }),
          apiRequest("/investor/statistics", { token }),
          apiRequest("/investor/withdrawals", { token }),
          apiRequest("/auth/me", { token }),
        ])

      const nextRounds = roundData.data.rounds || []
      setPortfolios(portfolioData.data.portfolios || [])
      setRounds(nextRounds)
      setInvestments(investmentData.data.investments || [])
      setWithdrawals(withdrawalData.data.withdrawals || [])
      setStats(statsData.data.statistics || null)

      const serverUser = meData.data.user
      onUserUpdate(serverUser)
      setProfileForm({
        full_name: serverUser.full_name || "",
        phone_number: serverUser.phone_number || "",
        country: serverUser.country || "",
        state: serverUser.state || "",
        residential_address: serverUser.residential_address || "",
        next_of_kin_name: serverUser.next_of_kin_name || "",
        next_of_kin_contact: serverUser.next_of_kin_contact || "",
        source_of_funds: serverUser.source_of_funds || "",
      })

      if (!selectedRoundId && nextRounds.length > 0) {
        setSelectedRoundId(nextRounds[0].id)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [token, onUserUpdate, selectedRoundId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedRoundId) return
    apiRequest(`/investor/nav-history/${selectedRoundId}`, { token })
      .then((response) => setNavHistory(response.data.history || []))
      .catch(() => setNavHistory([]))
  }, [token, selectedRoundId])

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

  async function submitInvestment(event) {
    event.preventDefault()
    setError("")
    setNote("")
    try {
      await apiRequest("/investor/invest", {
        method: "POST",
        token,
        body: {
          portfolio_round_id: investForm.portfolio_round_id,
          amount: Number(investForm.amount),
        },
      })
      setNote("Investment submitted.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function submitWithdrawal(event) {
    event.preventDefault()
    setError("")
    setNote("")
    try {
      await apiRequest("/investor/withdraw", {
        method: "POST",
        token,
        body: {
          investment_contract_id: withdrawForm.investment_contract_id,
          units_to_redeem: Number(withdrawForm.units_to_redeem),
        },
      })
      setNote("Withdrawal submitted.")
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveProfile(event) {
    event.preventDefault()
    setError("")
    setNote("")
    try {
      const response = await apiRequest("/auth/profile", {
        method: "PUT",
        token,
        body: profileForm,
      })
      onUserUpdate(response.data.user)
      setNote("Profile updated.")
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function openInvestmentDetail(investmentId) {
    setSelectedInvestmentId(investmentId)
    setDetailLoading(true)
    setError("")
    try {
      const response = await apiRequest(`/investor/investments/${investmentId}`, { token })
      setInvestmentDetail(response.data.investment || null)
    } catch (requestError) {
      setError(requestError.message)
      setInvestmentDetail(null)
    } finally {
      setDetailLoading(false)
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
      {loading ? <p className="panel">Loading investor data...</p> : null}
      {error ? (
        <div className="alert error inline-actions" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}
      {note ? (
        <div className="alert ok inline-actions" role="status">
          <span>{note}</span>
          <button type="button" onClick={() => setNote("")}>
            ×
          </button>
        </div>
      ) : null}

      {activePage === "overview" ? (
        <div className="stack">
          <section className="stats-grid">
            <StatCard label="Total Invested" value={currency(stats?.totalInvested)} />
            <StatCard label="Current Value" value={currency(stats?.currentValue)} tone="positive" />
            <StatCard label="Total Profit" value={currency(stats?.totalProfit)} />
            <StatCard label="Overall Return" value={percent(stats?.overallReturn)} tone="positive" />
          </section>

          <section className="split-2">
            <article className="panel">
              <h3>Recent Investments</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Portfolio</th>
                      <th>Status</th>
                      <th>Invested</th>
                      <th>Current</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.slice(0, 8).map((investment) => (
                      <tr key={investment.id}>
                        <td>{investment.round?.portfolio?.name || "-"}</td>
                        <td>{investment.status}</td>
                        <td>{currency(investment.invested_amount)}</td>
                        <td>{currency(investment.currentValue)}</td>
                        <td>
                          <button type="button" onClick={() => openInvestmentDetail(investment.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
              <h3>NAV Trend (Selected Round)</h3>
              <Sparkline values={navValues} />
            </article>
          </section>

          {selectedInvestmentId ? (
            <section className="panel">
              <h3>Investment Detail</h3>
              {detailLoading ? <p className="muted">Loading detail...</p> : null}
              {investmentDetail ? (
                <div className="stack">
                  <div className="split-2">
                    <div>
                      <p className="small">Portfolio</p>
                      <strong>{investmentDetail.round?.portfolio?.name || "-"}</strong>
                    </div>
                    <div>
                      <p className="small">Status</p>
                      <strong>{investmentDetail.status}</strong>
                    </div>
                    <div>
                      <p className="small">Units Issued</p>
                      <strong>{Number(investmentDetail.units_issued).toFixed(4)}</strong>
                    </div>
                    <div>
                      <p className="small">Units Remaining</p>
                      <strong>{Number(investmentDetail.units_remaining).toFixed(4)}</strong>
                    </div>
                  </div>

                  <div className="split-2">
                    <article className="panel">
                      <h4>Unit Ledger Entries</h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Units</th>
                              <th>NAV</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(investmentDetail.unitEntries || []).map((entry) => (
                              <tr key={entry.id}>
                                <td>{entry.type}</td>
                                <td>{Number(entry.units).toFixed(4)}</td>
                                <td>{Number(entry.nav).toFixed(6)}</td>
                                <td>{shortDate(entry.event_date)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>

                    <article className="panel">
                      <h4>Fee Records</h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Amount</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(investmentDetail.fees || []).map((fee) => (
                              <tr key={fee.id}>
                                <td>{fee.fee_type}</td>
                                <td>{currency(fee.amount)}</td>
                                <td>{shortDate(fee.charged_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInvestmentId("")
                      setInvestmentDetail(null)
                    }}
                  >
                    Close Detail
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {activePage === "invest" ? (
        <section className="split-2">
          <article className="panel">
            <h3>Create Investment</h3>
            {user.kyc_status !== "verified" ? (
              <p className="alert warn">KYC is {user.kyc_status}. Investing is blocked.</p>
            ) : null}
            <form className="form-grid" onSubmit={submitInvestment}>
              <label>
                Round
                <select
                  required
                  value={investForm.portfolio_round_id}
                  onChange={(event) =>
                    setInvestForm((current) => ({
                      ...current,
                      portfolio_round_id: event.target.value,
                    }))
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
                  min="100"
                  step="0.01"
                  required
                  value={investForm.amount}
                  onChange={(event) =>
                    setInvestForm((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <button type="submit" className="primary">
                Submit Investment
              </button>
            </form>
          </article>

          <article className="panel">
            <h3>Open Rounds</h3>
            <ul className="chip-list">
              {rounds.map((round) => (
                <li key={round.id}>
                  {round.portfolio?.name || "Portfolio"} | Round {round.round_number} | NAV{" "}
                  {Number(round.current_nav).toFixed(4)}
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}

      {activePage === "portfolios" ? (
        <div className="stack">
          <section className="panel">
            <h3>NAV History</h3>
            <form className="form-grid compact">
              <label>
                Round
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>NAV</th>
                    <th>Value</th>
                    <th>Cash</th>
                    <th>Market</th>
                  </tr>
                </thead>
                <tbody>
                  {navHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{shortDate(entry.recorded_at)}</td>
                      <td>{Number(entry.nav).toFixed(6)}</td>
                      <td>{currency(entry.portfolio_value)}</td>
                      <td>{currency(entry.cash_balance)}</td>
                      <td>{currency(entry.market_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Portfolio List</h3>
            <div className="cards-grid">
              {portfolios.map((portfolio) => (
                <article key={portfolio.id} className="mini-card">
                  <h4>{portfolio.name}</h4>
                  <p className="muted">{portfolio.description}</p>
                  <p className="small">Risk: {portfolio.risk_level}</p>
                  <p className="small">Min: {currency(portfolio.minimum_investment)}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activePage === "withdrawals" ? (
        <div className="stack">
          <section className="split-2">
            <article className="panel">
              <h3>Request Withdrawal</h3>
              <form className="form-grid" onSubmit={submitWithdrawal}>
                <label>
                  Contract
                  <select
                    required
                    value={withdrawForm.investment_contract_id}
                    onChange={(event) =>
                      setWithdrawForm((current) => ({
                        ...current,
                        investment_contract_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select contract</option>
                    {availableContracts.map((investment) => (
                      <option key={investment.id} value={investment.id}>
                        {investment.round?.portfolio?.name || "Portfolio"} | Units{" "}
                        {Number(investment.units_remaining).toFixed(4)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Units
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={withdrawForm.units_to_redeem}
                    onChange={(event) =>
                      setWithdrawForm((current) => ({
                        ...current,
                        units_to_redeem: event.target.value,
                      }))
                    }
                  />
                </label>
                <button className="primary secondary-tone" type="submit">
                  Submit Withdrawal
                </button>
              </form>
            </article>

            <article className="panel">
              <h3>Withdrawal Requests</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Units</th>
                      <th>Gross</th>
                      <th>Fees</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((withdrawal) => (
                      <tr key={withdrawal.id}>
                        <td>{withdrawal.status}</td>
                        <td>{shortDate(withdrawal.requested_at)}</td>
                        <td>{Number(withdrawal.units_to_redeem).toFixed(4)}</td>
                        <td>{currency(withdrawal.gross_amount)}</td>
                        <td>{currency(withdrawal.total_fees)}</td>
                        <td>{currency(withdrawal.net_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {activePage === "account" ? (
        <section className="panel">
          <h3>Account Profile</h3>
          <form className="form-grid" onSubmit={saveProfile}>
            <label>
              Full Name
              <input
                value={profileForm.full_name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, full_name: event.target.value }))
                }
              />
            </label>
            <label>
              Phone
              <input
                value={profileForm.phone_number}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, phone_number: event.target.value }))
                }
              />
            </label>
            <label>
              Country
              <input
                value={profileForm.country}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, country: event.target.value }))
                }
              />
            </label>
            <label>
              State
              <input
                value={profileForm.state}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, state: event.target.value }))
                }
              />
            </label>
            <label className="full">
              Residential Address
              <textarea
                rows={2}
                value={profileForm.residential_address}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    residential_address: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Next of Kin
              <input
                value={profileForm.next_of_kin_name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, next_of_kin_name: event.target.value }))
                }
              />
            </label>
            <label>
              Next of Kin Contact
              <input
                value={profileForm.next_of_kin_contact}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    next_of_kin_contact: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Source of Funds
              <input
                value={profileForm.source_of_funds}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, source_of_funds: event.target.value }))
                }
              />
            </label>
            <button className="primary" type="submit">
              Save Profile
            </button>
          </form>
        </section>
      ) : null}
    </AppShell>
  )
}
