import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, "Liquidity_Flight_Plan_2026.xlsx");

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Liquidity Flight Plan");
sheet.showGridLines = false;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rows = [
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Liquidity Flight Plan", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Scenario", "Board view", "Currency", "USD", "Prepared for", "Adversarial analyzer check", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Signal map", "Do not type account names here", "Cash lane", "Cash behavior", "Owner", ...months, "FY check", "Analyzer notes"],
  ["Runway", "anchor", "opening", "Cash at start of runway", "system", ...Array(12).fill(0), "=SUM(F6:Q6)", "opening target"],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Cash-in flywheel", "front door", "customer", "Customer money landed", "system", ...Array(12).fill(0), "=SUM(F8:Q8)", "customer receipts"],
  ["Cash-in flywheel", "edge", "other", "Refunds, rebates, and odd receipts", "system", ...Array(12).fill(0), "=SUM(F9:Q9)", "other operating inflow"],
  ["Cash-in flywheel", "subtotal", "calc", "Topline cash generated", "formula", ...Array(12).fill(null), "=SUM(F10:Q10)", "formula only"],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Runway burn", "partners", "operating", "Marketplace partner settlements", "system", ...Array(12).fill(0), "=SUM(F12:Q12)", "supplier cash"],
  ["Runway burn", "people", "operating", "People runway spend", "system", ...Array(12).fill(0), "=SUM(F13:Q13)", "payroll cash"],
  ["Runway burn", "space", "operating", "Studio and space commitment cash", "system", ...Array(12).fill(0), "=SUM(F14:Q14)", "rent/facilities"],
  ["Runway burn", "demand", "operating", "Audience acquisition cash", "system", ...Array(12).fill(0), "=SUM(F15:Q15)", "marketing cash"],
  ["Runway burn", "platform", "operating", "Operating backbone cash", "system", ...Array(12).fill(0), "=SUM(F16:Q16)", "admin/overhead"],
  ["Runway burn", "civic", "operating", "Government remittance cash", "system", ...Array(12).fill(0), "=SUM(F17:Q17)", "tax cash"],
  ["Runway burn", "subtotal", "calc", "Operating cash drag", "formula", ...Array(12).fill(null), "=SUM(F18:Q18)", "formula only"],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Long-game build", "equipment", "investing", "Workshop kit purchases", "system", ...Array(12).fill(0), "=SUM(F20:Q20)", "capex"],
  ["Long-game build", "software", "investing", "Code asset capitalization", "system", ...Array(12).fill(0), "=SUM(F21:Q21)", "software capex"],
  ["Long-game build", "exit", "investing", "Equipment resale receipts", "system", ...Array(12).fill(0), "=SUM(F22:Q22)", "asset sale"],
  ["Long-game build", "subtotal", "calc", "Long-game cash swing", "formula", ...Array(12).fill(null), "=SUM(F23:Q23)", "formula only"],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Capital oxygen", "borrow", "financing", "Line-of-credit oxygen", "system", ...Array(12).fill(0), "=SUM(F25:Q25)", "debt draw"],
  ["Capital oxygen", "repay", "financing", "Lender principal sendback", "system", ...Array(12).fill(0), "=SUM(F26:Q26)", "debt repay"],
  ["Capital oxygen", "cost", "financing", "Borrowing cost cash", "system", ...Array(12).fill(0), "=SUM(F27:Q27)", "interest paid"],
  ["Capital oxygen", "sponsors", "financing", "Sponsor oxygen", "system", ...Array(12).fill(0), "=SUM(F28:Q28)", "equity in"],
  ["Capital oxygen", "owners", "financing", "Owner cash sweeps", "system", ...Array(12).fill(0), "=SUM(F29:Q29)", "distributions"],
  ["Capital oxygen", "subtotal", "calc", "Capital stack cash swing", "formula", ...Array(12).fill(null), "=SUM(F30:Q30)", "formula only"],
  ["", "", "", "", "", ...Array(12).fill(""), "", ""],
  ["Runway", "net", "calc", "Net runway change", "formula", ...Array(12).fill(null), "=SUM(F32:Q32)", "formula only"],
  ["Runway", "anchor", "closing", "Cash at end of runway", "system", ...Array(12).fill(0), "=SUM(F33:Q33)", "closing target"],
];

sheet.getRange(`A1:S${rows.length}`).values = rows;
sheet.getRange("A2:S2").merge();

for (let col = 6; col <= 17; col += 1) {
  const letter = String.fromCharCode(64 + col);
  sheet.getRange(`${letter}10`).formulas = [[`=SUM(${letter}8:${letter}9)`]];
  sheet.getRange(`${letter}18`).formulas = [[`=SUM(${letter}12:${letter}17)`]];
  sheet.getRange(`${letter}23`).formulas = [[`=SUM(${letter}20:${letter}22)`]];
  sheet.getRange(`${letter}30`).formulas = [[`=SUM(${letter}25:${letter}29)`]];
  sheet.getRange(`${letter}32`).formulas = [[`=SUM(${letter}8:${letter}9)-SUM(${letter}12:${letter}17)-SUM(${letter}20:${letter}21)+SUM(${letter}22)+SUM(${letter}25:${letter}28)-SUM(${letter}26:${letter}27)-SUM(${letter}29)`]];
}

sheet.getRange("A2").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  horizontalAlignment: "center",
};
sheet.getRange("A5:S5").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#17365D" },
  wrapText: true,
};
sheet.getRange("A6:S33").format = {
  font: { color: "#1F2933" },
};
sheet.getRange("F6:R33").format.numberFormat = "$#,##0;($#,##0);-";
sheet.getRange("D6:D33").format = { wrapText: true };
sheet.getRange("A6:E33").format = { wrapText: true };

for (const rowIndex of [10, 18, 23, 30, 32]) {
  sheet.getRange(`A${rowIndex}:S${rowIndex}`).format = {
    fill: "#EEF2F6",
    font: { bold: true, color: "#102A43" },
  };
}
sheet.getRange("A33:S33").format = {
  fill: "#E8F5E9",
  font: { bold: true, color: "#1B5E20" },
};

sheet.getRange("A1").format.columnWidthPx = 120;
sheet.getRange("B1").format.columnWidthPx = 95;
sheet.getRange("C1").format.columnWidthPx = 90;
sheet.getRange("D1").format.columnWidthPx = 220;
sheet.getRange("E1").format.columnWidthPx = 80;
sheet.getRange("F1:R1").format.columnWidthPx = 78;
sheet.getRange("S1").format.columnWidthPx = 130;
sheet.freezePanes.freezeRows(5);

const preview = await workbook.render({
  sheetName: "Liquidity Flight Plan",
  range: "A1:S33",
  scale: 1,
  format: "png",
});
await fs.writeFile(path.join(__dirname, "Liquidity_Flight_Plan_2026.png"), new Uint8Array(await preview.arrayBuffer()));

await fs.mkdir(__dirname, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
