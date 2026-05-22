$ErrorActionPreference = "Stop"

$outDir = "C:\Users\Mano PC\FA\outputs\bulletproof-template-agent-1"
$xlsxPath = Join-Path $outDir "deliberately_challenging_direct_method_cash_flow_2026.xlsx"
$staging = Join-Path $outDir "_xlsx_staging"

if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "_rels") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "docProps") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "xl") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "xl\_rels") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "xl\worksheets") | Out-Null

function Escape-Xml([string]$text) {
    if ($null -eq $text) { return "" }
    return [System.Security.SecurityElement]::Escape($text)
}

function ColName([int]$index) {
    $name = ""
    while ($index -gt 0) {
        $index--
        $name = [char](65 + ($index % 26)) + $name
        $index = [math]::Floor($index / 26)
    }
    return $name
}

function CellXml([int]$row, [int]$col, [object]$value, [int]$style = 0, [string]$formula = $null) {
    $ref = "$(ColName $col)$row"
    $styleAttr = if ($style -gt 0) { " s=`"$style`"" } else { "" }
    if (![string]::IsNullOrEmpty($formula)) {
        return "<c r=`"$ref`"$styleAttr><f>$(Escape-Xml $formula)</f><v>0</v></c>"
    }
    if ($value -is [int] -or $value -is [long] -or $value -is [double] -or $value -is [decimal]) {
        return "<c r=`"$ref`"$styleAttr><v>$value</v></c>"
    }
    return "<c r=`"$ref`" t=`"inlineStr`"$styleAttr><is><t>$(Escape-Xml ([string]$value))</t></is></c>"
}

function RowXml([int]$row, [array]$cells, [double]$height = 0) {
    $heightAttr = if ($height -gt 0) { " ht=`"$height`" customHeight=`"1`"" } else { "" }
    return "<row r=`"$row`"$heightAttr>$($cells -join '')</row>"
}

$months = @("Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26","Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26")
$monthCols = 5..16
$totalCol = 17

$rows = New-Object System.Collections.Generic.List[string]

$rows.Add((RowXml 1 @(
    CellXml 1 1 "Direct Method Cash Flow Template - 2026" 1
    CellXml 1 5 "All writable monthly cells intentionally start at zero." 7
) 24))
$rows.Add((RowXml 2 @(
    CellXml 2 1 "Scope"
    CellXml 2 2 "Twelve monthly periods for calendar 2026; direct cash movement view."
    CellXml 2 5 "Input convention"
    CellXml 2 6 "Enter receipts and payments as positive amounts on writable rows."
) 18))
$rows.Add((RowXml 3 @(
    CellXml 3 1 "Formula behavior"
    CellXml 3 2 "Subtotal, net movement, and closing cash rows are formula-driven."
    CellXml 3 5 "Currency"
    CellXml 3 6 "Unspecified reporting currency."
) 18))
$rows.Add((RowXml 4 @(
    CellXml 4 1 "Challenge note"
    CellXml 4 2 "Labels are accountant-readable but intentionally nonstandard."
) 18))
$rows.Add((RowXml 5 @() 6))

$headerCells = @(
    CellXml 6 1 "Band" 2
    CellXml 6 2 "Line caption" 2
    CellXml 6 3 "Entry mode" 2
    CellXml 6 4 "Economic cue" 2
)
for ($i = 0; $i -lt $months.Length; $i++) {
    $headerCells += CellXml 6 (5 + $i) $months[$i] 2
}
$headerCells += CellXml 6 $totalCol "FY 2026" 2
$rows.Add((RowXml 6 $headerCells 21))

$lineDefs = @(
    @{r=7; band="Cash bridge"; label="Opening cash - bank ledger brought forward"; mode="Jan input; then linked"; cue="Starting cash before period activity"; kind="opening"},
    @{r=8; band="Operating receipts"; label="Marketplace sweep receipts"; mode="Writable"; cue="Cleared card and platform takings"; kind="input"},
    @{r=9; band="Operating receipts"; label="Invoice lockbox lodgements"; mode="Writable"; cue="Trade account collections received"; kind="input"},
    @{r=10; band="Operating receipts"; label="Retainer and milestone releases"; mode="Writable"; cue="Customer deposits becoming available"; kind="input"},
    @{r=11; band="Operating receipts"; label="Duty refunds and authority paybacks"; mode="Writable"; cue="Cash returned by tax or public bodies"; kind="input"},
    @{r=12; band="Operating receipts"; label="Vendor credits cashed back"; mode="Writable"; cue="Rebates, refunds, and recoveries"; kind="input"},
    @{r=13; band="Operating receipts"; label="Subtotal - operating money in"; mode="Formula"; cue="Total operating receipts"; kind="formula"; formulaType="sum"; refs=@(8,9,10,11,12)},
    @{r=14; band="Operating payments"; label="Merchandise settlement batches"; mode="Writable"; cue="Cash paid for stocked goods"; kind="input"},
    @{r=15; band="Operating payments"; label="Crew compensation wires and levies"; mode="Writable"; cue="Employee pay, taxes, and benefits cash"; kind="input"},
    @{r=16; band="Operating payments"; label="Premises service charges and utilities"; mode="Writable"; cue="Facilities, occupancy, energy, and upkeep"; kind="input"},
    @{r=17; band="Operating payments"; label="Carriage, fulfillment, and route costs"; mode="Writable"; cue="Shipping, field movement, and delivery spend"; kind="input"},
    @{r=18; band="Operating payments"; label="Channel tolls, commissions, and merchant fees"; mode="Writable"; cue="Selling platform and transaction charges"; kind="input"},
    @{r=19; band="Operating payments"; label="Policy cover, permits, and adviser retainers"; mode="Writable"; cue="Insurance, licenses, and professional services"; kind="input"},
    @{r=20; band="Operating payments"; label="Collected taxes passed through"; mode="Writable"; cue="Sales/VAT or similar remittances"; kind="input"},
    @{r=21; band="Operating payments"; label="Subtotal - operating money out"; mode="Formula"; cue="Total operating payments"; kind="formula"; formulaType="sum"; refs=@(14,15,16,17,18,19,20)},
    @{r=22; band="Operating result"; label="Cash surplus from trading pulse"; mode="Formula"; cue="Operating receipts less operating payments"; kind="formula"; formulaType="netop"},
    @{r=23; band="Investment traffic"; label="Workshop kit and fit-out purchases"; mode="Writable"; cue="Longer-lived operating asset purchases"; kind="input"},
    @{r=24; band="Investment traffic"; label="Internal platform build disbursements"; mode="Writable"; cue="Software or systems investment cash"; kind="input"},
    @{r=25; band="Investment traffic"; label="Retired asset proceeds and warranty recoveries"; mode="Writable"; cue="Cash recovered from asset disposals or claims"; kind="input"},
    @{r=26; band="Investment traffic"; label="Net cash from asset-cycle traffic"; mode="Formula"; cue="Asset recoveries less investment payments"; kind="formula"; formulaType="netinv"},
    @{r=27; band="Capital traffic"; label="Fresh lender advances received"; mode="Writable"; cue="Borrowed cash drawn into the business"; kind="input"},
    @{r=28; band="Capital traffic"; label="Scheduled note paydowns"; mode="Writable"; cue="Principal amounts repaid to lenders"; kind="input"},
    @{r=29; band="Capital traffic"; label="Shareholder funding calls banked"; mode="Writable"; cue="Equity-like funding received"; kind="input"},
    @{r=30; band="Capital traffic"; label="Member preference cash redemptions"; mode="Writable"; cue="Capital returned to investors or members"; kind="input"},
    @{r=31; band="Capital traffic"; label="Net cash from funding traffic"; mode="Formula"; cue="Financing receipts less repayments and redemptions"; kind="formula"; formulaType="netfin"},
    @{r=32; band="Cash bridge"; label="Net cash movement for the month"; mode="Formula"; cue="Operating, asset-cycle, and funding movement"; kind="formula"; formulaType="netchange"},
    @{r=33; band="Cash bridge"; label="Closing cash - bank ledger carried forward"; mode="Formula"; cue="Ending cash after monthly movement"; kind="formula"; formulaType="closing"}
)

foreach ($def in $lineDefs) {
    $style = if ($def.kind -eq "formula" -or $def.kind -eq "opening" -or $def.r -eq 33) { 4 } else { 0 }
    if ($def.r -eq 13 -or $def.r -eq 21 -or $def.r -eq 22 -or $def.r -eq 26 -or $def.r -eq 31 -or $def.r -eq 32 -or $def.r -eq 33) { $style = 3 }

    $cells = @(
        CellXml $def.r 1 $def.band $style
        CellXml $def.r 2 $def.label $style
        CellXml $def.r 3 $def.mode $style
        CellXml $def.r 4 $def.cue $style
    )

    foreach ($col in $monthCols) {
        $colName = ColName $col
        $formula = $null
        $value = 0
        $numStyle = 5
        if ($def.kind -eq "formula") {
            $numStyle = 6
            switch ($def.formulaType) {
                "sum" { $formula = (($def.refs | ForEach-Object { "$colName$_" }) -join "+") }
                "netop" { $formula = "$colName" + "13-$colName" + "21" }
                "netinv" { $formula = "$colName" + "25-$colName" + "23-$colName" + "24" }
                "netfin" { $formula = "$colName" + "27+$colName" + "29-$colName" + "28-$colName" + "30" }
                "netchange" { $formula = "$colName" + "22+$colName" + "26+$colName" + "31" }
                "closing" { $formula = "$colName" + "7+$colName" + "32" }
            }
        } elseif ($def.kind -eq "opening" -and $col -gt 5) {
            $prevCol = ColName ($col - 1)
            $formula = "$prevCol" + "33"
            $numStyle = 6
        }
        $cells += CellXml $def.r $col $value $numStyle $formula
    }

    if ($def.formulaType -eq "closing") {
        $cells += CellXml $def.r $totalCol 0 6 "P$($def.r)"
    } elseif ($def.kind -eq "opening") {
        $cells += CellXml $def.r $totalCol 0 6 "E$($def.r)"
    } else {
        $cells += CellXml $def.r $totalCol 0 6 ("SUM(E$($def.r):P$($def.r))")
    }
    $rows.Add((RowXml $def.r $cells 19))
}

$mergeCells = @(
    '<mergeCell ref="A1:D1"/>',
    '<mergeCell ref="E1:Q1"/>',
    '<mergeCell ref="B2:D2"/>',
    '<mergeCell ref="F2:Q2"/>',
    '<mergeCell ref="B3:D3"/>',
    '<mergeCell ref="F3:Q3"/>',
    '<mergeCell ref="B4:Q4"/>'
)

$sheetXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="34" customWidth="1"/>
    <col min="5" max="17" width="13" customWidth="1"/>
  </cols>
  <sheetData>
$($rows -join "`n")
  </sheetData>
  <mergeCells count="$($mergeCells.Count)">
$($mergeCells -join "`n")
  </mergeCells>
  <autoFilter ref="A6:Q33"/>
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>
"@

$stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);-"/></numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><name val="Aptos"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FF808080"/></top><bottom style="double"><color rgb="FF808080"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>
"@

$workbookXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="2026 Direct CF" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029" calcMode="auto"/>
</workbook>
"@

$workbookRels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"@

$rootRels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

$contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@

$created = (Get-Date).ToUniversalTime().ToString("s") + "Z"
$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Deliberately Challenging Direct Method Cash Flow Template 2026</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$created</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$created</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>2026 Direct CF</vt:lpstr></vt:vector></TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>
"@

[System.IO.File]::WriteAllText((Join-Path $staging "[Content_Types].xml"), $contentTypes, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "_rels\.rels"), $rootRels, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "docProps\core.xml"), $coreXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "docProps\app.xml"), $appXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "xl\workbook.xml"), $workbookXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "xl\_rels\workbook.xml.rels"), $workbookRels, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "xl\styles.xml"), $stylesXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $staging "xl\worksheets\sheet1.xml"), $sheetXml, [System.Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $xlsxPath) {
    Remove-Item -LiteralPath $xlsxPath -Force
}
$zipPath = "$xlsxPath.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

$current = Get-Location
try {
    Set-Location -LiteralPath $staging
    Compress-Archive -Path * -DestinationPath $zipPath -CompressionLevel Optimal
} finally {
    Set-Location $current
}
Move-Item -LiteralPath $zipPath -Destination $xlsxPath
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Output $xlsxPath
