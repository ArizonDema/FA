import { API_DOCS_URL } from "../api"

export function AppShell({ user, onLogout, navItems, activePage, setActivePage, children }) {
  return (
    <main className="app-root">
      <aside className="sidebar">
        <div>
          <p className="kicker">CSS Invest</p>
          <h2>{user.role.toUpperCase()} Workspace</h2>
          <p className="muted small">{user.full_name}</p>
          <p className="muted small">KYC: {user.kyc_status}</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setActivePage(item.key)}
              className={activePage === item.key ? "nav-btn active" : "nav-btn"}
            >
              {item.label}
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
