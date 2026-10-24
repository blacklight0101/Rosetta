// RF-631, P5-41, DEC-11, ADR-013: the planner's judgement of a claim of a source card. The planner
// reads the claim and says, per claim, that a decision or an owner answer changes it (`change`) or
// that it states a likely defect to keep or fix (`defect`). Nothing here reads claim text: no list
// of words, no stack. The judgement is untrusted model output: its card must be a supported card
// and a decision it names must exist; a change that names nothing real is a defect to decide.

export const judgementKinds = ['change', 'defect'] as const;
type JudgementKind = (typeof judgementKinds)[number];

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

/** The card id of a claim id (`FEAT-001.c3` is `FEAT-001`); undefined when the id has no `.c<n>`. */
function cardOf(claimId: string): string | undefined {
  const at = claimId.lastIndexOf('.c');
  return at > 0 && /^[0-9]{1,6}$/u.test(claimId.slice(at + 2)) ? claimId.slice(0, at) : undefined;
}

function judgementOf(draft: DraftClaimJudgement, decisionCount: number): ClaimJudgement {
  const { claim: claimId, reason, security } = draft;
  const base = { claimId, reason, security };
  if (draft.judgement === 'defect') return { ...base, kind: 'defect' };
  const { decision } = draft;
  if (decision !== null && decision >= 1 && decision <= decisionCount) {
    return {
      ...base,
      kind: 'change',
      decisionId: `ADR-${String(decision).padStart(3, '0')}`,
    };
  }
  if (draft.answer !== null) return { ...base, kind: 'change', answerCard: draft.answer };
  return { ...base, kind: 'defect' };
}

/** The judgements whose card is supported, once per claim; a change naming nothing real is a defect. */
// RF-631
export function assembleJudgements(
  drafts: readonly DraftClaimJudgement[],
  supported: ReadonlySet<string>,
  decisionCount: number,
): ClaimJudgement[] {
  const seen = new Set<string>();
  return drafts.flatMap((draft) => {
    const card = cardOf(draft.claim);
    if (card === undefined || !supported.has(card) || seen.has(draft.claim)) return [];
    seen.add(draft.claim);
    return [judgementOf(draft, decisionCount)];
  });
}

/** A change by an answer nobody gave is a defect to decide. */
// RF-631
export function settleJudgements(
  judgements: readonly ClaimJudgement[],
  answered: ReadonlySet<string>,
): ClaimJudgement[] {
  return judgements.map((each) => {
    if (each.kind !== 'change' || each.decisionId !== undefined) return each;
    if (each.answerCard !== undefined && answered.has(each.answerCard)) return each;
    const { claimId, reason, security } = each;
    return { claimId, reason, security, kind: 'defect' };
  });
}
