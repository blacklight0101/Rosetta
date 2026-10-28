import { afterEach, describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  projectId,
  sampleBook,
  sourcesOf,
  stageFiles,
  stagedNames,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';
import { buildWorkbook, emptySheets } from '../../../support/workbook-fixtures.js';

// RF-159, RNF-017, DEC-183: rendering a project hands the server back between sheets; cancel and the
// time bound apply during rendering and nothing is published; the rendered tree does not change.

const folders = useStagingFolders(afterEach);

function request(
  signal = new AbortController().signal,
  onProgress?: (progress: WorkbookProgress) => void,
) {
  return { projectId, uploadedAt, signal, ...(onProgress === undefined ? {} : { onProgress }) };
}

const sheetsBook = (count: number): Promise<Buffer> =>
  buildWorkbook({ sheets: emptySheets(count) });

describe('DiskWorkbookStaging.publish while rendering', () => {
  it('RF-159 keeps the snapshotHash of the workbook fixtures', async () => {
    const { staging } = await folders();
    const pricing = await sampleBook([{ name: 'Other' }]);
    const one = await staging.publish(
      (await stageFiles(staging, [['Pricing.xlsx', pricing]])).id,
      request(),
    );
    const two = await staging.publish(
      (
        await stageFiles(staging, [
          ['Pricing.xlsx', pricing],
          ['Forecast.xlsx', await sampleBook()],
        ])
      ).id,
      request(),
    );

    expect(one.info.snapshotHash).toBe(
      'sha256:634492c76f110be2dfd41bcbafc62533c8208be55a5abf2539d74fb6182d1a34',
    );
    expect(two.info.snapshotHash).toBe(
      'sha256:f09f88b599fa3980db9ef56d52f9003d13419eef9fbd2159de3e671e756cacd2',
    );
  });

  it('RNF-017 lets other work run while a workbook of many sheets renders', async () => {
    const { staging } = await folders();
    const { id } = await stageFiles(staging, [['Wide.xlsx', await sheetsBook(40)]]);
    let ticks = 0;
    let running = true;
    const spin = (): void => {
      ticks += 1;
      if (running) setImmediate(spin);
    };
    setImmediate(spin);
    const seen: number[] = [];

    await staging.publish(
      id,
      request(new AbortController().signal, (progress) => {
        if (progress.step === 'rendering') seen.push(ticks);
      }),
    );
    running = false;

    expect(seen).toHaveLength(40);
    expect((seen[seen.length - 1] ?? 0) - (seen[0] ?? 0)).toBeGreaterThanOrEqual(39);
  });
});

describe('DiskWorkbookStaging.publish while rendering (2)', () => {
  it('RF-159 stops before the next sheet when cancelled while rendering and publishes nothing', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Wide.xlsx', await sheetsBook(10)]]);
    const controller = new AbortController();
    const rendered: number[] = [];

    const published = staging.publish(
      id,
      request(controller.signal, (progress) => {
        if (progress.step !== 'rendering') return;
        rendered.push(progress.sheet);
        if (progress.sheet === 3) controller.abort(new Error('cancelled'));
      }),
    );

    await expect(published).rejects.toThrow('cancelled');
    expect(rendered).toEqual([1, 2, 3]);
    expect(await sourcesOf(dataDir)).toEqual([]);
    expect(await stagedNames(dataDir)).toEqual([]);
  });

  it('RF-159 stops with its error code when the bound is reached while rendering', async () => {
    const { staging, dataDir } = await folders({ publishTimeoutMs: 400 });
    const { id } = await stageFiles(staging, [['Wide.xlsx', await sheetsBook(6)]]);
    const steps: string[] = [];

    const published = staging.publish(
      id,
      request(new AbortController().signal, (progress) => {
        steps.push(progress.step);
        if (progress.step === 'rendering' && progress.sheet === 2) {
          for (const end = Date.now() + 500; Date.now() < end;) continue;
        }
      }),
    );

    await expect(published).rejects.toMatchObject({ code: ERROR_CODES.uploadTimedOut });
    expect(steps).not.toContain('saving');
    expect(await sourcesOf(dataDir)).toEqual([]);
  });
});
