import { z } from 'zod';

// RF-425, RF-1108, run-routes.ts, estimate-view.ts: the wire shape of the estimate of an understand
// run and of the answer to starting a run. Costs are decimal strings of micro-dollars (DEC-54), so
// nothing is rounded on the way; tokens are whole numbers.

const point = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costMicros: z.string().regex(/^\d{1,18}$/u),
});

const range = { low: point, likely: point, high: point };

export type Scenario = keyof typeof range;

const scenarioNumbers = z.object({ low: z.number(), likely: z.number(), high: z.number() });

const roleEstimate = z.object({
  role: z.string(),
  provider: z.string(),
  kind: z.string(),
  model: z.string(),
  keySource: z.string(),
  /** False for a cloud model without a price: its cost is zero here and unknown in fact. */
  priced: z.boolean(),
  ...range,
});

export type RoleEstimate = z.output<typeof roleEstimate>;

export const estimateSchema = z.object({
  priceTableVersion: z.string(),
  currency: z.string(),
  areas: z.array(z.object({ name: z.string(), estimatedTokens: z.number() })),
  assumptions: z.looseObject({ turnsPerArea: scenarioNumbers }),
  roles: z.array(roleEstimate),
  total: z.object(range),
});

export type RunEstimate = z.output<typeof estimateSchema>;

/** `POST /api/projects/:id/runs`: the run and its place in the queue (null when it started). */
export const startedRunSchema = z.looseObject({
  runId: z.string(),
  stage: z.string(),
  queueState: z.string(),
  position: z.number().nullable(),
});

export type StartedRun = z.output<typeof startedRunSchema>;

/** `POST /api/runs/:runId/stop`. */
export const stoppedRunSchema = z.looseObject({ runId: z.string() });
