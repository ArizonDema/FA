# Agent 5 Direct-Method Cash Flow Template

This folder contains one deliberately challenging 2026 direct-method cash-flow workbook for analyzer testing.

The workbook is organized as a monthly cash bridge. Pale monthly cells are writable input rows, while shaded rows calculate subtotals, net movement, opening cash, closing cash, and a zero cross-foot check.

## Row Meanings

- Opening cash on hand and in bank: cash available at the start of each month. January is typed by the user; later months link from the prior month close.
- Till sweeps and card-batch releases: money received from point-of-sale activity, card processors, and cash deposits.
- Ledger invoices converted to bank deposits: cash collected from customers after invoices have already been billed.
- Retainer replenishments and progress draws: advance payments, milestone payments, or replenishments received before or during work.
- Warranty reserve recoveries from vendors: money recovered from suppliers, vendors, or warranty programs.
- Subtotal - operating cash gathered: total operating cash received before operating payments.
- Crew pay packets and benefit remittances: cash paid to employees, contractors, tax agencies, and benefit providers for labor-related obligations.
- Premises license fees and service levies: cash paid for using facilities, shared services, maintenance, and occupancy arrangements.
- Materials drops, freight, and workshop consumables: cash paid for inventory, supplies, shipping, and production materials.
- Tax authority settlements and filing true-ups: cash paid to settle tax filings, estimates, assessments, or adjustments.
- Customer make-good refunds and chargeback leakage: cash returned to customers or lost through reversals and payment disputes.
- Subtotal - operating cash released: total operating cash paid out.
- Net cash carried by operations: operating cash received minus operating cash paid.
- Tooling bench upgrades and vehicle fit-outs: cash spent on long-lived equipment, tools, vehicles, and shop improvements.
- System build milestones paid to integrators: cash paid for software implementation, platform build, or systems integration milestones.
- Proceeds from retiring surplus gear: cash received when selling or disposing of used assets.
- Security deposits lodged with counterparties: cash placed with landlords, utilities, suppliers, or other counterparties as refundable deposits.
- Net cash from asset and deposit decisions: net cash effect of asset purchases, deposits, system builds, and asset sale proceeds.
- Bank line takedowns and note placements: borrowed cash received from lenders or financing arrangements.
- Scheduled lender amortization and fees: cash paid to reduce borrowing balances or settle lender charges.
- Partner capital injections cleared: cash contributed by owners, partners, members, or shareholders.
- Partner drawings and tax-pocket advances: cash withdrawn by principals or advanced for their personal tax obligations.
- Net cash from funding decisions: net cash effect of borrowing, repayments, capital contributions, and principal withdrawals.
- Net monthly cash movement: total monthly cash increase or decrease from operating, investing, and financing activity.
- Closing cash on hand and in bank: opening cash plus the month's net cash movement.
- Cross-foot check: formula integrity check that should equal zero when the roll-forward is intact.
