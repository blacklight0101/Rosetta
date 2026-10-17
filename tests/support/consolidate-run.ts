import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { Run } from '../../src/domain/runs/run.js';
import { UNDERSTAND_TIMEOUT } from './understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
  type UnderstandHarnessOptions,
} from './understand-run-harness.js';

// RF-250: the run of the consolidation tests (tests/recordings/fake/understand-consolidate.json:
// two ENT cards and two BR cards of different areas, one merge answered for each type).

export const recording = 'understand-consolidate.json';
export const READER_CALLS = 5;
export const BR_CALL = READER_CALLS + 1;
export const ENT_CALL = READER_CALLS + 2;

export interface Made {
  readonly h: UnderstandHarness;
  readonly run: Run;
  readonly folder: string;
}

export async function made(
  dataDir: string,
  options: Partial<UnderstandHarnessOptions> = {},
  areas?: readonly string[],
): Promise<Made> {
  const h = await createUnderstandHarness({ dataDir, recording, ...options });
  await h.scan();
  const run = await h.understand(areas === undefined ? {} : { areas });
  return { h, run, folder: h.runFolder(run) };
}

/** One run for a describe block, made in `beforeAll`, for tests that only read its result. */
export function useSharedRun(): { current(): Made } {
  const shared: { dir?: string; made?: Made } = {};
  beforeAll(async () => {
    shared.dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-consolidate-')));
    shared.made = await made(shared.dir);
  }, UNDERSTAND_TIMEOUT.timeout);
  afterAll(async () => {
    if (shared.dir !== undefined) await rm(shared.dir, { recursive: true, force: true });
  });
  return {
    current: () => {
      if (shared.made === undefined) throw new Error('The shared run did not start.');
      return shared.made;
    },
  };
}

export async function cardFiles(folder: string, type: string): Promise<string[]> {
  return (await readdir(join(folder, 'cards', type))).sort();
}

export const cardText = (folder: string, type: string, id: string): Promise<string> =>
  readFile(join(folder, 'cards', type, `${id}.md`), 'utf8');
