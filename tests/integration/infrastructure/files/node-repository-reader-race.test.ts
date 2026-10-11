import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { armTrap, type FsTrap } from '../../../support/fs-trap.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { refusalOf, securityCodes } from '../../../support/reader-harness.js';
import { writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-140, conventions (error catalogue): a file that disappears between the `realpath` and the
// `stat` of the reader is refused, never a raw error.

const trap = vi.hoisted((): FsTrap => ({ path: undefined, action: undefined }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const { springTrap } = await import('../../../support/fs-trap.js');
  return {
    ...actual,
    realpath: async (...args: Parameters<typeof actual.realpath>) => {
      try {
        return await actual.realpath(...args);
      } finally {
        await springTrap(trap, args[0]);
      }
    },
  };
});

const temp = useTempRoot('rosetta-reader-race-');

function snapshotRoot(): string {
  return join(
    temp.path,
    'sources',
    'owner__repo@0123456789abcdef0123456789abcdef01234567',
    'files',
  );
}

async function openReader(logger: MemoryLogger): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), { 'src/main.ts': 'needle\n', 'src/gone.ts': 'needle\n' });
  return NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: '',
    allowDenied: [],
    logger,
  });
}

function newLogger(): MemoryLogger {
  return new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
}

function removeGone(): Promise<void> {
  return rm(join(snapshotRoot(), 'src', 'gone.ts'), { force: true });
}

describe('NodeRepositoryReader when a file vanishes after its path is resolved', () => {
  it('RF-140 readLines refuses the vanished file instead of throwing', async () => {
    const logger = newLogger();
    const reader = await openReader(logger);
    armTrap(trap, join(snapshotRoot(), 'src', 'gone.ts'), removeGone);

    const refusal = refusalOf(
      await reader.readLines({ path: 'src/gone.ts', startLine: 1, endLine: 1 }),
    );

    expect(trap.path).toBeUndefined();
    expect(refusal).toMatchObject({ code: ERROR_CODES.pathOutsideRoot, reason: 'outside-root' });
    expect(securityCodes(logger)).toEqual([ERROR_CODES.pathOutsideRoot]);
  });

  it('RF-146 grep skips the vanished file and still searches the others', async () => {
    const reader = await openReader(newLogger());
    armTrap(trap, join(snapshotRoot(), 'src', 'gone.ts'), removeGone);

    const result = await reader.grep({ pattern: 'needle' });

    expect(trap.path).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      value: { matches: [{ path: 'src/main.ts', line: 1, text: 'needle' }] },
    });
  });
});
