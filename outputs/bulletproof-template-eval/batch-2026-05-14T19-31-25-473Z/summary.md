# Cash-flow template batch evaluation

Generated at: 2026-05-14T19:37:27.803Z

Expected inflows: 446500
Expected outflows: 217925
Expected net cash flow: 228575

| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| direct_method_cash_flow_challenging_2026.xlsx | failed | 5 | 150888 | 211384 | 6 | 8 | 12 |

## Failures

### direct_method_cash_flow_challenging_2026.xlsx
- template analyzer needs review: LLM bucket decision for "proceeds_from_retired_kit_and_fixtures" needs review.; LLM did not provide canonical semantic labels for direct buckets: proceeds_from_retired_kit_and_fixtures.; Direct cash-flow bucket bindings missing canonical semantic labels: proceeds_from_retired_kit_and_fixtures
- report total_outflows mismatch: expected 217925, got 199245
- report net_cash_flow mismatch: expected 228575, got 247255
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for interest expense:outflow; expected interest_paid
