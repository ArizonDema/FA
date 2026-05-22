# Agent 3 direct-method cash-flow template

Created workbook:

- `agent3_direct_method_cash_flow_2026_challenging.xlsx`

This is a deliberately challenging direct-method cash-flow template for analyzer testing. It uses twelve monthly columns for calendar year 2026, writable monthly input rows that are either blank or zero, and formula rows for subtotals, net movement, and closing cash. The labels are accountant-readable but intentionally avoid the most conventional phrasing.

## Row meanings

- Vault balance brought forward: cash available at the beginning of each month before current-month activity.
- Till sweeps from fulfilled invoice batches: money collected from completed sales or billings.
- Counterparty advance burn-offs collected in cash: cash received as customer or contract advances are settled through activity.
- Channel settlement drips after platform holdbacks: marketplace, processor, or channel collections after withheld amounts.
- Service-retainer refreshes banked this month: recurring service retainers or deposits received in cash.
- Rebates, claims and warranty escrow refunds: cash recoveries from suppliers, insurers, warranty programs, or claim processes.
- Miscellaneous operating coin-in: small or unusual operating cash receipts not captured elsewhere.
- Operating inflow subtotal: total cash entering from normal operations.
- Supplier pouch settlements for stocked goods: payments to suppliers for goods, materials, or inventory-related obligations.
- Crew stipends and shift settlement runs: cash paid for labor, staffing, or team-related compensation obligations.
- Premises access retainers and service charges: payments for facility access, occupancy-related service obligations, or similar overhead.
- Carrier tolls, fulfilment lanes and customs floats: shipping, logistics, freight, duty, and delivery-related cash payments.
- Software meters, data rooms and outsourced desks: payments for subscriptions, data services, contractors, or outsourced support.
- Tax set-asides released to authorities: cash remitted for taxes, duties, or statutory obligations.
- Customer appeasements and credit make-good cash: refunds, credits, concessions, or customer remediation paid in cash.
- Operating outflow subtotal: total cash leaving for normal operating activity.
- Net operating cash churn: operating inflows minus operating outflows as presented by the signed input rows.
- Workshop build-out retainage paid: cash paid for build-outs, improvements, or held-back project balances.
- Long-life equipment deposits and installation bites: cash paid for durable assets, deposits, installation, or commissioning.
- Insurance salvage and asset retirement recoveries: cash received from disposing of assets or recovering insured asset value.
- Net long-cycle asset movement: net cash effect of longer-lived asset activity.
- Bank note draw packets landing in account: new lender funding received into cash.
- Scheduled lender sweeps and fee skims: cash paid for financing costs, lender repayments, or required sweeps.
- Partner top-ups wired into treasury: owner, partner, or investor contributions received in cash.
- Member cash drawings and tax cover remittances: cash paid out to owners, members, or partners.
- Quiet reserve release or parking: discretionary reserve movements, either release into usable cash or parking of cash elsewhere.
- Net capital stack movement: net cash effect of financing and ownership-related activity.
- Net cash drift before rounding: combined net movement before small timing or rounding adjustments.
- Bank cut-off, FX dust and penny-rounding plug: small adjustments for bank timing, foreign exchange, rounding, or immaterial differences.
- Net movement posted to vault: final monthly increase or decrease in cash.
- Vault balance carried forward: ending cash after opening balance and monthly net movement.
- Undesignated receipt lane A: intentionally sparse extra cash-receipt row for analyzer robustness testing.
- Undesignated payment lane B: intentionally sparse extra cash-payment row for analyzer robustness testing.
