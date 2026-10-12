import { z } from 'zod';

// RF-1002, run-view.ts: the wire shape of `GET /api/runs/:runId`. `id` is the run's UUID that the
// stop and download routes take; `runId` is its folder name, which the events carry.

const count = z.number().int().nonnegative();

export const runSchema = z.looseObject({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  stage: z.string(),
  queueState: z.enum(['Queued', 'Running', 'Ended']),
  endState: z.string().nullable(),
  commitSha: z.string().nullable(),
  totals: z.object({
    costMicros: count,
    inputTokens: count,
    outputTokens: count,
    cachedInputTokens: count,
  }),
});

export type RunRow = z.output<typeof runSchema>;
