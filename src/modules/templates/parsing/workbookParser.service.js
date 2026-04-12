const ExcelJS = require("exceljs")
const CashFlowService = require("../../../services/cashFlow.service")

const PARSER_VERSION = "2026-04-12.phase2.v1"

function columnNumberToName(columnNumber) {
  let col = Number(columnNumber || 0)
  if (!col || col < 1) return ""
  let letters = ""
  while (col > 0) {
    const remainder = (col - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    col = Math.floor((col - remainder) / 26)
  }
  return letters
}

function columnNameToNumber(columnName) {
  return String(columnName || "")
    .trim()
    .toUpperCase()
    .split("")
    .reduce((total, character) => {
      if (character < "A" || character > "Z") return total
      return total * 26 + (character.charCodeAt(0) - 64)
    }, 0)
}

function cellAddress(rowIndex, columnIndex) {
  return `${columnNumberToName(columnIndex)}${rowIndex}`
}

function parseCellAddress(address) {
  const match = String(address || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return {
    column: columnNameToNumber(match[1]),
    row: Number(match[2]),
  }
}

function parseRange(range) {
  const [start, end] = String(range || "").split(":")
  const startCell = parseCellAddress(start)
  const endCell = parseCellAddress(end || start)
  if (!startCell || !endCell) return null
  return {
    range: String(range || "").toUpperCase(),
    start_row: Math.min(startCell.row, endCell.row),
    end_row: Math.max(startCell.row, endCell.row),
    start_col: Math.min(startCell.column, endCell.column),
    end_col: Math.max(startCell.column, endCell.column),
    master_address: `${columnNumberToName(Math.min(startCell.column, endCell.column))}${Math.min(startCell.row, endCell.row)}`,
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeRawValue(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value
  if (typeof value === "object") {
    if (value.formula) {
      return {
        formula: value.formula,
        result: normalizeRawValue(value.result ?? null),
      }
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || "").join("")
    }
    if (value.hyperlink && value.text) {
      return {
        text: value.text,
        hyperlink: value.hyperlink,
      }
    }
    if (typeof value.text === "string") return value.text
    if (value.result !== undefined) return normalizeRawValue(value.result)
  }
  return String(value)
}

function normalizeDisplayValue(cell) {
  const text = normalizeText(cell?.text)
  if (text) return text

  const normalized = normalizeRawValue(cell?.value)
  if (normalized === null || normalized === undefined) return null
  if (typeof normalized === "object") {
    if (normalized.result !== undefined && normalized.result !== null) {
      return normalizeText(normalized.result)
    }
    if (normalized.text) return normalizeText(normalized.text)
    if (normalized.formula) return normalizeText(normalized.formula)
  }
  return normalizeText(normalized)
}

function extractFormulaText(value) {
  if (value && typeof value === "object" && value.formula) {
    return String(value.formula).trim()
  }
  return null
}

function classifyValueType(value) {
  if (value === null || value === undefined) return "empty"
  if (value instanceof Date) return "date"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "string") return "string"
  if (typeof value === "object" && value.formula) return "formula"
  return "object"
}

function hasMeaningfulContent({ rawValue, displayValue, formulaText }) {
  if (formulaText) return true
  if (rawValue === null || rawValue === undefined) {
    return Boolean(displayValue)
  }
  if (typeof rawValue === "string") return Boolean(normalizeText(rawValue))
  if (typeof rawValue === "object") {
    if (rawValue.formula) return true
    if (rawValue.text) return Boolean(normalizeText(rawValue.text))
    return Object.keys(rawValue).length > 0
  }
  return true
}

function normalizeStyle(cell) {
  const alignment = cell?.alignment || {}
  const font = cell?.font || {}
  return {
    num_fmt: cell?.numFmt || null,
    horizontal: alignment.horizontal || null,
    vertical: alignment.vertical || null,
    wrap_text: Boolean(alignment.wrapText),
    indent: Number.isFinite(Number(alignment.indent)) ? Number(alignment.indent) : 0,
    text_rotation: Number.isFinite(Number(alignment.textRotation)) ? Number(alignment.textRotation) : 0,
    bold: Boolean(font.bold),
    italic: Boolean(font.italic),
    underline: Boolean(font.underline),
  }
}

function collectMergeRegions(worksheet) {
  const ranges = Array.isArray(worksheet?.model?.merges) ? worksheet.model.merges : []
  return ranges
    .map((range) => parseRange(range))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.start_row !== right.start_row) return left.start_row - right.start_row
      return left.start_col - right.start_col
    })
}

function buildMergeLookup(mergeRegions) {
  const lookup = new Map()
  mergeRegions.forEach((region) => {
    for (let rowIndex = region.start_row; rowIndex <= region.end_row; rowIndex += 1) {
      for (let columnIndex = region.start_col; columnIndex <= region.end_col; columnIndex += 1) {
        lookup.set(cellAddress(rowIndex, columnIndex), region)
      }
    }
  })
  return lookup
}

