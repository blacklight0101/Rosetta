import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../../src/application/ports/logger.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { grepLimits } from '../../../../src/infrastructure/files/grep-limits.js';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { repositoryReaderContract } from '../../../contracts/repository-reader.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { refusalOf, securityCodes, type ReaderFixture } from '../../../support/reader-harness.js';
import { hashTree, writeTree } from '../../../support/snapshot-fixture.js';
import { timedAsync } from '../../../support/stopwatch.js';
import { useTempRoot } from '../../../support/temp-root.js';

const temp = useTempRoot('rosetta-reader-');

function snapshotRoot(): string {
  return join(
    temp.path,
    'sources',
    'owner__repo@0123456789abcdef0123456789abcdef01234567',
    'files',
  );
}

function newLogger(): MemoryLogger {
  return new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
}

async function openReader(
  fixture: ReaderFixture,
  logger: Logger = newLogger(),
): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), fixture.files);
  return NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: fixture.ignoreRules ?? '',
    allowDenied: fixture.allowDenied ?? [],
    logger,
    ...(fixture.subpath === undefined ? {} : { subpath: fixture.subpath }),
    ...(fixture.maxFileBytes === undefined ? {} : { maxFileBytes: fixture.maxFileBytes }),
  });
}

repositoryReaderContract('NodeRepositoryReader', (fixture, logger) => openReader(fixture, logger));

describe('NodeRepositoryReader and links', () => {
  it('RF-140 a folder link that leads outside the snapshot is neither listed nor read', async () => {
    const outside = join(temp.path, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'stolen.txt'), 'outside the snapshot\n', 'utf8');
    await writeTree(snapshotRoot(), { 'src/main.ts': 'x\n' });
    await symlink(outside, join(snapshotRoot(), 'src', 'linked'), 'junction');
    const logger = newLogger();
    const reader = await openReader({ files: {} }, logger);

    expect(await reader.listFiles()).toEqual(['src/main.ts']);
    expect(reader.skippedPaths).toEqual({ links: ['src/linked'], invalidNames: [] });
    const refusal = refusalOf(
      await reader.readLines({ path: 'src/linked/stolen.txt', startLine: 1, endLine: 1 }),
    );
    expect(refusal).toMatchObject({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-root' });
    expect(securityCodes(logger)).toContain(ERROR_CODES.pathOutsideRoot);
  });

  it('RF-140 a grep never follows a folder link out of the snapshot', async () => {
    const outside = join(temp.path, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'stolen.txt'), 'needle\n', 'utf8');
    await writeTree(snapshotRoot(), { 'src/main.ts': 'x\n' });
    await symlink(outside, join(snapshotRoot(), 'linked'), 'junction');
    const reader = await openReader({ files: {} });

    expect(await reader.grep({ pattern: 'needle' })).toMatchObject({
      ok: true,
      value: { matches: [] },
    });
  });

  it('RF-140 a .rosettaignore that is a link is not followed', async () => {
    const outside = join(temp.path, 'outside');
    await mkdir(join(outside, 'dir'), { recursive: true });
    await writeTree(snapshotRoot(), { 'src/main.ts': 'x\n' });
    await symlink(join(outside, 'dir'), join(snapshotRoot(), '.rosettaignore'), 'junction');
    const reader = await openReader({ files: {} });

    expect(await reader.listFiles()).toEqual(['src/main.ts']);
  });
});

describe('NodeRepositoryReader.readBytes and links', () => {
  it('RF-140 readBytes refuses a file under a folder link and a hard-linked file', async () => {
    await linkedOutside('src/linked');
    await link(join(snapshotRoot(), 'src', 'main.ts'), join(snapshotRoot(), 'hard.ts'));
    const reader = await openReader({ files: {} });

    for (const path of ['src/linked/inner/stolen.txt', 'hard.ts']) {
      const result = await reader.readBytes({ path, maxBytes: 100 });
      expect(refusalOf(result)?.code).toBe(ERROR_CODES.pathOutsideRoot);
    }
  });
});

