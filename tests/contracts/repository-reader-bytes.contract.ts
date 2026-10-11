import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import {
  refusalOf,
  securityCodes,
  type NewReader,
  type ReaderFixture,
} from '../support/reader-harness.js';

const fixture: ReaderFixture = {
  files: {
    'src/small.txt': 'abc\n',
    'src/empty.txt': '',
    'src/binary.dat': 'ab\u0000cd',
    '.env': 'KEY=FAKE\n',
    'skipme/notes.txt': 'ignored\n',
  },
  ignoreRules: 'skipme/\n',
};

function readingTests(newReader: NewReader): void {
  it('RF-100 readBytes returns the size and the bytes of a file within the limit', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.readBytes({ path: 'src/small.txt', maxBytes: 100 });

    expect(result.ok && result.value.sizeBytes).toBe(4);
    expect(result.ok && Array.from(result.value.bytes ?? [])).toEqual([97, 98, 99, 10]);
  });

  it('RF-100 readBytes reads a file of exactly the limit and an empty file', async () => {
    const { reader } = await newReader(fixture);
    const exact = await reader.readBytes({ path: 'src/small.txt', maxBytes: 4 });
    const empty = await reader.readBytes({ path: 'src/empty.txt', maxBytes: 0 });

    expect(exact.ok && exact.value.bytes?.length).toBe(4);
    expect(empty.ok && empty.value).toEqual({
      path: 'src/empty.txt',
      sizeBytes: 0,
      bytes: new Uint8Array(0),
    });
  });

  it('RF-100 readBytes reports the size but returns no bytes for a file over the limit', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.readBytes({ path: 'src/small.txt', maxBytes: 3 });

    expect(result).toEqual({
      ok: true,
      value: { path: 'src/small.txt', sizeBytes: 4, bytes: undefined },
    });
  });

  it('RF-101 readBytes returns bytes that are not text unchanged', async () => {
    const { reader } = await newReader(fixture);
    const result = await reader.readBytes({ path: 'src/binary.dat', maxBytes: 100 });

    expect(result.ok && Array.from(result.value.bytes ?? [])).toEqual([97, 98, 0, 99, 100]);
  });
}

function refusalTests(newReader: NewReader): void {
  it('RF-140 readBytes refuses a missing, ignored or denied file like readLines does', async () => {
    const { reader } = await newReader(fixture);
    const missing = await reader.readBytes({ path: 'src/none.txt', maxBytes: 10 });
    const ignored = await reader.readBytes({ path: 'skipme/notes.txt', maxBytes: 10 });
    const denied = await reader.readBytes({ path: '.env', maxBytes: 10 });

    expect(refusalOf(missing)?.code).toBe(ERROR_CODES.fileNotFound);
    expect(refusalOf(ignored)?.code).toBe(ERROR_CODES.pathIgnored);
    expect(refusalOf(denied)?.code).toBe(ERROR_CODES.pathDenied);
  });

  it('RF-140 readBytes refuses a path outside the root with a security event', async () => {
    const { reader, logger } = await newReader(fixture);
    const result = await reader.readBytes({ path: '../outside.txt', maxBytes: 10 });

    expect(refusalOf(result)?.code).toBe(ERROR_CODES.pathOutsideRoot);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
  });
}

/** Contract of `readBytes` (RF-100, RF-101): the facts the universal scan needs about one file. */
export function bytesContract(newReader: NewReader): void {
  readingTests(newReader);
  refusalTests(newReader);
}
