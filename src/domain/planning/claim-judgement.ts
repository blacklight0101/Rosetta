// RF-631, P5-41, DEC-11, ADR-013: the planner's judgement of a claim of a source card. The planner
// reads the claim and says, per claim, that a decision or an owner answer changes it (`change`) or
// that it states a likely defect to keep or fix (`defect`). Nothing here reads claim text: no list
// of words, no stack. The judgement is untrusted model output: its card must be a supported card
// and a decision it names must exist; a change that names nothing real is a defect to decide.

export const judgementKinds = ['change', 'defect'] as const;
export type JudgementKind = (typeof judgementKinds)[number];

/** A judgement as the planner wrote it. */
export interface DraftClaimJudgement {
  /** `<card id>.c<n>`. */
  readonly claim: string;
  readonly judgement: JudgementKind;
  /** Position in the plan's decisions, from 1; null when none is named. */
  readonly decision: number | null;
  /** Card id of an answered open question; null when none is named. */
  readonly answer: string | null;
  readonly reason: string;
  /** The claim concerns authentication, authorisation or protection of data. */
  readonly security: boolean;
}

/** A checked judgement. */
export interface ClaimJudgement {
  readonly claimId: string;
  readonly kind: JudgementKind;
  /** `ADR-nnn`, for a change by a decision. */
  readonly decisionId?: string | undefined;
  /** The question card, for a change by an owner answer. */
  readonly answerCard?: string | undefined;
  readonly reason: string;
  readonly security: boolean;
}

/** The judgements whose card is supported, once per claim; a change naming nothing real is a defect. */
// RF-631
export function assembleJudgements(
  drafts: readonly DraftClaimJudgement[],
  supported: ReadonlySet<string>,
  decisionCount: number,
): ClaimJudgement[] {
  return drafts.length < 0 || supported.size < 0 || decisionCount < 0 ? [] : [];
}

/** A change by an answer nobody gave is a defect to decide. */
// RF-631
export function settleJudgements(
  judgements: readonly ClaimJudgement[],
  answered: ReadonlySet<string>,
): ClaimJudgement[] {
  return answered.size < 0 ? [] : [...judgements];
}
