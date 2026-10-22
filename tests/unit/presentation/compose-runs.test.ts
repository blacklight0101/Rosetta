import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { GitHubSnapshotFetcher } from '../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { LanguagePackRegistry } from '../../../src/infrastructure/scan/packs/pack-registry.js';
import { composeRuns } from '../../../src/presentation/compose-runs.js';
import { StreamRegistry } from '../../../src/presentation/web/event-stream.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';

// RF-122, P1-73: the partial snapshot folders are discarded by their own start-up step, never by
// the periodic queue sweep (`recover`), which would delete a download running at that moment;
// a failure to discard is a warning and does not stop the start-up.

const cleanups: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanups
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })),
  );
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
  const streams = new StreamRegistry();
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
    parseBudget: { totalMs: 120_000 },
    providers: { build: () => Promise.resolve({ ok: true, value: new Map() }) },
    ollamaUrl: undefined,
    priceTable: { version: '2026-10-11', currency: 'USD', prices: [] },
    reasoningModels: () => false,
    streams,
    keySources: { keySourceOf: () => Promise.resolve(undefined) },
  });
  return { runs, logger, pool, streams, clock };
}

describe('composeRuns streams', () => {
  it('RF-1101 the run routes share the stream registry the session store ends, and the clock', async () => {
    const { runs, pool, streams, clock } = composedRuns(tmpdir());

    expect(runs.services.streams).toBe(streams);
    expect(runs.services.clock).toBe(clock);
    await pool.end();
  });
});

describe('composeRuns', () => {
  it('RF-122 recover, the periodic queue sweep, does not discard the partial snapshot folders', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-runs-'));
    cleanups.push(dataDir);
    const partial = join(dataDir, 'sources', '.partial-downloading-now');
    await mkdir(join(partial, 'files'), { recursive: true });
    const discard = vi.spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders');
    const { runs, pool } = composedRuns(dataDir);

    // The database is unreachable, so the sweep rejects; it must not have touched the folder.
    await expect(runs.recover()).rejects.toThrow();
    await expect(runs.recover()).rejects.toThrow();

    expect(discard).not.toHaveBeenCalled();
    expect(await exists(partial)).toBe(true);
    await pool.end();
  });

  it('RF-122 discardPartialSnapshots removes a .partial- folder left in sources/ and keeps complete snapshots', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-runs-'));
    cleanups.push(dataDir);
    const partial = join(dataDir, 'sources', '.partial-left-behind');
    const complete = join(dataDir, 'sources', 'github.com_owner_repo_0123abc');
    await mkdir(join(partial, 'files'), { recursive: true });
    await mkdir(complete, { recursive: true });
    const { runs, pool } = composedRuns(dataDir);

    await runs.discardPartialSnapshots();

    expect(await exists(partial)).toBe(false);
    expect(await exists(complete)).toBe(true);
    await pool.end();
  });

  it('RF-122 a failure to discard is a warning with the error name only, and does not throw', async () => {
    vi.spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders').mockRejectedValue(
      new Error('sources folder unreadable'),
    );
    const { runs, logger, pool } = composedRuns('unused');

    await expect(runs.discardPartialSnapshots()).resolves.toBeUndefined();

    const warning = logger.entries.find((entry) => entry.level === 'warn');
    expect(warning?.logger).toBe('start-up');
    expect(warning?.message).not.toContain('unreadable');
    expect(warning?.message).toContain('Error');
    expect(warning?.message).toContain('sources');
    await pool.end();
  });
});

describe('start-up discard warning codes', () => {
  it('RF-122 a RosettaError from the discard keeps its code on the warning and not its text', async () => {
    vi.spyOn(GitHubSnapshotFetcher.prototype, 'discardPartialFolders').mockRejectedValue(
      new RosettaError(ERROR_CODES.snapshotWriteFailed, 'sources folder unreadable'),
    );
    const { runs, logger, pool } = composedRuns('unused');

    await runs.discardPartialSnapshots();

    const warning = logger.entries.find((entry) => entry.level === 'warn');
    expect(warning?.code).toBe(ERROR_CODES.snapshotWriteFailed);
    expect(warning?.message).not.toContain('unreadable');
    await pool.end();
  });
});
