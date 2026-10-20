import { expect, it } from 'vitest';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { fileOf } from '../../../../support/rendered-workbook-fixtures.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  readBuilt,
  row,
  sharedCell,
  stylesXml,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-render-');

async function built() {
  const data = worksheet(
    row(
      1,
      `${sharedCell('A1', 0)}${numberCell('B1', 45000.5, 1)}${formulaCell('C1', 'B1*2', '90001')}`,
    ),
    '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>',
  );
  const bytes = await buildWorkbook({
    sheets: [
      { name: 'CON', xml: data },
      { name: 'a/b', xml: data },
      { name: 'Data', xml: data },
      { name: 'data', xml: data },
      { name: 'Hidden', state: 'hidden', xml: data },
      { name: 'Deep', state: 'veryHidden', xml: data },
      { name: 'Empty' },
    ],
    sharedStrings: ['say "hi" | now\nline2'],
    styles: stylesXml([0, 164], { 164: 'dd/mm/yyyy hh:mm' }),
  });
  return readBuilt(root.path, bytes, { fileName: 'Pricing.xlsx' });
}

it('RF-152 renders a workbook read from a package into the folder of RFC-005 section 4.4', async () => {
  const rendered = renderWorkbook(await built());

  expect(rendered.folder).toBe('Pricing.xlsx');
  expect(rendered.names.map((name) => name.segment)).toEqual([
    'Pricing.xlsx',
    '_CON',
    'a_b',
    'Data',
    'data~2',
    'Hidden',
    'Deep',
    'Empty',
  ]);
  expect(rendered.files.map((file) => file.path)).toContain('Pricing.xlsx/Empty/notes.md');
  expect(fileOf(rendered, '_CON/values.md')).toContain(
    'R1 | A1 "say \\"hi\\" | now\\nline2" | B1 2023-03-15T12:00:00 | C1 90001 (f)\n',
  );
  expect(fileOf(rendered, '_CON/values.md')).toContain('- Merged ranges: A1:B1\n');
  expect(fileOf(rendered, 'Hidden/values.md')).toContain('- State: hidden\n');
  expect(fileOf(rendered, 'Deep/values.md')).toContain('- State: veryHidden\n');
  expect(fileOf(rendered, 'workbook.md')).toContain('| Deep | veryHidden |');
  expect(fileOf(rendered, 'a_b/formulas.md')).toContain('C1 = B1*2    [cached: 90001]');
});

it('RF-152 renders the same package twice to the same bytes', async () => {
  const model = await built();
  expect(renderWorkbook(model)).toEqual(renderWorkbook(await built()));
});
