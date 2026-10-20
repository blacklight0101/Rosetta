import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileRunManifestStore } from '../../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SnapshotStore } from '../../../src/infrastructure/github/snapshot-store.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { composeScanResults } from '../../../src/presentation/compose-understand.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';
import { UPLOAD_HASH, UPLOAD_KEY, UPLOADED_AT } from '../../support/upload-run-fixtures.js';

// RF-155, RF-152, ADR-004: the scan results of the composed application read the workbook folders
// from the `snapshot.json` of the snapshot a scan read, so the understand and plan stages choose the
// workbook guidance from the record, never from the files' names or content.

const workbook = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 20480,
  sha256: `sha256:${'b'.repeat(64)}`,
  counts: { sheets: 2, nonEmptyCells: 20, formulas: 3, macroModules: 0, macrosSkipped: 0 },
};

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-compose-wb-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** Scans the pricing-workbook fixture as an upload snapshot and opens the scan as the application does. */
async function opened(workbooks: readonly (typeof workbook)[] | undefined, raw?: string) {
  const snapshot = new SnapshotStore(dataDir);
  const files = snapshot.filesDir(UPLOAD_KEY);
  await cp(join('tests', 'fixtures', 'repos', 'pricing-workbook'), files, { recursive: true });
  const h = await createUnderstandHarness({
    dataDir,
    recording: 'understand-read-then-answer.json',
    repository: files,
    upload: true,
  });
  const scan = await h.scan();
  const record = {
    ...{ schemaVersion: 1, kind: 'upload', fileName: 'OrderDesk.zip', uploadedAt: UPLOADED_AT },
    ...(workbooks === undefined ? {} : { workbooks }),
    ...{ fileCount: 10, totalBytes: 4096, skippedLinks: 0, snapshotHash: UPLOAD_HASH },
  };
  const text = raw ?? JSON.stringify(record);
  await writeFile(join(snapshot.snapshotDir(UPLOAD_KEY), 'snapshot.json'), text);
  const parts = partsOf();
  const scanned = await composeScanResults(parts).open(scan);
  return { scanned, warnings: parts.logger.entries.filter((entry) => entry.level === 'warn') };
}

function partsOf() {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const writer = new NodeOutputWriter({ dataDir, logger });
  const manifests = new FileRunManifestStore({ writer, masker });
  return { dataDir, writer, manifests, logger };
}

/** Scans the same tree as a GitHub snapshot whose `snapshot.json` is not a record at all. */
async function openedGithub() {
  const key = `octo__demo@${'c'.repeat(40)}`;
  const snapshot = new SnapshotStore(dataDir);
  const files = snapshot.filesDir(key);
  await cp(join('tests', 'fixtures', 'repos', 'pricing-workbook'), files, { recursive: true });
  const h = await createUnderstandHarness({
    dataDir,
    recording: 'understand-read-then-answer.json',
    repository: files,
  });
  const scan = await h.scan();
  await writeFile(join(snapshot.snapshotDir(key), 'snapshot.json'), 'not a snapshot record');
  return composeScanResults(partsOf()).open(scan);
}

describe('the scan results of the composed application', () => {
  it('RF-155 name the folders of the workbooks the snapshot record lists', async () => {
    const { scanned } = await opened([workbook]);

    expect(scanned.workbookFolders).toEqual(['Pricing.xlsx']);
  });

  it('RF-155 name none for a zip whose record lists no workbook', async () => {
    const { scanned } = await opened(undefined);

    expect(scanned.workbookFolders ?? []).toEqual([]);
  });

  it('RF-155 are not read from the record of a GitHub snapshot, which can list none', async () => {
    const scanned = await openedGithub();

    expect(scanned.workbookFolders ?? []).toEqual([]);
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['a record of no known shape', JSON.stringify({ kind: 'upload', workbooks: 'many' })],
  ])(
    'RF-155 a snapshot record that is %s leaves the scan readable, with none listed and a warning',
    async (_name, raw) => {
      const { scanned, warnings } = await opened(undefined, raw);

      expect(scanned.workbookFolders ?? []).toEqual([]);
      expect(scanned.source.snapshotKey).toBe(UPLOAD_KEY);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toContain('snapshot.json');
    },
  );
});
