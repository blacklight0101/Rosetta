import { z } from 'zod';

// RF-1002, run-view.ts: the wire shape of `GET /api/runs/:runId`. `id` is the run's UUID that the
// stop and download routes take; `runId` is its folder name, which the events carry. `reportBuilt`
// says the run's report exists (P1-130); the start answer, which reads the same shape, has none.

const count = z.number().int().nonnegative();

export const runSchema = z.looseObject({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  stage: z.string(),
  queueState: z.enum(['Queued', 'Running', 'AwaitingApproval', 'Ended']),
  endState: z.string().nullable(),
  commitSha: z.string().nullable(),
  /** When the run began; null while it waits in the queue (or if it was stopped there). */
  startedAt: z.string().nullable().default(null),
  /** The place of a queued run in the server's queue, from 1; null for any other run. */
  position: z.number().int().positive().nullable().default(null),
  totals: z.object({
    costMicros: count,
    inputTokens: count,
    outputTokens: count,
    cachedInputTokens: count,
  }),
  reportBuilt: z.boolean().default(false),
  /** RF-208: the areas of the run that gave no usable card. */
  failedAreas: count.default(0),
  /** P7-02: the planned areas no reader started. */
  unreadAreas: count.default(0),
});

export type RunRow = z.output<typeof runSchema>;
