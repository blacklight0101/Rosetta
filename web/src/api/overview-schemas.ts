import { z } from 'zod';
import { totalsSchema } from './cost-schemas.js';
import { endReasonField } from './end-reason.js';
import { journeySchema } from './journey-schemas.js';
import { projectSchema } from './project-schemas.js';

// RF-1008, RF-1108, RF-1010: the wire shape of `GET /api/projects/overview` (project-overview-
// routes.ts): each project with its run count, its totals from the cost ledger, its latest run and
// the facts of its journey (P8-137), from which the list says where the project stands.
// `id` of the run is the UUID that the stop route and the live page take; `runId` is its folder
// name. `position` is the run's place in the queue while it is queued, null otherwise.

const lastRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stage: z.string(),
  /** Every state of the server (`RUN_QUEUE_STATES`): one it did not know would fail the whole list. */
  queueState: z.enum(['Queued', 'Running', 'AwaitingApproval', 'Ended']),
  endState: z.enum(['Completed', 'CapReached', 'Failed', 'Interrupted']).nullable(),
  /** P8-111: why an `Interrupted` run ended. */
  endReason: endReasonField,
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  position: z.number().int().positive().nullable(),
  failedAreas: z.number().int().nonnegative().default(0),
  unreadAreas: z.number().int().nonnegative().default(0),
});

export type LastRun = z.output<typeof lastRunSchema>;

const overviewRowSchema = z.object({
  project: projectSchema,
  runs: z.number().int().nonnegative(),
  totals: totalsSchema,
  lastRun: lastRunSchema.nullable(),
  /** RF-010, P8-137: the facts of the project's journey, as the journey route gives them, with no budget. */
  journey: journeySchema.nullable(),
});

export type ProjectOverviewRow = z.output<typeof overviewRowSchema>;

export const projectOverviewSchema = z.object({
  projects: z.array(overviewRowSchema),
  // True when the user has more projects than the page lists: only the newest are shown
  // (P1-163).
  truncated: z.boolean(),
});
