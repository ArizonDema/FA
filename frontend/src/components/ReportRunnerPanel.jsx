import { CapitalAccountStatementsPanel } from "./CapitalAccountStatementsPanel"
import { CashFlowExtractorPanel } from "./CashFlowExtractorPanel"

export function ReportRunnerPanel({ reportKind, onReportKindChange, cashFlowProps, casProps }) {
  return (
    <section className="stack report-runner-workspace">
      <section className="panel report-type-selector">
        <div>
          <p className="kicker">Report Builder</p>
          <h2>Run Reports</h2>
          <p className="muted small">Choose the report you want to prepare for the active fund.</p>
        </div>
        <label className="report-type-field">
          Report type
          <select value={reportKind} onChange={(event) => onReportKindChange(event.target.value)}>
            <option value="cash_flow">Cash Flow</option>
            <option value="capital_account_statement">Capital Account Statements (CAS)</option>
          </select>
        </label>
      </section>

      {reportKind === "capital_account_statement" ? (
        <CapitalAccountStatementsPanel {...casProps} />
      ) : (
        <CashFlowExtractorPanel {...cashFlowProps} />
      )}
    </section>
  )
}
