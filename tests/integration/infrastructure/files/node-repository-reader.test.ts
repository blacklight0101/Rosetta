import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../../src/application/ports/logger.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
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

describe('NodeRepositoryReader grep worker', () => {
  it('RF-146 ^(a+)+$ on a long line times out after the default 2 s and stops the worker', async () => {
    const logger = newLogger();
    const reader = await openReader({ files: { 'slow.txt': `${'a'.repeat(1999)}!\n` } }, logger);
    const { result, ms } = await timedAsync(() => reader.grep({ pattern: '^(a+)+$' }));

    expect(refusalOf(result)).toMatchObject({ code: ERROR_CODES.grepTimedOut, reason: 'timeout' });
    expect(ms).toBeGreaterThanOrEqual(1900);
    expect(ms).toBeLessThan(4500);
    expect(securityCodes(logger)).toEqual([ERROR_CODES.grepTimedOut]);
    expect(await reader.grep({ pattern: '!' })).toMatchObject({ ok: true });
  }, 10_000);

  it('RF-146 the timeout is configurable', async () => {
    await writeTree(snapshotRoot(), { 'slow.txt': `${'a'.repeat(1999)}!\n` });
    const reader = await NodeRepositoryReader.open({
      root: snapshotRoot(),
      ignoreRules: '',
      allowDenied: [],
      logger: newLogger(),
      grepTimeoutMs: 200,
    });
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
