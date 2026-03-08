import { useState } from "react"
import { apiRequest } from "../api"

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
      <section className="auth-card">
        <p className="kicker">Fund Accounting Platform</p>
        <h1>CSS Invest Console</h1>
        <p className="muted">Role-based operations for investors and admins.</p>

        <div className="tab-row">
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
          <form className="form-grid" onSubmit={submitLogin}>
            <label>
              Email
              <input
                type="email"
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
          <form className="form-grid" onSubmit={submitRegister}>
            <label>
              Full Name
              <input
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
                value={registerForm.phone_number}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, phone_number: event.target.value }))
                }
              />
            </label>
            <label>
              Country
              <input
                value={registerForm.country}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, country: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Creating..." : "Create Account"}
            </button>
          </form>
        )}

        {error ? <p className="alert error">{error}</p> : null}
        <p className="muted small">Demo login password: Password123!</p>
      </section>
    </main>
  )
}
