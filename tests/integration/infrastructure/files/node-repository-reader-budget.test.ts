import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-146, P1-160 (F-06): one grep reads at most a total number of bytes across all its files, so
// many medium files that each pass scan.maxFileBytes cannot make one search hold hundreds of MB.

const temp = useTempRoot('rosetta-reader-budget-');

function snapshotRoot(): string {
  return join(
    temp.path,
    'sources',
    'owner__repo@0123456789abcdef0123456789abcdef01234567',
    'files',
  );
}

/** `count` files `f/00.txt`.. of exactly `bytes` bytes each, every one ending in a needle line. */
function mediumFiles(count: number, bytes: number): Record<string, string> {
  const needle = 'needle\n';
  const body = `${'a'.repeat(bytes - needle.length - 1)}\n${needle}`;
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`f/${String(index).padStart(2, '0')}.txt`, body]),
  );
}

async function openReader(
  files: Record<string, string>,
  options: { readonly grepMaxTotalBytes?: number; readonly maxFileBytes?: number } = {},
): Promise<NodeRepositoryReader> {
  await writeTree(snapshotRoot(), files);
  return NodeRepositoryReader.open({
    root: snapshotRoot(),
    ignoreRules: '',
    allowDenied: [],
    logger: new MemoryLogger(new FixedClock('2026-10-14T09:00:00.000Z'), new SecretMasker()),
    ...options,
  });
}

async function searchedPaths(reader: NodeRepositoryReader): Promise<string[]> {
  const result = await reader.grep({ pattern: 'needle' });
  return result.ok ? result.value.matches.map((match) => match.path) : [];
}

describe('NodeRepositoryReader grep byte budget', () => {
  it('RF-146 files past the budget are not read, and the notice says how many', async () => {
    const reader = await openReader(mediumFiles(10, 1000), { grepMaxTotalBytes: 3500 });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual([
      'f/00.txt',
      'f/01.txt',
      'f/02.txt',
    ]);
    expect(result.ok && result.value.notice).toBe(
      '7 file(s) were not searched because the search reached its limit of 3500 bytes read; narrow it with a pathGlob.',
    );
  });

  it('RF-146 files that fill the budget exactly are all searched', async () => {
    const reader = await openReader(mediumFiles(4, 1000), { grepMaxTotalBytes: 4000 });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches).toHaveLength(4);
    expect(result.ok && result.value.notice).toBeUndefined();
  });
});

describe('NodeRepositoryReader grep byte budget boundaries', () => {
  it('RF-146 one byte over the budget leaves the last file out', async () => {
    const reader = await openReader(mediumFiles(4, 1000), { grepMaxTotalBytes: 3999 });

    expect(await searchedPaths(reader)).toEqual(['f/00.txt', 'f/01.txt', 'f/02.txt']);
  });

  it('RF-146 a smaller file after the budget is reached is still searched when it fits', async () => {
    const files = { ...mediumFiles(3, 1000), 'g/small.txt': 'needle\n' };
    const reader = await openReader(files, { grepMaxTotalBytes: 2500 });

    expect(await searchedPaths(reader)).toEqual(['f/00.txt', 'f/01.txt', 'g/small.txt']);
  });

  it('RF-146 a file larger than scan.maxFileBytes counts as too large, not against the budget', async () => {
    const files = { ...mediumFiles(2, 1000), 'g/big.txt': `${'b'.repeat(5000)}\nneedle\n` };
    const reader = await openReader(files, { grepMaxTotalBytes: 2000, maxFileBytes: 4000 });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches).toHaveLength(2);
    expect(result.ok && result.value.notice).toBe(
      "1 file(s) larger than the project's scan.maxFileBytes were not searched.",
    );
  });

  it('RF-146 a reader opened without a budget holds one grep to 32 MiB', async () => {
    const reader = await openReader(mediumFiles(34, 1_000_000));

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches).toHaveLength(33);
    expect(result.ok && result.value.notice).toContain('1 file(s) were not searched');
  });
});
