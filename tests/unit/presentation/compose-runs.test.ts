import type { QueryResult } from 'pg';
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
    const empty: QueryResult = { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] };
    vi.spyOn(pool, 'query').mockImplementation(() => Promise.resolve(empty));
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
    });

    await runs.recover();

    expect(discard).toHaveBeenCalledTimes(1);
    discard.mockRestore();
    await pool.end();
  });
});
