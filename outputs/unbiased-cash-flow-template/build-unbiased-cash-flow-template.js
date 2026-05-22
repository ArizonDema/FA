const path = require('path');
const ExcelJS = require('exceljs');

const outputPath = path.join(__dirname, 'unbiased-cash-flow-template-2026.xlsx');

const months = [
  'Jan 2026',
  'Feb 2026',
  'Mar 2026',
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
  'Dec 2026',
];

const sections = [
  {
    title: 'Counterparty value gathered',
    polarity: 'in',
    rows: [
      'Channel sweep deposits',
      'Marketplace settlement drops',
      'Maintenance retainers banked',
      'Recovered chargeback reserve',
      'Public incentive remittances',
      'Warranty pool releases',
      'Other bank-side value captured',
      'Unassigned intake line A',
      'Unassigned intake line B',
    ],
  },
  {
    title: 'Run-the-place cash calls',
    polarity: 'out',
    rows: [
      'Vendor passage payments',
      'Fulfillment lane charges',
      'Team stipend clearings',
      'Workspace occupancy uses',
      'Cloud and toolchain withdrawals',
      'Client goodwill credits paid',
      'Statutory desk remittances',
      'Professional review disbursements',
      'Insurance and surety draws',
      'Unassigned operating use A',
      'Unassigned operating use B',
    ],
  },
  {
    title: 'Capacity reshaping movements',
    polarity: 'mixed',
    rows: [
      { label: 'Build-out escrow returned', sign: 1 },
      { label: 'Workshop readiness transfers', sign: -1 },
      { label: 'Equipment renewal wires', sign: -1 },
      { label: 'Durable software license buys', sign: -1 },
      { label: 'Retired asset clearing receipts', sign: 1 },
      { label: 'Unassigned capacity movement', sign: -1 },
    ],
  },
  {
    title: 'Funding architecture movements',
    polarity: 'mixed',
    rows: [
      { label: 'Partner funding calls received', sign: 1 },
      { label: 'Facility draw notices funded', sign: 1 },
      { label: 'Facility amortization wires', sign: -1 },
      { label: 'Preference yield settlements', sign: -1 },
      { label: 'Reserve account top-ups', sign: -1 },
      { label: 'Unassigned funding movement', sign: 1 },
    ],
  },
];

const workbook = new ExcelJS.Workbook();
workbook.creator = 'Codex';
workbook.created = new Date(2026, 0, 1);
workbook.modified = new Date(2026, 0, 1);
workbook.calcProperties.fullCalcOnLoad = true;

const ws = workbook.addWorksheet('2026 Cash Motion', {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }],
  pageSetup: {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  },
});

ws.columns = [
  { header: '', key: 'label', width: 36 },
  ...months.map((month) => ({ header: month, key: month, width: 13 })),
];

const palette = {
  ink: '20323A',
  header: '2F4858',
  headerText: 'FFFFFF',
  section: 'D7E7DF',
  input: 'FFF6D8',
  formula: 'EAF2F8',
  total: 'C9DBF2',
  close: 'B9D8C2',
  border: '8EA3AD',
  note: 'F4F1EA',
};

function fill(cell, color) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function border(cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: palette.border } },
    left: { style: 'thin', color: { argb: palette.border } },
    bottom: { style: 'thin', color: { argb: palette.border } },
    right: { style: 'thin', color: { argb: palette.border } },
  };
}

function styleRow(row, color, bold = false) {
  row.eachCell((cell) => {
    fill(cell, color);
    border(cell);
    cell.font = { name: 'Aptos', size: 10, bold, color: { argb: palette.ink } };
  });
}

function amountStyle(cell, color) {
  fill(cell, color);
  border(cell);
  cell.numFmt = '#,##0;[Red](#,##0);-';
  cell.font = { name: 'Aptos', size: 10, color: { argb: palette.ink } };
  cell.alignment = { horizontal: 'right' };
}

ws.mergeCells('A1:M1');
ws.getCell('A1').value = 'Cash Motion Template - 2026 Monthly Direct Method';
ws.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: palette.headerText } };
ws.getCell('A1').alignment = { vertical: 'middle' };
fill(ws.getCell('A1'), palette.header);
ws.getRow(1).height = 26;

ws.mergeCells('A2:M2');
ws.getCell('A2').value =
  'Yellow cells are writable. Blue and green cells are formulas. Labels are intentionally accountant-readable but non-standard.';
ws.getCell('A2').font = { name: 'Aptos', size: 10, italic: true, color: { argb: palette.ink } };
fill(ws.getCell('A2'), palette.note);

const headerRow = ws.getRow(4);
headerRow.values = ['Cash motion line', ...months];
headerRow.eachCell((cell) => {
  fill(cell, palette.header);
  border(cell);
  cell.font = { name: 'Aptos', bold: true, color: { argb: palette.headerText } };
  cell.alignment = { horizontal: 'center' };
});

