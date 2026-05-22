from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape


OUT_DIR = Path(r"C:\Users\Mano PC\FA\outputs\bulletproof-template-agent-4")
XLSX_PATH = OUT_DIR / "direct_method_cash_flow_challenge_2026.xlsx"
README_PATH = OUT_DIR / "README.md"

MONTHS = [
    "Jan-2026", "Feb-2026", "Mar-2026", "Apr-2026",
    "May-2026", "Jun-2026", "Jul-2026", "Aug-2026",
    "Sep-2026", "Oct-2026", "Nov-2026", "Dec-2026",
]

SECTIONS = [
    (
        "Counterparty collections and operating float",
        [
            ("Till sweeps from fulfilled orders", "Cash collected when sold goods or completed services are paid for."),
            ("Retainer drawdowns released by clients", "Previously held client advances that become available as work is performed."),
            ("Partner pass-through recoveries", "Reimbursements collected for costs initially paid on behalf of others."),
            ("Card processor reserve releases", "Cash returned from payment processors after temporary holds are lifted."),
        ],
        "Subtotal - trading inflows before housekeeping",
    ),
    (
        "People, premises, and routine vendor leakage",
        [
            ("Crew settlement envelopes", "Regular cash paid to employees, contractors, or other labor providers."),
            ("Workshop occupancy remittances", "Cash paid to use offices, storage, production, or service space."),
            ("Utility and connectivity clearings", "Cash paid for power, water, telecom, internet, and similar operating services."),
            ("Trade supplier docket payments", "Cash paid to vendors for materials, merchandise, supplies, and outside services."),
            ("Warranty make-good disbursements", "Cash paid to repair, replace, refund, or otherwise satisfy customer obligations."),
        ],
        "Subtotal - recurring operating disbursements",
    ),
    (
        "Public charges and compliance settlements",
        [
            ("Indirect tax net remittance", "Sales, VAT, GST, or similar transaction taxes paid net of offsets."),
            ("Withholding and employment levy sweep", "Payroll-related taxes, benefit levies, and required withholdings paid out."),
            ("Licensing, permits, and statutory dues", "Cash paid for required filings, permits, registrations, and compliance fees."),
        ],
        "Subtotal - public-charge cash outs",
    ),
    (
        "Long-use asset and platform spending",
        [
            ("Fit-out milestone cheques", "Cash spent on build-outs, fixtures, improvements, or other long-lived setup work."),
            ("Production rig deposits and balances", "Cash paid for equipment, machinery, vehicles, tooling, or similar assets."),
            ("Core system implementation tranches", "Cash paid to deploy durable software, infrastructure, or platform capability."),
        ],
        "Subtotal - durable asset deployments",
    ),
    (
        "Funding, stakeholder, and reserve movements",
        [
            ("Founder bridge notes funded", "Cash received from short-term or related-party financing arrangements."),
            ("Bank facility principal retired", "Cash paid to reduce loan principal or other borrowed balances."),
            ("Member tax draw packets", "Cash paid to owners or members for taxes, drawings, or similar distributions."),
            ("Restricted cash lockbox build", "Cash moved into restricted or reserved accounts and no longer freely available."),
            ("Restricted cash lockbox release", "Cash released from restricted or reserved accounts back into available cash."),
        ],
        "Subtotal - financing and reserve net flow",
    ),
]


def col_name(num):
    name = ""
    while num:
        num, rem = divmod(num - 1, 26)
        name = chr(65 + rem) + name
    return name


def cell_ref(row, col):
    return f"{col_name(col)}{row}"


def text_cell(row, col, value, style=0):
    safe = escape(str(value))
    return f'<c r="{cell_ref(row, col)}" t="inlineStr" s="{style}"><is><t>{safe}</t></is></c>'


def number_cell(row, col, value=0, style=0):
    return f'<c r="{cell_ref(row, col)}" s="{style}"><v>{value}</v></c>'


def formula_cell(row, col, formula, style=0):
    return f'<c r="{cell_ref(row, col)}" s="{style}"><f>{escape(formula)}</f><v>0</v></c>'


def row_xml(row, cells, height=None):
    ht = f' ht="{height}" customHeight="1"' if height else ""
    return f'<row r="{row}"{ht}>{"".join(cells)}</row>'


