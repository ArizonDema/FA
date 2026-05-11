const fs = require("fs")
const ExcelJS = require("exceljs")
const JSZip = require("jszip")

const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const WORKBOOK_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"

function buildInvalidWorkbookMessage(label) {
  return `${label} is not a valid .xlsx workbook or is corrupted. Re-export it as an Excel .xlsx file and try again.`
}

function isWorkbookParseError(error) {
  const message = String(error?.message || "").toLowerCase()
  return (
    message.includes("reading 'sheets'") ||
    message.includes('reading "sheets"') ||
    message.includes("cannot merge already merged cells") ||
    message.includes("setting 'sheetno'") ||
    message.includes('setting "sheetno"') ||
    message.includes("end of central directory") ||
    message.includes("invalid signature") ||
    message.includes("unsupported zip") ||
    message.includes("bad crc") ||
    message.includes("unexpected end of file")
  )
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function decodeColumnLetters(columnLetters) {
  return String(columnLetters || "")
    .split("")
    .reduce((value, character) => value * 26 + (character.charCodeAt(0) - 64), 0)
}

function parseCellRange(range) {
  const [start, end] = String(range || "").split(":")
  const startMatch = start?.match(/^([A-Z]+)(\d+)$/)
  const endMatch = end?.match(/^([A-Z]+)(\d+)$/)
  if (!startMatch || !endMatch) return null
  return {
    startRow: Number(startMatch[2]),
    startCol: decodeColumnLetters(startMatch[1]),
    endRow: Number(endMatch[2]),
    endCol: decodeColumnLetters(endMatch[1]),
  }
}

function rangeContains(outerRef, innerRef) {
  const outer = parseCellRange(outerRef)
  const inner = parseCellRange(innerRef)
  if (!outer || !inner || outerRef === innerRef) return false
  return (
    outer.startRow <= inner.startRow &&
    outer.startCol <= inner.startCol &&
    outer.endRow >= inner.endRow &&
    outer.endCol >= inner.endCol
  )
}

function normalizeSpreadsheetTagPrefixes(xml) {
  const prefixMatch = String(xml || "").match(
    /xmlns:([A-Za-z0-9_]+)="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/,
  )
  if (!prefixMatch) return String(xml || "")

  const prefix = prefixMatch[1]
  let normalized = String(xml || "").replace(
    new RegExp(`xmlns:${escapeRegExp(prefix)}="${escapeRegExp(SPREADSHEETML_NS)}"`),
    `xmlns="${SPREADSHEETML_NS}"`,
  )
  normalized = normalized.replace(new RegExp(`<(/?)${escapeRegExp(prefix)}:`, "g"), "<$1")
  return normalized
}

function fixContentTypesXml(xml) {
  let normalized = String(xml || "")
  if (/<Default Extension="xml" ContentType="[^"]+"\s*\/>/.test(normalized)) {
    normalized = normalized.replace(
      /<Default Extension="xml" ContentType="[^"]+"\s*\/>/,
      '<Default Extension="xml" ContentType="application/xml" />',
    )
  } else if (!/Extension="xml"/.test(normalized)) {
    normalized = normalized.replace(
      /<Types[^>]*>/,
      '$&<Default Extension="xml" ContentType="application/xml" />',
    )
  }

  if (!/PartName="\/xl\/workbook\.xml"/.test(normalized)) {
    normalized = normalized.replace(
      /<\/Types>/,
      `<Override PartName="/xl/workbook.xml" ContentType="${WORKBOOK_CONTENT_TYPE}" /></Types>`,
    )
  }

  return normalized
}

function fixRootRelationshipsXml(xml) {
  return String(xml || "").replace(/Target="\/xl\/workbook\.xml"/g, 'Target="xl/workbook.xml"')
}

