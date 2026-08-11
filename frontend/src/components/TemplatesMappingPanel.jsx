import { CapitalAccountTemplatesPanel } from "./CapitalAccountTemplatesPanel"
import { CashFlowTemplatesPanel } from "./CashFlowTemplatesPanel"

export function TemplatesMappingPanel({ activeTab, onTabChange, ...props }) {
  return (
    <section className="stack templates-mapping-workspace">
      <div className="template-kind-tabs" role="tablist" aria-label="Template report type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "cash_flow"}
          className={`template-kind-tab ${activeTab === "cash_flow" ? "active" : ""}`}
          onClick={() => onTabChange("cash_flow")}
        >
          <span className="template-kind-tab-label">Cash Flow</span>
          <span className="template-kind-tab-description">Templates &amp; mappings</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "capital_account_statement"}
          className={`template-kind-tab ${activeTab === "capital_account_statement" ? "active" : ""}`}
          onClick={() => onTabChange("capital_account_statement")}
        >
          <span className="template-kind-tab-label">Capital Account Statements</span>
          <span className="template-kind-tab-description">CAS templates &amp; mappings</span>
        </button>
      </div>
      {activeTab === "cash_flow" ? <CashFlowTemplatesPanel {...props} /> : <CapitalAccountTemplatesPanel {...props} />}
    </section>
  )
}
