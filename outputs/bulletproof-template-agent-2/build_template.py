from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import html


OUT_DIR = Path(__file__).resolve().parent
WORKBOOK_PATH = OUT_DIR / "direct_method_cash_flow_challenging_2026.xlsx"

MONTHS = [
    "Jan-2026", "Feb-2026", "Mar-2026", "Apr-2026",
    "May-2026", "Jun-2026", "Jul-2026", "Aug-2026",
    "Sep-2026", "Oct-2026", "Nov-2026", "Dec-2026",
]

ROWS = [
    ("Opening cash on hand and at bank", "formula", None),
    ("Receipts: settlement-lagged trade takings", "input", "Cash collected from customers or platforms after timing delays."),
    ("Receipts: retainer drawdowns released", "input", "Cash released from customer retainers, deposits, or prepayments as work is delivered."),
    ("Receipts: merchant service rebates cleared", "input", "Cash rebates, incentives, or fee refunds received from payment processors or service providers."),
    ("Receipts: insurance recovery cash", "input", "Cash received from insurance claims or similar recoveries."),
    ("Operating cash gathered", "formula", None),
    ("Payments: rostered crew disbursements", "input", "Cash paid to employees, contractors, or shift-based labor pools."),
    ("Payments: premises and yard occupancy", "input", "Cash paid for offices, storage yards, warehouses, or other occupied space."),
    ("Payments: utility and connectivity clearings", "input", "Cash paid for power, water, telecom, internet, and similar services."),
    ("Payments: stock replenishment wires", "input", "Cash paid to replenish merchandise, raw materials, or operating supplies."),
    ("Payments: freight, duties, and landing charges", "input", "Cash paid to move goods and clear them through shipping or customs processes."),
    ("Payments: tax authority sweeps", "input", "Cash paid for sales tax, VAT, payroll tax, income tax, and similar remittances."),
    ("Payments: claims, refunds, and make-good credits", "input", "Cash paid back to customers or counterparties for returns, claims, credits, or service failures."),
    ("Payments: professional bench and licenses", "input", "Cash paid for advisors, software subscriptions, permits, memberships, and operating licenses."),
    ("Operating cash applied", "formula", None),
    ("Net cash from day-to-day trading", "formula", None),
    ("Equipment refresh and fit-out checks", "input", "Cash spent on durable tools, equipment, facility improvements, or technology build-outs."),
    ("Proceeds from retired kit and fixtures", "input", "Cash received from selling used equipment, fixtures, vehicles, or other long-lived items."),
    ("Investment in pledged term deposits", "input", "Cash placed into restricted or pledged deposits that cannot be used freely."),
    ("Release of pledged term deposits", "input", "Cash released back from restricted or pledged deposits."),
    ("Net cash from asset and reserve moves", "formula", None),
    ("Borrowing draws booked at treasury", "input", "Cash received from new borrowing facilities or drawdowns."),
    ("Lender principal retirements", "input", "Cash paid to reduce loan principal or similar borrowing balances."),
    ("Member capital subscriptions banked", "input", "Cash contributed by owners, members, shareholders, or partners."),
    ("Partner preference redemptions paid", "input", "Cash paid to redeem or return capital interests to owners or investors."),
    ("Net cash from funding bench", "formula", None),
    ("Bank fees, rounding, and timing wash", "input", "Small cash differences caused by bank charges, rounding, foreign exchange, or timing corrections."),
    ("Total period cash movement", "formula", None),
    ("Closing cash on hand and at bank", "formula", None),
]


