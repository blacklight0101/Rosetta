import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import {
  ByteBudget,
  TextFile,
} from '../../../../../src/infrastructure/sources/workbook/render-output.js';
import { MAX_LINE } from '../../../../../src/infrastructure/sources/workbook/workbook-text.js';

it('RF-146 cuts any line over the limit before it is written', () => {
  const file = new TextFile(new ByteBudget(1_000_000));
  file.add('x'.repeat(5000));
  const [line] = file.text().split('\n');
  expect(line?.length).toBeLessThanOrEqual(MAX_LINE);
  expect(line?.endsWith(' ...')).toBe(true);
});

it('RF-152 continues a row on the next line with the same prefix when it would pass the limit', () => {
  const file = new TextFile(new ByteBudget(1_000_000));
  const fields = Array.from({ length: 10 }, (_, i) => `F${String(i)} ${'v'.repeat(450)}`);

  file.addWrapped('R7 | ', fields, ' | ');

  const lines = file.text().trimEnd().split('\n');
  expect(lines.length).toBeGreaterThan(2);
  for (const line of lines) {
    expect(line.startsWith('R7 | F')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(MAX_LINE);
  }
  expect(lines.join(' | ').split(' | R7 | ').join(' | ').match(/F\d /gu)).toHaveLength(10);
});

it('RF-151 refuses to take more bytes than the budget with RST-1926, counting every line and its break', () => {
  const budget = new ByteBudget(22);
  const file = new TextFile(budget);

  file.add('0123456789');
  file.add('012345678');
  expect(() => {
    file.add('x');
  }).toThrow(expect.objectContaining({ code: ERROR_CODES.workbookTooLarge }));
});

it('RF-152 counts bytes, not characters', () => {
  const file = new TextFile(new ByteBudget(10));
  expect(() => {
    file.add('éééééé');
  }).toThrow(expect.objectContaining({ code: ERROR_CODES.workbookTooLarge }));
});
