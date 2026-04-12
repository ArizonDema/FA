const ResponseHandler = require("../../../utils/responseHandler")
const FundService = require("../services/fund.service")

class FundController {
  static async getFunds(req, res, next) {
    try {
      const funds = await FundService.listFunds()
      return ResponseHandler.success(res, { funds }, "Funds retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createFund(req, res, next) {
    try {
      if (!req.body?.name) {
        return ResponseHandler.badRequest(res, "Fund name is required")
      }

      const fund = await FundService.createFund({
        actorId: req.user?.id || null,
        payload: req.body,
      })

      return ResponseHandler.created(res, { fund }, "Fund created")
    } catch (error) {
      return next(error)
    }
  }

  static async getFundProfile(req, res, next) {
    try {
      const payload = await FundService.getFundProfile(req.params.id)
      if (!payload) {
        return ResponseHandler.notFound(res, "Fund not found")
      }
      return ResponseHandler.success(res, payload, "Fund profile retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async updateFundProfile(req, res, next) {
    try {
      const fund = await FundService.updateFundProfile({
        fundId: req.params.id,
        payload: req.body,
        actorId: req.user?.id || null,
      })

      if (!fund) {
        return ResponseHandler.notFound(res, "Fund not found")
      }

      return ResponseHandler.success(res, { fund }, "Fund profile updated")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = FundController
