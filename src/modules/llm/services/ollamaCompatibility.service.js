function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
}

function resolveOllamaThinkForModel(modelName, configuredThink) {
  const normalizedModel = normalizeText(modelName).toLowerCase()
  if (normalizedModel.startsWith("gpt-oss")) {
    return ["low", "medium", "high"].includes(configuredThink) ? configuredThink : "low"
  }
  return configuredThink
}

module.exports = {
  resolveOllamaThinkForModel,
}
