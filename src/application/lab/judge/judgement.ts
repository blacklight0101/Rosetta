import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { Rubric } from './rubric.js';

// RF-1404: the judge's reply, read against the rubric, and the overall score the lab computes. The
// reply is one JSON object `{ "scores": [{ "criterion", "score", "reason" }] }` with every
// criterion of the rubric once and no other; the lab, not the judge, adds the scores up.

export interface JudgedCriterion {
  readonly id: string;
  readonly score: number;
  readonly reason: string;
}

const REASON_CHARS = 400;

const replySchema = z.strictObject({
  scores: z.array(
    z.strictObject({
      criterion: z.string(),
      score: z.number().int().min(1).max(5),
      reason: z.string(),
    }),
  ),
});

function jsonOf(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
  const body = (fence?.[1] ?? text).trim();
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

// RF-1404
export function parseJudgeReply(text: string, rubric: Rubric): Result<JudgedCriterion[], string> {
  const parsed = replySchema.safeParse(jsonOf(text));
  if (!parsed.success) return err('The reply is not the scores object with whole scores 1 to 5.');
  const wanted = rubric.criteria.map((each) => each.id);
  const given = parsed.data.scores.map((each) => each.criterion);
  const same = given.length === wanted.length && wanted.every((id) => given.includes(id));
  if (!same) return err(`The reply must score exactly: ${wanted.join(', ')}.`);
  const criteria = wanted.map((id): JudgedCriterion => {
    const one = parsed.data.scores.find((each) => each.criterion === id);
    return { id, score: one?.score ?? 1, reason: (one?.reason ?? '').slice(0, REASON_CHARS) };
  });
  return ok(criteria);
}

// RF-1404
export function overallOf(
  criteria: readonly JudgedCriterion[],
  rubric: Rubric,
): { readonly overall: number; readonly vetoed: boolean } {
  const vetoed = rubric.criteria.some(
    (each) => each.veto && criteria.some((one) => one.id === each.id && one.score === 1),
  );
  if (vetoed) return { overall: 1, vetoed };
  const sum = criteria.reduce((total, each) => total + each.score, 0);
  return { overall: Math.round((sum / Math.max(criteria.length, 1)) * 10) / 10, vetoed };
}
