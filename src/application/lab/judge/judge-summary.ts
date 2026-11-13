import type { Judgement } from './judge-results.js';

// RF-1407, RF-1403: the judge's scores of a run, as means. Cases the judge did not score count in
// `unscored`, never as a score.

export interface JudgeSummary {
  readonly scored: number;
  readonly unscored: number;
  /** Mean of the overall scores of the scored cases. */
  readonly meanOverall: number | null;
  /** Mean score of each criterion over the scored cases. */
  readonly criteriaMeans: Readonly<Record<string, number>>;
  /** Cases whose veto criterion scored 1. */
  readonly vetoed: number;
  readonly costMicros: number;
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

// RF-1407
export function judgeSummaryOf(
  cases: readonly { readonly judge?: Judgement | undefined }[],
): JudgeSummary | null {
  const judged = cases.flatMap((each) => (each.judge === undefined ? [] : [each.judge]));
  if (judged.length === 0) return null;
  const scored = judged.filter((each) => each.state === 'scored');
  const byCriterion = new Map<string, number[]>();
  for (const each of scored.flatMap((one) => one.criteria)) {
    byCriterion.set(each.id, [...(byCriterion.get(each.id) ?? []), each.score]);
  }
  return {
    scored: scored.length,
    unscored: judged.length - scored.length,
    meanOverall: mean(scored.flatMap((each) => (each.overall === null ? [] : [each.overall]))),
    criteriaMeans: Object.fromEntries(
      [...byCriterion].map(([id, scores]) => [id, mean(scores) ?? 0]),
    ),
    vetoed: scored.filter((each) => each.vetoed).length,
    costMicros: judged.reduce((sum, each) => sum + each.costMicros, 0),
  };
}
