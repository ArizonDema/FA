const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const outDir = __dirname;
const outPath = path.join(outDir, "agent-5-direct-method-cash-flow-template.xlsx");

const months = [
  ["Jan-26", "2026-01-31"],
  ["Feb-26", "2026-02-28"],
  ["Mar-26", "2026-03-31"],
  ["Apr-26", "2026-04-30"],
  ["May-26", "2026-05-31"],
  ["Jun-26", "2026-06-30"],
  ["Jul-26", "2026-07-31"],
  ["Aug-26", "2026-08-31"],
  ["Sep-26", "2026-09-30"],
  ["Oct-26", "2026-10-31"],
  ["Nov-26", "2026-11-30"],
  ["Dec-26", "2026-12-31"],
];

const inputFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
const formulaFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1FF" } };
const darkFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243142" } };
const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE7F3" } };
const accentFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E8D5" } };
const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDEEBD8" } };

const thin = { style: "thin", color: { argb: "FFD7DEE8" } };
const medium = { style: "medium", color: { argb: "FF6B7280" } };

function monthCol(i) {
  return 4 + i;
}

function addr(row, col) {
  const letters = [];
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    letters.unshift(String.fromCharCode(65 + r));
    n = Math.floor((n - 1) / 26);
  }
  return `${letters.join("")}${row}`;
}

function cell(ws, row, col) {
  return ws.getRow(row).getCell(col);
}

function signedRow(ws, rowNumber, startCol = 4, endCol = 15) {
  for (let c = startCol; c <= endCol; c++) {
    cell(ws, rowNumber, c).numFmt = '#,##0;[Red](#,##0);"-"';
  }
}

