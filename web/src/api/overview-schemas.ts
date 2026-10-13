import { z } from 'zod';
import { totalsSchema } from './cost-schemas.js';
import { projectSchema } from './project-schemas.js';

// RF-1008, RF-1108, RF-1010: the wire shape of `GET /api/projects/overview` (project-overview-
// routes.ts): each project with its run count, its totals from the cost ledger and its latest run.
// `id` of the run is the UUID that the stop route and the live page take; `runId` is its folder
// name. `position` is the run's place in the queue while it is queued, null otherwise.

const lastRunSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stage: z.string(),
  queueState: z.enum(['Queued', 'Running', 'Ended']),
  endState: z.enum(['Completed', 'CapReached', 'Failed', 'Interrupted']).nullable(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  position: z.number().int().positive().nullable(),
});

export type LastRun = z.output<typeof lastRunSchema>;

const overviewRowSchema = z.object({
  project: projectSchema,
  runs: z.number().int().nonnegative(),
  totals: totalsSchema,
  lastRun: lastRunSchema.nullable(),
});

export type ProjectOverviewRow = z.output<typeof overviewRowSchema>;

export const projectOverviewSchema = z.object({ projects: z.array(overviewRowSchema) });
