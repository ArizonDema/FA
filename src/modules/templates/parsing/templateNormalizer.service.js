const { PARSER_VERSION } = require("./workbookParser.service")

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
}

function isNumericValue(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isDateLikeValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(t.*)?$/i.test(value)
}

function findRowLabelCell(cells) {
  const sortedCells = [...(cells || [])].sort((left, right) => left.column_index - right.column_index)
  const textCell = sortedCells.find(
    (cell) =>
      cell &&
      !cell.formula_text &&
      typeof cell.display_value === "string" &&
      normalizeText(cell.display_value),
  )
  return textCell || sortedCells.find((cell) => cell && normalizeText(cell.display_value)) || null
}

function countRowSignals(cells, labelCellAddress) {
  return (cells || []).reduce(
    (totals, cell) => {
      const display = normalizeText(cell.display_value)
      const rawValue = cell.raw_value
      if (!display && rawValue === null) return totals

      totals.non_empty += 1
      if (cell.formula_text) totals.formulas += 1
      if (cell.merge_range && cell.is_merge_master) totals.merge_masters += 1
      if (cell.style?.bold) totals.bold_cells += 1

      const formulaResult = rawValue && typeof rawValue === "object" ? rawValue.result : null
      const effectiveValue = formulaResult !== null && formulaResult !== undefined ? formulaResult : rawValue

      if (isNumericValue(effectiveValue)) {
        totals.numeric += 1
      } else if (isDateLikeValue(effectiveValue)) {
        totals.dates += 1
      } else if (typeof effectiveValue === "boolean") {
        totals.booleans += 1
      } else if (cell.address !== labelCellAddress && display) {
        totals.text += 1
      }

      return totals
    },
    {
      non_empty: 0,
      text: 0,
      numeric: 0,
      dates: 0,
      booleans: 0,
      formulas: 0,
      merge_masters: 0,
      bold_cells: 0,
    },
  )
}

function inferExpectedDataType(cells, labelCellAddress) {
  const signalSet = new Set()

  ;(cells || [])
    .filter((cell) => cell.address !== labelCellAddress)
    .forEach((cell) => {
      const rawValue = cell.raw_value
      const formulaResult = rawValue && typeof rawValue === "object" ? rawValue.result : null
      const effectiveValue = formulaResult !== null && formulaResult !== undefined ? formulaResult : rawValue

      if (isNumericValue(effectiveValue)) {
        signalSet.add("number")
        return
      }
      if (isDateLikeValue(effectiveValue)) {
        signalSet.add("date")
        return
      }
      if (typeof effectiveValue === "boolean") {
        signalSet.add("boolean")
        return
      }
      if (normalizeText(cell.display_value)) {
        signalSet.add("text")
      }
    })

  if (!signalSet.size) return "empty"
  if (signalSet.size === 1) return Array.from(signalSet)[0]
  return "mixed"
}

function isLikelySectionHeader({ rowLabel, signals, labelCell, row }) {
  if (!rowLabel) return false
  const onlyOneMeaningfulCell = signals.non_empty === 1
  const hasMergedTitle = Boolean(labelCell?.merge_range && labelCell?.is_merge_master)
  const isShortLabel = rowLabel.length <= 48
  const isBold = Boolean(labelCell?.style?.bold)

  if (hasMergedTitle && signals.numeric === 0 && signals.formulas === 0) return true
  if (onlyOneMeaningfulCell && signals.numeric === 0 && signals.formulas === 0 && isShortLabel) return true
  if (isBold && signals.numeric === 0 && signals.formulas === 0 && row.outline_level === 0 && isShortLabel) return true
  return false
}

function classifyRowType({ rowLabel, signals, labelCell, row }) {
  const normalizedLabel = normalizeText(rowLabel).toLowerCase()

  if (!signals.non_empty) return "blank"
  if (normalizedLabel && /\b(subtotal|sub-total)\b/.test(normalizedLabel)) return "subtotal"
  if (
    normalizedLabel &&
    (/\btotal\b/.test(normalizedLabel) ||
      /\bnet\s+(increase|decrease|change)\b/.test(normalizedLabel) ||
      /\bclosing cash\b/.test(normalizedLabel) ||
      /\bending cash\b/.test(normalizedLabel) ||
      /\bcash at end\b/.test(normalizedLabel))
  ) {
    return "total"
  }
  if (normalizedLabel && (/^\s*notes?\b/.test(normalizedLabel) || normalizedLabel.length > 80)) return "note"
  if (isLikelySectionHeader({ rowLabel: normalizedLabel, signals, labelCell, row })) return "section_header"
  if (signals.formulas > 0) return "formula_row"
  if (signals.numeric === 0 && signals.formulas === 0 && signals.non_empty <= 2 && normalizedLabel.length > 48) {
    return "note"
  }
  return "data_row"
}

function buildValueArrays(cells, columns) {
  const columnIndexLookup = new Map((columns || []).map((column, index) => [column.column_index, index]))
  const rawValues = (columns || []).map(() => null)
  const displayValues = (columns || []).map(() => null)
  const cellAddresses = []
  const formulaCells = []
  const cellSnapshots = []

  ;(cells || []).forEach((cell) => {
    const index = columnIndexLookup.get(cell.column_index)
    if (index !== undefined) {
      rawValues[index] = cell.raw_value
      displayValues[index] = cell.display_value
    }

    cellAddresses.push(cell.address)
    if (cell.formula_text) {
      formulaCells.push({
        address: cell.address,
        formula_text: cell.formula_text,
        result_value: cell.result_value,
      })
    }
    cellSnapshots.push({
      address: cell.address,
      column_index: cell.column_index,
      column_key: cell.column_key,
      raw_value: cell.raw_value,
      display_value: cell.display_value,
      formula_text: cell.formula_text,
      merge_range: cell.merge_range,
      style: cell.style,
      value_type: cell.value_type,
    })
  })

  return {
    rawValues,
    displayValues,
    cellAddresses,
    formulaCells,
    cellSnapshots,
  }
}

