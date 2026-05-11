const fs = require("fs")
const path = require("path")

const SKILL_DIR = path.join(__dirname, "..", "skills")
const cache = new Map()

function normalizeSkillVersion(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "")
}

function loadSkillPack(version) {
  const normalizedVersion = normalizeSkillVersion(version)
  if (!normalizedVersion) return null
  if (cache.has(normalizedVersion)) return cache.get(normalizedVersion)

  const filePath = path.join(SKILL_DIR, `${normalizedVersion}.json`)
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"))
  const skill = {
    version: payload.version || normalizedVersion,
    title: payload.title || normalizedVersion,
    instructions: Array.isArray(payload.instructions) ? payload.instructions.filter(Boolean) : [],
  }
  cache.set(normalizedVersion, skill)
  return skill
}

function renderSkillPack(version) {
  const skill = loadSkillPack(version)
  if (!skill) return ""
  return [
    `Skill version: ${skill.version}`,
    `Skill title: ${skill.title}`,
    ...skill.instructions.map((instruction) => `- ${instruction}`),
  ].join("\n")
}

module.exports = {
  loadSkillPack,
  renderSkillPack,
}
