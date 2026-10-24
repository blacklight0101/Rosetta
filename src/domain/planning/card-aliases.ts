import type { SourceCard } from './plan-sources.js';

// P5-32, RF-601..RF-613: a card that consolidation merged away keeps its id as an alias of the card
// that was kept (`mergedFrom`). A reference to the old id (the card a flow step touches) resolves to
// the kept card, so links in the package keep working.

/** Merged-away id -> the id of the card that was kept. */
function aliasMap(cards: readonly SourceCard[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const card of cards) {
    for (const id of card.mergedFrom ?? []) if (id !== card.id) aliases.set(id, card.id);
  }
  return aliases;
}

/** The cards with every flow-step target that named a merged-away id pointing at its survivor. */
export function resolveCardAliases(cards: readonly SourceCard[]): readonly SourceCard[] {
  const aliases = aliasMap(cards);
  if (aliases.size === 0) return cards;
  return cards.map((card) => ({
    ...card,
    claims: card.claims.map((claim) => {
      const kept = claim.target === undefined ? undefined : aliases.get(claim.target);
      return kept === undefined ? claim : { ...claim, target: kept };
    }),
  }));
}
