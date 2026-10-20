import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../../../../../src/infrastructure/sources/workbook/workbook-limits.js';
import { renderZipWorkbooks } from '../../../../../src/infrastructure/sources/workbook/zip-workbooks.js';
import { listTree } from '../../../../support/writable-temp-root.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

// RF-150, RF-153, Q-41, RST-1926: when the byte cap leaves every workbook of a zip out, each is
// listed with its reason and no dependency map is written, because there is nothing to map.

const root = useWritableTempRoot('rosetta-zip-cap-');

async function unpacked(names: readonly string[]): Promise<void> {
  const sheet = worksheet(row(1, `${numberCell('A1', 4)}${formulaCell('B1', 'A1*2', '8')}`));
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml: sheet }] });
  await mkdir(join(root.path, 'docs'), { recursive: true });
  await writeFile(join(root.path, 'README.md'), '# docs\n');
  for (const name of names) await writeFile(join(root.path, 'docs', name), bytes);
}

it('RST-1926 leaves every workbook out under a cap below the map, and writes no map', async () => {
  await unpacked(['One.xlsx', 'Two.xlsx']);
  const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxRenderedBytes: 50 };

  const result = await renderZipWorkbooks(root.path, limits, new AbortController().signal);

  expect(result?.entries).toEqual([]);
  expect(result?.leftOut.map((item) => item.name)).toEqual(['docs/One.xlsx', 'docs/Two.xlsx']);
  for (const item of result?.leftOut ?? []) {
    expect(item.reason).toContain(ERROR_CODES.workbookTooLarge);
  }
  expect(await listTree(root.path)).toEqual(['README.md']);
});

it('RF-153 writes the map beside the rendered workbooks when the cap is not reached', async () => {
  await unpacked(['One.xlsx']);
  const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxRenderedBytes: 64 * 1024 };

  const result = await renderZipWorkbooks(root.path, limits, new AbortController().signal);

  expect(result?.entries.map((entry) => entry.fileName)).toEqual(['docs/One.xlsx']);
  expect(await listTree(root.path)).toContain('dependencies.md');
});
