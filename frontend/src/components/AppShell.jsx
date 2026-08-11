import { API_DOCS_URL } from "../api"
import { BrandLockup } from "./BrandLogo"

export function AppShell({ user, onLogout, navItems, activePage, setActivePage, children }) {
  const isAdmin = user.role === "admin"
  const activeItem = navItems.find((item) => item.key === activePage)
  const initials = (user.full_name || "Navicera User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
  const kycState = String(user.kyc_status || "pending").toLowerCase()

  return (
    <main className={isAdmin ? "app-root admin-shell" : "app-root investor-shell"}>
      <aside className="sidebar">
        <div className="brand-block">
          <BrandLockup context="Fund reporting, under control." compact />
        </div>

        <div className="user-block">
          <span className="user-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="user-identity">
            <strong>{user.full_name}</strong>
            <small>{isAdmin ? "Fund administrator" : "Investor workspace"}</small>
          </span>
          <span className={`status-chip status-${kycState}`}>KYC {kycState}</span>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {navItems.map((item, index) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setActivePage(item.key)}
              className={activePage === item.key ? "nav-btn active" : "nav-btn"}
              aria-current={activePage === item.key ? "page" : undefined}
            >
              <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="nav-copy">
                <span>{item.label}</span>
                {item.description && <small>{item.description}</small>}
              </span>
              <span className="nav-active-indicator" aria-hidden="true" />
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
            API Docs
          </a>
          <button type="button" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="workspace-topbar">
          <div>
            <p className="kicker">{isAdmin ? "Administrator control room" : "Investor portfolio"}</p>
            <p className="workspace-topbar-title">{activeItem?.label || "Workspace"}</p>
          </div>
          <span className="system-state">
            <i aria-hidden="true" />
            Controlled workspace
          </span>
        </header>
        {children}
      </section>
    </main>
  )
}
