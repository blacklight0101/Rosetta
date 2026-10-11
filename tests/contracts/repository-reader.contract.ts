import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../support/fixed-clock.js';
import { MemoryLogger } from '../support/memory-logger.js';
import {
  refusalOf,
  securityCodes,
  type NewReader,
  type ReaderFixture,
  type RepositoryReaderFactory,
} from '../support/reader-harness.js';
import { grepContract } from './repository-reader-grep.contract.js';

const basic: ReaderFixture = {
  files: {
    'README.md': 'one\ntwo\nthree\n',
    'src/main.ts': 'first\r\nsecond\r\nthird',
    'src/util/text.ts': 'a\nb\n',
    'docs/guide.md': 'guide\n',
  },
};

function listingTests(newReader: NewReader): void {
  it('RF-140 lists every file with forward slashes, sorted by path', async () => {
    const { reader } = await newReader(basic);

    expect(await reader.listFiles()).toEqual([
      'README.md',
      'docs/guide.md',
      'src/main.ts',
      'src/util/text.ts',
    ]);
  });

  it('RF-140 with a subpath lists only the files under it, still relative to the root', async () => {
    const { reader } = await newReader({ ...basic, subpath: 'src' });

    expect(await reader.listFiles()).toEqual(['src/main.ts', 'src/util/text.ts']);
  });
}

function readTests(newReader: NewReader): void {
  it('RF-140 reads a 1-based inclusive line range without line endings', async () => {
    const { reader } = await newReader(basic);

    expect(await reader.readLines({ path: 'src/main.ts', startLine: 2, endLine: 3 })).toEqual({
      ok: true,
      value: {
        path: 'src/main.ts',
        startLine: 2,
        endLine: 3,
        totalLines: 3,
        lines: ['second', 'third'],
      },
    });
  });

  it('RF-140 an end beyond the last line returns the lines up to the end of the file', async () => {
    const { reader } = await newReader(basic);

    expect(await reader.readLines({ path: 'README.md', startLine: 3, endLine: 99 })).toEqual({
      ok: true,
      value: { path: 'README.md', startLine: 3, endLine: 3, totalLines: 3, lines: ['three'] },
    });
  });

  it.each([
    [0, 1],
    [3, 2],
    [4, 4],
    [1.5, 2],
  ])('RF-140 refuses the line range %d-%d', async (startLine, endLine) => {
    const { reader } = await newReader(basic);
    const result = await reader.readLines({ path: 'README.md', startLine, endLine });

    expect(refusalOf(result)).toMatchObject({
      code: ERROR_CODES.lineRangeInvalid,
      reason: 'invalid-range',
    });
  });
}

function missingTests(newReader: NewReader): void {
  it('RF-140 a missing file, or a name that differs only in case, is not found', async () => {
    const { reader } = await newReader(basic);

    for (const path of ['src/missing.ts', 'readme.md', 'SRC/main.ts']) {
      const result = await reader.readLines({ path, startLine: 1, endLine: 1 });
      expect(refusalOf(result)).toMatchObject({
        code: ERROR_CODES.fileNotFound,
        reason: 'not-found',
      });
    }
  });

  it('RF-140 with a subpath, a file outside it is refused as outside the root', async () => {
    const { reader, logger } = await newReader({ ...basic, subpath: 'src' });
    const result = await reader.readLines({ path: 'README.md', startLine: 1, endLine: 1 });

    expect(refusalOf(result)).toMatchObject({
      code: ERROR_CODES.pathOutsideRoot,
      reason: 'outside-root',
    });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
  });
}

function hostilePathTests(newReader: NewReader): void {
  it.each([
    '../outside.txt',
    'src/../../outside.txt',
    '/etc/passwd',
    'C:/Windows/win.ini',
    '\uFF0E\uFF0E/x',
  ])('RF-140 refuses %j outside the root, with a reason and a security event', async (path) => {
    const { reader, logger } = await newReader(basic);
    const refusal = refusalOf(await reader.readLines({ path, startLine: 1, endLine: 1 }));

    expect(refusal).toMatchObject({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-root' });
    expect(refusal?.message.length).toBeGreaterThan(10);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
  });

  it.each(['CON', 'src/nul.ts', 'COM1.log', 'README.md:stream', 'README.md.', 'src\\main.ts'])(
    'RF-140 refuses the invalid path %j with a security event',
    async (path) => {
      const { reader, logger } = await newReader(basic);
      const refusal = refusalOf(await reader.readLines({ path, startLine: 1, endLine: 1 }));

      expect(refusal).toMatchObject({ code: ERROR_CODES.pathInvalid, reason: 'invalid-path' });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.pathInvalid]);
    },
  );
}

