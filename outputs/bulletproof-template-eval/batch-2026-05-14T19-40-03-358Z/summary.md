# Cash-flow template batch evaluation

Generated at: 2026-05-14T19:45:14.077Z

Expected inflows: 446500
Expected outflows: 217925
Expected net cash flow: 228575

| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| direct_method_cash_flow_challenging_2026.xlsx | failed | 4 | 83439 | 227223 | 6 | 8 | 12 |

## Failures

### direct_method_cash_flow_challenging_2026.xlsx
- report total_outflows mismatch: expected 217925, got 199245
- report net_cash_flow mismatch: expected 228575, got 247255
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for interest expense:outflow; expected interest_paid
