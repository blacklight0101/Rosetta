import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { Run } from '../../src/domain/runs/run.js';
import { UNDERSTAND_TIMEOUT } from './understand-timeout.js';
import { createUnderstandHarness, type UnderstandHarness } from './understand-run-harness.js';

export { UNDERSTAND_RUN_WAIT, UNDERSTAND_TIMEOUT } from './understand-timeout.js';

// RF-200, RF-301: the full understand run of the C# fixture (a scan, a reader per area, then the
// verifier's judgement of the claims that pass the citation check) that several integration tests
// read.

export interface FullRun {
  readonly h: UnderstandHarness;
  readonly run: Run;
  /** The absolute run folder. */
  readonly folder: string;
}

export async function fullUnderstandRun(dataDir: string): Promise<FullRun> {
  const h = await createUnderstandHarness({
    dataDir,
    recording: 'understand-csharp-full.json',
    verifierRecording: 'verifier-csharp-full.json',
  });
  await h.scan();
  const run = await h.understand();
  return { h, run, folder: h.runFolder(run) };
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * One value made once for a whole describe block (or file), in `beforeAll`, in its own temporary
 * folder, for tests that only read it. A test that changes state keeps its own run in `useTempRoot`.
 */
export function useSharedValue<T>(
  prefix: string,
  make: (dataDir: string) => Promise<T>,
): { current(): T } {
  const state: { dir?: string; value?: T } = {};

  beforeAll(async () => {
    state.dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
    state.value = await make(state.dir);
  }, UNDERSTAND_TIMEOUT.timeout);

  afterAll(async () => {
    if (state.dir !== undefined)
      await rm(state.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  return {
    current: (): T => {
      if (state.value === undefined) throw new Error('The shared understand run is not ready');
      return state.value;
    },
  };
}

/**
 * One full run for the whole file, made in `beforeAll`, for tests that only read its result. A test
 * that changes state, or inspects the data folder as the run leaves it, keeps its own
 * `fullUnderstandRun` in a `useTempRoot` folder.
 */
export function useSharedFullRun(prefix: string): { current(): FullRun } {
  return useSharedValue(prefix, fullUnderstandRun);
}
