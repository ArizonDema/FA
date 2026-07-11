const path = require("path")
const ResponseHandler = require("../../../utils/responseHandler")
const StorageService = require("../../storage/services/storage.service")
const RepositoryService = require("../services/repository.service")
const RepositoryAnalysisService = require("../services/repositoryAnalysis.service")

class RepositoryController {
  static cleanupUpload(req) {
    StorageService.removeFileSilently(req.file?.path)
  }

  static async getSummary(req, res, next) {
    try {
      const summary = await RepositoryService.getSummary({ fundId: req.params.fundId })
      return ResponseHandler.success(res, { summary }, "Fund repository summary retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getItems(req, res, next) {
    try {
      const items = await RepositoryService.listItems({ fundId: req.params.fundId, filters: req.query })
      return ResponseHandler.success(res, { items }, "Fund repository items retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async createItem(req, res, next) {
    try {
      const item = await RepositoryService.createItem({
        fundId: req.params.fundId,
        actorId: req.user?.id || null,
        fields: req.body || {},
        upload: req.file,
      })
      return ResponseHandler.created(res, { item }, "Repository item uploaded")
    } catch (error) {
      RepositoryController.cleanupUpload(req)
      return next(error)
    }
  }

  static async addVersion(req, res, next) {
    try {
      const item = await RepositoryService.addVersion({
        fundId: req.params.fundId,
        itemId: req.params.itemId,
        actorId: req.user?.id || null,
        fields: req.body || {},
        upload: req.file,
      })
      return ResponseHandler.created(res, { item }, "Repository version uploaded")
    } catch (error) {
      RepositoryController.cleanupUpload(req)
      return next(error)
    }
  }

  static async updateItem(req, res, next) {
    try {
      const item = await RepositoryService.updateItem({
        fundId: req.params.fundId,
        itemId: req.params.itemId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.success(res, { item }, "Repository item updated")
    } catch (error) {
      return next(error)
    }
  }

  static async setCurrentVersion(req, res, next) {
    try {
      const item = await RepositoryService.setCurrentVersion({
        fundId: req.params.fundId,
        itemId: req.params.itemId,
        versionId: req.body?.version_id,
        actorId: req.user?.id || null,
      })
      return ResponseHandler.success(res, { item }, "Current repository version updated")
    } catch (error) {
      return next(error)
    }
  }

  static async downloadVersion(req, res, next) {
    try {
      const download = await RepositoryService.resolveDownload({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
      })
      return res.download(download.filePath, path.basename(download.fileName))
    } catch (error) {
      return next(error)
    }
  }

  static async getActivity(req, res, next) {
    try {
      const activity = await RepositoryService.getActivity({ fundId: req.params.fundId })
      return ResponseHandler.success(res, { activity }, "Fund repository activity retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getReaders(req, res, next) {
    try {
      const readers = await RepositoryAnalysisService.getReaderCatalog({ fundId: req.params.fundId })
      return ResponseHandler.success(res, { readers }, "Repository readers retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getReaderSuggestion(req, res, next) {
    try {
      const readerSuggestion = await RepositoryAnalysisService.suggestReaderForVersion({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
      })
      return ResponseHandler.success(res, { reader_suggestion: readerSuggestion }, "Repository reader suggestion retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async analyzeVersion(req, res, next) {
    try {
      const analysis = await RepositoryAnalysisService.analyzeVersion({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
        readerKey: req.body?.reader_key || null,
        triggerType: "manual",
      })
      return ResponseHandler.created(res, { analysis }, "Repository version analyzed")
    } catch (error) {
      return next(error)
    }
  }

  static async analyzeCurrentVersions(req, res, next) {
    try {
      const batch = await RepositoryAnalysisService.analyzeCurrentVersions({
        fundId: req.params.fundId,
        actorId: req.user?.id || null,
        includeExisting: req.body?.include_existing || false,
      })
      return ResponseHandler.created(res, { batch }, "Repository current sources analyzed")
    } catch (error) {
      return next(error)
    }
  }

  static async getVersionAnalyses(req, res, next) {
    try {
      const analyses = await RepositoryAnalysisService.getVersionAnalyses({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
      })
      return ResponseHandler.success(res, { analyses }, "Repository analyses retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async addManualKeyPoint(req, res, next) {
    try {
      const keyPoint = await RepositoryAnalysisService.addManualKeyPoint({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.created(res, { key_point: keyPoint }, "Repository key point added")
    } catch (error) {
      return next(error)
    }
  }

  static async reviewVersionKeyPoints(req, res, next) {
    try {
      const review = await RepositoryAnalysisService.reviewVersionKeyPoints({
        fundId: req.params.fundId,
        versionId: req.params.versionId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.success(res, { review }, "Repository key points reviewed")
    } catch (error) {
      return next(error)
    }
  }

  static async getVersionComparison(req, res, next) {
    try {
      const comparison = await RepositoryAnalysisService.getVersionComparison({
        fundId: req.params.fundId,
        itemId: req.params.itemId,
        versionId: req.params.versionId,
      })
      return ResponseHandler.success(res, { comparison }, "Repository version comparison retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getInsights(req, res, next) {
    try {
      const insights = await RepositoryAnalysisService.getInsights({ fundId: req.params.fundId })
      return ResponseHandler.success(res, { insights }, "Repository insights retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getReadiness(req, res, next) {
    try {
      const readiness = await RepositoryAnalysisService.getReadiness({ fundId: req.params.fundId })
      return ResponseHandler.success(res, { readiness }, "Repository readiness retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getKnowledgePack(req, res, next) {
    try {
      const knowledge = await RepositoryAnalysisService.getKnowledgePack({
        fundId: req.params.fundId,
        reviewStatus: req.query?.status || "confirmed",
      })
      return ResponseHandler.success(res, { knowledge }, "Repository knowledge pack retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async getKeyPointIndex(req, res, next) {
    try {
      const keyPointIndex = await RepositoryAnalysisService.getKeyPointIndex({
        fundId: req.params.fundId,
        filters: req.query || {},
      })
      return ResponseHandler.success(res, { key_point_index: keyPointIndex }, "Repository key point index retrieved")
    } catch (error) {
      return next(error)
    }
  }

  static async reviewKeyPoint(req, res, next) {
    try {
      const keyPoint = await RepositoryAnalysisService.reviewKeyPoint({
        fundId: req.params.fundId,
        keyPointId: req.params.keyPointId,
        actorId: req.user?.id || null,
        fields: req.body || {},
      })
      return ResponseHandler.success(res, { key_point: keyPoint }, "Repository key point updated")
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = RepositoryController
