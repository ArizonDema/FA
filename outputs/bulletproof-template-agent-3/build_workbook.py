from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


OUT_DIR = Path(__file__).resolve().parent
XLSX_PATH = OUT_DIR / "agent3_direct_method_cash_flow_2026_challenging.xlsx"

MONTHS = [
    "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026",
    "May 2026", "Jun 2026", "Jul 2026", "Aug 2026",
    "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026",
]

ROWS = [
    ("opening", "Vault balance brought forward", None),
    ("blank", "", None),
    ("section", "Operating inflows - collections and recoveries", None),
    ("input", "Till sweeps from fulfilled invoice batches", 0),
    ("input", "Counterparty advance burn-offs collected in cash", 0),
    ("input", "Channel settlement drips after platform holdbacks", 0),
    ("input", "Service-retainer refreshes banked this month", 0),
    ("input", "Rebates, claims and warranty escrow refunds", 0),
    ("input", "Miscellaneous operating coin-in", None),
    ("subtotal", "Operating inflow subtotal", "op_in"),
    ("blank", "", None),
    ("section", "Operating outflows - settlement, people and overhead", None),
    ("input", "Supplier pouch settlements for stocked goods", 0),
    ("input", "Crew stipends and shift settlement runs", 0),
    ("input", "Premises access retainers and service charges", 0),
    ("input", "Carrier tolls, fulfilment lanes and customs floats", 0),
    ("input", "Software meters, data rooms and outsourced desks", 0),
    ("input", "Tax set-asides released to authorities", 0),
    ("input", "Customer appeasements and credit make-good cash", None),
    ("subtotal", "Operating outflow subtotal", "op_out"),
    ("calc", "Net operating cash churn", "net_op"),
    ("blank", "", None),
    ("section", "Long-cycle asset movements", None),
    ("input", "Workshop build-out retainage paid", 0),
    ("input", "Long-life equipment deposits and installation bites", 0),
    ("input", "Insurance salvage and asset retirement recoveries", 0),
    ("subtotal", "Net long-cycle asset movement", "asset_net"),
    ("blank", "", None),
    ("section", "Capital stack movements", None),
    ("input", "Bank note draw packets landing in account", 0),
    ("input", "Scheduled lender sweeps and fee skims", 0),
    ("input", "Partner top-ups wired into treasury", 0),
    ("input", "Member cash drawings and tax cover remittances", 0),
    ("input", "Quiet reserve release or parking", None),
    ("subtotal", "Net capital stack movement", "cap_net"),
    ("blank", "", None),
    ("calc", "Net cash drift before rounding", "pre_round"),
    ("input", "Bank cut-off, FX dust and penny-rounding plug", 0),
    ("calc", "Net movement posted to vault", "posted_net"),
    ("closing", "Vault balance carried forward", None),
    ("blank", "", None),
    ("section", "Analyzer traps - writable rows intentionally sparse", None),
    ("input", "Undesignated receipt lane A", None),
    ("input", "Undesignated payment lane B", None),
]

DATA_START_ROW = 5
HEADER_ROW = 4
MONTH_COLS = list("BCDEFGHIJKLM")
FULL_YEAR_COL = "N"


def a1(col, row):
    return f"{col}{row}"


def row_xml(row_num, cells):
    return f'<row r="{row_num}">' + "".join(cells) + "</row>"


def text_cell(ref, text, style=0):
    return (
        f'<c r="{ref}" t="inlineStr" s="{style}">'
        f"<is><t>{escape(text)}</t></is></c>"
    )


def num_cell(ref, value, style=0):
    return f'<c r="{ref}" s="{style}"><v>{value}</v></c>'


def formula_cell(ref, formula, style=0):
    return f'<c r="{ref}" s="{style}"><f>{escape(formula)}</f><v>0</v></c>'


def blank_cell(ref, style=0):
    return f'<c r="{ref}" s="{style}"/>'


def formulas_for(kind, col, rows_by_key):
    if kind == "op_in":
        return f"SUM({a1(col, rows_by_key['Till sweeps from fulfilled invoice batches'])}:{a1(col, rows_by_key['Miscellaneous operating coin-in'])})"
    if kind == "op_out":
        return f"SUM({a1(col, rows_by_key['Supplier pouch settlements for stocked goods'])}:{a1(col, rows_by_key['Customer appeasements and credit make-good cash'])})"
    if kind == "net_op":
        return f"{a1(col, rows_by_key['Operating inflow subtotal'])}-{a1(col, rows_by_key['Operating outflow subtotal'])}"
    if kind == "asset_net":
        return (
            f"{a1(col, rows_by_key['Insurance salvage and asset retirement recoveries'])}"
            f"-{a1(col, rows_by_key['Workshop build-out retainage paid'])}"
            f"-{a1(col, rows_by_key['Long-life equipment deposits and installation bites'])}"
        )
    if kind == "cap_net":
        return (
            f"{a1(col, rows_by_key['Bank note draw packets landing in account'])}"
            f"-{a1(col, rows_by_key['Scheduled lender sweeps and fee skims'])}"
            f"+{a1(col, rows_by_key['Partner top-ups wired into treasury'])}"
            f"-{a1(col, rows_by_key['Member cash drawings and tax cover remittances'])}"
            f"+{a1(col, rows_by_key['Quiet reserve release or parking'])}"
        )
    if kind == "pre_round":
        return (
            f"{a1(col, rows_by_key['Net operating cash churn'])}"
            f"+{a1(col, rows_by_key['Net long-cycle asset movement'])}"
            f"+{a1(col, rows_by_key['Net capital stack movement'])}"
        )
    if kind == "posted_net":
        return f"{a1(col, rows_by_key['Net cash drift before rounding'])}+{a1(col, rows_by_key['Bank cut-off, FX dust and penny-rounding plug'])}"
    raise ValueError(kind)


