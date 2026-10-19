import { z } from 'zod';

// RF-002, RF-010, data-model.md section 3.1: the wire shape of a project and of its settings
// document. The settings are `looseObject`s so a field the page has no control for (a cap per
// role, manual areas, a context size) comes back to the server unchanged when the document is
// saved whole (a save replaces the document). The server's own schema decides what is valid.

const providerSettings = z.looseObject({
  kind: z.string(),
  keySource: z.string(),
  toolMode: z.string(),
  timeoutSeconds: z.number(),
  maxRetries: z.number(),
  contextTokens: z.union([z.literal('auto'), z.number()]).optional(),
});

const roleSettings = z.looseObject({
  provider: z.string(),
  model: z.string(),
  maxOutputTokens: z.number(),
  maxTurns: z.number().optional(),
});

const priceSettings = z.looseObject({
  provider: z.string(),
  model: z.string(),
  inputPerMillionMicros: z.number(),
  outputPerMillionMicros: z.number(),
  cachedInputPerMillionMicros: z.number(),
  cacheWriteInputPerMillionMicros: z.number().optional(),
});

// RF-423: the caps of one role; the page shows them only as a notice (P2-26).
const roleCapSettings = z.looseObject({
  maxCostMicros: z.number().optional(),
  maxTokens: z.number().optional(),
});

const settingsSchema = z.looseObject({
  providers: z.record(z.string(), providerSettings),
  roles: z.looseObject({
    reader: roleSettings,
    verifier: roleSettings,
    planner: roleSettings,
    summariser: roleSettings,
  }),
  budget: z.looseObject({
    run: z.looseObject({ maxCostMicros: z.number(), maxTokens: z.number() }),
    confirmAboveCostMicros: z.number(),
    allowUnpriced: z.boolean(),
    prices: z.array(priceSettings).optional(),
    roles: z.record(z.string(), roleCapSettings).optional(),
  }),
  scan: z.looseObject({
    maxFileBytes: z.number(),
    areaTokenBudget: z.number(),
    excerptMaxLines: z.number(),
    ignoreRules: z.string(),
  }),
  agents: z.looseObject({ parallelism: z.number() }),
});

export type ProjectSettings = z.output<typeof settingsSchema>;
export type ProviderSettings = z.output<typeof providerSettings>;
export type PriceSettings = z.output<typeof priceSettings>;
export type RoleCapSettings = z.output<typeof roleCapSettings>;

/** A project as `GET /api/projects` shows it; the owner's id never leaves the server. */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string(),
  ref: z.string(),
  subpath: z.string(),
  settings: settingsSchema,
  /** Counts the saves of the settings; a save names it in If-Match (P1-106). */
  settingsVersion: z.number().int().min(1),
  /** RFC-004 section 4.1: where the code comes from. Absent on the wire means a GitHub project. */
  sourceKind: z.enum(['github', 'upload', 'workbook']).default('github'),
  /** The zip an upload project holds; null while it has no source (RF-128). */
  source: z
    .object({
      fileName: z.string(),
      uploadedAt: z.string(),
      /** RF-157: how many workbooks the zip holds, when the server says; absent means none. */
      workbooks: z.number().int().min(0).optional(),
    })
    .nullable()
    .default(null),
  /** True when the source was replaced after the last run started (RF-128). */
  codeChangedSinceLastRun: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Project = z.output<typeof projectSchema>;
