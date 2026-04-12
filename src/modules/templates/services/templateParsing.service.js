const logger = require("../../../config/logger")
const { Template, CashFlowTemplate, TemplateVersion, TemplateRow } = require("../../../models")
const CashFlowService = require("../../../services/cashFlow.service")
const TemplateFileLoader = require("../parsing/templateFileLoader.service")
const WorkbookParser = require("../parsing/workbookParser.service")
const TemplateNormalizer = require("../parsing/templateNormalizer.service")
const TemplatePersistenceService = require("../parsing/templatePersistence.service")

const TemplateModel = Template || CashFlowTemplate

function formatRow(record) {
  const payload = typeof record?.toJSON === "function" ? record.toJSON() : { ...(record || {}) }
  return {
    id: payload.id,
    templateVersionId: payload.template_version_id,
    sheetName: payload.sheet_name,
    rowIndex: payload.row_index,
    rowLabel: payload.label,
    rowType: payload.row_type,
    indentationLevel: payload.indentation_level,
    formulaText: payload.formula_text,
    rowOrder: payload.row_order,
    sectionName: payload.section_name,
    parentSection: payload.parent_section_name,
    expectedDataType: payload.expected_data_type,
    cellRange: payload.cell_range,
    isFormula: Boolean(payload.is_formula),
    rawJson: payload.raw_json || null,
    metadata: payload.metadata_json || null,
    cellAddresses: payload.cell_addresses_json || [],
  }
}

class TemplateParsingService {
  static async getTemplateVersionRecord({ templateId, versionId }) {
    const template = await TemplateModel.findByPk(templateId)
    if (!template) return null

    const version = await TemplateVersion.findOne({
      where: {
        id: versionId,
        template_id: templateId,
      },
    })
    if (!version) return null

    return { template, version }
  }

  static resolveSourcePath(template, version) {
    const candidates = [version?.source_file_path, template?.template_file_path].filter(Boolean)
    const resolved = candidates.find((candidate) => TemplateFileLoader.loadablePath(candidate))

    if (!resolved) {
      throw new CashFlowService.CashFlowValidationError(
        "Template source file is missing and cannot be parsed. Re-upload the template before parsing again.",
      )
    }

    return resolved
  }

  static async buildNormalizedStructure({ templateVersionId, sourceFilePath, sourceFileName }) {
    const filePayload = TemplateFileLoader.load({
      filePath: sourceFilePath,
      sourceFileName,
    })
    const workbookStructure = await WorkbookParser.parse(filePayload)
    return TemplateNormalizer.normalize({
      templateVersionId,
      workbookStructure,
    })
  }

  static async persistVersionStructure({
    templateVersionId,
    sourceFilePath,
    sourceFileName,
    actorId = null,
    transaction = null,
  }) {
    const normalizedStructure = await this.buildNormalizedStructure({
      templateVersionId,
      sourceFilePath,
      sourceFileName,
    })

    const persistence = await TemplatePersistenceService.persistNormalizedStructure({
      templateVersionId,
      normalizedStructure,
      actorId,
      transaction,
    })

    return {
      normalizedStructure,
      parseMetadata: persistence.parseMetadata,
      persistedRowCount: persistence.persistedRowCount,
    }
  }

  static async parseTemplateVersion({ templateId, versionId, actorId = null }) {
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const { template, version } = records

    try {
      const sourceFilePath = this.resolveSourcePath(template, version)
      const result = await this.persistVersionStructure({
        templateVersionId: version.id,
        sourceFilePath,
        sourceFileName: version.source_file_name || template.template_file_name,
        actorId,
      })

      const refreshedVersion = await TemplateVersion.findByPk(version.id)
      return {
        template,
        version: refreshedVersion,
        ...result,
      }
    } catch (error) {
      logger.error("[phase2] Template parsing failed", {
        template_id: templateId,
        template_version_id: versionId,
        error_message: error.message,
      })
      throw error
    }
  }

  static async getParsedStructure({ templateId, versionId }) {
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    return {
      template: records.template,
      version: records.version,
      structure: records.version.parsed_structure_json || null,
      parseMetadata: records.version.parse_metadata_json || null,
    }
  }

  static async getTemplateRows({ templateId, versionId, sheetName = null }) {
    const records = await this.getTemplateVersionRecord({ templateId, versionId })
    if (!records) return null

    const where = { template_version_id: versionId }
    if (sheetName) {
      where.sheet_name = sheetName
    }

    const rows = await TemplateRow.findAll({
      where,
      order: [
        ["row_order", "ASC"],
        ["row_index", "ASC"],
      ],
    })

    return {
      template: records.template,
      version: records.version,
      rows: rows.map((row) => formatRow(row)),
    }
  }
}

module.exports = TemplateParsingService
