import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../../../../../src/infrastructure/sources/workbook/workbook-limits.js';
import { renderZipWorkbooks } from '../../../../../src/infrastructure/sources/workbook/zip-workbooks.js';
import { formulaBook, sampleBook } from '../../../../support/workbook-staging-harness.js';
import { listTree, useWritableTempRoot } from '../../../../support/writable-temp-root.js';

// RF-151, RF-152, Q-41, DEC-152: a workbook in a zip that holds a formula over 8,192 characters is
// left out and listed with its reason; the rest of the zip is analysed.

const root = useWritableTempRoot('rosetta-zip-formula-');

async function unpacked(files: readonly (readonly [string, Buffer])[]): Promise<void> {
  await mkdir(join(root.path, 'docs'), { recursive: true });
  await writeFile(join(root.path, 'README.md'), '# docs\n');
  for (const [name, bytes] of files) await writeFile(join(root.path, 'docs', name), bytes);
}

it('RF-151 leaves a zipped workbook with a formula of 8,193 characters out and renders the rest', async () => {
  await unpacked([
    ['Good.xlsx', await sampleBook()],
    ['Long.xlsx', await formulaBook(8193)],
  ]);

  const result = await renderZipWorkbooks(
    root.path,
    DEFAULT_WORKBOOK_LIMITS,
    new AbortController().signal,
  );

  expect(result?.entries.map((entry) => entry.fileName)).toEqual(['docs/Good.xlsx']);
  expect(result?.leftOut).toHaveLength(1);
  expect(result?.leftOut[0]?.name).toBe('docs/Long.xlsx');
  expect(result?.leftOut[0]?.reason).toContain(ERROR_CODES.workbookFormulaTooLong);
  const tree = await listTree(root.path);
  expect(tree).toContain('dependencies.md');
  expect(tree.some((path) => path.startsWith('docs/Long.xlsx'))).toBe(false);
});

it('RF-151 renders a zipped workbook whose longest formula has exactly 8,192 characters', async () => {
  await unpacked([['Edge.xlsx', await formulaBook(8192)]]);

  const result = await renderZipWorkbooks(
    root.path,
    DEFAULT_WORKBOOK_LIMITS,
    new AbortController().signal,
  );

  expect(result?.leftOut).toEqual([]);
  expect(result?.entries.map((entry) => entry.fileName)).toEqual(['docs/Edge.xlsx']);
});
