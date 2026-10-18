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

/**
 * A Done-when item that reads Given ..., when ..., then ... in that order, each part with at least
 * one word, in any letter case and layout. Linear in the text, so a hostile one costs no more.
 */
function isScenario(text: string): boolean {
  const words: string[] = text.toLowerCase().match(/[a-z']+/gu) ?? [];
  const when = words.indexOf('when', 1);
  if (words[0] !== 'given' || when < 2) return false;
  const then = words.indexOf('then', when + 1);
  return then > when + 1 && then < words.length - 1;
}

/** Why a draft is not a card an agent can build without guessing; undefined when it is one. */
// RF-630, RF-635
export function cardProblem(card: CardQualityFields): string | undefined {
  if (card.invariant.trim() === '') return 'The card states no invariant.';
  if (card.acceptanceCriteria.length === 0 || !card.acceptanceCriteria.every(isScenario)) {
    return 'A Done-when item is not a Given/When/Then scenario.';
  }
  const atRisk = card.adds.length > 0 || card.riskClass !== 'none';
  if (atRisk && !card.probes.some((probe) => probe.trim() !== '')) {
    return 'The card adds a guard or sits at a risk and lists no review probes.';
  }
  return undefined;
}
