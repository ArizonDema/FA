# Cash-flow template batch evaluation

Generated at: 2026-05-14T19:21:00.060Z

Expected inflows: 446500
Expected outflows: 217925
Expected net cash flow: 228575

| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| deliberately_challenging_direct_method_cash_flow_2026.xlsx | failed | 1 | 5 | 0 |  |  |  |
| direct_method_cash_flow_challenging_2026.xlsx | failed | 4 | 89264 | 245578 | 6 | 8 | 0 |
| agent3_direct_method_cash_flow_2026_challenging.xlsx | failed | 1 | 4 | 0 |  |  |  |
| direct_method_cash_flow_challenge_2026.xlsx | failed | 9 | 387291 | 203488 | 6 | 4 | 0 |
| agent-5-direct-method-cash-flow-template.xlsx | failed | 22 | 433095 | 139 | 0 | 0 | 0 |
| unbiased-cash-flow-template-2026.xlsx | failed | 7 | 763384 | 230994 | 6 | 6 | 0 |

## Failures

### deliberately_challenging_direct_method_cash_flow_2026.xlsx
- template ingestion failed: Template workbook has no worksheets

### direct_method_cash_flow_challenging_2026.xlsx
- report total_outflows mismatch: expected 217925, got 199245
- report net_cash_flow mismatch: expected 228575, got 247255
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for interest expense:outflow; expected interest_paid

### agent3_direct_method_cash_flow_2026_challenging.xlsx
- template ingestion failed: 22:84: disallowed character in closing tag.

### direct_method_cash_flow_challenge_2026.xlsx
- report total_inflows mismatch: expected 446500, got 311500
- report total_outflows mismatch: expected 217925, got 160785
- report net_cash_flow mismatch: expected 228575, got 150715
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for office equipment:outflow; expected capital_expenditures
- missing mapping assignment for notes payable:outflow; expected debt_repayment
- missing mapping assignment for interest expense:outflow; expected interest_paid
- missing mapping assignment for owner capital:inflow; expected equity_injection
- missing mapping assignment for owner drawings:outflow; expected dividends_distributions

### agent-5-direct-method-cash-flow-template.xlsx
- template analyzer did not finish on an LLM source: fallback
- template analyzer needs review: LLM output could not be validated after retries. Human review is required before confirming this template.; No direct outflow bucket rows were detected.; Several direct bucket labels need semantic review: CF-10, CF-20, CF-30, CF-40.; Layout decision did not identify any usable period labels; Ollama request timed out after 120000ms
- template LLM timeout marker found
- report total_inflows mismatch: expected 446500, got 0
- report total_outflows mismatch: expected 217925, got 0
- report net_cash_flow mismatch: expected 228575, got 0
- missing mapping assignment for accounts receivable:inflow; expected customer_receipts
- missing mapping assignment for unearned revenue:inflow; expected customer_receipts
- missing mapping assignment for accounts payable:outflow; expected supplier_payments
- missing mapping assignment for salaries expense:outflow; expected payroll
- missing mapping assignment for rent expense:outflow; expected rent_facilities
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for bank fees expense:outflow; expected general_admin
- missing mapping assignment for prepaid insurance:outflow; expected general_admin
- missing mapping assignment for travel expense:outflow; expected general_admin
- missing mapping assignment for utilities expense:outflow; expected general_admin
- missing mapping assignment for office equipment:outflow; expected capital_expenditures
- missing mapping assignment for notes payable:inflow; expected debt_drawdown
- missing mapping assignment for notes payable:outflow; expected debt_repayment
- missing mapping assignment for interest expense:outflow; expected interest_paid
- missing mapping assignment for owner capital:inflow; expected equity_injection
- missing mapping assignment for owner drawings:outflow; expected dividends_distributions

### unbiased-cash-flow-template-2026.xlsx
- template analyzer needs review: Opening balance target not detected. It will be skipped unless you map it manually.; Closing balance target not detected. It will be skipped unless you map it manually.
- report total_outflows mismatch: expected 217925, got 178785
- report net_cash_flow mismatch: expected 228575, got 267715
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for notes payable:outflow; expected debt_repayment
- missing mapping assignment for interest expense:outflow; expected interest_paid
- missing mapping assignment for owner drawings:outflow; expected dividends_distributions
