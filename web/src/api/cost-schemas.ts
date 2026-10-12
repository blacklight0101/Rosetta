import { z } from 'zod';
import { capsViewSchema } from './admin-schemas.js';

// RF-428, RF-1010, RF-1106: the wire shapes of the cost routes. Amounts are decimal strings of
// micro-units, so none is rounded on the way (data-model.md section 1); tokens are numbers.

const micros = z.string().regex(/^\d+$/u);

const totalsSchema = z.object({
  calls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedInputTokens: z.number().int(),
  cost: z.array(z.object({ currency: z.string(), costMicros: micros })),
  unknownCostCalls: z.number().int(),
  priceTableVersions: z.array(z.string()),
});

export type UsageTotals = z.output<typeof totalsSchema>;

export const accountTotalsSchema = z.object({
  totals: totalsSchema,
  /** The administrator only: the caps and the server-key spend of this UTC month. */
  server: capsViewSchema.nullable(),
});

export type AccountTotals = z.output<typeof accountTotalsSchema>;

const lineSchema = z.object({ key: z.string(), local: z.boolean(), totals: totalsSchema });

export type CostLine = z.output<typeof lineSchema>;

export const projectCostSchema = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
  totals: totalsSchema,
  byRun: z.array(lineSchema.extend({ runId: z.string().nullable(), firstAt: z.string() })),
  byStage: z.array(lineSchema),
  byRole: z.array(lineSchema),
  byProvider: z.array(lineSchema),
  byModel: z.array(lineSchema.extend({ provider: z.string(), model: z.string() })),
  /** The user's provider tests, of no project and no run, outside the project totals (RF-407). */
  providerTests: lineSchema.nullable(),
});

export type ProjectCost = z.output<typeof projectCostSchema>;
