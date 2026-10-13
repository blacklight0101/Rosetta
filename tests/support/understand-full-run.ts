import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { Run } from '../../src/domain/runs/run.js';
import { createUnderstandHarness, type UnderstandHarness } from './understand-run-harness.js';

// RF-200: the full understand run of the C# fixture (a scan, then a reader per area) that several
// integration tests read.

export interface FullRun {
  readonly h: UnderstandHarness;
  readonly run: Run;
  /** The absolute run folder. */
  readonly folder: string;
}

export async function fullUnderstandRun(dataDir: string): Promise<FullRun> {
  const h = await createUnderstandHarness({ dataDir, recording: 'understand-csharp-full.json' });
  await h.scan();
  const run = await h.understand();
  return { h, run, folder: h.runFolder(run) };
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** A scan and an understand run take a few seconds; more when the whole suite runs at once. */
export const UNDERSTAND_TIMEOUT = { timeout: 30_000 } as const;

/**
 * One full run for the whole file, made in `beforeAll`, for tests that only read its result. A test
 * that changes state, or inspects the data folder as the run leaves it, keeps its own
 * `fullUnderstandRun` in a `useTempRoot` folder.
 */
export function useSharedFullRun(prefix: string): { current(): FullRun } {
  const state: { dir?: string; full?: FullRun } = {};

  beforeAll(async () => {
    state.dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
    state.full = await fullUnderstandRun(state.dir);
  }, UNDERSTAND_TIMEOUT.timeout);

  afterAll(async () => {
    if (state.dir !== undefined) await rm(state.dir, { recursive: true, force: true });
  });

  return {
    current: () => {
      if (state.full === undefined) throw new Error('The shared understand run is not ready');
      return state.full;
    },
  };
}
