import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { ZipUploadStore } from '../../../../src/infrastructure/sources/zip-upload-store.js';
import { YauzlZipExtractor } from '../../../../src/infrastructure/sources/zip-extractor.js';
import { DEFAULT_ZIP_LIMITS } from '../../../../src/infrastructure/sources/zip-limits.js';
import {
  bodyOf,
  otherProjectId,
  requestOf,
  sampleZip,
} from '../../../support/upload-store-harness.js';
import {
  MB,
  projectId,
  sampleBook,
  sourcesOf,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-150, RF-129, DEC-149, RFC-005 section 4.2: a batch holds twice the limit of free space from its
// opening to its end, the zip upload store holds from the same pool, and a restart deletes a batch
// that was open.

const folders = useStagingFolders(afterEach);

/** Room for exactly one upload at the 1 MB limit: twice the limit, plus a little. */
const ROOM_FOR_ONE = 2 * MB + 1024;

describe('DiskWorkbookStaging the free-space reservation', () => {
  it('DEC-149 refuses a batch when less than twice the limit is free, and creates nothing', async () => {
    const { staging, dataDir } = await folders({ freeBytes: () => Promise.resolve(2 * MB - 1) });

    await expect(staging.open(MB)).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });

    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('DEC-149 holds the room of an open batch: a second batch is refused until the first ends', async () => {
    const { staging } = await folders({ freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const first = await staging.open(MB);

    await expect(staging.open(MB)).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
    await staging.discard(first);

    await expect(staging.open(MB)).resolves.toBeTypeOf('string');
  });

  it('DEC-149 gives the room back when a batch is published', async () => {
    const { staging } = await folders({ freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    await staging.publish(id, { projectId, uploadedAt, signal: new AbortController().signal });

    await expect(staging.open(MB)).resolves.toBeTypeOf('string');
  });

  it('DEC-149 gives the room back when a batch is published and refused', async () => {
    const { staging } = await folders({ freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const { id } = await stageFiles(staging, [['Bad.xlsx', Buffer.from([0x50, 0x4b, 3, 4, 0, 0])]]);

    await staging
      .publish(id, { projectId, uploadedAt, signal: new AbortController().signal })
      .catch(() => undefined);

    await expect(staging.open(MB)).resolves.toBeTypeOf('string');
  });
});

describe('DiskWorkbookStaging the free-space reservation (2)', () => {
  it('DEC-149 one reservation serves the zip upload and the batch: with room for one, a zip is refused during a batch', async () => {
    const { staging, space, dataDir } = await folders({
      freeBytes: () => Promise.resolve(ROOM_FOR_ONE),
    });
    const zips = new ZipUploadStore({
      dataDir,
      extractor: new YauzlZipExtractor(DEFAULT_ZIP_LIMITS),
      reservation: space,
    });
    await staging.open(MB);

    await expect(
      zips.store(requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId })),
    ).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
  });

  it('DEC-149 one reservation serves the zip upload and the batch: with room for one, a batch is refused during a zip', async () => {
    const { staging, space, dataDir } = await folders({
      freeBytes: () => Promise.resolve(ROOM_FOR_ONE),
    });
    const zips = new ZipUploadStore({
      dataDir,
      extractor: new YauzlZipExtractor(DEFAULT_ZIP_LIMITS),
      reservation: space,
    });
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const body = (async function* () {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield await sampleZip();
    })();
    const running = zips.store(requestOf(body));
    await reading;

    await expect(staging.open(MB)).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
    release();
    await running;
  });
});

describe('DiskWorkbookStaging.discard and a restart', () => {
  it('RF-150 deletes the staging folder of a batch that was cancelled', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);

    await staging.discard(id);

    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('RF-150 ignores a batch it does not know', async () => {
    const { staging } = await folders();

    await expect(staging.discard('no-such-batch')).resolves.toBeUndefined();
  });

  it('RF-150 deletes a staging folder left by a restart with the sweep of partial folders', async () => {
    const { staging, dataDir } = await folders();
    await stageFiles(staging, [['Pricing.xlsx', await sampleBook()]]);
    expect(await sourcesOf(dataDir)).toHaveLength(1);

    const removed = await new SnapshotStore(dataDir).discardPartials();

    expect(removed).toHaveLength(1);
    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('RF-150 refuses a file for a batch it does not know', async () => {
    const { staging } = await folders();

    await expect(
      staging.receive('no-such-batch', {
        ...{ fileName: 'Pricing.xlsx', body: bodyOf(await sampleBook()), limitBytes: MB },
        ...{ declaredBytes: undefined, signal: new AbortController().signal },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.notFound });
  });
});
