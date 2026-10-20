import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import {
  encryptedBook,
  legacyBook,
  projectId,
  sampleBook,
  sourcesOf,
  stageFiles,
  stagedNames,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';
import { listTree } from '../../../support/writable-temp-root.js';

// RF-150, RF-152, RF-157, RFC-005 section 4.2: finishing a batch reads, renders and publishes every
// workbook or none, hashes the rendered tree, and deletes the workbooks and the staging folder.

const folders = useStagingFolders(afterEach);

function request(signal = new AbortController().signal) {
  return { projectId, uploadedAt, signal };
}

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

describe('DiskWorkbookStaging.publish', () => {
  it('RF-152 publishes workbook__<project>@<16 hex> with the rendered tree and snapshot.json', async () => {
    const { staging, dataDir } = await folders();
    const pricing = await sampleBook();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', pricing]]);

    const published = await staging.publish(id, request());

    expect(published.key).toBe(
      `workbook__${projectId}@${published.info.snapshotHash.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    );
    const tree = await listTree(join(dataDir, 'sources', published.key, 'files'));
    expect(tree).toContain('Pricing.xlsx/workbook.md');
    expect(tree).toContain('Pricing.xlsx/Summary/values.md');
    expect(tree).toContain('Pricing.xlsx/Summary/formulas.md');
    const record: unknown = JSON.parse(
      await readFile(join(dataDir, 'sources', published.key, 'snapshot.json'), 'utf8'),
    );
    expect(record).toMatchObject({
      schemaVersion: 1,
      kind: 'workbook',
      uploadedAt,
      rendererVersion: '1',
      snapshotHash: published.info.snapshotHash,
      fileCount: tree.length,
    });
  });
});

describe('DiskWorkbookStaging.publish (2)', () => {
  it('RF-152 records each workbook: its name, folder, size, SHA-256 of the file and counts', async () => {
    const { staging } = await folders();
    const pricing = await sampleBook();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', pricing]]);

    const { info, summary } = await staging.publish(id, request());

    expect(info.workbooks).toEqual([
      {
        fileName: 'Pricing.xlsx',
        folder: 'Pricing.xlsx',
        sizeBytes: pricing.length,
        sha256: sha256(pricing),
        counts: { sheets: 1, nonEmptyCells: 4, formulas: 1, macroModules: 0, macrosSkipped: 0 },
      },
    ]);
    expect(summary).toEqual([
      { name: 'Pricing.xlsx', sheets: 1, cells: 4, formulas: 1, macroModules: 0 },
    ]);
  });

  it('RF-152 reads the snapshot back as a workbook snapshot, and the tree is read-only', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);
    const published = await staging.publish(id, request());

    const snapshot = await new SnapshotStore(dataDir).readExisting(published.key);

    expect(snapshot).toMatchObject({ kind: 'workbook', snapshotHash: published.info.snapshotHash });
    const file = join(dataDir, 'sources', published.key, 'files', 'Pricing.xlsx', 'workbook.md');
    expect((await stat(file)).mode & 0o222).toBe(0);
  });

  it('RF-152 deletes the uploaded workbooks and the staging folder (Q-37)', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    const published = await staging.publish(id, request());

    expect(await sourcesOf(dataDir)).toEqual([published.key]);
    const all = await listTree(join(dataDir, 'sources'));
    expect(all.some((path) => path.endsWith('.xlsx') && !path.includes('/'))).toBe(false);
    expect(await stagedNames(dataDir)).toEqual([]);
  });
});

describe('DiskWorkbookStaging.publish (3)', () => {
  it('RF-152 gives the same key to the same batch uploaded again', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();
    const first = await staging.publish(
      (await stageFiles(staging, [['Pricing.xlsx', book]])).id,
      request(),
    );

    const second = await staging.publish(
      (await stageFiles(staging, [['Pricing.xlsx', book]])).id,
      request(),
    );

    expect(second.key).toBe(first.key);
    expect(await sourcesOf(dataDir)).toEqual([first.key]);
  });
});

describe('DiskWorkbookStaging.publish when a workbook is refused', () => {
  it.each([
    ['an encrypted workbook', 'Locked.xlsx', encryptedBook(), ERROR_CODES.workbookEncrypted],
    [
      'a legacy workbook saved under .xlsx',
      'Old.xlsx',
      legacyBook(),
      ERROR_CODES.workbookLegacyFormat,
    ],
  ])('RF-151 publishes nothing for %s and names the file', async (_what, name, bytes, code) => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [
      ['Pricing.xlsx', await sampleBook()],
      [name, bytes],
    ]);

    await expect(staging.publish(id, request())).rejects.toMatchObject({
      code,
      problems: [{ field: name, code }],
    });

    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('RF-151 refuses the batch when the workbooks hold more cells than the limit, with RST-1926', async () => {
    const { staging, dataDir } = await folders({ limits: { maxCells: 3 } });
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    await expect(staging.publish(id, request())).rejects.toMatchObject({
      code: ERROR_CODES.workbookTooLarge,
    });

    expect(await sourcesOf(dataDir)).toEqual([]);
  });
});

describe('DiskWorkbookStaging.publish when a workbook is refused (2)', () => {
  it('RF-151 counts the cells of all the workbooks of the batch together', async () => {
    const { staging } = await folders({ limits: { maxCells: 6 } });
    const book = await sampleBook();
    const { id } = await stageFiles(staging, [
      ['One.xlsx', book],
      ['Two.xlsx', book],
    ]);

    await expect(staging.publish(id, request())).rejects.toMatchObject({
      code: ERROR_CODES.workbookTooLarge,
    });
  });

  it('RF-150 stops at once when the request is aborted and leaves nothing behind', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);
    const controller = new AbortController();
    controller.abort(new Error('the client went away'));

    await expect(staging.publish(id, request(controller.signal))).rejects.toThrow();

    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('RF-150 stops a read that takes longer than the time bound with RST-1918', async () => {
    const { staging, dataDir } = await folders({ publishTimeoutMs: 1 });
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(staging.publish(id, request())).rejects.toMatchObject({
      code: ERROR_CODES.uploadTimedOut,
    });

    expect(await sourcesOf(dataDir)).toEqual([]);
  });
});
