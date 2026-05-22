# Unbiased Cash Flow Template

This folder contains a deliberately non-easy 2026 monthly cash-flow workbook for analyzer testing. It uses a direct-method layout, but the language is intentionally unfamiliar rather than based on conventional statement labels.

Design choices:

- Twelve monthly periods run from January 2026 through December 2026.
- Yellow cells are writable input cells and currently contain zeros, except the first opening bank position.
- Subtotal, monthly change, and closing bank position lines are formula-driven.
- The structure includes an opening bank position and a closing bank position so the cash roll-forward can be checked month by month.
- Group names and line labels are plausible for accountants, but avoid ordinary labels such as customer receipts, payroll, rent, capital expenditure, debt proceeds, or owner distributions.

Expected broad categories:

- Cash gathered from counterparties and settlement channels.
- Cash used to operate the business and satisfy recurring obligations.
- Cash movements related to capacity, durable tools, build-outs, and asset clearings.
- Cash movements related to external and partner funding arrangements.

The workbook is intended to be a neutral test artifact and does not include application-specific mapping keys.
