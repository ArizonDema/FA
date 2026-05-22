# Testing Template 2 Adversarial LLM Evaluation

- Status: failed
- Template model: gpt-oss:20b
- Runtime model: gpt-oss:20b
- Runtime attempted: true
- Runtime accepted: 6
- Runtime rejected: 0
- Template semantic repair attempted: true

## Failures

- template ingestion needs human review: Several direct bucket labels need semantic review: Buyer money received, People engine cash, Space commitments, Demand creation spend.; LLM bucket decision for "space_commitments" needs review.; LLM bucket decision for "demand_creation_spend" needs review.; LLM did not provide canonical semantic labels for direct buckets: space_commitments, demand_creation_spend.; Direct cash-flow bucket bindings missing canonical semantic labels: space_commitments, demand_creation_spend
- wrong concept for rent expense:outflow: expected rent_facilities, got general_admin (back_office_platform_costs)
- wrong concept for marketing expense:outflow: expected sales_marketing, got general_admin (back_office_platform_costs)

## Files

- source_template: C:\Users\Mano PC\FA\uploads\cash-flow\template-analyses\1777558116725_Testing_Template_2.xlsx
- renamed_template: C:\Users\Mano PC\FA\uploads\cash-flow\testing-template-2-adversarial\2026-05-11T18-30-53-316Z\Testing_Template_2_adversarial_names.xlsx
- trial_balance: C:\Users\Mano PC\OneDrive\Documents\Samples;Data\Trial_Balance_2026.xlsx
- general_ledger: C:\Users\Mano PC\OneDrive\Documents\Samples;Data\General_Ledger_2026.xlsx
- report_output: C:\Users\Mano PC\FA\uploads\cash-flow\testing-template-2-adversarial\2026-05-11T18-30-53-316Z\cash_flow_output.xlsx
