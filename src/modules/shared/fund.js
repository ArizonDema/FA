function resolveFundId(input) {
  if (!input) return null

  if (typeof input === "string") {
    return input.trim() || null
  }

  return (
    input.fund_id ||
    input.portfolio_id ||
    input.fundId ||
    input.portfolioId ||
    input.params?.fund_id ||
    input.params?.portfolio_id ||
    input.params?.id ||
    input.query?.fund_id ||
    input.query?.portfolio_id ||
    input.body?.fund_id ||
    input.body?.portfolio_id ||
    null
  )
}

function withFundId(record) {
  if (!record) return record
  const payload = typeof record.toJSON === "function" ? record.toJSON() : { ...record }
  if (payload.id && !payload.fund_id) {
    payload.fund_id = payload.id
  }
  if (payload.portfolio_id && !payload.fund_id) {
    payload.fund_id = payload.portfolio_id
  }
  return payload
}

module.exports = {
  resolveFundId,
  withFundId,
}
