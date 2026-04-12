const CashFlowTemplateIngestionService = require("../../../services/cashFlowTemplateIngestion.service")

class LlmOrchestratorService {
  static computeTemplateHash(templatePath) {
    return CashFlowTemplateIngestionService.computeTemplateHash(templatePath)
  }

  static async analyzeTemplateSchema({ templatePath, sourceFileName }) {
    return await CashFlowTemplateIngestionService.ingestTemplateSchema({
      templatePath,
      sourceFileName,
    })
  }

  static async getHealth() {
    return await CashFlowTemplateIngestionService.checkOllamaHealth()
  }
}

module.exports = LlmOrchestratorService
