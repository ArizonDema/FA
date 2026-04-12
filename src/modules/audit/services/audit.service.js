const logger = require("../../../config/logger")
const { AuditEvent, AuditLog } = require("../../../models")

const AuditEventModel = AuditEvent || AuditLog

class AuditService {
  static async logEvent({
    actorId = null,
    eventType,
    entityType,
    entityId = null,
    metadata = null,
    before = null,
    after = null,
    occurredAt = new Date(),
  }) {
    try {
      return await AuditEventModel.create({
        actor_id: actorId,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        action: eventType,
        metadata_json: metadata,
        before_json: before,
        after_json: after,
        occurred_at: occurredAt,
        created_at: occurredAt,
      })
    } catch (error) {
      logger.warn(`[v0] Audit log failed for ${entityType}:${entityId || "unknown"}`, error)
      return null
    }
  }

  static async logRequestEvent(req, payload) {
    return await this.logEvent({
      actorId: req.user?.id || null,
      ...payload,
    })
  }
}

module.exports = AuditService
