import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { GitHubSnapshotFetcher } from '../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../src/infrastructure/scan/packs/pack-registry.js';
import { composeRuns } from '../../../src/presentation/compose-runs.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';

// RF-122, RF-1108: the start-up recovery of the runs also discards the partial snapshot folders;
// a failure to discard is a warning and does not stop the start-up (P1-73).

const cleanups: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The runs composition against an unreachable database, so the queue step of `recover` rejects. */
function composedRuns(dataDir: string) {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const pool = createPool({
    connectionString: 'postgres://u:p@127.0.0.1:1/none',
    onIdleError: () => undefined,
  });
  const runs = composeRuns({
    pool,
    logger,
    clock,
    masker,
    dataDir,
    version: '1.2.3-test',
    githubToken: undefined,
    packs: new LanguagePackRegistry([]),
    providers: { build: () => Promise.resolve({ ok: true, value: new Map() }) },
    ollamaUrl: undefined,
    priceTable: { version: '2026-10-11', currency: 'USD', prices: [] },
  });
  return { runs, logger, pool };
}

describe('composeRuns', () => {
  it('RF-122 recover discards the partial snapshot folders of an interrupted download', async () => {
    const discard = vi
      .spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders')
      .mockResolvedValue([]);
    const { runs, pool } = composedRuns('unused');

    // The database is unreachable, so the queue step that follows rejects; the discard comes first.
    await expect(runs.recover()).rejects.toThrow();

    expect(discard).toHaveBeenCalledTimes(1);
    await pool.end();
  });

  it('RF-122 recover removes a .partial- folder left in sources/', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-runs-'));
    cleanups.push(dataDir);
    const partial = join(dataDir, 'sources', '.partial-left-behind');
    await mkdir(join(partial, 'files'), { recursive: true });
    const { runs, pool } = composedRuns(dataDir);

    await expect(runs.recover()).rejects.toThrow();

    expect(await exists(partial)).toBe(false);
    await pool.end();
  });

  it('RF-122 a failure to discard the partial folders is logged as a warning and recovery goes on', async () => {
    vi.spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders').mockRejectedValue(
      new Error('sources folder unreadable'),
    );
    const { runs, logger, pool } = composedRuns('unused');

    // The queue step still runs: the rejection is the unreachable database, not the discard.
    await expect(runs.recover()).rejects.not.toThrow('sources folder unreadable');

    const warning = logger.entries.find((entry) => entry.level === 'warn');
    expect(warning?.logger).toBe('start-up');
    expect(warning?.message).toContain('sources folder unreadable');
    await pool.end();
  });
});
