// RF-202, RF-208: the card objects of one JSON value of an answer, before any schema reads them.

/**
 * A bare list counts as the card list only when it holds something: a stray `[]` in prose would
 * otherwise read as "no cards", so an empty answer needs the explicit `{"cards": []}` (P1-33).
 */
export function asCardList(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? { cards: value } : value;
}

/** The card objects of a JSON value, or undefined when the value is not a card list. */
export function cardItems(value: unknown): readonly unknown[] | undefined {
  const list = asCardList(value);
  if (typeof list !== 'object' || list === null || !('cards' in list)) return undefined;
  return Array.isArray(list.cards) ? list.cards : undefined;
}