function fixWorkbookRelationshipsXml(xml) {
  return String(xml || "")
    .replace(/Target="\/xl\/styles\.xml"/g, 'Target="styles.xml"')
    .replace(/Target="\/xl\/theme\/theme1\.xml"/g, 'Target="theme/theme1.xml"')
    .replace(/Target="\/xl\/sharedStrings\.xml"/g, 'Target="sharedStrings.xml"')
    .replace(/Target="\/xl\/worksheets\//g, 'Target="worksheets/')
}

function removeOverlappingMergeRanges(xml) {
  const mergeCellsMatch = String(xml || "").match(/<mergeCells[^>]*>([\s\S]*?)<\/mergeCells>/)
  if (!mergeCellsMatch) return String(xml || "")

  const refs = Array.from(
    mergeCellsMatch[1].matchAll(/<mergeCell[^>]*ref="([A-Z0-9:]+)"\s*\/?>/g),
  ).map((match) => match[1])

  if (!refs.length) return String(xml || "")

  const filteredRefs = refs.filter((ref) => !refs.some((other) => rangeContains(other, ref)))
  const replacement = filteredRefs.length
    ? `<mergeCells count="${filteredRefs.length}">${filteredRefs
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : ""

  return String(xml || "").replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/, replacement)
}

async function attemptWorkbookRepair(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  let changed = false

  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    if (!entryName.endsWith(".xml") && !entryName.endsWith(".rels")) continue

    const original = await entry.async("string")
    let normalized = original

    if (entryName === "[Content_Types].xml") {
      normalized = fixContentTypesXml(normalized)
    } else if (entryName === "_rels/.rels") {
      normalized = fixRootRelationshipsXml(normalized)
    } else if (entryName === "xl/_rels/workbook.xml.rels") {
      normalized = fixWorkbookRelationshipsXml(normalized)
    }

    if (
      entryName === "xl/workbook.xml" ||
      entryName === "xl/styles.xml" ||
      entryName === "xl/sharedStrings.xml" ||
      entryName.startsWith("xl/worksheets/")
    ) {
      normalized = normalizeSpreadsheetTagPrefixes(normalized)
    }

    if (entryName.startsWith("xl/worksheets/")) {
      normalized = removeOverlappingMergeRanges(normalized)
    }

    if (normalized !== original) {
      zip.file(entryName, normalized)
      changed = true
    }
  }

  if (!changed) return null
  return await zip.generateAsync({ type: "nodebuffer" })
}

async function loadWorkbookWithRecovery({ buffer, label, ValidationErrorCtor }) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
    return workbook
  } catch (error) {
    if (!isWorkbookParseError(error)) {
      throw toWorkbookValidationError({
        error,
        label,
        ValidationErrorCtor,
      })
    }

    try {
      const repairedBuffer = await attemptWorkbookRepair(buffer)
      if (!repairedBuffer) {
        throw error
      }
      const repairedWorkbook = new ExcelJS.Workbook()
      await repairedWorkbook.xlsx.load(repairedBuffer)
      return repairedWorkbook
    } catch (repairError) {
      throw toWorkbookValidationError({
        error: repairError,
        label,
        ValidationErrorCtor,
      })
    }
  }
}

function toWorkbookValidationError({ error, label, ValidationErrorCtor }) {
  if (error instanceof ValidationErrorCtor) return error
  if (error?.code === "ENOENT") {
    return new ValidationErrorCtor(`${label} file not found`)
  }
  if (isWorkbookParseError(error)) {
    return new ValidationErrorCtor(buildInvalidWorkbookMessage(label), {
      original_error: String(error?.message || ""),
    })
  }
  return error
}

async function readWorkbookFromFile({ filePath, label, ValidationErrorCtor }) {
  try {
    const buffer = fs.readFileSync(filePath)
    return await loadWorkbookWithRecovery({
      buffer,
      label,
      ValidationErrorCtor,
    })
  } catch (error) {
    throw toWorkbookValidationError({
      error,
      label,
      ValidationErrorCtor,
    })
  }
}

async function loadWorkbookFromBuffer({ buffer, label, ValidationErrorCtor }) {
  try {
    return await loadWorkbookWithRecovery({
      buffer,
      label,
      ValidationErrorCtor,
    })
  } catch (error) {
    throw toWorkbookValidationError({
      error,
      label,
      ValidationErrorCtor,
    })
  }
  return workbook
}

module.exports = {
  readWorkbookFromFile,
  loadWorkbookFromBuffer,
  toWorkbookValidationError,
}
