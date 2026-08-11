import { useState } from "react"
import { apiRequest } from "../api"
import { BrandLockup } from "./BrandLogo"

export function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [registerForm, setRegisterForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone_number: "",
    country: "United States",
  })

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await apiRequest("/auth/login", { method: "POST", body: loginForm })
      onAuth(response.data.token, response.data.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister(event) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await apiRequest("/auth/register", { method: "POST", body: registerForm })
      onAuth(response.data.token, response.data.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-root">
      <div className="auth-shell">
        <section className="auth-brand-panel">
          <BrandLockup context="Fund reporting, under control." />
          <div className="auth-brand-message">
            <p className="kicker">The reporting control tower</p>
            <h1>One governed path from source data to signed-off reporting.</h1>
            <p>
              Turn trial balances, ledgers, LPAs, and templates into controlled,
              reviewable, audit-ready fund reports.
            </p>
          </div>
          <div className="auth-proof-list">
            <div>
              <span>01</span>
              <p>
                <strong>Controlled</strong>
                Source-to-report lineage stays visible.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Reviewable</strong>
                AI suggestions keep human approval in view.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Audit-ready</strong>
                Every decision carries evidence and status.
              </p>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-heading">
            <p className="kicker">Secure workspace</p>
            <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="muted">
              {mode === "login"
                ? "Sign in to continue to your Navicera workspace."
                : "Set up investor access to the controlled reporting workspace."}
            </p>
          </div>

          <div className="tab-row" aria-label="Authentication mode">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={mode === "login" ? "tab active" : "tab"}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={mode === "register" ? "tab active" : "tab"}
            >
              Register
            </button>
          </div>

          {mode === "login" ? (
            <form className="form-grid auth-form" onSubmit={submitLogin}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  required
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form className="form-grid auth-form" onSubmit={submitRegister}>
              <label>
                Full Name
                <input
                  autoComplete="name"
                  required
                  value={registerForm.full_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, full_name: event.target.value }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={registerForm.email}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={registerForm.password}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <label>
                Phone
                <input
                  autoComplete="tel"
                  value={registerForm.phone_number}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, phone_number: event.target.value }))
                  }
                />
              </label>
              <label className="full">
                Country
                <input
                  autoComplete="country-name"
                  value={registerForm.country}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, country: event.target.value }))
                  }
                />
              </label>
              <button type="submit" className="primary full" disabled={busy}>
                {busy ? "Creating..." : "Create Account"}
              </button>
            </form>
          )}

          {error ? <p className="alert error">{error}</p> : null}
          <div className="auth-card-foot">
            <p className="muted small">Demo password: Password123!</p>
            <span>Controlled · Reviewable · Audit-ready</span>
          </div>
        </section>
      </div>
    </main>
  )
}
