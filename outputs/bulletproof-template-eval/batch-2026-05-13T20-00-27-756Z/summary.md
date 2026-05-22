# Cash-flow template batch evaluation

Generated at: 2026-05-13T20:15:14.433Z

Expected inflows: 446500
Expected outflows: 217925
Expected net cash flow: 228575

| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| direct_method_cash_flow_challenging_2026.xlsx | failed | 4 | 673496 | 213128 | 3 | 10 | 6 |

## Failures

### direct_method_cash_flow_challenging_2026.xlsx
- template analyzer needs review: LLM bucket decision for "receipts_settlement_lagged_trade_takings" needs review.; LLM bucket decision for "receipts_retainer_drawdowns_released" needs review.; LLM bucket decision for "bank_fees_rounding_and_timing_wash" needs review.; LLM did not provide canonical semantic labels for direct buckets: receipts_settlement_lagged_trade_takings, receipts_retainer_drawdowns_released, bank_fees_rounding_and_timing_wash.; Direct cash-flow bucket bindings missing canonical semantic labels: receipts_settlement_lagged_trade_takings, receipts_retainer_drawdowns_released, bank_fees_rounding_and_timing_wash
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for notes payable:outflow; expected debt_repayment
- missing mapping assignment for interest expense:outflow; expected interest_paid
