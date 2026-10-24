import { CARD_TYPES, type CardType } from '../cards/card-vocabulary.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { ExcludedClaim } from './plan-sources.js';

// P5-26, RF-604: the claims left out of the package, summarised so the open questions stay short.
// A claim is more important when its card kind states more of what the system does (business
// rules first, then features, then the rest in the order of the card vocabulary), then when it
// cites more code, then by its id so the order never changes between two runs.

/** The kinds of card in the order of importance: BR, FEAT, then the other kinds as listed. */
const KIND_ORDER: readonly CardType[] = [
  'BR',
  'FEAT',
  ...CARD_TYPES.filter((type) => type !== 'BR' && type !== 'FEAT'),
];

function kindRank(type: CardType): number {
  return KIND_ORDER.indexOf(type);
}

/** The claims, the most important first. */
export function rankLeftOut(claims: readonly ExcludedClaim[]): ExcludedClaim[] {
  return [...claims].sort(
    (a, b) =>
      kindRank(a.cardType) - kindRank(b.cardType) ||
      b.citations - a.citations ||
      byCodeUnit(a.claimId, b.claimId),
  );
}

export interface LeftOutCount {
  readonly name: string;
  readonly count: number;
}

function countBy(claims: readonly ExcludedClaim[], key: (claim: ExcludedClaim) => string) {
  const counts = new Map<string, number>();
  for (const claim of claims) counts.set(key(claim), (counts.get(key(claim)) ?? 0) + 1);
  return counts;
}

/** Claims left out per card kind, in the order of importance; kinds with none are omitted. */
export function countByKind(claims: readonly ExcludedClaim[]): LeftOutCount[] {
  const counts = countBy(claims, (claim) => claim.cardType);
  return KIND_ORDER.flatMap((name) => {
    const count = counts.get(name) ?? 0;
    return count === 0 ? [] : [{ name, count }];
  });
}

/** Claims left out per area, the largest first. */
export function countByArea(claims: readonly ExcludedClaim[]): LeftOutCount[] {
  return [...countBy(claims, (claim) => claim.area)]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || byCodeUnit(a.name, b.name));
}

/** Claims left out per status, in the order the vocabulary lists them. */
export function countByStatus(claims: readonly ExcludedClaim[]): LeftOutCount[] {
  return [...countBy(claims, (claim) => claim.status)]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => byCodeUnit(a.name, b.name));
}
