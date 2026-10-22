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

/** Q-57: the context window and the output limit a role runs with. */
const roleLimit = z.object({
  contextTokens: z.number(),
  contextAutomatic: z.boolean(),
  modelWindowTokens: z.number().optional(),
  maxOutputTokens: z.number(),
});

const roleLimits = z.record(z.string(), roleLimit);

export const roleEstimate = z.object({
  role: z.string(),
  provider: z.string(),
  kind: z.string(),
  model: z.string(),
  keySource: z.string(),
  /** False for a cloud model without a price: its cost is zero here and unknown in fact. */
  priced: z.boolean(),
  /** Q-58: the effort a reasoning model is asked for; absent for any other model. */
  reasoningEffort: z.string().optional(),
  ...range,
});

export type RoleEstimate = z.output<typeof roleEstimate>;

const micros = z.string().regex(/^\d{1,18}$/u);

/** RF-405, DEC-159: the reservation of the first reader calls and the caps that must hold it. */
const firstCalls = z.object({
  calls: z.number(),
  promptTokens: z.number(),
  maxOutputTokens: z.number(),
  perCallMicros: micros,
  reservedMicros: micros,
  reservedTokens: micros,
  /** The administrator's run cap when the roles use the server's key. */
  adminRunCapMicros: micros.nullable(),
  caps: z.array(
    z.object({
      kind: z.string(),
      unit: z.enum(['micros', 'tokens']),
      limit: micros,
      spent: micros,
      fits: z.boolean(),
    }),
  ),
});

export const estimateSchema = z.object({
  codeMap: z
    .object({
      scannerVersion: z.number().int().nonnegative().nullable(),
      currentScannerVersion: z.number().int().nonnegative(),
      outdated: z.boolean(),
    })
    .optional(),
  priceTableVersion: z.string(),
  currency: z.string(),
  areas: z.array(
    z.object({
      ...{ name: z.string(), estimatedTokens: z.number(), files: z.number() },
      thirdParty: z.boolean(),
    }),
  ),
  assumptions: z.looseObject({ turnsPerArea: scenarioNumbers, roleLimits: roleLimits.optional() }),
  roles: z.array(roleEstimate),
  total: z.object(range),
  firstCalls: firstCalls.optional(),
});

export type RunEstimate = z.output<typeof estimateSchema>;

/** `POST /api/projects/:id/runs`: the run and its place in the queue (null when it started). */
export const startedRunSchema = z.looseObject({
  /** The run's id, which Cancel names; `runId` is its folder name, which the events use. */
  id: z.string(),
  runId: z.string(),
  stage: z.string(),
  queueState: z.string(),
  position: z.number().nullable(),
});

export type StartedRun = z.output<typeof startedRunSchema>;

/** `POST /api/runs/:runId/stop`. */
export const stoppedRunSchema = z.looseObject({ runId: z.string() });
