import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { bodyOf, endlessZipLike } from '../../../support/upload-store-harness.js';
import {
  MB,
  sampleBook,
  sourcesOf,
  stageFiles,
  stagedNames,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-150, RF-151, RF-129, RFC-005 section 4.2: one workbook streamed into the staging folder of an
// open batch: its type, its first bytes, the names and the count, the part of the total still free,
// and that a file that fails leaves nothing behind.

const folders = useStagingFolders(afterEach);

function request(fileName: string, body: AsyncIterable<Uint8Array>, limitBytes = MB) {
  return {
    ...{ fileName, body, limitBytes, declaredBytes: undefined },
    signal: new AbortController().signal,
  };
}

describe('DiskWorkbookStaging.receive', () => {
  it('RF-150 streams the file into the staging folder and answers its name and size', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();

    const { staged } = await stageFiles(staging, [['Pricing.xlsx', book]]);

    expect(staged).toEqual([{ name: 'Pricing.xlsx', size: book.length }]);
    expect(await stagedNames(dataDir)).toHaveLength(1);
  });

  it('RF-150 keeps the batch in a staging folder that the start-up sweep of partial folders knows', async () => {
    const { staging, dataDir } = await folders();

    await staging.open(MB);

    const entries = await sourcesOf(dataDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^\.partial-/u);
  });

  it('RF-151 takes the first bytes of a compound file too, so the refusal names the real cause at the finish', async () => {
    const { staging } = await folders();
    const id = await staging.open(MB);
    const compound = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4]);

    const stored = await staging.receive(id, request('Old.xlsx', bodyOf(compound)));

    expect(stored.size).toBe(compound.length);
  });

  it.each([
    ['a file that is not a package', 'Notes.xlsx', Buffer.from('plain text, not a package')],
    ['an empty file', 'Empty.xlsx', Buffer.alloc(0)],
  ])('RF-151 refuses %s with RST-1927 and leaves no file', async (_what, name, bytes) => {
    const { staging, dataDir } = await folders();
    const id = await staging.open(MB);

    await expect(staging.receive(id, request(name, bodyOf(bytes)))).rejects.toMatchObject({
      code: ERROR_CODES.workbookNotReadable,
    });

    expect(await stagedNames(dataDir)).toEqual([]);
  });
});

describe('DiskWorkbookStaging.receive (2)', () => {
  it.each([
    ['a name that is not a workbook', 'Notes.txt', ERROR_CODES.workbookNotReadable],
    ['a legacy .xls', 'Old.xls', ERROR_CODES.workbookLegacyFormat],
    ['an .xlsb', 'Old.xlsb', ERROR_CODES.workbookLegacyFormat],
  ])('RF-151 refuses %s before reading the body', async (_what, name, code) => {
    const { staging, dataDir } = await folders();
    const id = await staging.open(MB);
    let read = false;
    const body = (async function* () {
      read = true;
      await Promise.resolve();
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    })();

    await expect(staging.receive(id, request(name, body))).rejects.toMatchObject({ code });

    expect(read).toBe(false);
    expect(await stagedNames(dataDir)).toEqual([]);
  });

  it('RF-150 names the file in the refusal, so the page can show it beside the reason', async () => {
    const { staging } = await folders();
    const id = await staging.open(MB);

    await expect(
      staging.receive(id, request('Old.xls', bodyOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])))),
    ).rejects.toMatchObject({
      problems: [{ field: 'Old.xls', code: ERROR_CODES.workbookLegacyFormat }],
    });
  });
});

describe('DiskWorkbookStaging.receive names and counts', () => {
  it('RF-151 refuses a second file with the same name, case ignored, with RST-1928', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();
    const { id } = await stageFiles(staging, [['Pricing.xlsx', book]]);

    await expect(staging.receive(id, request('PRICING.XLSX', bodyOf(book)))).rejects.toMatchObject({
      code: ERROR_CODES.workbookDuplicateName,
    });

    expect(await stagedNames(dataDir)).toHaveLength(1);
  });

  it('RF-151 refuses the file past the count limit with RST-1924', async () => {
    const { staging } = await folders({ limits: { maxFiles: 2 } });
    const book = await sampleBook();
    const { id } = await stageFiles(staging, [
      ['One.xlsx', book],
      ['Two.xlsx', book],
    ]);

    await expect(staging.receive(id, request('Three.xlsx', bodyOf(book)))).rejects.toMatchObject({
      code: ERROR_CODES.workbookTooManyFiles,
    });
  });
});

describe('DiskWorkbookStaging.receive and the limit', () => {
  it('RF-129 stops at the part of the total that is left with RST-1916 and leaves no partial file', async () => {
    const { staging, dataDir } = await folders();
    const id = await staging.open(MB);

    await expect(
      staging.receive(id, request('Big.xlsx', endlessZipLike(), 5000)),
    ).rejects.toMatchObject({
      code: ERROR_CODES.uploadTooLarge,
    });

    expect(await stagedNames(dataDir)).toEqual([]);
  });

  it('RF-129 refuses a declared length above the part that is left before reading the body', async () => {
    const { staging } = await folders();
    const id = await staging.open(MB);
    let read = false;
    const body = (async function* () {
      read = true;
      await Promise.resolve();
      yield Buffer.alloc(1);
    })();

    await expect(
      staging.receive(id, { ...request('Big.xlsx', body, 1000), declaredBytes: 5000 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.uploadTooLarge });

    expect(read).toBe(false);
  });

  it('RF-129 stops a client that goes silent with RST-1918', async () => {
    const { staging } = await folders({ stallMs: 30 });
    const id = await staging.open(MB);
    const silent = (async function* () {
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      await new Promise<void>(() => undefined);
    })();

    await expect(staging.receive(id, request('Slow.xlsx', silent))).rejects.toMatchObject({
      code: ERROR_CODES.uploadTimedOut,
    });
  });
});

describe('DiskWorkbookStaging.receive an aborted file', () => {
  it('RF-150 leaves no partial file when the request is aborted, and the same name can be sent again', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();
    const id = await staging.open(MB);
    const controller = new AbortController();
    const half = (async function* () {
      yield book.subarray(0, 40);
      controller.abort(new Error('the client went away'));
      await Promise.resolve();
      yield book.subarray(40);
    })();

    await expect(
      staging.receive(id, { ...request('Pricing.xlsx', half), signal: controller.signal }),
    ).rejects.toThrow();
    expect(await stagedNames(dataDir)).toEqual([]);
    const again = await staging.receive(id, request('Pricing.xlsx', bodyOf(book)));

    expect(again).toEqual({ name: 'Pricing.xlsx', size: book.length });
  });

  it('RF-150 leaves no partial file when the body itself fails half way', async () => {
    const { staging, dataDir } = await folders();
    const id = await staging.open(MB);
    const broken = (async function* () {
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]);
      await Promise.resolve();
      throw new Error('connection reset');
    })();

    await expect(staging.receive(id, request('Pricing.xlsx', broken))).rejects.toThrow();

    expect(await stagedNames(dataDir)).toEqual([]);
  });
});
