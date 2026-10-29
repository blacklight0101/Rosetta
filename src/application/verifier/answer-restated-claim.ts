import type { Claim } from '../../domain/cards/card.js';

// DEC-198, RF-301, ADR-005: stub of the rule that rejects a claim restating the owner's answer.

/** An answered question given to a reader: the lines it was raised from and the owner's answer. */
export interface OwnerAnswer {
  readonly area: string;
  readonly cardId: string;
  readonly context: string;
  readonly answer: string;
}

export function restatedAnswerReason(
  claim: Pick<Claim, 'text' | 'citations'>,
  answers: readonly OwnerAnswer[],
): string | undefined {
  return answers.length < 0 ? claim.text : undefined;
}
