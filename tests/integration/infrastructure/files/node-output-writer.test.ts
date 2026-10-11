import { link, mkdir, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { outputWriterContract } from '../../../contracts/output-writer.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { securityCodes } from '../../../support/reader-harness.js';
import { hashTree, writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

const temp = useTempRoot('rosetta-writer-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';

function dataDir(): string {
  return join(temp.path, 'data');
}

function snapshotFolder(): string {
  return join(dataDir(), 'sources', 'owner__repo@0123456789abcdef0123456789abcdef01234567');
}

function userFolder(): string {
  return join(dataDir(), 'users', userId);
}

function newWriter(): { writer: NodeOutputWriter; logger: MemoryLogger } {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  return { writer: new NodeOutputWriter({ dataDir: dataDir(), logger }), logger };
}

outputWriterContract('NodeOutputWriter', (logger) =>
  Promise.resolve(new NodeOutputWriter({ dataDir: dataDir(), logger })),
);

async function seedSnapshot(): Promise<string> {
  await writeTree(join(snapshotFolder(), 'files'), { 'src/main.ts': 'original\n' });
  return hashTree(snapshotFolder());
}

describe('NodeOutputWriter on disk', () => {
  it('RF-005 the file lands at <data>/users/<userId>/<path> and nowhere else', async () => {
    const { writer } = newWriter();
    await writer.writeText({ userId, path: 'projects/p/scan-summary.md' }, '# Scan\n');

    expect(await readFile(join(userFolder(), 'projects', 'p', 'scan-summary.md'), 'utf8')).toBe(
      '# Scan\n',
    );
  });
});

describe('NodeOutputWriter and links', () => {
  it('RF-005 a folder link inside the workspace that leads into the snapshot cache is refused', async () => {
    const before = await seedSnapshot();
    await mkdir(userFolder(), { recursive: true });
    await symlink(join(snapshotFolder(), 'files'), join(userFolder(), 'projects'), 'junction');
    const { writer, logger } = newWriter();

    const write = await writer.writeText({ userId, path: 'projects/src/main.ts' }, 'changed\n');
    const append = await writer.appendLine({ userId, path: 'projects/new.jsonl' }, '{}');

    expect(write).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.snapshotWriteRefused, reason: 'snapshot-cache' },
    });
    expect(append).toMatchObject({ ok: false, error: { reason: 'snapshot-cache' } });
    expect(securityCodes(logger)).toEqual([
      ERROR_CODES.snapshotWriteRefused,
      ERROR_CODES.snapshotWriteRefused,
    ]);
    expect(await hashTree(snapshotFolder())).toBe(before);
  });

  it('RF-005 a folder link inside the workspace that leads elsewhere is refused', async () => {
    const outside = join(temp.path, 'elsewhere');
    await mkdir(outside, { recursive: true });
    await mkdir(userFolder(), { recursive: true });
    await symlink(outside, join(userFolder(), 'projects'), 'junction');
    const { writer, logger } = newWriter();

    const result = await writer.writeText({ userId, path: 'projects/x.json' }, '{}');

    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.writeOutsideWorkspace } });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.writeOutsideWorkspace]);
  });

  it('RF-005 a linked user folder is refused even when its parent folders are plain', async () => {
    const outside = join(temp.path, 'elsewhere');
    await mkdir(outside, { recursive: true });
    await mkdir(join(dataDir(), 'users'), { recursive: true });
    await symlink(outside, userFolder(), 'junction');
    const { writer } = newWriter();

    expect(await writer.writeText({ userId, path: 'x.json' }, '{}')).toMatchObject({
      ok: false,
      error: { reason: 'outside-workspace' },
    });
  });
});

describe('NodeOutputWriter and hard links', () => {
  it('RF-005 appending to a file hard-linked to a snapshot file is refused and the snapshot is unchanged', async () => {
    const before = await seedSnapshot();
    await mkdir(userFolder(), { recursive: true });
    await link(
      join(snapshotFolder(), 'files', 'src', 'main.ts'),
      join(userFolder(), 'linked.jsonl'),
    );
    const { writer, logger } = newWriter();

    const result = await writer.appendLine({ userId, path: 'linked.jsonl' }, '{}');

    expect(result).toMatchObject({ ok: false, error: { reason: 'outside-workspace' } });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.writeOutsideWorkspace]);
    expect(await hashTree(snapshotFolder())).toBe(before);
  });

  it('RF-005 replacing a file hard-linked to a snapshot file leaves the snapshot unchanged', async () => {
    const before = await seedSnapshot();
    await mkdir(userFolder(), { recursive: true });
    await link(join(snapshotFolder(), 'files', 'src', 'main.ts'), join(userFolder(), 'copy.md'));
    const { writer } = newWriter();

    await writer.writeText({ userId, path: 'copy.md' }, 'replaced\n');

    expect(await readFile(join(userFolder(), 'copy.md'), 'utf8')).toBe('replaced\n');
    expect(await hashTree(snapshotFolder())).toBe(before);
  });
});
