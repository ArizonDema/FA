# Semantic Concept Taxonomy

## Purpose

The semantic concept layer is the canonical accounting vocabulary used by the product.
It sits between:

- raw accounting data such as source accounts or imported balances
- client-facing template rows and report layouts

This layer is intentionally independent from any one client template, portfolio, or chart of accounts.

## Design Principles

- Stable keys are the long-lived product contract.
- Concepts describe accounting meaning, not one workbook label.
- Template rows and source accounts should both map into the same concept universe.
- Synonyms and examples support deterministic matching later, but do not make the concept itself client-specific.
- Statement type and aggregation behavior capture reporting intent without coupling to rendering.

## Main Categories

- `cash_position`: opening, closing, and bridge-style cash concepts
- `capital_activity`: subscriptions, redemptions, capital calls, distributions
- `income`: recurring and investment income concepts
- `expense`: operating, professional, and tax expense concepts
- `gains_losses`: realized, unrealized, and FX-related performance concepts
- `payable_receivable`: accruals, payables, and receivables that support reporting context
- `operating`: operating section concepts for cash-flow reporting
- `investing`: investing section concepts for cash-flow reporting
- `financing`: financing section concepts for cash-flow reporting
- `equity`: equity-oriented concepts reserved for later report families
- `other`: fallback concepts for future extension

## Core Attributes

- `stable_key`: canonical lookup key used by mappings and APIs
- `category` and `subcategory`: coarse and fine taxonomy grouping
- `expected_sign`: `positive`, `negative`, or `either`
- `expected_balance_type`: `debit`, `credit`, `either`, or `memo`
- `aggregation_behavior`: `sum`, `subtract`, `derived`, `opening_balance`, `closing_balance`
- `statement_type`: `cash_flow`, `nav`, `capital_activity`, `pnl`, `balance_sheet`, or `generic`
- `dimensions_allowed_json`: optional list of dimensions a later mapper can use, such as `period`, `currency`, `entity`, or `share_class`
- `synonyms_json`: canonical alias phrases
- `examples_json`: example row labels or account phrases

## How Phase 4 Should Use This

Phase 4 should map both `Account` and `TemplateRow` records to `SemanticConcept` records by:

- using `stable_key` as the canonical target identifier
- using `synonyms_json`, `examples_json`, and row/account context as deterministic candidate inputs
- preserving mapping status and approvals outside the semantic concept table
- treating semantic concepts as reusable product vocabulary, not per-client configuration

Template-row matching should use the Phase 2 row shape, especially:

- `label`
- `row_type`
- `section_name`
- `parent_section_name`
- `formula_text`
- `expected_data_type`
- `metadata_json.cellSnapshots`

Account matching should use:

- `name`
- `normalized_name`
- source metadata
- current financial statement family

## API Usage

- `GET /api/v1/semantic-concepts`
- `GET /api/v1/semantic-concepts/:id`
- `GET /api/v1/semantic-concepts/key/:key`
- `GET /api/v1/semantic-concepts/categories`
- `POST /api/v1/semantic-concepts`

The API returns both compatibility fields such as `stable_key` and convenience aliases such as `key`, `active`, `expectedSign`, and `statementType`.
