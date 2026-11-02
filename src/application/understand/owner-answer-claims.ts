import type { Claim } from '../../domain/cards/card.js';
import type { OwnerAnswer } from '../verifier/answer-restated-claim.js';
import type { RerunPlan } from './answer-rerun.js';

// DEC-198, RF-301: the answers a run gave its readers, as the judgement step hands them to the
// verifier rule that rejects a claim restating one (`answer-restated-claim.ts`).

/** The part of an answered question the rule needs. */
export function ownerAnswerOf(question: RerunPlan['pending'][number]): OwnerAnswer {
  const { area, cardId, context, answer } = question;
  return { area, cardId, context, answer };
}

/** The answers given to the readers of an area. */
export function answersOfArea(
  answers: readonly OwnerAnswer[] | undefined,
  area: string,
): readonly OwnerAnswer[] {
  return (answers ?? []).filter((each) => each.area === area);
}

/** P3-106, DEC-198: what makes two claims one judgement: text, citations and the answers they rest on. */
export function sharedKey(
  answers: readonly OwnerAnswer[] | undefined,
  area: string,
  claim: Pick<Claim, 'text' | 'citations'>,
): string {
  const given = answersOfArea(answers, area).map((each) => each.cardId);
  return JSON.stringify([claim.text, claim.citations, given]);
}
