import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import {
  projectId,
  sampleBook,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';
import { formulaCell, numberCell, row, worksheet } from '../../../support/workbook-fixtures.js';

// RF-152, RF-159, DEC-183, P5-47: the hashes of a workbook snapshot are taken while the files are
// written. The snapshot hash and snapshot.json are the ones the earlier pass over
// the written files gave: the golden values below were recorded from that pass.

const folders = useStagingFolders(afterEach);

const GOLDEN = {
  snapshotHash: 'sha256:9d6d3c4f07ce26056bd70a39a4bb2db9c690b4d88946d446fca4b8940672f11d',
  fileCount: 15,
  totalBytes: 3007,
};

async function stagedBatch() {
  const { staging, dataDir } = await folders();
  const rates = await sampleBook([
    {
      name: 'Rates',
      xml: worksheet(row(1, `${numberCell('A1', 3)}${formulaCell('B1', 'A1+1', '4')}`)),
    },
  ]);
  const files = [
    ['Pricing.xlsx', await sampleBook()],
    ['Rates.xlsx', rates],
  ] as const;
  const { id } = await stageFiles(staging, files);
  const published = await staging.publish(id, {
    projectId,
    uploadedAt,
    signal: new AbortController().signal,
  });
  return { dataDir, published, files };
}

describe('workbook snapshot, golden values', () => {
  it('RF-152 gives the snapshotHash and counts recorded before the change', async () => {
    const { published } = await stagedBatch();

    expect(published.info.snapshotHash).toBe(GOLDEN.snapshotHash);
    expect(published.info.fileCount).toBe(GOLDEN.fileCount);
    expect(published.info.totalBytes).toBe(GOLDEN.totalBytes);
  });

  it('RF-152 agrees with a fresh walk of the published tree and a fresh hash of each upload', async () => {
    const { dataDir, published, files } = await stagedBatch();
    const store = new SnapshotStore(dataDir);

    const walked = await store.inspect(store.filesDir(published.key));

    expect(walked.snapshotHash).toBe(published.info.snapshotHash);
    expect(walked.fileCount).toBe(published.info.fileCount);
    expect(walked.totalBytes).toBe(published.info.totalBytes);
    expect(published.info.workbooks.map((book) => book.sha256)).toEqual(
      files.map(([, bytes]) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`),
    );
  });

  it('RF-152 writes snapshot.json with the recorded fields', async () => {
    const { dataDir, published } = await stagedBatch();

    const text = await readFile(join(dataDir, 'sources', published.key, 'snapshot.json'), 'utf8');

    const record = JSON.parse(text) as Record<string, unknown>;
    expect(record).toMatchObject({
      schemaVersion: 1,
      kind: 'workbook',
      uploadedAt,
      snapshotHash: GOLDEN.snapshotHash,
      fileCount: GOLDEN.fileCount,
      totalBytes: GOLDEN.totalBytes,
      skippedLinks: 0,
    });
    expect(text).toBe(`${JSON.stringify({ schemaVersion: 1, ...published.info }, null, 2)}\n`);
  });
});
