import { z } from 'zod';

// RF-1008, RF-1012: the wire shapes of the history and snapshot routes (history-routes.ts). `id` is
// the run's UUID that the report, zip and delete routes take; `runId` is its folder name, which is
// what people read. Byte counts are numbers.

const count = z.number().int().nonnegative();

const historyRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stage: z.string(),
  queueState: z.enum(['Queued', 'Running', 'Ended']),
  endState: z.string().nullable(),
  commitSha: z.string().nullable(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  totals: z.object({
    costMicros: count,
    inputTokens: count,
    outputTokens: count,
    cachedInputTokens: count,
  }),
  sizeBytes: count,
  /** RF-208: the areas of the run that gave no usable card. */
  failedAreas: count.default(0),
  /** P7-02: the planned areas no reader started; a capped run with some reads "Partly read". */
  unreadAreas: count.default(0),
  /** EV-80: the place of a queued run in the server's queue, counted from 1. */
  position: z.number().int().positive().nullable().default(null),
});

export type HistoryRun = z.output<typeof historyRunSchema>;

export const runHistorySchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    sourceUrl: z.string(),
    ref: z.string(),
    subpath: z.string(),
    /** `projects/<id>`, the folder a deletion removes, relative to the workspace. */
    folder: z.string(),
    sizeBytes: count,
  }),
  runs: z.array(historyRunSchema),
});

export type RunHistory = z.output<typeof runHistorySchema>;

const snapshotSchema = z.object({
  key: z.string(),
  repository: z.string(),
  commitSha: z.string(),
  downloadedAt: z.string(),
  fileCount: count,
  sizeBytes: count,
  runs: count,
  activeRuns: count,
  lastUsedAt: z.string().nullable(),
});

export type Snapshot = z.output<typeof snapshotSchema>;

export const snapshotListSchema = z.object({ snapshots: z.array(snapshotSchema) });

/** The answer of every deletion: the bytes its folder held. */
export const deletedSchema = z.object({ freedBytes: count });

export type Deleted = z.output<typeof deletedSchema>;
