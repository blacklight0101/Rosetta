import { expect, it } from 'vitest';
import { renderProject } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { sectionOf } from '../../../../support/dependency-fixtures.js';
import { fileOf } from '../../../../support/rendered-workbook-fixtures.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  readBuilt,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

// RF-153: two workbooks are built as packages, read by the real reader and mapped. Everything in the
// workbooks is first-party test data.

const root = useWritableTempRoot('rosetta-dependencies-');
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function pricing() {
  const summary = worksheet(
    row(1, `${numberCell('B1', 4)}${formulaCell('C1', 'B1*2', '8')}`) +
      row(2, formulaCell('A2', '[1]Rates!C4*B1', '28')),
  );
  const bytes = await buildWorkbook({
    sheets: [{ name: 'Summary', xml: summary }],
    workbookExtra: '<externalReferences><externalReference r:id="rId50"/></externalReferences>',
    workbookRels: `<Relationship Id="rId50" Type="${REL}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
    extraParts: [
      { name: 'xl/externalLinks/externalLink1.xml', data: `<externalLink xmlns="${MAIN}"/>` },
      {
        name: 'xl/externalLinks/_rels/externalLink1.xml.rels',
        data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/externalLinkPath" Target="file:///C:/Users/x/Rates.xlsx" TargetMode="External"/></Relationships>`,
      },
    ],
  });
  return readBuilt(root.path, bytes, { fileName: 'Pricing.xlsx' });
}

async function rates() {
  const sheet = worksheet(row(4, numberCell('C4', 7)));
  const bytes = await buildWorkbook({ sheets: [{ name: 'Rates', xml: sheet }] });
  return readBuilt(root.path, bytes, { fileName: 'Rates.xlsx' });
}

it('RF-153 maps two workbooks read from packages: edges, inputs, outputs and the file name only', async () => {
  const project = renderProject([await pricing(), await rates()]);
  const map = project.dependencies.content;

  expect(sectionOf(map, 'Workbooks')).toEqual(['Pricing.xlsx -> Rates.xlsx: 1 formula']);
  expect(sectionOf(map, 'Sheets')).toEqual(['Pricing.xlsx/Summary -> Rates.xlsx/Rates: 1 formula']);
  expect(sectionOf(map, 'Input cells')).toEqual(['Pricing.xlsx/Summary!B1', 'Rates.xlsx/Rates!C4']);
  expect(sectionOf(map, 'Output cells')).toEqual([
    'Pricing.xlsx/Summary!A2',
    'Pricing.xlsx/Summary!C1',
  ]);
  expect(map).not.toContain('Users');
  const [first] = project.workbooks;
  if (first === undefined) throw new Error('No workbook rendered');
  expect(fileOf(first, 'Summary/formulas.md')).toContain('A2 = [Rates.xlsx]Rates!C4*B1');
});