function inferUsedRange(worksheet, mergeRegions) {
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = 0
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = 0

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const rawValue = normalizeRawValue(cell.value)
      const displayValue = normalizeDisplayValue(cell)
      const formulaText = extractFormulaText(cell.value)
      if (!hasMeaningfulContent({ rawValue, displayValue, formulaText })) return

      minRow = Math.min(minRow, rowNumber)
      maxRow = Math.max(maxRow, rowNumber)
      minCol = Math.min(minCol, columnNumber)
      maxCol = Math.max(maxCol, columnNumber)
    })
  })

  mergeRegions.forEach((region) => {
    minRow = Math.min(minRow, region.start_row)
    maxRow = Math.max(maxRow, region.end_row)
    minCol = Math.min(minCol, region.start_col)
    maxCol = Math.max(maxCol, region.end_col)
  })

  if (!Number.isFinite(minRow) || !Number.isFinite(minCol) || maxRow === 0 || maxCol === 0) {
    minRow = 1
    minCol = 1
    maxRow = Math.max(worksheet.rowCount || 1, 1)
    maxCol = Math.max(worksheet.columnCount || 1, 1)
  }

  return {
    start_row: minRow,
    end_row: maxRow,
    start_col: minCol,
    end_col: maxCol,
    start_address: cellAddress(minRow, minCol),
    end_address: cellAddress(maxRow, maxCol),
    cell_range: `${cellAddress(minRow, minCol)}:${cellAddress(maxRow, maxCol)}`,
  }
}

function parseCell(cell, mergeLookup) {
  const address = String(cell.address || "").toUpperCase()
  const mergeRegion = mergeLookup.get(address) || null
  const rawValue = normalizeRawValue(cell.value)
  const displayValue = normalizeDisplayValue(cell)
  const formulaText = extractFormulaText(cell.value)
  const isMergeMaster = Boolean(mergeRegion) && mergeRegion.master_address === address

  if (!hasMeaningfulContent({ rawValue, displayValue, formulaText }) && !isMergeMaster) {
    return null
  }

  const parsedAddress = parseCellAddress(address)
  return {
    address,
    row_index: parsedAddress?.row || null,
    column_index: parsedAddress?.column || null,
    column_key: parsedAddress ? columnNumberToName(parsedAddress.column) : null,
    raw_value: rawValue,
    display_value: displayValue,
    value_type: classifyValueType(cell.value),
    formula_text: formulaText,
    result_value:
      cell.value && typeof cell.value === "object" && cell.value.result !== undefined
        ? normalizeRawValue(cell.value.result)
        : null,
    is_merged: Boolean(mergeRegion),
    is_merge_master: isMergeMaster,
    merge_range: mergeRegion?.range || null,
    style: normalizeStyle(cell),
  }
}

class WorkbookParser {
  static async parse(filePayload) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(filePayload.buffer)

    if (!workbook.worksheets.length) {
      throw new CashFlowService.CashFlowValidationError("Template workbook has no worksheets")
    }

    const worksheets = workbook.worksheets.map((worksheet, index) => {
      const mergeRegions = collectMergeRegions(worksheet)
      const mergeLookup = buildMergeLookup(mergeRegions)
      const usedRange = inferUsedRange(worksheet, mergeRegions)
      const rows = []

      for (let rowIndex = usedRange.start_row; rowIndex <= usedRange.end_row; rowIndex += 1) {
        const row = worksheet.getRow(rowIndex)
        const cells = []

        for (let columnIndex = usedRange.start_col; columnIndex <= usedRange.end_col; columnIndex += 1) {
          const parsedCell = parseCell(row.getCell(columnIndex), mergeLookup)
          if (parsedCell) cells.push(parsedCell)
        }

        rows.push({
          row_index: rowIndex,
          order: rowIndex - usedRange.start_row,
          hidden: Boolean(row.hidden),
          height: row.height || null,
          outline_level: Number.isFinite(Number(row.outlineLevel)) ? Number(row.outlineLevel) : 0,
          cells,
          merged_regions: mergeRegions.filter(
            (region) => region.start_row <= rowIndex && region.end_row >= rowIndex,
          ),
        })
      }

      const columns = []
      for (let columnIndex = usedRange.start_col; columnIndex <= usedRange.end_col; columnIndex += 1) {
        const column = worksheet.getColumn(columnIndex)
        columns.push({
          column_index: columnIndex,
          column_key: columnNumberToName(columnIndex),
          width: Number.isFinite(Number(column.width)) ? Number(column.width) : null,
          hidden: Boolean(column.hidden),
          outline_level: Number.isFinite(Number(column.outlineLevel)) ? Number(column.outlineLevel) : 0,
        })
      }

      return {
        name: worksheet.name,
        order: index,
        state: worksheet.state || "visible",
        row_count: worksheet.rowCount || 0,
        column_count: worksheet.columnCount || 0,
        actual_row_count: worksheet.actualRowCount || 0,
        actual_column_count: worksheet.actualColumnCount || 0,
        used_range: usedRange,
        columns,
        merged_regions: mergeRegions,
        rows,
      }
    })

    return {
      parser_version: PARSER_VERSION,
      source_file_name: filePayload.source_file_name,
      extension: filePayload.extension,
      size_bytes: filePayload.size_bytes,
      source_file_sha256: filePayload.source_file_sha256,
      worksheet_count: worksheets.length,
      worksheets,
    }
  }
}

module.exports = WorkbookParser
module.exports.PARSER_VERSION = PARSER_VERSION
module.exports.__test = {
  columnNumberToName,
  columnNameToNumber,
  parseCellAddress,
  parseRange,
  normalizeRawValue,
  normalizeDisplayValue,
  hasMeaningfulContent,
}