describe('NodeRepositoryReader after open()', () => {
  it('RF-140 an indexed folder swapped for a link is refused on read and skipped by grep', async () => {
    const outside = join(temp.path, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'main.ts'), 'needle outside\n', 'utf8');
    const logger = newLogger();
    const reader = await openReader({ files: { 'src/main.ts': 'needle inside\n' } }, logger);
    await rm(join(snapshotRoot(), 'src'), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    await symlink(outside, join(snapshotRoot(), 'src'), 'junction');

    const refusal = refusalOf(
      await reader.readLines({ path: 'src/main.ts', startLine: 1, endLine: 1 }),
    );

    expect(await reader.listFiles()).toEqual(['src/main.ts']);
    expect(refusal).toMatchObject({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-root' });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
    expect(await reader.grep({ pattern: 'needle' })).toMatchObject({
      ok: true,
      value: { matches: [] },
    });
  });
});

async function linkedOutside(linkPath: string): Promise<void> {
  const outside = join(temp.path, 'outside');
  await mkdir(join(outside, 'inner'), { recursive: true });
  await writeFile(join(outside, 'inner', 'stolen.txt'), 'outside the snapshot\n', 'utf8');
  await writeTree(snapshotRoot(), { 'src/main.ts': 'x\n' });
  await symlink(outside, join(snapshotRoot(), ...linkPath.split('/')), 'junction');
}

describe('NodeRepositoryReader and a linked subpath', () => {
  it.each([
    ['is a link', 'linked', 'linked'],
    ['passes through a link', 'src/linked', 'src/linked/inner'],
  ])(
    'RF-140 a subpath that %s is refused when the reader opens, with a security event',
    async (_label, linkPath, subpath) => {
      await linkedOutside(linkPath);
      const logger = newLogger();

      await expect(openReader({ files: {}, subpath }, logger)).rejects.toMatchObject({
        code: ERROR_CODES.pathOutsideRoot,
      });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
    },
  );
});

async function canHardLink(): Promise<boolean> {
  const folder = await mkdtemp(join(tmpdir(), 'rosetta-link-probe-'));
  try {
    await writeFile(join(folder, 'a'), 'a', 'utf8');
    await link(join(folder, 'a'), join(folder, 'b'));
    return true;
  } catch {
    return false;
  } finally {
    await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

const hardLinks = await canHardLink();

describe('NodeRepositoryReader and hard links', () => {
  it.skipIf(!hardLinks)(
    'RF-140 a file hard-linked to a file outside the snapshot is refused and never searched',
    async () => {
      await writeTree(snapshotRoot(), { 'src/main.ts': 'x\n' });
      const outside = join(temp.path, 'outside.txt');
      await writeFile(outside, 'needle outside\n', 'utf8');
      await link(outside, join(snapshotRoot(), 'src', 'hard.txt'));
      const logger = newLogger();
      const reader = await openReader({ files: {} }, logger);

      const refusal = refusalOf(
        await reader.readLines({ path: 'src/hard.txt', startLine: 1, endLine: 1 }),
      );
      expect(refusal).toMatchObject({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-root' });
      expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
      expect(await reader.grep({ pattern: 'needle' })).toMatchObject({
        ok: true,
        value: { matches: [] },
      });
    },
  );
});

describe('NodeRepositoryReader leaves the snapshot alone', () => {
  it('RF-005 listing, reading, refusing and searching leave the snapshot byte for byte unchanged', async () => {
    const files = { 'src/main.ts': 'a\nb\n', '.env': 'FAKE\n', 'docs/x.md': 'needle\n' };
    const reader = await openReader({ files });
    const before = await hashTree(snapshotRoot());

    await reader.listFiles();
    await reader.readLines({ path: 'src/main.ts', startLine: 1, endLine: 2 });
    await reader.readLines({ path: '../escape.txt', startLine: 1, endLine: 1 });
    await reader.readLines({ path: '.env', startLine: 1, endLine: 1 });
    await reader.grep({ pattern: 'needle' });

    expect(await hashTree(snapshotRoot())).toBe(before);
  });
});

/** A snapshot whose one line makes `^(a+)+$` backtrack until the worker is stopped. */
async function openSlowReader(
  logger: Logger,
  grepTimeoutMs: number,
): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), {
    'slow.txt': `${'a'.repeat(1999)}!
`,
  });
  return NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: '',
    allowDenied: [],
    logger,
    grepTimeoutMs,
  });
}

describe('NodeRepositoryReader grep worker', () => {
  // The 2 s default is not waited for: the constant is asserted and the stop path runs with 1 s,
  // enough for the next search to start its worker on a slow runner.
  it('RF-146 ^(a+)+$ on a long line times out, the default is 2 s, and the worker stops', async () => {
    const logger = newLogger();
    const reader = await openSlowReader(logger, 1000);
    const { result, ms } = await timedAsync(() => reader.grep({ pattern: '^(a+)+$' }));

    expect(grepLimits.timeoutMs).toBe(2000);
    expect(refusalOf(result)).toMatchObject({ code: ERROR_CODES.grepTimedOut, reason: 'timeout' });
    expect(ms).toBeGreaterThanOrEqual(900);
    expect(ms).toBeLessThan(3000);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.grepTimedOut]);
    expect(await reader.grep({ pattern: '!' })).toMatchObject({ ok: true });
  });

  it('RF-146 a reader opened without grepTimeoutMs arms the grep timer with the 2 s default', async () => {
    await writeTree(snapshotRoot(), { 'a.txt': 'needle\n' });
    const reader = await NodeRepositoryReader.open({
      root: snapshotRoot(),
      ignoreRules: '',
      allowDenied: [],
      logger: newLogger(),
    });
    const timers = vi.spyOn(globalThis, 'setTimeout');

    try {
      expect(await reader.grep({ pattern: 'needle' })).toMatchObject({ ok: true });

      expect(timers.mock.calls.map(([, delay]) => delay)).toContain(2000);
    } finally {
      timers.mockRestore();
    }
  });

  it('RF-146 the timeout is configurable', async () => {
    const reader = await openSlowReader(newLogger(), 200);
    const { result, ms } = await timedAsync(() => reader.grep({ pattern: '^(a+)+$' }));

    expect(refusalOf(result)).toMatchObject({ reason: 'timeout' });
    expect(ms).toBeLessThan(1500);
  });
});

describe('NodeRepositoryReader deny list', () => {
  it('RF-147 a lifted deny pattern is recorded in the application log', async () => {
    const logger = newLogger();
    await openReader({ files: { 'a.txt': 'x\n' }, allowDenied: ['*.key'] }, logger);

    expect(logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', data: { liftedDenyPatterns: ['*.key'] } }),
    );
  });
});
