import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';
import { roleEstimate } from './estimate-schemas.js';

// RF-231, RF-209, deepen-routes.ts: the understanding of an ended understand run (the honest
// measures and the record of a Deepen run) and the estimate and the start of a Deepen. Every answer
// is parsed before use; another user's run answers 404 like an unknown one. Costs travel as decimal
// strings of micro-dollars (RF-425). Model and repository text (claim ids, reasons) is shown as text.

const count = z.number().int().nonnegative();
const share = z.number().min(0).max(1).nullable();

const measureFields = {
  firstPartyCoverage: share,
  firstPartyTokens: count,
  firstPartyReadTokens: count,
  supported: count,
  rejected: count,
  supportedShare: share,
  notJudged: count,
  rejectedUnresolved: count,
  supportedAfterReread: count,
  thirdParty: z.object({ files: count, tokens: count, claims: count }),
  wellCovered: z.boolean(),
};

const measuresSchema = z.object({
  ...measureFields,
  /** The largest first-party files no task read, at most ten; `filesNotReadCount` counts all. */
  filesNotRead: z.array(
    z.object({ path: z.string(), tokens: count, unreadShare: z.number().min(0).max(1).optional() }),
  ),
  filesNotReadCount: count,
});

/** A measure set before or after a Deepen: the files not read are only counted there. */
const summarySchema = z
  .object({ ...measureFields, filesNotRead: count })
  .transform(({ filesNotRead, ...rest }) => ({ ...rest, filesNotReadCount: filesNotRead }));

const roundSchema = z.looseObject({
  round: count,
  complete: z.boolean(),
  judged: z.array(z.string()),
  reread: z.array(z.looseObject({ claimId: z.string(), reason: z.string() })),
  filesRead: z.array(z.string()),
  newClaims: z.array(
    z.looseObject({ claimId: z.string(), status: z.string(), replaces: z.string().optional() }),
  ),
  tokens: count,
  costMicros: count,
});

const deepenSchema = z.looseObject({
  parentRunId: z.string(),
  parentRunKey: z.string(),
  maxRounds: count,
  coveragePass: z.boolean(),
  roundsDone: count,
  stopReason: z.enum(['noProgress', 'roundLimit', 'capReached', 'stopped']).nullable(),
  outOfScope: z.array(z.looseObject({ claimId: z.string(), reason: z.string() })),
  rounds: z.array(roundSchema),
  before: summarySchema.nullable(),
  after: summarySchema.nullable(),
});

const understandingSchema = z.looseObject({
  measures: measuresSchema.nullable(),
  deepen: deepenSchema.nullable(),
});

export type MeasureFigures = z.output<typeof measuresSchema>;
export type DeepenRecordData = z.output<typeof deepenSchema>;
export type Understanding = z.output<typeof understandingSchema>;

const point = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costMicros: z.string().regex(/^\d{1,18}$/u),
});
const range = { low: point, likely: point, high: point };

const deepenEstimateSchema = z.looseObject({
  currency: z.string(),
  maxRounds: count,
  coveragePass: z.boolean(),
  plan: z.looseObject({
    judge: count,
    reread: count,
    outOfScope: count,
    failedAreas: count.default(0),
    unreadFiles: count,
    unreadTokens: count,
  }),
  roles: z.array(roleEstimate),
  round: z.object(range),
  /** The first round times the round limit: a working ceiling, not a proven maximum. */
  allRounds: z.object(range),
  cap: z.looseObject({ maxCostMicros: count, maxTokens: count }),
  overCap: z.looseObject({ round: z.boolean(), allRounds: z.boolean() }),
});

export type DeepenEstimate = z.output<typeof deepenEstimateSchema>;

export interface DeepenChoice {
  readonly maxRounds: number;
  readonly coveragePass: boolean;
}

const runPath = (runId: string): string => `/api/runs/${encodeURIComponent(runId)}`;

// RF-231, RF-209
export function getUnderstanding(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<Understanding>> {
  return client.request({
    method: 'GET',
    path: `${runPath(runId)}/understanding`,
    schema: understandingSchema,
    signal,
  });
}

// RF-209, RF-425: nothing starts.
export function estimateDeepen(
  client: ApiClient,
  runId: string,
  choice: DeepenChoice,
  signal: AbortSignal,
): Promise<ApiResult<DeepenEstimate>> {
  return client.request({
    method: 'POST',
    path: `${runPath(runId)}/deepen/estimate`,
    body: choice,
    schema: deepenEstimateSchema,
    signal,
  });
}

const startedSchema = z.looseObject({ id: z.string() });

// RF-209, RF-143: starts the Deepen run on the owner's confirmation.
export function startDeepen(
  client: ApiClient,
  runId: string,
  choice: DeepenChoice & {
    readonly cloudConsent: boolean;
    /** RF-132: sent only when ticked. */
    readonly privateCodeConfirmed?: boolean;
  },
): Promise<ApiResult<{ readonly id: string }>> {
  return client.request({
    method: 'POST',
    path: `${runPath(runId)}/deepen`,
    body: { confirmed: true, ...choice },
    schema: startedSchema,
  });
}
