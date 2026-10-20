import { buildVbaProject } from '../../support/vba-project.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  row,
  sharedCell,
  worksheet,
} from '../../support/workbook-fixtures.js';

// RF-150, RF-152, RF-153, RF-154, P3-52: the two workbooks of the Excel journey are built in the
// test from first-party content (an order desk that prices quotes); nothing binary is committed.
// `Pricing.xlsm` holds a macro module, a shared formula, a table, a validation list and a reference
// to `Discounts.xlsx`, the second workbook of the batch.

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

const STRINGS = [
  'Customer type',
  'Quantity',
  'List price',
  'Total',
  'Retail',
  'Wholesale',
  'Price',
  'Tier',
  'Discount',
];

const quoteRows =
  row(
    1,
    [sharedCell('A1', 0), sharedCell('B1', 1), sharedCell('C1', 2), sharedCell('D1', 3)].join(''),
  ) +
  row(
    2,
    [
      sharedCell('A2', 4),
      numberCell('B2', 120),
      '<c r="C2"><f t="shared" ref="C2:C3" si="0">VLOOKUP(A2,Rates!$A$2:$B$3,2,FALSE)</f><v>25</v></c>',
      formulaCell('D2', 'B2*C2*(1-[1]Discounts!$B$2)', '2700'),
    ].join(''),
  ) +
  row(
    3,
    [
      sharedCell('A3', 5),
      numberCell('B3', 40),
      '<c r="C3"><f t="shared" si="0"/><v>18</v></c>',
      formulaCell('D3', 'B3*C3*(1-[1]Discounts!$B$3)', '720'),
    ].join(''),
  );

const quoteAfter =
  '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="A2:A3">' +
  '<formula1>"Retail,Wholesale"</formula1></dataValidation></dataValidations>';

const ratesRows =
  row(1, sharedCell('A1', 0) + sharedCell('B1', 6)) +
  row(2, sharedCell('A2', 4) + numberCell('B2', 25)) +
  row(3, sharedCell('A3', 5) + numberCell('B3', 18));

const tableXml =
  `<table xmlns="${MAIN}" name="Quotes" displayName="Quotes" ref="A1:D3"><tableColumns count="4">` +
  '<tableColumn id="1" name="Customer type"/><tableColumn id="2" name="Quantity"/>' +
  '<tableColumn id="3" name="List price"/><tableColumn id="4" name="Total"/></tableColumns></table>';

const externalLink = {
  workbookExtra: '<externalReferences><externalReference r:id="rId50"/></externalReferences>',
  workbookRels: `<Relationship Id="rId50" Type="${REL}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
  parts: [
    { name: 'xl/externalLinks/externalLink1.xml', data: `<externalLink xmlns="${MAIN}"/>` },
    {
      name: 'xl/externalLinks/_rels/externalLink1.xml.rels',
      data: `<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/externalLinkPath" Target="file:///Discounts.xlsx" TargetMode="External"/></Relationships>`,
    },
  ],
};

const macroSource = [
  'Attribute VB_Name = "Module1"',
  'Sub ApplyTierDiscount()',
  '    If Sheets("Quote").Range("B2").Value >= 100 Then',
  '        Sheets("Quote").Range("E2").Value = "Tier 2 discount"',
  '    End If',
  'End Sub',
  '',
].join('\r\n');

const moduleOne = { name: 'Module1', kind: 'standard', source: macroSource } as const;

/** `Pricing.xlsm`: the Quote and Rates sheets, a macro module, and a reference to Discounts.xlsx. */
export function pricingWorkbook(): Promise<Buffer> {
  return buildWorkbook({
    sheets: [
      {
        name: 'Quote',
        xml: worksheet(quoteRows, quoteAfter),
        rels: `<Relationship Id="rId1" Type="${REL}/table" Target="../tables/table1.xml"/>`,
      },
      { name: 'Rates', xml: worksheet(ratesRows) },
    ],
    sharedStrings: STRINGS,
    workbookExtra: externalLink.workbookExtra,
    workbookRels: externalLink.workbookRels,
    extraParts: [
      ...externalLink.parts,
      { name: 'xl/tables/table1.xml', data: tableXml },
      { name: 'xl/vbaProject.bin', data: buildVbaProject({ modules: [moduleOne] }) },
    ],
  });
}

/** `Discounts.xlsx`: one discount per tier, read by Pricing.xlsm through its external link; a new rate is another file. */
export function discountsWorkbook(retailRate = 0.1): Promise<Buffer> {
  const rows =
    row(1, sharedCell('A1', 7) + sharedCell('B1', 8)) +
    row(2, sharedCell('A2', 4) + numberCell('B2', retailRate)) +
    row(3, sharedCell('A3', 5) + numberCell('B3', 0.2));
  return buildWorkbook({
    sheets: [{ name: 'Discounts', xml: worksheet(rows) }],
    sharedStrings: STRINGS,
  });
}
