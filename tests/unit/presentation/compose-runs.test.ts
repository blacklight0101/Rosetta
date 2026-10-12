import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { GitHubSnapshotFetcher } from '../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../src/infrastructure/scan/packs/pack-registry.js';
import { composeRuns } from '../../../src/presentation/compose-runs.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';

// RF-122, RF-1108: the start-up recovery of the runs also discards the partial snapshot folders.

describe('composeRuns', () => {
  it('RF-122 recover discards the partial snapshot folders of an interrupted download', async () => {
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const masker = new SecretMasker();
    const pool = createPool({
      connectionString: 'postgres://u:p@127.0.0.1:1/none',
      onIdleError: () => undefined,
    });
    const discard = vi
      .spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders')
      .mockResolvedValue([]);
    const runs = composeRuns({
      pool,
      logger: new MemoryLogger(clock, masker),
      clock,
      masker,
      dataDir: 'unused',
      version: '1.2.3-test',
      githubToken: undefined,
      packs: new LanguagePackRegistry([]),
      providers: { build: () => Promise.resolve({ ok: true, value: new Map() }) },
      ollamaUrl: undefined,
      priceTable: { version: '2026-10-11', currency: 'USD', prices: [] },
    });

    // The database is unreachable, so the queue step that follows rejects; the discard comes first.
    await expect(runs.recover()).rejects.toThrow();

    expect(discard).toHaveBeenCalledTimes(1);
    discard.mockRestore();
    await pool.end();
  });
});
