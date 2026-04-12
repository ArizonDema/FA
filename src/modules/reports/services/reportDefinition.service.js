const { ReportDefinition, ReportTemplate } = require("../../../models")
const AuditService = require("../../audit/services/audit.service")

const ReportDefinitionModel = ReportDefinition || ReportTemplate

class ReportDefinitionService {
  static async list({ type = null } = {}) {
    const where = {}
    if (type) where.type = type

    return await ReportDefinitionModel.findAll({
      where,
      order: [["created_at", "DESC"]],
    })
  }

  static async create({ payload, actorId = null }) {
    const definition = await ReportDefinitionModel.create({
      ...payload,
      definition_json:
        payload.definition_json ||
        {
          type: payload.type,
          name: payload.name,
          template_body: payload.template_body || null,
        },
      status: payload.status || "draft",
    })

    await AuditService.logEvent({
      actorId,
      eventType: "report_definition_created",
      entityType: "report_definition",
      entityId: definition.id,
      after: definition.toJSON(),
      metadata: { type: definition.type },
    })

    return definition
  }

  static async update({ definitionId, payload, actorId = null }) {
    const definition = await ReportDefinitionModel.findByPk(definitionId)
    if (!definition) return null

    const before = definition.toJSON()
    await definition.update({
      ...payload,
      definition_json: payload.definition_json || definition.definition_json,
    })

    await AuditService.logEvent({
      actorId,
      eventType: "report_definition_updated",
      entityType: "report_definition",
      entityId: definition.id,
      before,
      after: definition.toJSON(),
      metadata: { type: definition.type },
    })

    return definition
  }
}

module.exports = ReportDefinitionService