def build_rows():
    rows = []
    rows.append(row_xml(1, []))
    rows.append(row_xml(2, [text_cell(2, 2, "2026 Direct-Method Cash Flow Template", 1)]))
    rows.append(row_xml(3, [text_cell(3, 2, "Writable amount rows are zero-filled; formula rows calculate the cash rollforward.", 2)]))
    rows.append(row_xml(4, [text_cell(4, 2, "Enter inflows as positive amounts and cash paid out as negative amounts.", 2)]))
    rows.append(row_xml(5, []))

    header = [text_cell(6, 1, "#", 3), text_cell(6, 2, "Line caption", 3), text_cell(6, 3, "Row kind", 3)]
    for i, month in enumerate(MONTHS, start=4):
        header.append(text_cell(6, i, month, 3))
    header += [text_cell(6, 16, "FY total", 3), text_cell(6, 18, "Plain-English cue", 3)]
    rows.append(row_xml(6, header))

    current_row = 7
    line_number = 1
    subtotal_rows = []

    opening_row = current_row
    cells = [
        number_cell(current_row, 1, line_number, 4),
        text_cell(current_row, 2, "Opening cash on hand and in bank", 4),
        text_cell(current_row, 3, "opening", 4),
        number_cell(current_row, 4, 0, 4),
    ]
    for col in range(5, 16):
        cells.append(formula_cell(current_row, col, f"{cell_ref(closing_row_placeholder(), col - 1)}", 4))
    cells += [formula_cell(current_row, 16, f"D{current_row}", 4), text_cell(current_row, 18, "Cash available at the very start of each month.", 4)]
    rows.append(("OPENING_ROW_PLACEHOLDER", cells, current_row))
    current_row += 1
    line_number += 1

    writable_rows = []
    for section_title, items, subtotal_label in SECTIONS:
        rows.append(row_xml(current_row, [
            number_cell(current_row, 1, line_number, 5),
            text_cell(current_row, 2, section_title, 5),
            text_cell(current_row, 3, "section", 5),
        ]))
        current_row += 1
        line_number += 1

        section_start = current_row
        for label, meaning in items:
            cells = [
                number_cell(current_row, 1, line_number, 0),
                text_cell(current_row, 2, label, 0),
                text_cell(current_row, 3, "input", 0),
            ]
            for col in range(4, 16):
                cells.append(number_cell(current_row, col, 0, 6))
            cells += [formula_cell(current_row, 16, f"SUM(D{current_row}:O{current_row})", 7), text_cell(current_row, 18, meaning, 0)]
            rows.append(row_xml(current_row, cells, height="22"))
            writable_rows.append(current_row)
            current_row += 1
            line_number += 1
        section_end = current_row - 1

        cells = [
            number_cell(current_row, 1, line_number, 8),
            text_cell(current_row, 2, subtotal_label, 8),
            text_cell(current_row, 3, "formula", 8),
        ]
        for col in range(4, 16):
            c = col_name(col)
            cells.append(formula_cell(current_row, col, f"SUM({c}{section_start}:{c}{section_end})", 8))
        cells.append(formula_cell(current_row, 16, f"SUM(D{current_row}:O{current_row})", 8))
        rows.append(row_xml(current_row, cells))
        subtotal_rows.append(current_row)
        current_row += 2
        line_number += 1

    net_row = current_row
    cells = [
        number_cell(net_row, 1, line_number, 8),
        text_cell(net_row, 2, "Net cash travel for the month", 8),
        text_cell(net_row, 3, "formula", 8),
    ]
    for col in range(4, 16):
        c = col_name(col)
        cells.append(formula_cell(net_row, col, "+".join(f"{c}{r}" for r in subtotal_rows), 8))
    cells += [formula_cell(net_row, 16, f"SUM(D{net_row}:O{net_row})", 8), text_cell(net_row, 18, "Total monthly cash inflows less cash outflows and reserve movements.", 8)]
    rows.append(row_xml(net_row, cells))
    current_row += 1
    line_number += 1

    close_row = current_row
    cells = [
        number_cell(close_row, 1, line_number, 9),
        text_cell(close_row, 2, "Closing cash on hand and in bank", 9),
        text_cell(close_row, 3, "closing", 9),
    ]
    for col in range(4, 16):
        c = col_name(col)
        cells.append(formula_cell(close_row, col, f"{c}{opening_row}+{c}{net_row}", 9))
    cells += [formula_cell(close_row, 16, f"O{close_row}", 9), text_cell(close_row, 18, "Cash remaining at the end of each month after the direct cash activity.", 9)]
    rows.append(row_xml(close_row, cells))

    output = []
    for item in rows:
        if isinstance(item, tuple):
            _, cells, row = item
            patched = []
            for col in range(5, 16):
                cells[col - 1] = formula_cell(row, col, f"{cell_ref(close_row, col - 1)}", 4)
            patched = cells
            output.append(row_xml(row, patched))
        else:
            output.append(item)
    return output, close_row


