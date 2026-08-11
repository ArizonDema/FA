import { useCallback, useEffect, useState } from "react"
import { apiRequest } from "./api"
import { AuthScreen } from "./components/AuthScreen"
import { InvestorWorkspace } from "./components/InvestorWorkspace"
import { AdminWorkspace } from "./components/AdminWorkspace"
import { BrandLockup } from "./components/BrandLogo"

const STORAGE_KEY = "css_invest_auth"

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(token, user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function App() {
  const initial = readSession()
  const [token, setToken] = useState(initial?.token || "")
  const [user, setUser] = useState(initial?.user || null)
  const [checking, setChecking] = useState(Boolean(initial?.token))

  const onAuth = useCallback((nextToken, nextUser) => {
    setToken(nextToken)
    setUser(nextUser)
    saveSession(nextToken, nextUser)
  }, [])

  const onUserUpdate = useCallback(
    (nextUser) => {
      setUser(nextUser)
      if (token) {
        saveSession(token, nextUser)
      }
    },
    [token],
  )

  const onLogout = useCallback(() => {
    setToken("")
    setUser(null)
    clearSession()
  }, [])

  useEffect(() => {
    let mounted = true

    if (!token) {
      setChecking(false)
      return () => {}
    }

    apiRequest("/auth/me", { token })
      .then((response) => {
        if (!mounted) return
        setUser(response.data.user)
        saveSession(token, response.data.user)
        setChecking(false)
      })
      .catch(() => {
        if (!mounted) return
        onLogout()
        setChecking(false)
      })

    return () => {
      mounted = false
    }
  }, [token, onLogout])

  if (checking) {
    return (
      <main className="auth-root session-loading">
        <BrandLockup context="Securing your workspace…" />
      </main>
    )
  }

  if (!token || !user) {
    return <AuthScreen onAuth={onAuth} />
  }

  if (user.role === "admin") {
    return <AdminWorkspace token={token} user={user} onLogout={onLogout} />
  }

  return (
    <InvestorWorkspace
      token={token}
      user={user}
      onLogout={onLogout}
      onUserUpdate={onUserUpdate}
    />
  )
}
