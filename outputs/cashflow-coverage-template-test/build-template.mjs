import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/Mano PC/FA/outputs/cashflow-coverage-template-test";
const outputPath = `${outputDir}/Liquidity_Movement_Board_Coverage_Test.xlsx`;

await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Liquidity Board");
sheet.showGridLines = false;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rows = [
  ["Section", "Cash lane", ...months, "FY Total"],
  ["Anchors", "Cash at start", ...Array(12).fill(null), null],
  ["", "", ...Array(12).fill(null), null],
  ["Operating current", "Buyer cash landed", ...Array(12).fill(null), null],
  ["Operating current", "Operating rebates and recoveries", ...Array(12).fill(null), null],
  ["Operating current", "Vendor passage", ...Array(12).fill(null), null],
  ["Operating current", "People runway", ...Array(12).fill(null), null],
  ["Operating current", "Space commitments", ...Array(12).fill(null), null],
  ["Operating current", "Operating backbone", ...Array(12).fill(null), null],
  ["Operating current", "Authority sweeps", ...Array(12).fill(null), null],
  ["Operating current", "Other operating exits", ...Array(12).fill(null), null],
  ["Operating current", "Operating current subtotal", ...Array(12).fill(null), null],
  ["", "", ...Array(12).fill(null), null],
  ["Build and harvest", "Workshop kit buildout", ...Array(12).fill(null), null],
  ["Build and harvest", "Retired kit proceeds", ...Array(12).fill(null), null],
  ["Build and harvest", "Build and harvest subtotal", ...Array(12).fill(null), null],
  ["", "", ...Array(12).fill(null), null],
  ["Capital channels", "Borrowing draws released", ...Array(12).fill(null), null],
  ["Capital channels", "Lender principal sendback", ...Array(12).fill(null), null],
  ["Capital channels", "Sponsor and member cash in", ...Array(12).fill(null), null],
  ["Capital channels", "Owner preference redemptions", ...Array(12).fill(null), null],
  ["Capital channels", "Capital channels subtotal", ...Array(12).fill(null), null],
  ["", "", ...Array(12).fill(null), null],
  ["Anchors", "Monthly cash movement", ...Array(12).fill(null), null],
  ["Anchors", "Cash at finish", ...Array(12).fill(null), null],
];

sheet.getRange("A1:O1").merge();
sheet.getRange("A1").values = [["Liquidity Movement Board"]];
sheet.getRange("A2:O2").merge();
sheet.getRange("A2").values = [["A deliberately unfamiliar direct cash-flow template for analyzer and coverage-gate testing."]];
sheet.getRange("A4:O28").values = rows;

sheet.getRange("C5:N28").values = Array.from({ length: 24 }, () => Array(12).fill(0));

for (let row = 5; row <= 28; row += 1) {
  sheet.getRange(`O${row}`).formulas = [[`=SUM(C${row}:N${row})`]];
}

for (let col = 3; col <= 14; col += 1) {
  const colLetter = String.fromCharCode(64 + col);
  sheet.getRange(`${colLetter}16`).formulas = [[`=SUM(${colLetter}8:${colLetter}15)`]];
  sheet.getRange(`${colLetter}20`).formulas = [[`=SUM(${colLetter}18:${colLetter}19)`]];
  sheet.getRange(`${colLetter}26`).formulas = [[`=SUM(${colLetter}22:${colLetter}25)`]];
  sheet.getRange(`${colLetter}28`).formulas = [[`=${colLetter}16+${colLetter}20+${colLetter}26`]];
  if (col === 3) {
    sheet.getRange(`${colLetter}29`).formulas = [[`=${colLetter}5+${colLetter}28`]];
  } else {
    const previous = String.fromCharCode(63 + col);
    sheet.getRange(`${colLetter}5`).formulas = [[`=${previous}29`]];
    sheet.getRange(`${colLetter}29`).formulas = [[`=${colLetter}5+${colLetter}28`]];
  }
}
sheet.getRange("O16").formulas = [["=SUM(C16:N16)"]];
sheet.getRange("O20").formulas = [["=SUM(C20:N20)"]];
sheet.getRange("O26").formulas = [["=SUM(C26:N26)"]];
sheet.getRange("O28").formulas = [["=SUM(C28:N28)"]];
sheet.getRange("O29").formulas = [["=N29"]];

sheet.getRange("A1:O1").format = {
  fill: "#153247",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "left",
};
sheet.getRange("A2:O2").format = {
  fill: "#E8F1F4",
  font: { color: "#244356", italic: true },
};
sheet.getRange("A4:O4").format = {
  fill: "#275E6B",
  font: { bold: true, color: "#FFFFFF" },
};
sheet.getRange("A5:O29").format = {
  font: { color: "#14212B" },
  border: {
    bottom: { style: "Continuous", color: "#D7E0E4" },
  },
};
sheet.getRange("A16:O16").format = { fill: "#EEF7F1", font: { bold: true, color: "#173A2C" } };
sheet.getRange("A20:O20").format = { fill: "#F3F2FA", font: { bold: true, color: "#332B58" } };
sheet.getRange("A26:O26").format = { fill: "#FDF3E7", font: { bold: true, color: "#5A3516" } };
sheet.getRange("A28:O29").format = { fill: "#E9EEF6", font: { bold: true, color: "#152338" } };
sheet.getRange("C5:O29").format.numberFormat = "$#,##0;($#,##0);-";
sheet.getRange("A:A").format.columnWidth = 20;
sheet.getRange("B:B").format.columnWidth = 32;
sheet.getRange("C:O").format.columnWidth = 12;
sheet.freezePanes.freezeRows(4);
sheet.freezePanes.freezeColumns(2);

const notes = workbook.worksheets.add("Test Notes");
notes.showGridLines = false;
notes.getRange("A1:D1").merge();
notes.getRange("A1").values = [["How to use this test template"]];
notes.getRange("A3:D9").values = [
  ["Purpose", "This template uses unfamiliar cash-flow row labels so the analyzer has to infer semantics.", "", ""],
  ["Expected analyzer behavior", "Label writable rows to canonical categories like customer receipts, supplier payments, payroll, capex, debt, equity, and distributions.", "", ""],
  ["Intentional gap", "There is no row for Marketing spend.", "", ""],
  ["Intentional gap", "There is no row for Interest paid.", "", ""],
  ["Expected report behavior", "If your company GL has marketing or interest cash movements, report generation should stop with a friendly preflight card.", "", ""],
  ["What should not happen", "The app should not dump raw JSON or quietly push these movements into a generic fallback row.", "", ""],
  ["Suggested fix in app", "Add rows named Marketing spend and Interest paid, reanalyze, then generate again.", "", ""],
];
notes.getRange("A1:D1").format = {
  fill: "#153247",
  font: { bold: true, color: "#FFFFFF", size: 16 },
};
notes.getRange("A3:A9").format = { fill: "#E8F1F4", font: { bold: true, color: "#244356" } };
notes.getRange("B3:D9").format = { wrapText: true };
notes.getRange("A:A").format.columnWidth = 22;
notes.getRange("B:D").format.columnWidth = 34;

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "Liquidity Board", range: "A1:O29", scale: 1, format: "png" });
await workbook.render({ sheetName: "Test Notes", range: "A1:D9", scale: 1, format: "png" });

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
