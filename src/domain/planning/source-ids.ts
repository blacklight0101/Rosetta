// P8-02, RF-604, EV-83: an entry of a `sources` list of the planner's answer names a supported card.
// A model sometimes writes the id of a claim (`ENT-002.c4`, the card id, `.c` and the claim's
// number) where the card id belongs; such an entry counts as its card when that card is supported.
// An entry that names no supported card, as a card or as one of its claims, is dropped.

const CLAIM_ID = /^(.+)\.c[0-9]+$/u;

/** The supported card an entry names, as its id or as the id of one of its claims. */
function supportedCardOf(entry: string, supported: ReadonlySet<string>): string | undefined {
  if (supported.has(entry)) return entry;
  const card = CLAIM_ID.exec(entry)?.[1];
  return card !== undefined && supported.has(card) ? card : undefined;
}

/** The supported cards a `sources` list names, once each, in the order of the list. */
export function supportedSources(
  sources: readonly string[],
  supported: ReadonlySet<string>,
): string[] {
  return [...new Set(sources.flatMap((entry) => supportedCardOf(entry, supported) ?? []))];
}
