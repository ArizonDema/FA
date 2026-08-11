export const SUMMARY_SCALAR_FIELDS = ["fund_name", "period_start", "period_end"]
export const SUMMARY_COLUMN_FIELDS = [
  "investor_name",
  "share_class",
  "beginning_capital",
  "contributions",
  "distributions",
  "ending_capital",
  "unfunded_commitment",
  "commitment_amount",
  "called_capital",
  "paid_capital",
  "outstanding_called_capital",
  "ownership_percentage",
  "rollforward_variance",
  "currency",
]
export const SUMMARY_REQUIRED_COLUMNS = SUMMARY_COLUMN_FIELDS.slice(0, 7)
export const STATEMENT_SCALAR_FIELDS = [
  "fund_name",
  "investor_name",
  "share_class",
  "period_start",
  "period_end",
  "beginning_capital",
  "contributions",
  "distributions",
  "ending_capital",
  "commitment_amount",
  "called_capital",
  "paid_capital",
  "unfunded_commitment",
  "investor_type",
  "contact_email",
  "currency",
  "accounting_basis",
  "outstanding_called_capital",
  "ownership_percentage",
  "rollforward_variance",
]
export const STATEMENT_REQUIRED_SCALARS = STATEMENT_SCALAR_FIELDS.slice(0, 13)
export const ACTIVITY_COLUMN_FIELDS = ["date", "type", "amount", "withholding", "net_amount", "reference", "memo"]
export const ACTIVITY_REQUIRED_COLUMNS = ACTIVITY_COLUMN_FIELDS.slice(0, 3)
export const SUMMARY_TOTAL_FIELDS = [
  "beginning_capital",
  "contributions",
  "distributions",
  "ending_capital",
  "commitment_amount",
  "called_capital",
  "paid_capital",
  "outstanding_called_capital",
  "unfunded_commitment",
]

export function fieldLabel(field) {
  return String(field || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function bindingCell(binding) {
  return typeof binding === "string" ? binding : binding?.cell
}

function missing(source, fields, binding = false) {
  return fields.filter((field) => !(binding ? bindingCell(source?.[field]) : source?.[field]))
}

export function normalizeCasConfig(value = {}) {
  return {
    ...value,
    version: "cas_v1",
    summary: {
      ...(value.summary || {}),
      sheet_name: value.summary?.sheet_name || "",
      scalar_bindings: value.summary?.scalar_bindings || {},
      table: {
        ...(value.summary?.table || {}),
        data_start_row: value.summary?.table?.data_start_row || "",
        style_source_row: value.summary?.table?.style_source_row || value.summary?.table?.data_start_row || "",
        columns: value.summary?.table?.columns || {},
      },
      totals_bindings: value.summary?.totals_bindings || {},
    },
    statement: {
      ...(value.statement || {}),
      prototype_sheet_name: value.statement?.prototype_sheet_name || "",
      scalar_bindings: value.statement?.scalar_bindings || {},
      activity_table: {
        ...(value.statement?.activity_table || {}),
        data_start_row: value.statement?.activity_table?.data_start_row || "",
        style_source_row:
          value.statement?.activity_table?.style_source_row || value.statement?.activity_table?.data_start_row || "",
        columns: value.statement?.activity_table?.columns || {},
      },
    },
  }
}

export function evaluateCasConfig(value = {}) {
  const config = normalizeCasConfig(value)
  const groups = [
    {
      key: "summary_sheet",
      label: "Summary sheet",
      missing: config.summary.sheet_name ? [] : ["summary sheet"],
    },
    {
      key: "summary_scalars",
      label: "Summary identity and period fields",
      missing: missing(config.summary.scalar_bindings, SUMMARY_SCALAR_FIELDS, true),
    },
    {
      key: "summary_table",
      label: "Summary statement table",
      missing: [
        ...(config.summary.table.data_start_row ? [] : ["data start row"]),
        ...missing(config.summary.table.columns, SUMMARY_REQUIRED_COLUMNS),
      ],
    },
    {
      key: "statement_sheet",
      label: "Statement prototype sheet",
      missing: config.statement.prototype_sheet_name ? [] : ["statement prototype sheet"],
    },
    {
      key: "statement_scalars",
      label: "Statement identity and rollforward fields",
      missing: missing(config.statement.scalar_bindings, STATEMENT_REQUIRED_SCALARS, true),
    },
    {
      key: "activity_table",
      label: "Statement activity table",
      missing: [
        ...(config.statement.activity_table.data_start_row ? [] : ["data start row"]),
        ...missing(config.statement.activity_table.columns, ACTIVITY_REQUIRED_COLUMNS),
      ],
    },
    {
      key: "distinct_sheets",
      label: "Separate summary and statement sheets",
      missing:
        config.summary.sheet_name &&
        config.statement.prototype_sheet_name &&
        config.summary.sheet_name !== config.statement.prototype_sheet_name
          ? []
          : ["two different worksheet names"],
    },
  ]
  return {
    config,
    canActivate: groups.every((group) => group.missing.length === 0),
    groups,
  }
}
