const { TemplateVersion, TemplateRow } = require("../../../models")

function buildParseMetadata(normalizedStructure) {
  return {
    parser_version: normalizedStructure?.parserVersion || null,
    sheet_count: normalizedStructure?.workbookMetadata?.worksheetCount || 0,
    total_row_count: normalizedStructure?.summary?.totalRows || 0,
    row_type_counts: normalizedStructure?.summary || {},
    source_file_name: normalizedStructure?.workbookMetadata?.sourceFileName || null,
    source_file_sha256: normalizedStructure?.workbookMetadata?.sourceFileSha256 || null,
  }
}

class TemplatePersistenceService {
  static async persistNormalizedStructure({
    templateVersionId,
    normalizedStructure,
    actorId = null,
    transaction = null,
  }) {
    const parseMetadata = buildParseMetadata(normalizedStructure)

    await TemplateVersion.update(
      {
        parsed_structure_json: normalizedStructure,
        parse_metadata_json: parseMetadata,
        parsed_at: new Date(),
      },
      {
        where: { id: templateVersionId },
        transaction,
      },
    )

    await TemplateRow.destroy({
      where: { template_version_id: templateVersionId },
      transaction,
    })

    const rowRecords = []

    ;(normalizedStructure?.sheets || []).forEach((sheet) => {
      ;(sheet.rows || []).forEach((row) => {
        rowRecords.push({
          template_version_id: templateVersionId,
          sheet_name: sheet.name || null,
          row_index: Number.isInteger(row.rowIndex) ? row.rowIndex : null,
          row_key: `${sheet.name || "sheet"}:${row.rowIndex || row.sortOrder || rowRecords.length + 1}`,
          label: row.rowLabel || null,
          row_type: row.rowType || null,
          indentation_level: Number.isFinite(Number(row.indentationLevel)) ? Number(row.indentationLevel) : 0,
          formula_text: row.formulaText || null,
          row_order: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : rowRecords.length + 1,
          section_name: row.sectionName || null,
          parent_section_name: row.parentSection || null,
          expected_data_type: row.expectedDataType || null,
          cell_range: row.cellRange || null,
          is_formula: Boolean(row.isFormula),
          cell_addresses_json: row.metadata?.cellAddresses || [],
          raw_json: {
            raw_values: row.rawValues || [],
            display_values: row.displayValues || [],
            cells: row.metadata?.cellSnapshots || [],
          },
          metadata_json: {
            ...row.metadata,
            sheetOrder: sheet.order,
            columnKeys: (sheet.columns || []).map((column) => column.columnKey),
          },
          created_by: actorId,
        })
      })
    })

    if (rowRecords.length) {
      await TemplateRow.bulkCreate(rowRecords, { transaction })
    }

    return {
      parseMetadata,
      persistedRowCount: rowRecords.length,
    }
  }
}

module.exports = TemplatePersistenceService
