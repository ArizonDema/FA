const ResponseHandler = require("../../../utils/responseHandler")
const { AuditEvent } = require("../../../models")

class AuditController {
  static async getEvents(req, res, next) {
    try {
      const where = {}
      if (req.query.event_type) where.event_type = req.query.event_type
      if (req.query.entity_type) where.entity_type = req.query.entity_type
      if (req.query.entity_id) where.entity_id = req.query.entity_id

      const events = await AuditEvent.findAll({
        where,
        order: [["created_at", "DESC"]],
      })

      return ResponseHandler.success(res, { events }, "Audit events retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = AuditController
