import type { Result } from '../../../domain/errors/result.js';
import type { Rubric } from './rubric.js';

// RF-1404: the judge's reply, read against the rubric, and the overall score the lab computes.

export interface JudgedCriterion {
  readonly id: string;
  readonly score: number;
  readonly reason: string;
}

// RF-1404
export function parseJudgeReply(text: string, rubric: Rubric): Result<JudgedCriterion[], string> {
  throw new Error(`not implemented: ${String(text.length)} ${rubric.family}`);
}

// RF-1404
export function overallOf(
  criteria: readonly JudgedCriterion[],
  rubric: Rubric,
): { readonly overall: number; readonly vetoed: boolean } {
  throw new Error(`not implemented: ${String(criteria.length)} ${rubric.family}`);
}