function ignoreTests(newReader: NewReader): void {
  const fixture: ReaderFixture = {
    files: {
      '.rosettaignore': 'fixtures/\n!secrets/\n!.env\n',
      'secrets/notes.md': 'hidden\n',
      'fixtures/data.json': '{}\n',
      'src/main.ts': 'x\n',
      '.env': 'FAKE env file\n',
    },
    ignoreRules: 'secrets/\n',
  };

  it('RF-140 paths matched by the setting or by .rosettaignore are absent from the listing', async () => {
    const { reader } = await newReader(fixture);

    expect(await reader.listFiles()).toEqual(['.rosettaignore', 'src/main.ts']);
  });

  it.each(['secrets/notes.md', 'fixtures/data.json'])(
    'RF-140 a read of the ignored path %s is refused with a reason and a security event',
    async (path) => {
      const { reader, logger } = await newReader(fixture);
      const refusal = refusalOf(await reader.readLines({ path, startLine: 1, endLine: 1 }));

      expect(refusal).toMatchObject({ code: ERROR_CODES.pathIgnored, reason: 'ignored' });
      expect(refusal?.message).toContain('ignore rules');
      expect(securityCodes(logger)).toEqual([ERROR_CODES.pathIgnored]);
    },
  );

  it('RF-140 a negated .rosettaignore pattern lifts neither the setting nor the deny list', async () => {
    const { reader } = await newReader(fixture);

    expect(
      refusalOf(await reader.readLines({ path: 'secrets/notes.md', startLine: 1, endLine: 1 })),
    ).toMatchObject({ reason: 'ignored' });
    expect(
      refusalOf(await reader.readLines({ path: '.env', startLine: 1, endLine: 1 })),
    ).toMatchObject({ reason: 'denied' });
  });
}

const denied: Readonly<Record<string, string>> = {
  '.env': 'FAKE\n',
  'config/.env.production': 'FAKE\n',
  'certs/server.pem': 'FAKE\n',
  'certs/server.key': 'FAKE\n',
  'certs/store.pfx': 'FAKE\n',
  'certs/store.p12': 'FAKE\n',
  'home/id_rsa.pub': 'FAKE\n',
  'vault.kdbx': 'FAKE\n',
};

function denyTests(newReader: NewReader): void {
  it('RF-147 files on the deny list are absent from the listing without any ignore rule', async () => {
    const { reader } = await newReader({ files: { ...denied, 'src/main.ts': 'x\n' } });

    expect(await reader.listFiles()).toEqual(['src/main.ts']);
    expect(reader.liftedDenyPatterns).toEqual([]);
  });

  it.each(Object.keys(denied))('RF-147 a read of %s is refused as denied', async (path) => {
    const { reader, logger } = await newReader({ files: denied });
    const refusal = refusalOf(await reader.readLines({ path, startLine: 1, endLine: 1 }));

    expect(refusal).toMatchObject({ code: ERROR_CODES.pathDenied, reason: 'denied' });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathDenied]);
  });

  it('RF-147 an explicit scan.allowDenied entry lifts that pattern and the reader records it', async () => {
    const { reader } = await newReader({ files: denied, allowDenied: ['*.pem'] });

    expect(await reader.listFiles()).toEqual(['certs/server.pem']);
    expect(
      await reader.readLines({ path: 'certs/server.pem', startLine: 1, endLine: 1 }),
    ).toMatchObject({ ok: true });
    expect(reader.liftedDenyPatterns).toEqual(['*.pem']);
  });
}

function readOnlyTests(newReader: NewReader): void {
  it('RF-005 the reader offers no operation that writes', async () => {
    const { reader } = await newReader(basic);
    const prototypeNames = Object.getOwnPropertyNames(Object.getPrototypeOf(reader));
    const operations = [...prototypeNames, ...Object.keys(reader)].filter(
      (name) => name !== 'constructor' && !name.startsWith('#'),
    );

    expect(operations.sort()).toEqual(['grep', 'liftedDenyPatterns', 'listFiles', 'readLines']);
  });
}

/** Contract of the RepositoryReader port (RF-005, RF-140, RF-146, RF-147). */
export function repositoryReaderContract(name: string, create: RepositoryReaderFactory): void {
  describe(`RepositoryReader contract: ${name}`, () => {
    const newReader: NewReader = async (fixture) => {
      const logger = new MemoryLogger(
        new FixedClock('2026-10-11T09:00:00.000Z'),
        new SecretMasker(),
      );
      return { reader: await create(fixture, logger), logger };
    };

    listingTests(newReader);
    readTests(newReader);
    missingTests(newReader);
    hostilePathTests(newReader);
    ignoreTests(newReader);
    denyTests(newReader);
    grepContract(newReader);
    readOnlyTests(newReader);
  });
}