def build_sheet_xml():
    rows_by_key = {
        label: DATA_START_ROW + offset
        for offset, (_, label, _) in enumerate(ROWS)
        if label
    }

    xml_rows = []
    xml_rows.append(row_xml(1, [text_cell("A1", "Cash Movement Ledger - direct method stress template", 1)]))
    xml_rows.append(row_xml(2, [text_cell("A2", "Writable monthly cells are intentionally blank or zero; formula rows carry subtotals and balances.", 2)]))
    header = [text_cell("A4", "Line item", 3)]
    for col, month in zip(MONTH_COLS, MONTHS):
        header.append(text_cell(f"{col}{HEADER_ROW}", month, 3))
    header.append(text_cell(f"{FULL_YEAR_COL}{HEADER_ROW}", "Full year", 3))
    xml_rows.append(row_xml(HEADER_ROW, header))

    for row_num, (row_type, label, payload) in enumerate(ROWS, start=DATA_START_ROW):
        style = {"section": 4, "input": 5, "subtotal": 6, "calc": 6, "opening": 7, "closing": 7}.get(row_type, 0)
        cells = []
        if row_type == "blank":
            xml_rows.append(row_xml(row_num, []))
            continue
        cells.append(text_cell(f"A{row_num}", label, style))
        for idx, col in enumerate(MONTH_COLS):
            ref = f"{col}{row_num}"
            if row_type == "section":
                cells.append(blank_cell(ref, style))
            elif row_type == "input":
                cells.append(blank_cell(ref, style) if payload is None else num_cell(ref, payload, style))
            elif row_type == "opening":
                if idx == 0:
                    cells.append(num_cell(ref, 0, style))
                else:
                    previous_col = MONTH_COLS[idx - 1]
                    cells.append(formula_cell(ref, a1(previous_col, rows_by_key["Vault balance carried forward"]), style))
            elif row_type == "closing":
                cells.append(formula_cell(ref, f"{a1(col, rows_by_key['Vault balance brought forward'])}+{a1(col, rows_by_key['Net movement posted to vault'])}", style))
            else:
                cells.append(formula_cell(ref, formulas_for(payload, col, rows_by_key), style))

        annual_ref = f"{FULL_YEAR_COL}{row_num}"
        if row_type == "section":
            cells.append(blank_cell(annual_ref, style))
        elif row_type == "opening":
            cells.append(formula_cell(annual_ref, a1("B", row_num), style))
        elif row_type == "closing":
            cells.append(formula_cell(annual_ref, a1("M", row_num), style))
        else:
            cells.append(formula_cell(annual_ref, f"SUM(B{row_num}:M{row_num})", style))
        xml_rows.append(row_xml(row_num, cells))

    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
 <sheetFormatPr defaultRowHeight="18"/>
 <cols>
  <col min="1" max="1" width="48" customWidth="1"/>
  <col min="2" max="13" width="13" customWidth="1"/>
  <col min="14" max="14" width="14" customWidth="1"/>
 </cols>
 <sheetData>{''.join(xml_rows)}</sheetData>
 <mergeCells count="2"><mergeCell ref="A1:N1"/><mergeCell ref="A2:N2"/></mergeCells>
 <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>'''


def styles_xml():
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);-"/></numFmts>
 <fonts count="5">
  <font><sz val="11"/><name val="Calibri"/></font>
  <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  <font><i/><color rgb="FF4B5563"/><name val="Calibri"/></font>
  <font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  <font><b/><name val="Calibri"/></font>
 </fonts>
 <fills count="7">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF135C62"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F8"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF556070"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF28313B"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFFFF7DC"/></patternFill></fill>
 </fills>
 <borders count="3">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left/><right/><top/><bottom style="thin"><color rgb="FFD9DEE7"/></bottom/><diagonal/></border>
  <border><left/><right/><top style="medium"><color rgb="FF455060"/></top><bottom style="medium"><color rgb="FF455060"/></bottom><diagonal/></border>
 </borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="8">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1"/>
  <xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
  <xf numFmtId="164" fontId="4" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
 </cellXfs>
 <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''


def build():
    with ZipFile(XLSX_PATH, "w", ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
 <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
 <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>''')
        z.writestr("_rels/.rels", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
 <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>''')
        z.writestr("xl/_rels/workbook.xml.rels", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''')
        z.writestr("xl/workbook.xml", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets><sheet name="Direct CF 2026" sheetId="1" r:id="rId1"/></sheets>
 <calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>
</workbook>''')
        z.writestr("xl/worksheets/sheet1.xml", build_sheet_xml())
        z.writestr("xl/styles.xml", styles_xml())
        z.writestr("docProps/core.xml", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dc:title>Direct-method cash-flow analyzer stress template</dc:title>
 <dc:creator>Codex</dc:creator>
</cp:coreProperties>''')
        z.writestr("docProps/app.xml", '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
 <Application>Codex</Application>
</Properties>''')


if __name__ == "__main__":
    build()
    print(XLSX_PATH)