let currentRow = 6;
const openingRow = currentRow;
ws.getCell(`A${currentRow}`).value = 'Opening bank position';
for (let col = 2; col <= 13; col += 1) {
  const cell = ws.getRow(currentRow).getCell(col);
  cell.value = col === 2 ? 85000 : 0;
  amountStyle(cell, col === 2 ? palette.input : palette.formula);
}
styleRow(ws.getRow(currentRow), palette.formula, true);
amountStyle(ws.getCell('B6'), palette.input);
currentRow += 2;

const summaryRows = [];

for (const section of sections) {
  const titleRow = currentRow;
  ws.getCell(`A${titleRow}`).value = section.title;
  ws.mergeCells(titleRow, 1, titleRow, 13);
  styleRow(ws.getRow(titleRow), palette.section, true);
  currentRow += 1;

  const firstInputRow = currentRow;
  for (const item of section.rows) {
    const label = typeof item === 'string' ? item : item.label;
    ws.getCell(`A${currentRow}`).value = label;
    ws.getCell(`A${currentRow}`).font = { name: 'Aptos', size: 10, color: { argb: palette.ink } };
    border(ws.getCell(`A${currentRow}`));

    for (let col = 2; col <= 13; col += 1) {
      const cell = ws.getRow(currentRow).getCell(col);
      cell.value = 0;
      amountStyle(cell, palette.input);
    }
    currentRow += 1;
  }
  const lastInputRow = currentRow - 1;

  const subtotalRow = currentRow;
  const prefix = section.polarity === 'out' ? 'Cash used by ' : 'Cash supplied by ';
  ws.getCell(`A${subtotalRow}`).value = `${prefix}${section.title.toLowerCase()}`;
  for (let col = 2; col <= 13; col += 1) {
    const letter = ws.getColumn(col).letter;
    const subtotalCell = ws.getRow(subtotalRow).getCell(col);
    if (section.polarity === 'mixed') {
      const signedTerms = section.rows.map((item, offset) => {
        const sign = item.sign || 1;
        const ref = `${letter}${firstInputRow + offset}`;
        return sign === -1 ? `-${ref}` : ref;
      });
      subtotalCell.value = { formula: signedTerms.join('+').replace(/\+-/g, '-') };
    } else {
      subtotalCell.value = { formula: `SUM(${letter}${firstInputRow}:${letter}${lastInputRow})` };
    }
    amountStyle(subtotalCell, palette.total);
  }
  styleRow(ws.getRow(subtotalRow), palette.total, true);
  summaryRows.push({ row: subtotalRow, polarity: section.polarity });
  currentRow += 2;
}

const netRow = currentRow;
ws.getCell(`A${netRow}`).value = 'Monthly change in bank position';
for (let col = 2; col <= 13; col += 1) {
  const letter = ws.getColumn(col).letter;
  const terms = summaryRows.map(({ row, polarity }) => {
    const ref = `${letter}${row}`;
    return polarity === 'out' ? `-${ref}` : ref;
  });
  ws.getRow(netRow).getCell(col).value = { formula: terms.join('+').replace(/\+-/g, '-') };
  amountStyle(ws.getRow(netRow).getCell(col), palette.total);
}
styleRow(ws.getRow(netRow), palette.total, true);
currentRow += 1;

const closingRow = currentRow;
ws.getCell(`A${closingRow}`).value = 'Closing bank position';
for (let col = 2; col <= 13; col += 1) {
  const letter = ws.getColumn(col).letter;
  ws.getRow(closingRow).getCell(col).value = { formula: `${letter}${openingRow}+${letter}${netRow}` };
  amountStyle(ws.getRow(closingRow).getCell(col), palette.close);
}
styleRow(ws.getRow(closingRow), palette.close, true);

for (let col = 3; col <= 13; col += 1) {
  const priorMonth = ws.getColumn(col - 1).letter;
  const openingCell = ws.getRow(openingRow).getCell(col);
  openingCell.value = { formula: `${priorMonth}${closingRow}` };
  amountStyle(openingCell, palette.formula);
}

ws.autoFilter = {
  from: 'A4',
  to: 'M4',
};

for (let row = 1; row <= closingRow; row += 1) {
  ws.getRow(row).eachCell((cell) => {
    cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
  });
}

const notes = workbook.addWorksheet('Read Me');
notes.columns = [{ width: 30 }, { width: 90 }];
notes.addRows([
  ['Purpose', 'A deliberately non-easy, direct-method monthly cash-flow template for analyzer testing.'],
  ['Writable cells', 'Yellow monthly amount cells are intentionally blank/zero and may be overwritten by a tester.'],
  ['Formula cells', 'Subtotal, monthly change, and closing bank position rows use formulas.'],
  ['Design constraint', 'Line names avoid common cash-flow labels while remaining understandable to accounting users.'],
]);
notes.eachRow((row) => {
  row.eachCell((cell) => {
    border(cell);
    cell.font = { name: 'Aptos', size: 10, color: { argb: palette.ink } };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });
});

workbook.xlsx.writeFile(outputPath).then(() => {
  console.log(outputPath);
});
