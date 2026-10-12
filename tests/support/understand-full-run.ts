import { readFile } from 'node:fs/promises';
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
