import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../../src/application/ports/workbook-staging.js';
import {
  renderProject,
  renderProjectAsync,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { invoiceWorkbook } from '../../../../support/invoice-workbook-fixture.js';
import { book, cell, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';

// RF-159, RNF-017: the asynchronous render gives the bytes of the synchronous one, reports its
// progress in order and checks for a stop at every point where it hands the server back.

const withSheets = (name: string, sheets: number) =>
  book(
    Array.from({ length: sheets }, (_, i) =>
      sheet(`S${String(i + 1)}`, { cells: [cell('A1', num(i)), cell('B1', num(2))] }),
    ),
    { fileName: name },
  );

const limits = { maxTotalBytes: 1024 * 1024 };
const noCheck = (): void => undefined;
const rank = (step: string): number =>
  ['reading', 'rendering', 'dependencies', 'saving'].indexOf(step);

function digest(project: ReturnType<typeof renderProject>): string {
  const hash = createHash('sha256');
  for (const file of [...project.workbooks.flatMap((w) => w.files), project.dependencies]) {
    hash.update(`${file.path}\n${file.content}\n`);
  }
  return hash.digest('hex');
}

describe('renderProjectAsync', () => {
  it('RF-159 renders the invoice fixture to the same bytes as before', async () => {
    const models = [invoiceWorkbook()];

    const asynchronous = await renderProjectAsync(models, limits, { check: noCheck });

    expect(digest(asynchronous)).toBe(digest(renderProject(models, limits)));
    expect(digest(asynchronous)).toBe(
      '7b04635b2995d36aaae51a39708dc0f2a8c91c36485d6aa8e7e055ee73669b5c',
    );
  });

  it('RF-159 reports progress in order with the counts of the project', async () => {
    const events: WorkbookProgress[] = [];

    await renderProjectAsync([withSheets('A.xlsx', 2), withSheets('B.xlsx', 1)], limits, {
      check: noCheck,
      onProgress: (progress) => events.push(progress),
    });

    const rendering = events.filter((e) => e.step === 'rendering');
    expect(rendering.map((e) => [e.workbook, e.workbooks, e.sheet, e.sheets])).toEqual([
      [1, 2, 1, 2],
      [1, 2, 2, 2],
      [2, 2, 1, 1],
    ]);
    expect(events.every((e) => e.cells === 6)).toBe(true);
    const order = events.map((e) => e.step);
    expect(order).toEqual([...order].sort((a, b) => rank(a) - rank(b)));
    expect(order).toContain('dependencies');
  });

  it('RF-159 checks for a stop before each sheet and stops before the next one', async () => {
    const seen: number[] = [];

    await expect(
      renderProjectAsync([withSheets('A.xlsx', 5)], limits, {
        check: () => {
          if (seen.length === 2) throw new Error('stopped');
        },
        onProgress: (progress) => seen.push(progress.sheet),
      }),
    ).rejects.toThrow('stopped');

    expect(seen).toEqual([1, 2]);
  });
});
