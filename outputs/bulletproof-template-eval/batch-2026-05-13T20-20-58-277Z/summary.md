# Cash-flow template batch evaluation

Generated at: 2026-05-13T20:29:53.313Z

Expected inflows: 446500
Expected outflows: 217925
Expected net cash flow: 228575

| Template | Status | Failures | Ingestion ms | Report ms | LLM accepted | Profile auto | Review required |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| direct_method_cash_flow_challenging_2026.xlsx | failed | 8 | 298541 | 236447 | 4 | 10 | 4 |

## Failures

### direct_method_cash_flow_challenging_2026.xlsx
- template analyzer needs review: LLM semantic repair failed; deterministic semantic bindings were preserved.; Direct cash-flow bucket bindings missing canonical semantic labels: receipts_settlement_lagged_trade_takings, receipts_retainer_drawdowns_released, receipts_merchant_service_rebates_cleared, receipts_insurance_recovery_cash, payments_rostered_crew_disbursements, payments_premises_and_yard_occupancy, payments_utility_and_connectivity_clearings, payments_stock_replenishment_wires, payments_freight_duties_and_landing_charges, payments_tax_authority_sweeps, payments_claims_refunds_and_make_good_credits, payments_professional_bench_and_licenses, equipment_refresh_and_fit_out_checks, proceeds_from_retired_kit_and_fixtures, investment_in_pledged_term_deposits, release_of_pledged_term_deposits, borrowing_draws_booked_at_treasury, lender_principal_retirements, member_capital_subscriptions_banked, partner_preference_redemptions_paid, bank_fees_rounding_and_timing_wash
- template LLM timeout marker found
- missing mapping assignment for accounts receivable:inflow; expected customer_receipts
- missing mapping assignment for salaries expense:outflow; expected payroll
- missing mapping assignment for marketing expense:outflow; expected sales_marketing
- missing mapping assignment for notes payable:inflow; expected debt_drawdown
- missing mapping assignment for interest expense:outflow; expected interest_paid
- missing mapping assignment for owner capital:inflow; expected equity_injection
