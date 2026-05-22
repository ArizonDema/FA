# Testing Template 2 Adversarial LLM Evaluation

- Status: failed
- Template model: gpt-oss:20b
- Runtime model: gpt-oss:20b
- Runtime attempted: true
- Runtime accepted: 0
- Runtime rejected: 6
- Template semantic repair attempted: true

## Failures

- template semantic repair failed: Ollama request timed out after 120000ms
- template ingestion needs human review: Several direct bucket labels need semantic review: Buyer money received, People engine cash, Space commitments, Demand creation spend.; LLM semantic repair failed; deterministic semantic bindings were preserved.; Direct cash-flow bucket bindings missing canonical semantic labels: buyer_money_received, service_credits_and_odd_receipts, partner_operating_payouts, people_engine_cash, space_commitments, demand_creation_spend, back_office_platform_costs, treasury_tax_cash_out, long_life_asset_buildout, product_build_capitalization, equipment_exit_cash, credit_line_cash_in, lender_principal_return, cost_of_borrowing_cash, sponsor_cash_support, owner_cash_takeouts
- runtime LLM did not accept or confirm any mapping
- wrong concept for accounts receivable:inflow: expected customer_receipts, got none (service_credits_and_odd_receipts)
- wrong concept for unearned revenue:inflow: expected customer_receipts, got none (service_credits_and_odd_receipts)
- wrong concept for salaries expense:outflow: expected payroll, got none (back_office_platform_costs)
- wrong concept for rent expense:outflow: expected rent_facilities, got none (back_office_platform_costs)
- wrong concept for marketing expense:outflow: expected sales_marketing, got none (back_office_platform_costs)
- wrong concept for bank fees expense:outflow: expected general_admin, got none (back_office_platform_costs)
- wrong concept for prepaid insurance:outflow: expected general_admin, got none (back_office_platform_costs)
- wrong concept for travel expense:outflow: expected general_admin, got none (back_office_platform_costs)
- wrong concept for utilities expense:outflow: expected general_admin, got none (back_office_platform_costs)
- wrong concept for office equipment:outflow: expected capital_expenditures, got none (back_office_platform_costs)
- wrong concept for notes payable:inflow: expected debt_drawdown, got none (service_credits_and_odd_receipts)
- wrong concept for notes payable:outflow: expected debt_repayment, got none (back_office_platform_costs)
- wrong concept for interest expense:outflow: expected interest_paid, got none (back_office_platform_costs)
- wrong concept for owner capital:inflow: expected equity_injection, got none (service_credits_and_odd_receipts)
- wrong concept for owner drawings:outflow: expected dividends_distributions, got none (back_office_platform_costs)

## Files

- source_template: C:\Users\Mano PC\FA\uploads\cash-flow\template-analyses\1777558116725_Testing_Template_2.xlsx
- renamed_template: C:\Users\Mano PC\FA\uploads\cash-flow\testing-template-2-adversarial\2026-05-11T18-22-17-552Z\Testing_Template_2_adversarial_names.xlsx
- trial_balance: C:\Users\Mano PC\OneDrive\Documents\Samples;Data\Trial_Balance_2026.xlsx
- general_ledger: C:\Users\Mano PC\OneDrive\Documents\Samples;Data\General_Ledger_2026.xlsx
- report_output: C:\Users\Mano PC\FA\uploads\cash-flow\testing-template-2-adversarial\2026-05-11T18-22-17-552Z\cash_flow_output.xlsx
