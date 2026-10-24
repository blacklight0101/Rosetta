import type { DeepenRecord } from '../../src/domain/deepen/deepen-record.js';
import { join } from 'node:path';
import { z } from 'zod';
import type { Run } from '../../src/domain/runs/run.js';
import { readJson } from './understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
  type UnderstandHarnessOptions,
} from './understand-run-harness.js';

// RF-209: a completed understand run on Catalog and Services to deepen, and what a run left: its
// claims (from `task-results.json`, the data a resume reads) and the Deepen record of its manifest.

const deepenAreas = ['Catalog', 'Services'];

const claimSchema = z.object({
  claimId: z.string(),
  status: z.string(),
  replaces: z.string().optional(),
  verdict: z.object({ reason: z.string(), reasonKind: z.string().optional() }).optional(),
  citations: z.array(z.object({ path: z.string(), startLine: z.number(), endLine: z.number() })),
});
const resultsSchema = z.object({
  tasks: z.array(
    z.object({
      agentTaskId: z.string(),
      cards: z.array(z.object({ claims: z.array(claimSchema) })),
    }),
  ),
});

export type StoredClaim = z.output<typeof claimSchema>;

/** Every claim of the run, in task, card and claim order. */
export async function claimsOf(h: UnderstandHarness, run: Run): Promise<readonly StoredClaim[]> {
  const file = await readJson(join(h.runFolder(run), 'task-results.json'));
  return resultsSchema
    .parse(file)
    .tasks.flatMap((task) => task.cards.flatMap((card) => card.claims));
}

/** The claim with this id; the test fails when the run has none. */
export async function claimOf(
  h: UnderstandHarness,
  run: Run,
  claimId: string,
): Promise<StoredClaim> {
  const claim = (await claimsOf(h, run)).find((each) => each.claimId === claimId);
  if (claim === undefined) throw new Error(`The run has no claim ${claimId}`);
  return claim;
}

/** The Deepen record of the run's manifest; the test fails when it has none. */
export async function deepenOf(h: UnderstandHarness, run: Run): Promise<DeepenRecord> {
  const { deepen } = await h.manifestOf(run);
  if (deepen === undefined) throw new Error('The run has no Deepen record');
  return deepen;
}

/** The reader task ids the fake reader was asked about, in call order. */
export function readerTasksAsked(h: UnderstandHarness): readonly string[] {
  return h.providers
    .requests()
    .map((request) => request.context.agentTaskId)
    .filter((id) => id.startsWith('reader-'));
}

/** A harness whose scan has run and whose completed understand run on Catalog and Services is returned. */
export async function completedRun(
  options: UnderstandHarnessOptions,
): Promise<{ readonly h: UnderstandHarness; readonly run: Run }> {
  const h = await createUnderstandHarness(options);
  await h.scan();
  const run = await h.understand({ areas: deepenAreas });
  if (run.endState !== 'Completed')
    throw new Error(`The run to deepen ended ${String(run.endState)}`);
  return { h, run };
}
