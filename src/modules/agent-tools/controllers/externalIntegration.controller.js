const ResponseHandler = require("../../../utils/responseHandler")
const ExternalIntegrationService = require("../services/externalIntegration.service")

class ExternalIntegrationController {
  static async listIntegrations(req, res, next) {
    try {
      const integrations = await ExternalIntegrationService.listIntegrations({
        fundId: req.query.fund_id || req.query.fundId,
        status: req.query.status || null,
        providerType: req.query.provider_type || req.query.providerType || null,
      })
      return ResponseHandler.success(res, { integrations }, "External integrations retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createIntegration(req, res, next) {
    try {
      const integration = await ExternalIntegrationService.createIntegration({
        fundId: req.body.fund_id || req.body.fundId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.created(res, { integration }, "External integration created")
    } catch (error) {
      return next(error)
    }
  }

  static async getIntegration(req, res, next) {
    try {
      const integration = await ExternalIntegrationService.getIntegration({
        fundId: req.query.fund_id || req.query.fundId || null,
        integrationId: req.params.id,
      })
      return ResponseHandler.success(res, { integration }, "External integration retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async updateIntegration(req, res, next) {
    try {
      const integration = await ExternalIntegrationService.updateIntegration({
        fundId: req.body.fund_id || req.body.fundId || req.query.fund_id || req.query.fundId || null,
        integrationId: req.params.id,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.success(res, { integration }, "External integration updated")
    } catch (error) {
      return next(error)
    }
  }

  static async startSyncRun(req, res, next) {
    try {
      const result = await ExternalIntegrationService.startSyncRun({
        fundId: req.body.fund_id || req.body.fundId || req.query.fund_id || req.query.fundId || null,
        integrationId: req.params.id,
        actorId: req.user?.id || null,
        syncType: req.body.sync_type || req.body.syncType || "discovery",
        triggerType: req.body.trigger_type || req.body.triggerType || "manual",
        idempotencyKey: req.body.idempotency_key || req.headers["idempotency-key"] || null,
        externalCorrelationId: req.body.external_correlation_id || req.body.externalCorrelationId || null,
        discoveredArtifacts: req.body.discovered_artifacts || req.body.discoveredArtifacts || [],
        metadata: req.body.metadata || req.body.metadata_json || null,
      })
      return ResponseHandler.created(res, result, "External sync run created")
    } catch (error) {
      return next(error)
    }
  }

  static async listSyncRuns(req, res, next) {
    try {
      const syncRuns = await ExternalIntegrationService.listSyncRuns({
        fundId: req.query.fund_id || req.query.fundId || null,
        integrationId: req.query.integration_id || req.query.integrationId || null,
        status: req.query.status || null,
      })
      return ResponseHandler.success(res, { syncRuns }, "External sync runs retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getSyncRun(req, res, next) {
    try {
      const syncRun = await ExternalIntegrationService.getSyncRun({
        syncRunId: req.params.id,
        fundId: req.query.fund_id || req.query.fundId || null,
      })
      return ResponseHandler.success(res, { syncRun }, "External sync run retrieved")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = ExternalIntegrationController
