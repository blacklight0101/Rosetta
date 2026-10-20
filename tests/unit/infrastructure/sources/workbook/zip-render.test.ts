import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { renderZip } from '../../../../../src/infrastructure/sources/workbook/zip-render.js';
import {
  renderProject,
  renderWorkbook,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { book, cell, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';

// RF-153, RF-152, RST-1926: the workbooks of a zip share one byte limit with their dependency map.

const small = book([sheet('S', { cells: [cell('A1', num(1))] })], { fileName: 'docs/Small.xlsx' });
const cells = Array.from({ length: 300 }, (_, index) => cell(`A${String(index + 1)}`, num(index)));
const large = book([sheet('S', { cells }), sheet('T', { cells })], { fileName: 'docs/Large.xlsx' });
const items = [small, large].map((model) => ({ model, folder: model.fileName }));

const bytes = (files: readonly { readonly content: string }[]): number =>
  files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
const booksOnly = (model: typeof small): number => bytes(renderWorkbook(model).files);

it('RF-153 renders every workbook in place with one map when they fit', () => {
  const result = renderZip(items);

  expect(result.live).toEqual([0, 1]);
  expect(result.rendered.workbooks.map((w) => w.folder)).toEqual([
    'docs/Small.xlsx',
    'docs/Large.xlsx',
  ]);
  expect(result.refused.size).toBe(0);
});

it('RST-1926 refuses the workbook that does not fit after the ones before it', () => {
  const limit =
    bytes(renderProject([small]).workbooks.flatMap((w) => w.files)) +
    bytes([renderProject([small]).dependencies]);

  const result = renderZip(items, limit);

  expect(result.live).toEqual([0]);
  expect([...result.refused.keys()]).toEqual([1]);
  expect(result.refused.get(1)?.code).toBe(ERROR_CODES.workbookTooLarge);
});

it('RST-1926 drops the last workbook when the books fit but their map does not', () => {
  const result = renderZip(items, booksOnly(small) + booksOnly(large));

  expect(result.live).toEqual([0]);
  expect(result.refused.get(1)?.code).toBe(ERROR_CODES.workbookTooLarge);
});

it('RST-1926 keeps a small workbook that comes after the one that did not fit', () => {
  const next = book([sheet('S', { cells: [cell('A1', num(2))] })], { fileName: 'docs/Next.xlsx' });
  const both = renderProject([small, next]);
  const limit = bytes(both.workbooks.flatMap((w) => w.files)) + bytes([both.dependencies]);

  const result = renderZip([...items, { model: next, folder: next.fileName }], limit);

  expect(result.live).toEqual([0, 2]);
  expect([...result.refused.keys()]).toEqual([1]);
});
