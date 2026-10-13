import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { armTrap, type FsTrap } from '../../../support/fs-trap.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { refusalOf } from '../../../support/reader-harness.js';
import { writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-144, RF-146, RNF-004, ADR-006, P1-127: the reader itself (not only the bounded-read helper)
// holds a file to the cap when it grows after the `stat` that measured it. The trap runs just
// before `open`, so the size check has passed and the read sees the larger file.

const trap = vi.hoisted((): FsTrap => ({ path: undefined, action: undefined }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const { springTrap } = await import('../../../support/fs-trap.js');
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      await springTrap(trap, args[0]);
      return actual.open(...args);
    },
  };
});

const temp = useTempRoot('rosetta-reader-grow-');
const maxFileBytes = 1000;

function snapshotRoot(): string {
  return join(
    temp.path,
    'sources',
    'owner__repo@0123456789abcdef0123456789abcdef01234567',
    'files',
  );
}

function grownPath(): string {
  return join(snapshotRoot(), 'src', 'grows.txt');
}

/** A reader over a 100-byte file that grows to 5,700 bytes between its `stat` and its read. */
async function openGrowingReader(): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), { 'src/grows.txt': `${'a'.repeat(99)}\n` });
  const reader = await NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: '',
    allowDenied: [],
    logger: new MemoryLogger(new FixedClock('2026-10-13T09:00:00.000Z'), new SecretMasker()),
    maxFileBytes,
  });
  armTrap(trap, grownPath(), () => appendFile(grownPath(), 'needle\n'.repeat(800)));
  return reader;
}

describe('NodeRepositoryReader when a file grows after its size check', () => {
  it('RF-144 readLines refuses the grown file instead of reading it at its new size', async () => {
    const reader = await openGrowingReader();

    const result = await reader.readLines({ path: 'src/grows.txt', startLine: 1, endLine: 9999 });

    expect(trap.path).toBeUndefined();
    expect(refusalOf(result)).toMatchObject({
      code: ERROR_CODES.fileTooLarge,
      reason: 'too-large',
    });
  });

  it('RF-144 readBytes returns no bytes for the grown file, never more than the cap', async () => {
    const reader = await openGrowingReader();

    const result = await reader.readBytes({ path: 'src/grows.txt', maxBytes: maxFileBytes });

    expect(trap.path).toBeUndefined();
    expect(result).toMatchObject({ ok: true, value: { path: 'src/grows.txt', bytes: undefined } });
  });

  it('RF-146 grep leaves the grown file out as too large, with the notice', async () => {
    const reader = await openGrowingReader();

    const result = await reader.grep({ pattern: 'needle' });

    expect(trap.path).toBeUndefined();
    expect(result.ok && result.value.matches).toEqual([]);
    expect(result.ok && result.value.notice).toContain('scan.maxFileBytes');
  });
});
