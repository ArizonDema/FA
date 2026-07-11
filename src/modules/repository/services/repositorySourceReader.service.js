const fs = require("fs")
const path = require("path")
const ExcelJS = require("exceljs")
const JSZip = require("jszip")

const MAX_TEXT_LENGTH = 200000
const MAX_TABLE_ROWS = 2000
const MAX_TABLE_COLUMNS = 80

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function limitText(text) {
  return String(text || "").slice(0, MAX_TEXT_LENGTH)
}

function cellText(value) {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    if (value.result !== undefined) return cellText(value.result)
    if (typeof value.text === "string") return value.text
    if (Array.isArray(value.richText)) return value.richText.map((entry) => entry.text || "").join("")
  }
  return String(value)
}

function textFromWordXml(xml, { preserveParagraphs = true } = {}) {
  const paragraphSeparator = preserveParagraphs ? "\n" : " "
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, paragraphSeparator)
      .replace(/<[^>]+>/g, ""),
  )
}

function wordCellText(xml) {
  return textFromWordXml(xml, { preserveParagraphs: false }).replace(/\s+/g, " ").trim()
}

function extractWordTables(xml) {
  const tables = []
  const tableMatches = String(xml || "").match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || []
  tableMatches.slice(0, 100).forEach((tableXml, tableIndex) => {
    const rows = []
    const rowMatches = tableXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) || []
    rowMatches.slice(0, MAX_TABLE_ROWS).forEach((rowXml) => {
      const cells = []
      const cellMatches = rowXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) || []
      cellMatches.slice(0, MAX_TABLE_COLUMNS).forEach((cellXml) => {
        cells.push(wordCellText(cellXml))
      })
      if (cells.some(Boolean)) rows.push(cells)
    })
    if (rows.length) tables.push({ name: `Word Table ${tableIndex + 1}`, rows })
  })
  return tables
}

async function readDocx(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const document = zip.file("word/document.xml")
  if (!document) throw new Error("DOCX file does not contain word/document.xml")
  const xml = await document.async("string")
  const text = textFromWordXml(xml)
  const tables = extractWordTables(xml)
  return {
    status: "ready",
    format: "docx",
    extraction_method: "docx_xml_text",
    text: limitText(text),
    tables,
    issues: [],
  }
}

async function readSpreadsheet(filePath, extension) {
  const workbook = new ExcelJS.Workbook()
  if (extension === ".csv") {
    await workbook.csv.readFile(filePath)
  } else {
    await workbook.xlsx.readFile(filePath)
  }

  const tables = workbook.worksheets.map((worksheet) => {
    const rows = []
    const rowLimit = Math.min(worksheet.rowCount || 0, MAX_TABLE_ROWS)
    const columnLimit = Math.min(worksheet.columnCount || 0, MAX_TABLE_COLUMNS)
    for (let rowIndex = 1; rowIndex <= rowLimit; rowIndex += 1) {
      const row = []
      for (let columnIndex = 1; columnIndex <= columnLimit; columnIndex += 1) {
        row.push(cellText(worksheet.getCell(rowIndex, columnIndex).value))
      }
      rows.push(row)
    }
    return { name: worksheet.name, rows }
  })
  const text = tables
    .flatMap((table) => [table.name, ...table.rows.map((row) => row.filter(Boolean).join(" | "))])
    .join("\n")

  return {
    status: "ready",
    format: extension.slice(1),
    extraction_method: extension === ".csv" ? "csv_table" : "exceljs_workbook",
    text: limitText(text),
    tables,
    issues: [],
  }
}

async function readPdf(filePath) {
  let parsePdf = null
  try {
    parsePdf = require("pdf-parse")
  } catch (error) {
    return {
      status: "requires_reader",
      format: "pdf",
      extraction_method: null,
      text: "",
      tables: [],
      issues: [
        {
          code: "pdf_reader_unavailable",
          message: "PDF was stored safely, but PDF text extraction is not installed yet. Upload DOCX/TXT or enable a PDF reader.",
        },
      ],
    }
  }

  const parsed = await parsePdf(fs.readFileSync(filePath))
  const text = limitText(parsed.text)
  if (!text.trim()) {
    return {
      status: "requires_reader",
      format: "pdf",
      extraction_method: "pdf_parse",
      text: "",
      tables: [],
      issues: [
        {
          code: "pdf_text_not_detected",
          message: "No searchable text was found in this PDF. Upload a text-searchable PDF/DOCX or apply OCR before extracting key points.",
        },
      ],
    }
  }
  return {
    status: "ready",
    format: "pdf",
    extraction_method: "pdf_parse",
    text,
    tables: [],
    issues: [],
  }
}

function unreadableFormatIssue(extension) {
  if (extension === ".doc") {
    return {
      code: "legacy_word_requires_conversion",
      message: "Legacy .doc files are stored but not readable for key points. Upload a .docx or text-searchable PDF version.",
    }
  }
  if (extension === ".xls") {
    return {
      code: "legacy_excel_requires_conversion",
      message: "Legacy .xls files are stored but not readable for key points. Upload an .xlsx or .csv version.",
    }
  }
  if ([".png", ".jpg", ".jpeg"].includes(extension)) {
    return {
      code: "image_requires_ocr",
      message: "Image files are stored but need OCR before key points can be extracted. Upload a text-searchable PDF or DOCX version.",
    }
  }
  return {
    code: "source_format_not_readable",
    message: `Stored ${extension || "file"} is not machine-readable by repository readers yet.`,
  }
}

class RepositorySourceReaderService {
  static async read({ filePath, extension }) {
    const normalizedExtension = String(extension || path.extname(filePath)).toLowerCase()
    if ([".txt", ".md"].includes(normalizedExtension)) {
      return {
        status: "ready",
        format: normalizedExtension.slice(1),
        extraction_method: "plain_text",
        text: limitText(fs.readFileSync(filePath, "utf8")),
        tables: [],
        issues: [],
      }
    }
    if (normalizedExtension === ".docx") return await readDocx(filePath)
    if ([".xlsx", ".csv"].includes(normalizedExtension)) return await readSpreadsheet(filePath, normalizedExtension)
    if (normalizedExtension === ".pdf") return await readPdf(filePath)
    return {
      status: "requires_reader",
      format: normalizedExtension.replace(".", "") || "unknown",
      extraction_method: null,
      text: "",
      tables: [],
      issues: [unreadableFormatIssue(normalizedExtension)],
    }
  }
}

module.exports = RepositorySourceReaderService
