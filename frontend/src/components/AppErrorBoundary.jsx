import { Component } from "react"

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error("Application render failed", error, info)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="auth-root">
        <section className="panel stack">
          <h1>Something went wrong</h1>
          <p className="muted">
            The page hit a render error. Reloading usually recovers the workspace without losing saved data.
          </p>
          {import.meta.env.DEV && (
            <pre className="error-details">
              {this.state.error?.message || "Unknown render error"}
              {this.state.info?.componentStack ? `\n${this.state.info.componentStack}` : ""}
            </pre>
          )}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </section>
      </main>
    )
  }
}
