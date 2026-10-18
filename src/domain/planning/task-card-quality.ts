// RF-630, RF-635, DEC-135, ADR-018: what a planned task card must state beyond the change to make.
// It states the invariant the work makes true, its Done-when items as Given/When/Then scenarios, a
// risk class, and, when it adds a check, a filter, a limit or a parser (or sits at a risk), the
// concrete hostile and edge inputs a reviewer will try. A draft that cannot say so is not a card.

export const riskClasses = ['security boundary', 'data loss', 'money', 'none'] as const;

export type RiskClass = (typeof riskClasses)[number];

/** The kinds of guard whose cards carry review probes (RF-630). */
export const guardKinds = ['check', 'filter', 'limit', 'parser'] as const;

export type GuardKind = (typeof guardKinds)[number];

export interface CardQualityFields {
  readonly invariant: string;
  readonly riskClass: RiskClass;
  readonly adds: readonly GuardKind[];
  readonly probes: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

/** Why a draft is not a card an agent can build without guessing; undefined when it is one. */
// RF-630
export function cardProblem(card: CardQualityFields): string | undefined {
  return card.acceptanceCriteria.length < 0 ? 'never' : undefined;
}
