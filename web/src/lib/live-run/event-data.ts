import { z } from 'zod';

// RF-1002, data-model.md section 3.9: the payload of each event type the live page reads. Every
// field is optional or defaulted, because a stream may carry an older or a newer shape: an event
// that does not fit changes nothing but the log.

const text = z.string().max(2000);
const count = z.number().int().nonnegative();

export const agentData = z.looseObject({
  area: text.optional(),
  role: text.optional(),
  model: text.optional(),
});

export const turnData = z.looseObject({
  turn: count.optional(),
  inputTokens: count.optional(),
  outputTokens: count.optional(),
});

export const toolCalledData = z.looseObject({
  tool: text.optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});

export const toolResultData = z.looseObject({
  tool: text.optional(),
  ok: z.boolean().optional(),
  linesReturned: count.optional(),
  refusedReason: text.optional(),
});

export const cardData = z.looseObject({
  cardId: text,
  type: text.optional(),
  title: text.optional(),
  claims: count.optional(),
});

export const agentEndedData = z.looseObject({
  state: text.optional(),
  turns: count.optional(),
  cards: count.optional(),
});

const citation = z.object({
  path: text,
  startLine: z.number().int(),
  endLine: z.number().int(),
});

export const citationCheckedData = z.looseObject({
  claimId: text,
  ok: z.boolean(),
  reason: text.optional(),
  text: z.string().max(20_000).optional(),
  citations: z.array(citation).max(50).optional(),
});

export const claimJudgedData = z.looseObject({
  claimId: text,
  status: text,
  reason: text.optional(),
});

/** `costMicros` is a number in the event log and may be a decimal string on the wire. */
const micros = z.union([
  count,
  z
    .string()
    .regex(/^\d{1,15}$/u)
    .transform(Number),
]);

export const usageData = z.looseObject({
  role: text.optional(),
  costMicros: micros.optional(),
  tokens: z.looseObject({ inputTokens: count, outputTokens: count }).optional(),
});

export type UsageData = z.output<typeof usageData>;

const capPair = z.object({ maxCostMicros: z.number(), maxTokens: z.number() });

export const startedData = z.looseObject({
  stage: text.optional(),
  source: z
    .looseObject({
      owner: text,
      repo: text,
      subpath: text.optional(),
      commitSha: text.nullable().optional(),
      // RF-131: an upload run's manifest source names the zip; owner and repo are empty.
      kind: z.enum(['github', 'upload']).optional(),
      fileName: text.optional(),
      uploadedAt: text.optional(),
      snapshotHash: text.nullable().optional(),
    })
    .optional(),
  caps: z.looseObject({ run: capPair }).optional(),
});

export const resolvedData = z.looseObject({ url: text.optional(), commitSha: text.optional() });

export const endedData = z.looseObject({
  endState: text,
  errorCode: text.optional(),
  /** RF-208: areas of a completed run that gave no usable card. */
  failedAreas: count.optional(),
  totals: z.looseObject({ costMicros: micros.optional() }).optional(),
});

export const scanData = z.looseObject({ files: count, areas: count });

/** `cards.merged` (RF-250): the cards a merge absorbed and the claims it renumbered, `from` the old id and `to` the new one. */
export const cardsMergedData = z.looseObject({
  /** The merged card and the cards it absorbed (the merged card is one of them). */
  cardId: text.optional(),
  from: z.array(text).optional(),
  claims: z.array(z.object({ from: text, to: text })),
});

/** `deepen.started` (RF-209): the run it improves, what was confirmed, the cards it starts from. */
export const deepenStartedData = z.looseObject({
  parentRunId: text,
  parentRunKey: text,
  maxRounds: count,
  coveragePass: z.boolean(),
  seeded: z.looseObject({
    cards: count,
    claims: count,
    supported: count,
    rejected: count,
    notJudged: count,
  }),
});

/** `deepen.round.started` (RF-209): the counts of the round plan. */
export const deepenRoundStartedData = z.looseObject({
  round: count,
  judge: count,
  reread: count,
  outOfScope: count,
  unreadFiles: count,
});

/** `deepen.round.ended` (RF-209): what the round added; `complete` is false when a cap or a Stop cut it. */
export const deepenRoundEndedData = z.looseObject({
  round: count,
  complete: z.boolean(),
  newClaims: count,
  newSupported: count,
  filesRead: count,
});

/** `deepen.ended` (RF-209): why the Deepen stopped. */
export const deepenEndedData = z.looseObject({ stopReason: text, roundsDone: count });
