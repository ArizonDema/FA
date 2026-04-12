function withTemplateIdentity(record) {
  if (!record) return record
  const payload = typeof record.toJSON === "function" ? record.toJSON() : { ...record }
  if (payload.portfolio_id && !payload.fund_id) {
    payload.fund_id = payload.portfolio_id
  }
  return payload
}

module.exports = {
  withTemplateIdentity,
}
