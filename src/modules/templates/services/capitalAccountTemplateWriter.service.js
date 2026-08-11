const ExcelJS = require("exceljs")
const CashFlowService = require("../../../services/cashFlow.service")
const { readWorkbookFromFile } = require("../../../utils/excelWorkbook.util")
const CapitalAccountTemplateService = require("./capitalAccountTemplate.service")

function cloneObject(value, ancestors = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return new Date(value.getTime())
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (typeof value === "function") return undefined
  if (typeof value !== "object") return value
  if (ancestors.has(value)) return undefined
  ancestors.add(value)
  if (Array.isArray(value)) {
    const result = value.map((item) => cloneObject(item, ancestors))
    ancestors.delete(value)
    return result
  }
  if (typeof value === "object") {
    const result = {}
    Object.entries(value).forEach(([key, item]) => {
      if (key.startsWith("_") || typeof item === "function") return
      const cloned = cloneObject(item, ancestors)
      if (cloned !== undefined) result[key] = cloned
    })
    ancestors.delete(value)
    return result
  }
  ancestors.delete(value)
  return value
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function translateFormula(formula, rowDelta = 0, sourceSheetName = null, targetSheetName = null) {
  let translated = String(formula || "")
  if (sourceSheetName && targetSheetName && sourceSheetName !== targetSheetName) {
    const sourceQuoted = `'${sourceSheetName.replace(/'/g, "''")}'!`
    const targetQuoted = `'${targetSheetName.replace(/'/g, "''")}'!`
    translated = translated.replace(new RegExp(escapeRegExp(sourceQuoted), "g"), targetQuoted)
    translated = translated.replace(
      new RegExp(`(?<![A-Za-z0-9_'])${escapeRegExp(sourceSheetName)}!`, "g"),
      targetQuoted,
    )
  }
  if (!rowDelta) return translated
  return translated.replace(/(\$?[A-Z]{1,3})(\$?)([1-9][0-9]*)/g, (match, column, absoluteRow, row) => {
    if (absoluteRow === "$") return match
    return `${column}${Math.max(1, Number(row) + rowDelta)}`
  })
}

function uniqueSheetName(baseName, usedNames) {
  const cleaned = String(baseName || "Capital Account")
    .replace(/[\\/?*:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Capital Account"
  const base = cleaned.slice(0, 31)
  let candidate = base
  let counter = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` ${counter}`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
    counter += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

function copyCell(sourceCell, targetCell, { rowDelta = 0, sourceSheetName = null, targetSheetName = null } = {}) {
  const value = cloneObject(sourceCell.value)
  if (value && typeof value === "object" && value.formula) {
    value.formula = translateFormula(value.formula, rowDelta, sourceSheetName, targetSheetName)
  }
  targetCell.value = value
  targetCell.style = cloneObject(sourceCell.style || {})
  targetCell.numFmt = sourceCell.numFmt
  targetCell.note = cloneObject(sourceCell.note)
  targetCell.dataValidation = cloneObject(sourceCell.dataValidation)
  targetCell.protection = cloneObject(sourceCell.protection)
}

function copyPrototypeRow(worksheet, sourceRowNumber, targetRowNumber) {
  const sourceRow = worksheet.getRow(sourceRowNumber)
  const targetRow = worksheet.getRow(targetRowNumber)
  targetRow.height = sourceRow.height
  targetRow.hidden = sourceRow.hidden
  targetRow.outlineLevel = sourceRow.outlineLevel
  sourceRow.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
    copyCell(sourceCell, targetRow.getCell(columnNumber), { rowDelta: targetRowNumber - sourceRowNumber })
  })
}

function cloneWorksheet(workbook, source, name) {
  const target = workbook.addWorksheet(name, {
    properties: cloneObject(source.properties),
    pageSetup: cloneObject(source.pageSetup),
    views: cloneObject(source.views),
  })
  target.state = source.state
  target.headerFooter = cloneObject(source.headerFooter)
  target.pageMargins = cloneObject(source.pageMargins)
  target.autoFilter = cloneObject(source.autoFilter)

  source.columns.forEach((sourceColumn, index) => {
    const targetColumn = target.getColumn(index + 1)
    targetColumn.width = sourceColumn.width
    targetColumn.hidden = sourceColumn.hidden
    targetColumn.outlineLevel = sourceColumn.outlineLevel
    targetColumn.style = cloneObject(sourceColumn.style || {})
  })
  source.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
    const targetRow = target.getRow(rowNumber)
    targetRow.height = sourceRow.height
    targetRow.hidden = sourceRow.hidden
    targetRow.outlineLevel = sourceRow.outlineLevel
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
      copyCell(sourceCell, targetRow.getCell(columnNumber), {
        sourceSheetName: source.name,
        targetSheetName: name,
      })
    })
  })
  ;(source.model?.merges || []).forEach((range) => target.mergeCells(range))
  ;(source.getImages?.() || []).forEach((image) => {
    target.addImage(image.imageId, cloneObject(image.range))
  })
  return target
}

function bindingCell(binding) {
  return typeof binding === "string" ? binding : binding?.cell
}

function writeBindings(worksheet, bindings, values) {
  Object.entries(bindings || {}).forEach(([field, binding]) => {
    const address = bindingCell(binding)
    if (!address) return
    const cell = worksheet.getCell(address)
    if (binding?.mode === "preserve_formula" && cell.value && typeof cell.value === "object" && cell.value.formula) {
      return
    }
    cell.value = values?.[field] ?? null
  })
}