def col_name(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def esc(value):
    return html.escape(str(value), quote=True)


def inline_cell(ref, value, style=0):
    return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t>{esc(value)}</t></is></c>'


def num_cell(ref, value=0, style=0):
    return f'<c r="{ref}" s="{style}"><v>{value}</v></c>'


def formula_cell(ref, formula, style=0):
    return f'<c r="{ref}" s="{style}"><f>{esc(formula)}</f><v>0</v></c>'


def row_xml(row_num, cells, height=None):
    ht = f' ht="{height}" customHeight="1"' if height else ""
    return f'<row r="{row_num}"{ht}>{"".join(cells)}</row>'


def sheet1_xml():
    row_numbers = {label: idx for idx, (label, _, _) in enumerate(ROWS, start=5)}
    rows = []
    rows.append(row_xml(1, [inline_cell("A1", "Direct Method Cash Flow Template - 2026 Monthly", 1)], 28))
    rows.append(row_xml(2, [inline_cell("A2", "Yellow cells are writable test inputs; gray cells are formulas. Positive amounts are cash inflows; payment rows are entered as positive cash paid amounts.", 6)], 32))

    header = [inline_cell("A4", "Line", 2), inline_cell("B4", "Row type", 2)]
    for col, month in enumerate(MONTHS, start=3):
        header.append(inline_cell(f"{col_name(col)}4", month, 2))
    header.append(inline_cell("O4", "FY 2026", 2))
    rows.append(row_xml(4, header))

    for idx, (label, row_type, _) in enumerate(ROWS, start=5):
        style = 4 if row_type == "input" else 3
        cells = [
            inline_cell(f"A{idx}", label, style),
            inline_cell(f"B{idx}", "Writable input" if row_type == "input" else "Calculated", style),
        ]
        for col in range(3, 15):
            letter = col_name(col)
            prev = col_name(col - 1)
            if row_type == "input":
                cells.append(num_cell(f"{letter}{idx}", 0, 8))
                continue
            if label == "Opening cash on hand and at bank":
                if col == 3:
                    cells.append(num_cell(f"{letter}{idx}", 0, 7))
                else:
                    cells.append(formula_cell(f"{letter}{idx}", f"{prev}{row_numbers['Closing cash on hand and at bank']}", 7))
            elif label == "Operating cash gathered":
                cells.append(formula_cell(f"{letter}{idx}", f"SUM({letter}{row_numbers['Receipts: settlement-lagged trade takings']}:{letter}{row_numbers['Receipts: insurance recovery cash']})", 7))
            elif label == "Operating cash applied":
                cells.append(formula_cell(f"{letter}{idx}", f"SUM({letter}{row_numbers['Payments: rostered crew disbursements']}:{letter}{row_numbers['Payments: professional bench and licenses']})", 7))
            elif label == "Net cash from day-to-day trading":
                cells.append(formula_cell(f"{letter}{idx}", f"{letter}{row_numbers['Operating cash gathered']}-{letter}{row_numbers['Operating cash applied']}", 7))
            elif label == "Net cash from asset and reserve moves":
                cells.append(formula_cell(f"{letter}{idx}", f"{letter}{row_numbers['Proceeds from retired kit and fixtures']}+{letter}{row_numbers['Release of pledged term deposits']}-{letter}{row_numbers['Equipment refresh and fit-out checks']}-{letter}{row_numbers['Investment in pledged term deposits']}", 7))
            elif label == "Net cash from funding bench":
                cells.append(formula_cell(f"{letter}{idx}", f"{letter}{row_numbers['Borrowing draws booked at treasury']}+{letter}{row_numbers['Member capital subscriptions banked']}-{letter}{row_numbers['Lender principal retirements']}-{letter}{row_numbers['Partner preference redemptions paid']}", 7))
            elif label == "Total period cash movement":
                cells.append(formula_cell(f"{letter}{idx}", f"SUM({letter}{row_numbers['Net cash from day-to-day trading']},{letter}{row_numbers['Net cash from asset and reserve moves']},{letter}{row_numbers['Net cash from funding bench']},{letter}{row_numbers['Bank fees, rounding, and timing wash']})", 7))
            elif label == "Closing cash on hand and at bank":
                cells.append(formula_cell(f"{letter}{idx}", f"{letter}{row_numbers['Opening cash on hand and at bank']}+{letter}{row_numbers['Total period cash movement']}", 7))
        if label == "Opening cash on hand and at bank":
            cells.append(formula_cell(f"O{idx}", f"C{idx}", 7))
        elif label == "Closing cash on hand and at bank":
            cells.append(formula_cell(f"O{idx}", f"N{idx}", 7))
        else:
            cells.append(formula_cell(f"O{idx}", f"SUM(C{idx}:N{idx})", 7))
        rows.append(row_xml(idx, cells))

    cols = (
        '<cols><col min="1" max="1" width="42" customWidth="1"/>'
        '<col min="2" max="2" width="16" customWidth="1"/>'
        '<col min="3" max="15" width="12" customWidth="1"/></cols>'
    )
    merge = '<mergeCells count="2"><mergeCell ref="A1:O1"/><mergeCell ref="A2:O2"/></mergeCells>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="2" ySplit="6" topLeftCell="C7" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
        f"{cols}<sheetData>{''.join(rows)}</sheetData>{merge}</worksheet>"
    )


def sheet2_xml():
    rows = [row_xml(1, [inline_cell("A1", "Line", 2), inline_cell("B1", "Plain-English meaning", 2)])]
    for idx, (label, _, meaning) in enumerate(ROWS, start=2):
        rows.append(row_xml(idx, [
            inline_cell(f"A{idx}", label, 0),
            inline_cell(f"B{idx}", meaning or "Calculated subtotal, net movement, opening balance, or closing balance derived from other rows.", 0),
        ]))
    cols = '<cols><col min="1" max="1" width="45" customWidth="1"/><col min="2" max="2" width="95" customWidth="1"/></cols>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"{cols}<sheetData>{''.join(rows)}</sheetData></worksheet>"
    )


def write_workbook():
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""
    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""
    workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Cash Flow 2026" sheetId="1" r:id="rId1"/><sheet name="Row meanings" sheetId="2" r:id="rId2"/></sheets>
<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>
</workbook>"""
    workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""
    styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7D6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/></border><border><left/><right/><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="3" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""
    core = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Challenging Direct Method Cash Flow Template 2026</dc:title><dc:creator>Codex</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-05-13T00:00:00Z</dcterms:created></cp:coreProperties>"""
    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Codex</Application></Properties>"""

    with ZipFile(WORKBOOK_PATH, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/styles.xml", styles)
        zf.writestr("xl/worksheets/sheet1.xml", sheet1_xml())
        zf.writestr("xl/worksheets/sheet2.xml", sheet2_xml())
        zf.writestr("docProps/core.xml", core)
        zf.writestr("docProps/app.xml", app)


if __name__ == "__main__":
    write_workbook()
    print(WORKBOOK_PATH)
