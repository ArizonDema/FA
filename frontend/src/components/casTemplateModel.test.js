import test from "node:test"
import assert from "node:assert/strict"
import { evaluateCasConfig } from "./casTemplateModel.js"

function readyConfig() {
  const statementFields = [
    "fund_name", "investor_name", "share_class", "period_start", "period_end",
    "beginning_capital", "contributions", "distributions", "ending_capital",
    "commitment_amount", "called_capital", "paid_capital", "unfunded_commitment",
  ]
  return {
    version: "cas_v1",
    summary: {
      sheet_name: "Summary",
      scalar_bindings: { fund_name: "B1", period_start: "B2", period_end: "B3" },
      table: {
        data_start_row: 5,
        columns: {
          investor_name: "A", share_class: "B", beginning_capital: "C", contributions: "D",
          distributions: "E", ending_capital: "F", unfunded_commitment: "G",
        },
      },
    },
    statement: {
      prototype_sheet_name: "Prototype",
      scalar_bindings: Object.fromEntries(statementFields.map((field, index) => [field, `B${index + 1}`])),
      activity_table: { data_start_row: 20, columns: { date: "A", type: "B", amount: "C" } },
    },
  }
}

test("CAS mapping readiness is independent and requires both sheet roles", () => {
  assert.equal(evaluateCasConfig(readyConfig()).canActivate, true)
  const invalid = readyConfig()
  invalid.statement.prototype_sheet_name = "Summary"
  const review = evaluateCasConfig(invalid)
  assert.equal(review.canActivate, false)
  assert.ok(review.groups.find((group) => group.key === "distinct_sheets").missing.length)
})

test("optional activity columns do not block activation", () => {
  const config = readyConfig()
  assert.deepEqual(Object.keys(config.statement.activity_table.columns), ["date", "type", "amount"])
  assert.equal(evaluateCasConfig(config).canActivate, true)
})
