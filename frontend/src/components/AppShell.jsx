import { API_DOCS_URL } from "../api"

export function AppShell({ user, onLogout, navItems, activePage, setActivePage, children }) {
  return (
    <main className="app-root">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">FA</div>
          <div>
            <p className="kicker">CSS Invest</p>
            <h2>{user.role === "admin" ? "Reporting Studio" : "Investor Workspace"}</h2>
          </div>
        </div>

        <div className="user-block">
          <p className="muted small">{user.full_name}</p>
          <span className="status-chip">KYC {user.kyc_status}</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setActivePage(item.key)}
              className={activePage === item.key ? "nav-btn active" : "nav-btn"}
            >
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
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

      <section className="content">{children}</section>
    </main>
  )
}