function buildRowCellRange(cells) {
  if (!Array.isArray(cells) || !cells.length) return null
  const ordered = [...cells].sort((left, right) => left.column_index - right.column_index)
  return `${ordered[0].address}:${ordered[ordered.length - 1].address}`
}

class TemplateNormalizer {
  static normalize({ templateVersionId, workbookStructure }) {
    let sortOrder = 0

    const sheets = (workbookStructure?.worksheets || []).map((sheet) => {
      const sectionStack = []
      let currentSection = null

      const rows = (sheet.rows || []).map((row) => {
        sortOrder += 1

        const cells = Array.isArray(row.cells) ? row.cells : []
        const labelCell = findRowLabelCell(cells)
        const rowLabel = normalizeText(labelCell?.display_value || labelCell?.raw_value || "") || null
        const indentationLevel = Math.max(
          Number(labelCell?.style?.indent || 0),
          Number.isFinite(Number(row.outline_level)) ? Number(row.outline_level) : 0,
        )
        const signals = countRowSignals(cells, labelCell?.address || null)
        const rowType = classifyRowType({
          rowLabel,
          signals,
          labelCell,
          row,
        })

        let sectionName = null
        let parentSection = null

        if (rowType === "section_header" && rowLabel) {
          while (
            sectionStack.length &&
            indentationLevel <= Number(sectionStack[sectionStack.length - 1].indentation_level || 0)
          ) {
            sectionStack.pop()
          }
          parentSection = sectionStack[sectionStack.length - 1]?.name || null
          sectionName = rowLabel
          currentSection = rowLabel
          sectionStack.push({ name: rowLabel, indentation_level: indentationLevel })
        } else {
          while (
            sectionStack.length > 1 &&
            indentationLevel < Number(sectionStack[sectionStack.length - 1].indentation_level || 0)
          ) {
            sectionStack.pop()
          }
          sectionName = sectionStack[sectionStack.length - 1]?.name || currentSection || null
          parentSection = sectionStack.length > 1 ? sectionStack[sectionStack.length - 2].name : null
        }

        const values = buildValueArrays(cells, sheet.columns || [])
        const formulaText = values.formulaCells.map((item) => `${item.address}=${item.formula_text}`).join(" | ") || null

        return {
          rowIndex: row.row_index,
          rowLabel,
          rowType,
          indentationLevel,
          isFormula: values.formulaCells.length > 0,
          formulaText,
          rawValues: values.rawValues,
          displayValues: values.displayValues,
          cellRange: buildRowCellRange(cells),
          sectionName,
          parentSection,
          sortOrder,
          expectedDataType: inferExpectedDataType(cells, labelCell?.address || null),
          metadata: {
            rowHidden: Boolean(row.hidden),
            rowHeight: row.height || null,
            outlineLevel: Number.isFinite(Number(row.outline_level)) ? Number(row.outline_level) : 0,
            nonEmptyCellCount: signals.non_empty,
            formulaCount: values.formulaCells.length,
            cellAddresses: values.cellAddresses,
            formulaCells: values.formulaCells,
            mergedRanges: row.merged_regions || [],
            cellSnapshots: values.cellSnapshots,
            labelCellAddress: labelCell?.address || null,
            labelColumnKey: labelCell?.column_key || null,
          },
        }
      })

      return {
        name: sheet.name,
        order: sheet.order,
        cellRange: sheet.used_range?.cell_range || null,
        rowCount: sheet.row_count || 0,
        columnCount: sheet.column_count || 0,
        usedRange: sheet.used_range || null,
        columns: (sheet.columns || []).map((column) => ({
          columnIndex: column.column_index,
          columnKey: column.column_key,
          width: column.width,
          hidden: Boolean(column.hidden),
          outlineLevel: Number.isFinite(Number(column.outline_level)) ? Number(column.outline_level) : 0,
        })),
        mergedCells: sheet.merged_regions || [],
        rows,
      }
    })

    const summary = sheets.reduce(
      (totals, sheet) => {
        sheet.rows.forEach((row) => {
          totals.totalRows += 1
          totals[row.rowType] = (totals[row.rowType] || 0) + 1
        })
        return totals
      },
      { totalRows: 0 },
    )

    return {
      templateVersionId,
      parserVersion: PARSER_VERSION,
      workbookMetadata: {
        sourceFileName: workbookStructure?.source_file_name || null,
        extension: workbookStructure?.extension || null,
        sizeBytes: workbookStructure?.size_bytes || null,
        sourceFileSha256: workbookStructure?.source_file_sha256 || null,
        worksheetCount: workbookStructure?.worksheet_count || sheets.length,
      },
      sheets,
      summary,
    }
  }
}

module.exports = TemplateNormalizer
module.exports.__test = {
  normalizeText,
  findRowLabelCell,
  classifyRowType,
  inferExpectedDataType,
}
