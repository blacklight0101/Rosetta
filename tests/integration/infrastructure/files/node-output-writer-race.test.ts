import { mkdir, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { armTrap, type FsTrap } from '../../../support/fs-trap.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { securityCodes } from '../../../support/reader-harness.js';
import { hashTree, writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-005: the check-then-use window of the writer. The last `lstat` of the path check is trapped,
// and the trap swaps the `projects` folder for a junction into the snapshot cache before the
// write; the writer must notice and refuse instead of writing into the snapshot.

const trap = vi.hoisted((): FsTrap => ({ path: undefined, action: undefined }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const { springTrap } = await import('../../../support/fs-trap.js');
  return {
    ...actual,
    lstat: async (...args: Parameters<typeof actual.lstat>) => {
      try {
        return await actual.lstat(...args);
      } finally {
        await springTrap(trap, args[0]);
      }
    },
  };
});

const temp = useTempRoot('rosetta-writer-race-');
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

async function seedSnapshot(): Promise<string> {
  await writeTree(join(snapshotFolder(), 'files'), { 'src/main.ts': 'original\n' });
  await mkdir(join(userFolder(), 'projects', 'src'), { recursive: true });
  return hashTree(snapshotFolder());
}

/** Replaces `<user>/projects` by a junction to the snapshot's `files` folder. */
async function swapProjectsForJunction(): Promise<void> {
  const projects = join(userFolder(), 'projects');
  await rm(projects, { recursive: true, force: true });
  await symlink(join(snapshotFolder(), 'files'), projects, 'junction');
}

async function temporaryFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.filter((entry) => entry.endsWith('.tmp'));
}

describe('NodeOutputWriter when a folder is swapped for a link after the check', () => {
  it('RF-005 writeText refuses the swapped folder and leaves the snapshot and the workspace clean', async () => {
    const before = await seedSnapshot();
    const { writer, logger } = newWriter();
    armTrap(trap, join(userFolder(), 'projects', 'src', 'main.ts'), swapProjectsForJunction);

    const result = await writer.writeText({ userId, path: 'projects/src/main.ts' }, 'changed\n');

    expect(trap.path).toBeUndefined();
    expect(result).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.snapshotWriteRefused, reason: 'snapshot-cache' },
    });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.snapshotWriteRefused]);
    expect(await hashTree(snapshotFolder())).toBe(before);
    expect(await temporaryFiles(snapshotFolder())).toEqual([]);
    expect(await temporaryFiles(userFolder())).toEqual([]);
  });

  it('RF-005 appendLine refuses the swapped folder and leaves the snapshot unchanged', async () => {
    const before = await seedSnapshot();
    const { writer, logger } = newWriter();
    armTrap(trap, join(userFolder(), 'projects', 'new.jsonl'), swapProjectsForJunction);

    const result = await writer.appendLine({ userId, path: 'projects/new.jsonl' }, '{}');

    expect(trap.path).toBeUndefined();
    expect(result).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.snapshotWriteRefused, reason: 'snapshot-cache' },
    });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.snapshotWriteRefused]);
    expect(await hashTree(snapshotFolder())).toBe(before);
    expect(await temporaryFiles(snapshotFolder())).toEqual([]);
  });
});
