import { expect, it } from 'vitest';
import { listTree, useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  numberCell,
  readBuilt,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-parts-');

const NAMES = [
  '<definedNames>',
  '<definedName name="TaxRate">Rates!$B$2</definedName>',
  '<definedName name="Local" localSheetId="1" hidden="1">Rates!$A$1:$A$9</definedName>',
  '</definedNames>',
].join('');

it('RF-152 returns defined names with their scope and target', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'Main' }, { name: 'Rates' }],
    workbookExtra: NAMES,
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.definedNames).toEqual([
    { name: 'TaxRate', hidden: false, refersTo: 'Rates!$B$2' },
    { name: 'Local', sheet: 'Rates', hidden: true, refersTo: 'Rates!$A$1:$A$9' },
  ]);
});

it('RF-152 returns merged ranges, the used range, validation lists and conditional rules', async () => {
  const after =
    '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>' +
    '<conditionalFormatting sqref="C1:C9"><cfRule type="cellIs" priority="1" operator="greaterThan"><formula>100</formula></cfRule></conditionalFormatting>' +
    '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="D1:D9"><formula1>"Yes,No"</formula1></dataValidation></dataValidations>';
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        xml: worksheet(row(1, numberCell('A1', 1)), after).replace(
          '<sheetData>',
          '<dimension ref="A1:D9"/><sheetData>',
        ),
      },
    ],
  });

  const sheet = (await readBuilt(root.path, bytes)).sheets[0];

  expect(sheet?.usedRange).toBe('A1:D9');
  expect(sheet?.mergedRanges).toEqual(['A1:B1']);
  expect(sheet?.validations).toEqual([{ ranges: 'D1:D9', type: 'list', formula1: '"Yes,No"' }]);
  expect(sheet?.conditionalRules).toEqual([
    { ranges: 'C1:C9', type: 'cellIs', operator: 'greaterThan', formulas: ['100'] },
  ]);
});

it('RF-152 returns comments with their address and text but never an author', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        rels: '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>',
      },
    ],
    extraParts: [
      {
        name: 'xl/comments1.xml',
        data: '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author><t>Somebody Real</t></author></authors><commentList><comment ref="B2" authorId="0"><text><r><t>Check </t></r><r><t>this</t></r></text></comment></commentList></comments>',
      },
    ],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.sheets[0]?.comments).toEqual([{ address: 'B2', text: 'Check this' }]);
  expect(JSON.stringify(model)).not.toContain('Somebody Real');
});

it('RF-152 returns tables, pivot tables and chart kinds listed by sheet', async () => {
  const type = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        rels:
          `<Relationship Id="rId1" Type="${type}/table" Target="../tables/table1.xml"/>` +
          `<Relationship Id="rId2" Type="${type}/pivotTable" Target="../pivotTables/pivotTable1.xml"/>` +
          `<Relationship Id="rId3" Type="${type}/drawing" Target="../drawings/drawing1.xml"/>`,
      },
    ],
    extraParts: [
      {
        name: 'xl/tables/table1.xml',
        data: '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="Orders" displayName="Orders" ref="A1:B9"><tableColumns count="2"><tableColumn id="1" name="Id"/><tableColumn id="2" name="Total"/></tableColumns></table>',
      },
      {
        name: 'xl/pivotTables/pivotTable1.xml',
        data: '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="BySite"><location ref="F1:H9"/></pivotTableDefinition>',
      },
      {
        name: 'xl/drawings/drawing1.xml',
        data: '<xdr:wsDr xmlns:xdr="d"/>',
      },
      {
        name: 'xl/drawings/_rels/drawing1.xml.rels',
        data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${type}/chart" Target="../charts/chart1.xml"/></Relationships>`,
      },
      {
        name: 'xl/charts/chart1.xml',
        data: '<c:chartSpace xmlns:c="c"><c:chart><c:plotArea><c:barChart/></c:plotArea></c:chart></c:chartSpace>',
      },
    ],
  });

  const sheet = (await readBuilt(root.path, bytes)).sheets[0];

  expect(sheet?.tables).toEqual([{ name: 'Orders', range: 'A1:B9', columns: ['Id', 'Total'] }]);
  expect(sheet?.pivots).toEqual([{ name: 'BySite', range: 'F1:H9' }]);
  expect(sheet?.charts).toEqual(['barChart']);
});

it('RF-151 lists external links by file name and connections by name and type, and opens neither', async () => {
  const type = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S' }],
    workbookExtra: '<externalReferences><externalReference r:id="rId50"/></externalReferences>',
    workbookRels: `<Relationship Id="rId50" Type="${type}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
    extraParts: [
      {
        name: 'xl/externalLinks/externalLink1.xml',
        data: '<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
      },
      {
        name: 'xl/externalLinks/_rels/externalLink1.xml.rels',
        data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${type}/externalLinkPath" Target="file:///Z:/shared/Prices.xlsx" TargetMode="External"/></Relationships>`,
      },
      {
        name: 'xl/connections.xml',
        data: '<connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><connection id="1" name="Sales" type="5"><dbPr connection="Provider=Fake;Password=notreal" command="select 1"/></connection></connections>',
      },
      { name: 'xl/vbaProject.bin', data: 'not read here' },
    ],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.externalLinks).toEqual([{ fileName: 'Prices.xlsx' }]);
  expect(model.connections).toEqual([{ name: 'Sales', sourceType: 5 }]);
  expect(model.hasMacros).toBe(true);
  expect(JSON.stringify(model)).not.toContain('Password');
});

it('RF-151 writes no part to disk while it reads', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S', xml: worksheet(row(1, numberCell('A1', 1))) }],
  });

  await readBuilt(root.path, bytes);

  expect(await listTree(root.path)).toEqual(['upload/Book.xlsx']);
});