def closing_row_placeholder():
    return 999


def sheet_xml():
    rows, last_row = build_rows()
    cols = (
        '<cols>'
        '<col min="1" max="1" width="5" customWidth="1"/>'
        '<col min="2" max="2" width="38" customWidth="1"/>'
        '<col min="3" max="3" width="10" customWidth="1"/>'
        '<col min="4" max="16" width="13" customWidth="1"/>'
        '<col min="18" max="18" width="34" customWidth="1"/>'
        '</cols>'
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="3" ySplit="6" topLeftCell="D7" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
{cols}
<sheetData>{"".join(rows)}</sheetData>
<autoFilter ref="A6:R{last_row}"/>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>'''


def styles_xml():
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><color rgb="FF52616B"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2933"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7E5C1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEFE2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom style="thin"><color rgb="FFB8C2CC"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FF1F2933"/></bottom><diagonal/></border><border><left/><right/><top style="medium"><color rgb="FF1F2933"/></top><bottom style="medium"><color rgb="FF1F2933"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="3" fontId="4" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="3" fontId="4" fillId="5" borderId="2" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''


def write_workbook():
    files = {
        "[Content_Types].xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>''',
        "_rels/.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>''',
        "docProps/app.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Codex</Application></Properties>''',
        "docProps/core.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>2026 Direct-Method Cash Flow Challenge Template</dc:title><dc:creator>Codex</dc:creator></cp:coreProperties>''',
        "xl/workbook.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cash Flow 2026" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="181029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>''',
        "xl/_rels/workbook.xml.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>''',
        "xl/styles.xml": styles_xml(),
        "xl/worksheets/sheet1.xml": sheet_xml(),
    }
    with ZipFile(XLSX_PATH, "w", ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)


def write_readme():
    content = """# Bulletproof Template Agent 4

Created workbook: `direct_method_cash_flow_challenge_2026.xlsx`

This is a deliberately challenging direct-method cash-flow template for calendar year 2026. It uses 12 monthly periods, accountant-readable but uncommon row captions, zero-filled writable amount rows, formula subtotal rows, a monthly net cash movement row, and opening and closing cash rollforward rows.

Enter inflows as positive amounts and cash paid out as negative amounts.

## Row meanings

- Opening cash on hand and in bank: Cash available at the beginning of each month before current-month activity.
- Till sweeps from fulfilled orders: Money collected after goods or services have been delivered.
- Retainer drawdowns released by clients: Client advances that become available as work is earned or delivered.
- Partner pass-through recoveries: Reimbursements received for costs first paid on someone else's behalf.
- Card processor reserve releases: Previously withheld card or payment-platform balances released into available cash.
- Crew settlement envelopes: Cash paid to employees, contractors, or other labor providers.
- Workshop occupancy remittances: Cash paid for work space, storage, facilities, or operating locations.
- Utility and connectivity clearings: Cash paid for power, water, telecom, internet, and similar services.
- Trade supplier docket payments: Cash paid to suppliers for inventory, materials, supplies, or outside services.
- Warranty make-good disbursements: Cash paid for refunds, repairs, replacements, or customer remedy costs.
- Indirect tax net remittance: Transaction taxes paid to authorities after applying available offsets.
- Withholding and employment levy sweep: Payroll-related taxes, mandatory withholdings, and employment levies paid out.
- Licensing, permits, and statutory dues: Required cash payments for licenses, permits, registrations, and filings.
- Fit-out milestone cheques: Cash spent on durable improvements, fixtures, or build-out work.
- Production rig deposits and balances: Cash paid for equipment, machinery, vehicles, tooling, or similar long-lived assets.
- Core system implementation tranches: Cash paid for durable software, infrastructure, or platform implementation.
- Founder bridge notes funded: Cash received from founder, related-party, or short-term bridge financing.
- Bank facility principal retired: Cash used to reduce principal on bank or lender obligations.
- Member tax draw packets: Cash paid to owners or members as draws, tax distributions, or similar equity-related payments.
- Restricted cash lockbox build: Cash moved out of freely available balances into restricted or reserved accounts.
- Restricted cash lockbox release: Cash moved back from restricted or reserved accounts into available balances.
- Net cash travel for the month: Combined monthly effect of all operating, public-charge, asset, financing, and reserve cash movements.
- Closing cash on hand and in bank: Cash remaining at month-end after adding net cash movement to opening cash.
"""
    README_PATH.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_workbook()
    write_readme()
    print(XLSX_PATH)
    print(README_PATH)
