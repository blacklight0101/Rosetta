import type { CaseJudge } from './answer-judge.js';
import type { CheckItem } from './judge-check-set.js';
import type { Judgement } from './judge-results.js';
import { overallOf } from './judgement.js';
import type { Rubric } from './rubric.js';

// RF-1405, RF-1402: the judge check. Every item is scored once by the judge, one after another,
// through the ledger gate; a refused call or a stopped ledger ends the check and the items left are
// not scored. The report compares the judge with the hand labels (calibration claims) and with the
// hand scores (samples): exact, within one point and mean absolute difference per criterion, and
// whether the overall scores fall in the same band (high 4 and up, low 2 and down, otherwise middle).

export interface CheckResult {
  readonly item: CheckItem;
  readonly judgement: Judgement | undefined;
}

interface CriterionAgreement {
  readonly n: number;
  readonly exact: number;
  readonly within1: number;
  readonly meanAbsDiff: number;
}

interface FamilyAgreement {
  readonly samples: number;
  readonly scored: number;
  readonly overallAgreed: number;
  readonly criteria: Readonly<Record<string, CriterionAgreement>>;
}

export interface CheckReport {
  readonly calibration: {
    readonly items: number;
    readonly scored: number;
    readonly agreed: number;
    readonly cases: readonly {
      readonly id: string;
      readonly followsLabel: boolean;
      readonly score: number | null;
      readonly agreed: boolean;
    }[];
  };
  readonly families: Readonly<Record<string, FamilyAgreement>>;
  readonly calls: number;
  readonly costMicros: number;
  readonly stopped: string | null;
  /** What the judge gave every item, for the owner's review. */
  readonly items: readonly {
    readonly id: string;
    readonly kind: CheckItem['kind'];
    readonly family: string;
    readonly overall: number | null;
    readonly judge: Readonly<Record<string, { score: number; reason: string }>>;
    readonly hand: Readonly<Record<string, number>> | null;
  }[];
}

/** Scores the items in order; stops at the first refusal or when the ledger stops the check. */
// RF-1405
export async function scoreItems(
  judge: CaseJudge,
  items: readonly CheckItem[],
): Promise<{ results: CheckResult[]; stopped: string | null }> {
  const results: CheckResult[] = [];
  let stopped: string | null = null;
  for (const item of items) {
    if (stopped !== null) {
      results.push({ item, judgement: undefined });
      continue;
    }
    const { family, source, answer, label } = item;
    const judgement = await judge.score({ family, caseKey: item.id, source, answer, label });
    results.push({ item, judgement });
    const why = judge.stopped();
    if (why !== undefined) stopped = why;
    else if (judgement.state === 'refused') stopped = 'A guard refused a judge call.';
  }
  return { results, stopped };
}

const band = (value: number): 'high' | 'middle' | 'low' =>
  value >= 4 ? 'high' : value <= 2 ? 'low' : 'middle';

function criterionOf(pairs: readonly (readonly [number, number])[]): CriterionAgreement {
  const diffs = pairs.map(([judged, hand]) => Math.abs(judged - hand));
  return {
    n: pairs.length,
    exact: diffs.filter((each) => each === 0).length,
    within1: diffs.filter((each) => each <= 1).length,
    meanAbsDiff: diffs.length === 0 ? 0 : diffs.reduce((sum, each) => sum + each, 0) / diffs.length,
  };
}

function overallAgrees(result: CheckResult, rubric: Rubric | undefined): boolean {
  const { item, judgement } = result;
  const overall = judgement?.overall ?? null;
  if (rubric === undefined || item.scores === null || overall === null) return false;
  const hand = Object.entries(item.scores).map(([id, score]) => ({ id, score, reason: '' }));
  return band(overallOf(hand, rubric).overall) === band(overall);
}

function familyOf(results: readonly CheckResult[], rubric: Rubric | undefined): FamilyAgreement {
  const scored = results.filter((each) => each.judgement?.state === 'scored');
  const criteria: Record<string, CriterionAgreement> = {};
  for (const { id } of rubric?.criteria ?? []) {
    const pairs = scored.flatMap(({ item, judgement }) => {
      const judged = judgement?.criteria.find((each) => each.id === id)?.score;
      const hand = item.scores?.[id];
      return judged === undefined || hand === undefined ? [] : [[judged, hand] as const];
    });
    criteria[id] = criterionOf(pairs);
  }
  const agreed = scored.filter((each) => overallAgrees(each, rubric)).length;
  return { samples: results.length, scored: scored.length, overallAgreed: agreed, criteria };
}

function calibrationOf(results: readonly CheckResult[]): CheckReport['calibration'] {
  const mine = results.filter((each) => each.item.kind === 'calibration');
  const cases = mine.map(({ item, judgement }) => {
    const score = judgement?.criteria.find((each) => each.id === 'verdict-correct')?.score ?? null;
    const agreed = score !== null && score >= 4 === (item.followsLabel === true);
    return { id: item.id, followsLabel: item.followsLabel === true, score, agreed };
  });
  return {
    items: mine.length,
    scored: cases.filter((each) => each.score !== null).length,
    agreed: cases.filter((each) => each.agreed).length,
    cases,
  };
}

// RF-1405
export function reportOf(
  checked: { results: readonly CheckResult[]; stopped: string | null },
  rubrics: ReadonlyMap<string, Rubric>,
): CheckReport {
  const { results } = checked;
  const hand = results.filter((each) => each.item.kind === 'hand-scored');
  const families: Record<string, FamilyAgreement> = {};
  for (const family of new Set(hand.map((each) => each.item.family))) {
    const mine = hand.filter((each) => each.item.family === family);
    families[family] = familyOf(mine, rubrics.get(family));
  }
  return {
    calibration: calibrationOf(results),
    families,
    calls: results.reduce((sum, each) => sum + (each.judgement?.calls ?? 0), 0),
    costMicros: results.reduce((sum, each) => sum + (each.judgement?.costMicros ?? 0), 0),
    stopped: checked.stopped,
    items: results.map(({ item, judgement }) => ({
      ...{ id: item.id, kind: item.kind, family: item.family },
      overall: judgement?.overall ?? null,
      judge: Object.fromEntries(
        (judgement?.criteria ?? []).map((each) => [
          each.id,
          { score: each.score, reason: each.reason },
        ]),
      ),
      hand: item.scores,
    })),
  };
}
