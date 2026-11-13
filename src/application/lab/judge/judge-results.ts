import { z } from 'zod';

// RF-1404, RF-1403: what a judged lab run adds to `results.json`: the judge's scores of each case
// and the judge, its prompt and its rubric, each named by SHA-256 (RNF-015).

const count = z.number().int().min(0);

export const judgementSchema = z.strictObject({
  /** `scored`; `unreadable` (the reply was no valid scoring), `failed` (the call failed) or `refused` (a guard or the ledger). */
  state: z.enum(['scored', 'unreadable', 'failed', 'refused']),
  criteria: z.array(
    z.strictObject({
      id: z.string().min(1),
      score: z.number().int().min(1).max(5),
      reason: z.string(),
    }),
  ),
  /** Mean of the criteria to one decimal, or 1 on a vetoed criterion; null without a score. */
  overall: z.number().min(1).max(5).nullable(),
  vetoed: z.boolean(),
  /** The RST code of the first judge call that failed or was refused. */
  rstCode: z.string().nullable(),
  calls: count,
  inputTokens: count,
  outputTokens: count,
  /** What the judge call cost; the case's own `costMicros` stays the target's. */
  costMicros: count,
});

export const judgeInfoSchema = z.strictObject({
  provider: z.string(),
  model: z.string(),
  modelVersion: z.string().nullable(),
  prompt: z.strictObject({
    name: z.string(),
    version: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  rubric: z.strictObject({
    family: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
});

export type Judgement = z.infer<typeof judgementSchema>;
export type JudgeInfo = z.infer<typeof judgeInfoSchema>;
