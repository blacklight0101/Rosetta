import { expect, it } from 'vitest';
import { plainModel } from '../../../../../src/infrastructure/sources/workbook/external-names.js';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import {
  dependenciesOf,
  projectOf,
  sectionOf,
  withFormula,
} from '../../../../support/dependency-fixtures.js';

// RF-153, Q-38: a formula names an external link by its number. A link the reader left out (no usable
// file name) keeps the numbers of the links after it, so `[2]` never reads the wrong workbook.

function readerAfterDroppedLink() {
  const reader = book(
    [sheet('S', { cells: [withFormula('A1', '[2]Rates!C4'), withFormula('A2', '[1]Rates!C4')] })],
    {
      fileName: 'Reader.xlsx',
      externalLinks: [{ fileName: 'Rates.xlsx', position: 2 }],
    },
  );
  const rates = book([sheet('Rates', { cells: [cell('C4', num(1))] })], { fileName: 'Rates.xlsx' });
  return [reader, rates];
}

it('RF-153 resolves [2] to the link that kept position 2 and leaves [1] unresolved', () => {
  const content = dependenciesOf(readerAfterDroppedLink());

  expect(sectionOf(content, 'Workbooks')).toEqual(['Reader.xlsx -> Rates.xlsx: 1 formula']);
  expect(sectionOf(content, 'Unresolved and dynamic references')).toHaveLength(1);
});

it('Q-38 shows the file name of the link at its position in the formulas', () => {
  const [reader] = readerAfterDroppedLink();
  if (reader === undefined) throw new Error('No workbook');
  const formulas = plainModel(reader).sheets[0]?.cells.map((c) => c.formula?.text);

  expect(formulas).toEqual(['[Rates.xlsx]Rates!C4', '[1]Rates!C4']);
});

it('RF-152 says in workbook.md how many external links had no file name', () => {
  const reader = book([sheet('S')], { fileName: 'Reader.xlsx', unnamedExternalLinks: 2 });
  const [first] = projectOf([reader]).workbooks;
  if (first === undefined) throw new Error('No workbook rendered');

  expect(fileOf(first, 'workbook.md')).toContain(
    '- 2 external links had no usable file name and are not listed.',
  );
});

it('RF-152 says nothing about unnamed links when there are none', () => {
  const [first] = projectOf([book([sheet('S')], { fileName: 'Reader.xlsx' })]).workbooks;
  if (first === undefined) throw new Error('No workbook rendered');

  expect(fileOf(first, 'workbook.md')).not.toContain('no usable file name');
});