function applyMonthFormulaAcross(ws, rowNumber, formulaForCol) {
  for (let c = 4; c <= 15; c++) {
    cell(ws, rowNumber, c).value = { formula: formulaForCol(c) };
    cell(ws, rowNumber, c).fill = formulaFill;
  }
  cell(ws, rowNumber, 16).value = { formula: `SUM(D${rowNumber}:O${rowNumber})` };
  cell(ws, rowNumber, 17).value = { formula: `MIN(D${rowNumber}:O${rowNumber})` };
  cell(ws, rowNumber, 18).value = { formula: `MAX(D${rowNumber}:O${rowNumber})` };
  cell(ws, rowNumber, 16).fill = formulaFill;
  cell(ws, rowNumber, 17).fill = formulaFill;
  cell(ws, rowNumber, 18).fill = formulaFill;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Codex";
  wb.created = new Date("2026-05-13T00:00:00Z");
  wb.modified = new Date("2026-05-13T00:00:00Z");
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet("2026 Direct Cash Bridge", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 8, activeCell: "D9" }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: "line", width: 9 },
    { key: "band", width: 18 },
    { key: "caption", width: 42 },
    ...months.map(([m]) => ({ key: m, width: 13 })),
    { key: "total", width: 14 },
    { key: "low", width: 12 },
    { key: "high", width: 12 },
    { key: "remarks", width: 34 },
  ];

  ws.mergeCells("A1:S1");
  ws.getCell("A1").value = "Direct-Method Cash Flow Template - 12 Monthly Periods, 2026";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").alignment = { vertical: "middle" };
  ws.getCell("A1").fill = darkFill;
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:S2");
  ws.getCell("A2").value =
    "Enter cash movements in the pale writable rows. Blue, green, and amber rows calculate subtotals, net movement, opening cash, and closing cash.";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF455468" } };

  ws.mergeCells("A4:C4");
  ws.getCell("A4").value = "Scenario tag";
  ws.getCell("D4").value = "Base case";
  ws.getCell("D4").fill = inputFill;
  ws.getCell("F4").value = "Currency";
  ws.getCell("G4").value = "USD";
  ws.getCell("G4").fill = inputFill;
  ws.getCell("I4").value = "Prepared by";
  ws.getCell("J4").value = "";
  ws.getCell("J4").fill = inputFill;

  ws.getRow(7).values = [
    "Line",
    "Cash band",
    "Accountant-readable cash line",
    ...months.map(([m]) => m),
    "FY total",
    "Lowest month",
    "Highest month",
    "Template note",
  ];
  ws.getRow(8).values = ["", "", "Period end date", ...months.map(([, d]) => new Date(`${d}T00:00:00Z`)), "", "", "", ""];
  ws.getRow(7).height = 24;

  for (let c = 1; c <= 19; c++) {
    const cell = ws.getCell(7, c);
    cell.fill = darkFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    ws.getCell(8, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F7" } };
    ws.getCell(8, c).font = { italic: true, color: { argb: "FF667085" } };
    ws.getCell(8, c).border = { bottom: thin };
  }
  for (let c = 4; c <= 15; c++) ws.getCell(8, c).numFmt = "mmm d";

  const rowDefs = [
    { type: "section", band: "STARTING POSITION", label: "Opening cash on hand and in bank" },
    { type: "open", band: "Balance", label: "Opening cash on hand and in bank", note: "January is writable; February onward links to the prior month close." },
    { type: "blank" },
    { type: "section", band: "OPERATING INFLOWS", label: "Cash collected from trading activity" },
    { type: "input", band: "Operating in", label: "Till sweeps and card-batch releases", note: "Cash from point-of-sale batches and merchant processors." },
    { type: "input", band: "Operating in", label: "Ledger invoices converted to bank deposits", note: "Collections against billed trade invoices." },
    { type: "input", band: "Operating in", label: "Retainer replenishments and progress draws", note: "Advance or milestone cash released by clients." },
    { type: "input", band: "Operating in", label: "Warranty reserve recoveries from vendors", note: "Supplier reimbursements and claim recoveries." },
    { type: "subtotal", key: "opIn", band: "Operating in", label: "Subtotal - operating cash gathered" },
    { type: "blank" },
    { type: "section", band: "OPERATING OUTFLOWS", label: "Cash paid to keep the business running" },
    { type: "input", band: "Operating out", label: "Crew pay packets and benefit remittances", note: "Cash wages, taxes withheld, and benefit provider payments." },
    { type: "input", band: "Operating out", label: "Premises license fees and service levies", note: "Occupancy-related payments for use of facilities." },
    { type: "input", band: "Operating out", label: "Materials drops, freight, and workshop consumables", note: "Inventory, shipping, supplies, and production consumables." },
    { type: "input", band: "Operating out", label: "Tax authority settlements and filing true-ups", note: "Sales, income, payroll, and other authority cash settlements." },
    { type: "input", band: "Operating out", label: "Customer make-good refunds and chargeback leakage", note: "Cash refunds, reversals, and payment disputes." },
    { type: "subtotal", key: "opOut", band: "Operating out", label: "Subtotal - operating cash released" },
    { type: "calc", key: "opNet", band: "Operating", label: "Net cash carried by operations" },
    { type: "blank" },
    { type: "section", band: "INVESTING FLOWS", label: "Cash tied to long-life assets and deposits" },
    { type: "input", band: "Investing out", label: "Tooling bench upgrades and vehicle fit-outs", note: "Cash spent on durable operating assets." },
    { type: "input", band: "Investing out", label: "System build milestones paid to integrators", note: "Implementation and platform-build cash outlays." },
    { type: "input", band: "Investing in", label: "Proceeds from retiring surplus gear", note: "Cash received from disposals of used assets." },
    { type: "input", band: "Investing out", label: "Security deposits lodged with counterparties", note: "Deposits placed for facilities, utilities, or supply arrangements." },
    { type: "subtotal", key: "invNet", band: "Investing", label: "Net cash from asset and deposit decisions" },
    { type: "blank" },
    { type: "section", band: "FINANCING FLOWS", label: "Cash exchanged with funders and principals" },
    { type: "input", band: "Financing in", label: "Bank line takedowns and note placements", note: "Borrowed money received into the business." },
    { type: "input", band: "Financing out", label: "Scheduled lender amortization and fees", note: "Principal repayment and lender charges paid in cash." },
    { type: "input", band: "Financing in", label: "Partner capital injections cleared", note: "New capital contributions deposited by principals." },
    { type: "input", band: "Financing out", label: "Partner drawings and tax-pocket advances", note: "Cash withdrawn for principals or taxes on their behalf." },
    { type: "subtotal", key: "finNet", band: "Financing", label: "Net cash from funding decisions" },
    { type: "blank" },
    { type: "section", band: "CASH RECONCILIATION", label: "Month-end cash roll-forward" },
    { type: "calc", key: "netMove", band: "Bridge", label: "Net monthly cash movement" },
    { type: "close", key: "close", band: "Balance", label: "Closing cash on hand and in bank", note: "Opening balance plus the month's net cash movement." },
    { type: "check", key: "check", band: "Check", label: "Cross-foot check", note: "Should remain zero after formulas are intact." },
  ];

  const inputRows = [];
  const sectionRows = [];
  const rowByKey = {};
  let r = 9;
  let lineNo = 10;

  for (const def of rowDefs) {
    if (def.type === "blank") {
      r++;
      continue;
    }

    cell(ws, r, 1).value = def.type === "section" ? "" : `CF-${lineNo}`;
    cell(ws, r, 2).value = def.band;
    cell(ws, r, 3).value = def.label;
    cell(ws, r, 19).value = def.note || "";
    cell(ws, r, 19).alignment = { wrapText: true, vertical: "top" };

    if (def.type !== "section") lineNo += 10;
    if (def.key) rowByKey[def.key] = r;

    if (def.type === "section") {
      sectionRows.push(r);
      ws.mergeCells(r, 1, r, 19);
      cell(ws, r, 1).value = def.label;
      cell(ws, r, 1).fill = sectionFill;
      cell(ws, r, 1).font = { bold: true, color: { argb: "FF1F2937" } };
      cell(ws, r, 1).alignment = { vertical: "middle" };
      ws.getRow(r).height = 22;
    } else if (def.type === "input") {
      inputRows.push(r);
      for (let c = 4; c <= 15; c++) cell(ws, r, c).value = 0;
    }
    r++;
  }

  const lastRow = r - 1;

  function sumRows(rows, c) {
    return rows.map((row) => addr(row, c)).join(",");
  }

  const opInRows = inputRows.filter((row) => cell(ws, row, 2).value === "Operating in");
  const opOutRows = inputRows.filter((row) => cell(ws, row, 2).value === "Operating out");
  const invRows = inputRows.filter((row) => String(cell(ws, row, 2).value).startsWith("Investing"));
  const finRows = inputRows.filter((row) => String(cell(ws, row, 2).value).startsWith("Financing"));
  const openRow = 10;
  const closeRow = rowByKey.close;

  applyMonthFormulaAcross(ws, rowByKey.opIn, (c) => `SUM(${sumRows(opInRows, c)})`);
  applyMonthFormulaAcross(ws, rowByKey.opOut, (c) => `SUM(${sumRows(opOutRows, c)})`);
  applyMonthFormulaAcross(ws, rowByKey.opNet, (c) => `${addr(rowByKey.opIn, c)}-${addr(rowByKey.opOut, c)}`);
  applyMonthFormulaAcross(ws, rowByKey.invNet, (c) => {
    const parts = invRows.map((row) => {
      const band = cell(ws, row, 2).value;
      return band === "Investing in" ? addr(row, c) : `-${addr(row, c)}`;
    });
    return parts.join("+").replaceAll("+-", "-");
  });
  applyMonthFormulaAcross(ws, rowByKey.finNet, (c) => {
    const parts = finRows.map((row) => {
      const band = cell(ws, row, 2).value;
      return band === "Financing in" ? addr(row, c) : `-${addr(row, c)}`;
    });
    return parts.join("+").replaceAll("+-", "-");
  });
  applyMonthFormulaAcross(ws, rowByKey.netMove, (c) => `${addr(rowByKey.opNet, c)}+${addr(rowByKey.invNet, c)}+${addr(rowByKey.finNet, c)}`);
  applyMonthFormulaAcross(ws, rowByKey.close, (c) => `${addr(openRow, c)}+${addr(rowByKey.netMove, c)}`);
  applyMonthFormulaAcross(ws, rowByKey.check, (c) => `${addr(rowByKey.close, c)}-${addr(openRow, c)}-${addr(rowByKey.netMove, c)}`);

  for (let c = 4; c <= 15; c++) {
    if (c === 4) {
      cell(ws, openRow, c).value = 0;
      cell(ws, openRow, c).fill = inputFill;
    } else {
      cell(ws, openRow, c).value = { formula: addr(closeRow, c - 1) };
      cell(ws, openRow, c).fill = formulaFill;
    }
  }
  cell(ws, openRow, 16).value = { formula: "D10" };
  cell(ws, openRow, 17).value = { formula: "MIN(D10:O10)" };
  cell(ws, openRow, 18).value = { formula: "MAX(D10:O10)" };

  for (let row = 1; row <= lastRow; row++) {
    for (let c = 1; c <= 19; c++) {
      const currentCell = cell(ws, row, c);
      currentCell.border = { top: thin, bottom: thin, left: thin, right: thin };
      currentCell.alignment = currentCell.alignment || {};
      currentCell.alignment.vertical = "middle";
    }
  }

  for (const row of inputRows) {
    for (let c = 1; c <= 19; c++) cell(ws, row, c).fill = c >= 4 && c <= 15 ? inputFill : cell(ws, row, c).fill;
    signedRow(ws, row);
    cell(ws, row, 3).alignment = { wrapText: true, vertical: "middle" };
  }

  const formulaRows = [rowByKey.opIn, rowByKey.opOut, rowByKey.opNet, rowByKey.invNet, rowByKey.finNet, rowByKey.netMove, rowByKey.close, rowByKey.check];
  for (const row of formulaRows) {
    for (let c = 1; c <= 19; c++) cell(ws, row, c).fill = row === rowByKey.close ? totalFill : formulaFill;
    ws.getRow(row).font = { bold: true };
    cell(ws, row, 3).alignment = { wrapText: true, vertical: "middle" };
    signedRow(ws, row);
  }
  for (let c = 1; c <= 19; c++) cell(ws, rowByKey.netMove, c).fill = accentFill;
  for (let c = 1; c <= 19; c++) cell(ws, openRow, c).fill = c >= 4 && c <= 15 ? cell(ws, openRow, c).fill : totalFill;
  ws.getRow(openRow).font = { bold: true };

  for (let row = 9; row <= lastRow; row++) {
    cell(ws, row, 1).font = { color: { argb: "FF667085" } };
    cell(ws, row, 2).font = { color: { argb: "FF344054" } };
    cell(ws, row, 3).font = { bold: formulaRows.includes(row) || row === openRow };
    for (let c = 4; c <= 18; c++) cell(ws, row, c).numFmt = '#,##0;[Red](#,##0);"-"';
  }

  for (const row of sectionRows) {
    for (let c = 1; c <= 19; c++) {
      cell(ws, row, c).border = { top: medium, bottom: medium };
    }
  }

  ws.autoFilter = { from: "A7", to: "S7" };
  ws.getColumn(19).alignment = { wrapText: true };

  ws.addConditionalFormatting({
    ref: `D${rowByKey.check}:O${rowByKey.check}`,
    rules: [
      {
        type: "cellIs",
        operator: "notEqual",
        formulae: ["0"],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFD6D6" } } },
      },
    ],
  });

  ws.getCell("S4").value = "Writable rows are zero-filled; formula rows are shaded.";
  ws.getCell("S4").alignment = { wrapText: true };
  ws.getCell("S4").font = { italic: true, color: { argb: "FF667085" } };

  await wb.xlsx.writeFile(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
