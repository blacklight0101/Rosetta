import { z } from 'zod';
import { endReasonField } from './end-reason.js';

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
  /** P8-111: why an `Interrupted` run ended. */
  endReason: endReasonField,
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
  /** P8-130: the areas read below the coverage bar; the lists read "Partly read" from it, as the run page does. */
  partlyReadAreas: count.default(0),
  /** P8-130: the share of the first-party code the run read (0 to 1); null when it cannot be worked out. */
  readShare: z.number().min(0).max(1).nullable().default(null),
  /** EV-80: the place of a queued run in the server's queue, counted from 1. */
  position: z.number().int().positive().nullable().default(null),
  /** P8-88: the sum of the spans the run was running in; null until it ends. */
  runningMs: count.nullable().default(null),
  /** P8-88: from the first start to the end; null until the run ends. */
  wallMs: count.nullable().default(null),
  /** P8-89: the rounds a Deepen run has finished; null for a run that is not a Deepen. */
  deepenRounds: count.nullable().default(null),
});

export type HistoryRun = z.output<typeof historyRunSchema>;

export const runHistorySchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    sourceUrl: z.string(),
    /** P8-89: only a GitHub project pins a commit, so only it has a Commit column. */
    sourceKind: z.enum(['github', 'upload', 'workbook']).default('github'),
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