function shiftBindingsAfterRow(bindings, startRow, rowDelta) {
  if (!rowDelta) return bindings
  return Object.fromEntries(Object.entries(bindings || {}).map(([field, binding]) => {
    const address = bindingCell(binding)
    const match = String(address || "").match(/^([A-Z]+)([1-9][0-9]*)$/)
    if (!match || Number(match[2]) <= startRow) return [field, binding]
    const shifted = `${match[1]}${Number(match[2]) + rowDelta}`
    return [field, typeof binding === "string" ? shifted : { ...binding, cell: shifted }]
  }))
}

function fillRepeatingTable(worksheet, table, rows) {
  const startRow = Number(table?.data_start_row || 0)
  if (!startRow) return
  const styleRow = Number(table?.style_source_row || startRow)
  const columns = table?.columns || {}
  const sourceRowSnapshot = new Map()
  worksheet.getRow(styleRow).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    sourceRowSnapshot.set(columnNumber, {
      value: cloneObject(cell.value),
      style: cloneObject(cell.style || {}),
      numFmt: cell.numFmt,
      note: cloneObject(cell.note),
      dataValidation: cloneObject(cell.dataValidation),
      protection: cloneObject(cell.protection),
    })
  })
  const sourceHeight = worksheet.getRow(styleRow).height

  if (rows.length > 1) {
    worksheet.spliceRows(startRow + 1, 0, ...Array.from({ length: rows.length - 1 }, () => []))
  }

  const restoreRow = (targetRowNumber) => {
    const targetRow = worksheet.getRow(targetRowNumber)
    targetRow.height = sourceHeight
    sourceRowSnapshot.forEach((snapshot, columnNumber) => {
      const targetCell = targetRow.getCell(columnNumber)
      const value = cloneObject(snapshot.value)
      if (value && typeof value === "object" && value.formula) {
        value.formula = translateFormula(value.formula, targetRowNumber - styleRow)
      }
      targetCell.value = value
      targetCell.style = cloneObject(snapshot.style)
      targetCell.numFmt = snapshot.numFmt
      targetCell.note = cloneObject(snapshot.note)
      targetCell.dataValidation = cloneObject(snapshot.dataValidation)
      targetCell.protection = cloneObject(snapshot.protection)
    })
  }

  if (!rows.length) {
    Object.values(columns).forEach((column) => {
      worksheet.getCell(`${column}${startRow}`).value = null
    })
    return
  }

  rows.forEach((row, index) => {
    const rowNumber = startRow + index
    restoreRow(rowNumber)
    Object.entries(columns).forEach(([field, column]) => {
      worksheet.getCell(`${column}${rowNumber}`).value = row?.[field] ?? null
    })
  })
}

function statementValues(statement, context) {
  return {
    ...statement,
    fund_name: context.fundName,
    accounting_basis: context.accountingBasis,
  }
}

class CapitalAccountTemplateWriterService {
  static async write({ templatePath, config, data, fundName, outputPath }) {
    const normalizedConfig = CapitalAccountTemplateService.validateConfig(config)
    const readiness = CapitalAccountTemplateService.evaluateReadiness(normalizedConfig)
    if (!readiness.can_activate) {
      throw new CashFlowService.CashFlowValidationError(
        readiness.activation_block_reason || "CAS template mappings are incomplete",
        readiness,
      )
    }

    const workbook = await readWorkbookFromFile({
      filePath: templatePath,
      label: "Capital account statement template",
      ValidationErrorCtor: CashFlowService.CashFlowValidationError,
    })
    const summary = workbook.getWorksheet(normalizedConfig.summary.sheet_name)
    const prototype = workbook.getWorksheet(normalizedConfig.statement.prototype_sheet_name)
    if (!summary || !prototype || summary.id === prototype.id) {
      throw new CashFlowService.CashFlowValidationError(
        "CAS template must contain separate mapped summary and statement prototype sheets",
      )
    }

    const context = {
      fundName: fundName || "Fund",
      accountingBasis: data.accounting_basis || null,
    }
    writeBindings(summary, normalizedConfig.summary.scalar_bindings, {
      fund_name: context.fundName,
      period_start: data.period?.start,
      period_end: data.period?.end,
      accounting_basis: data.accounting_basis,
    })
    fillRepeatingTable(summary, normalizedConfig.summary.table, data.statements || [])
    writeBindings(
      summary,
      shiftBindingsAfterRow(
        normalizedConfig.summary.totals_bindings,
        Number(normalizedConfig.summary.table.data_start_row || 0),
        Math.max((data.statements || []).length - 1, 0),
      ),
      data.totals || {},
    )

    const usedNames = new Set(workbook.worksheets.map((sheet) => sheet.name.toLowerCase()))
    const generatedSheets = []
    ;(data.statements || []).forEach((statement) => {
      const sheetName = uniqueSheetName(`${statement.investor_name} ${statement.share_class}`, usedNames)
      const sheet = cloneWorksheet(workbook, prototype, sheetName)
      writeBindings(sheet, normalizedConfig.statement.scalar_bindings, statementValues(statement, context))
      fillRepeatingTable(sheet, normalizedConfig.statement.activity_table, statement.activity || [])
      generatedSheets.push(sheet)
    })
    workbook.removeWorksheet(prototype.id)
    workbook.calcProperties.fullCalcOnLoad = true
    workbook.calcProperties.forceFullCalc = true
    workbook.calcProperties.calcMode = "auto"
    await workbook.xlsx.writeFile(outputPath)
    return { outputPath, generatedSheetCount: generatedSheets.length }
  }
}

module.exports = CapitalAccountTemplateWriterService
module.exports._private = {
  cloneObject,
  translateFormula,
  uniqueSheetName,
  copyPrototypeRow,
  cloneWorksheet,
  fillRepeatingTable,
  shiftBindingsAfterRow,
}
