import { join } from 'node:path';
import type * as GrepLimits from '../../../../src/infrastructure/files/grep-limits.js';
import { describe, expect, it, vi } from 'vitest';
import { NodeRepositoryReader } from '../../../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { writeTree } from '../../../support/snapshot-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-146, P1-160: a reader opened without `grepMaxTotalBytes` holds a grep to
// `grepLimits.maxTotalBytes` (shrunk here to 2,500 bytes, so the test needs no 128 MiB tree).

vi.mock('../../../../src/infrastructure/files/grep-limits.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GrepLimits>();
  return { ...actual, grepLimits: { ...actual.grepLimits, maxTotalBytes: 2500 } };
});

const temp = useTempRoot('rosetta-reader-default-budget-');

describe('NodeRepositoryReader default grep budget', () => {
  it('RF-146 a reader opened without a budget uses grepLimits.maxTotalBytes', async () => {
    const root = join(temp.path, 'files');
    const body = `${'a'.repeat(992)}\nneedle\n`;
    await writeTree(root, { 'f/1.cs': body, 'f/2.cs': body, 'f/3.cs': body });
    const reader = await NodeRepositoryReader.open({
      root,
      ignoreRules: '',
      allowDenied: [],
      logger: new MemoryLogger(new FixedClock('2026-10-14T09:00:00.000Z'), new SecretMasker()),
    });

    const result = await reader.grep({ pattern: 'needle' });

    expect(result.ok && result.value.matches.map((match) => match.path)).toEqual([
      'f/1.cs',
      'f/2.cs',
    ]);
    expect(result.ok && result.value.notice).toContain('1 file(s) were not searched');
  });
});
