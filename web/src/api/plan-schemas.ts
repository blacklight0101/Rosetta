import { z } from 'zod';

// RF-605, RF-606, RF-608, RF-609, RF-613: the wire shapes of Plan setup: the catalogue
// (`GET /api/plan/catalogue`), the planning brief (`GET` and `PUT /api/projects/:id/planning-brief`),
// the options the planner proposes (`POST /api/projects/:id/plan-options`) and the plan estimate
// (`GET /api/projects/:id/plan-estimate`). Every answer is parsed before use. Costs and limits are
// decimal strings of micro-dollars or tokens, read into bigints so nothing is rounded.

const bigIntText = z
  .string()
  .regex(/^\d{1,18}$/u)
  .transform((text) => BigInt(text));

export const catalogueSchema = z.object({
  version: z.number(),
  entries: z.array(
    z.object({
      ...{ id: z.string(), group: z.string(), title: z.string(), rule: z.string() },
      ...{ why: z.string(), check: z.string(), defaultOn: z.boolean() },
    }),
  ),
  migrations: z.array(z.object({ id: z.string(), title: z.string(), tradeOff: z.string() })),
});

export type Catalogue = z.output<typeof catalogueSchema>;
export type CatalogueEntry = Catalogue['entries'][number];

const stackChoice = z.object({ layer: z.string(), choice: z.string(), custom: z.boolean() });

/** The brief as the server keeps it, or its defaults while none is saved (`savedAt` null). */
const briefSchema = z.object({
  savedAt: z.string().nullable(),
  catalogueVersion: z.number(),
  principles: z.array(z.string()),
  architecture: z.object({
    style: z.string(),
    recommended: z.array(z.string()),
    evidence: z.array(z.string()),
  }),
  migration: z.string(),
  stack: z.array(stackChoice),
  context: z.object({
    teamSize: z.number().nullable(),
    experience: z.string().nullable(),
    deadline: z.string().nullable(),
    keepIntegrations: z.array(z.string()),
    dataMigration: z.string().nullable(),
  }),
  buildMethod: z.object({ aiAssisted: z.boolean() }),
  defaulted: z.array(z.string()),
});

export const briefViewSchema = z.object({
  saved: z.boolean(),
  /** A package was written from an earlier brief than the saved one (RF-605). */
  outOfDate: z.boolean(),
  brief: briefSchema,
});

export type BriefView = z.output<typeof briefViewSchema>;
export type Brief = BriefView['brief'];
export type StackChoice = z.output<typeof stackChoice>;

const styleOption = z.object({
  style: z.string(),
  strengths: z.array(z.string()),
  costs: z.array(z.string()),
  evidence: z.array(z.string()),
});

export const planOptionsSchema = z.object({
  architecture: z.object({ recommended: z.string(), options: z.array(styleOption) }),
  stack: z.array(z.object({ layer: z.string(), options: z.array(z.string()) })),
});

export type PlanOptions = z.output<typeof planOptionsSchema>;
export type StyleOption = z.output<typeof styleOption>;

const figure = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costMicros: bigIntText,
});

const byScenario = <T extends z.ZodType>(schema: T) =>
  z.object({ low: schema, likely: schema, high: schema });

const planCap = z.object({
  kind: z.string(),
  unit: z.enum(['micros', 'tokens']),
  limit: bigIntText,
  spent: bigIntText,
  remaining: bigIntText,
  fits: byScenario(z.boolean()),
});

export const planEstimateSchema = z.object({
  priceTableVersion: z.string(),
  currency: z.string(),
  planner: z.object({
    ...{ role: z.string(), provider: z.string(), kind: z.string(), model: z.string() },
    ...{ keySource: z.string(), priced: z.boolean() },
    ...byScenario(figure).shape,
  }),
  /** Whether the call would find a key; false means the run is refused (RST-2302). */
  keyAvailable: z.boolean(),
  /** Read generically: the calls of the run and the numbers behind the figures vary by release. */
  assumptions: z.looseObject({ calls: z.number().optional() }),
  caps: z.array(planCap),
  withinCaps: byScenario(z.boolean()),
});

export type PlanEstimate = z.output<typeof planEstimateSchema>;
export type PlanCap = PlanEstimate['caps'][number];

// RF-614: the understand run Plan setup plans from.
export const planSourceSchema = z.object({
  runId: z.string(),
  runKey: z.string(),
  endedAt: z.string().nullable(),
  areas: z.array(z.string()),
  supportedClaims: z.number().int().min(0),
  /** P3-121: `CapReached` for a run that stopped at a cap but holds Supported claims. */
  endState: z.enum(['Completed', 'CapReached']),
  newest: z.boolean(),
});

export type PlanSource = z.output<typeof planSourceSchema>;
