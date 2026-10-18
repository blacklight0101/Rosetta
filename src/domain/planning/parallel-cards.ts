// RF-634, DEC-135, ADR-018: cards that cannot collide when several builders work at once. Each
// card lists the files and folders it expects to change and the shared identifiers it needs (an
// error code, a migration number, a configuration key, a port); the plan allocates every
// identifier, so no two cards get the same one, and orders two cards whose files overlap by a
// dependency, so they are never in one parallel group.

export const identifierKinds = [
  'error code',
  'migration number',
  'configuration key',
  'port',
] as const;

export type IdentifierKind = (typeof identifierKinds)[number];

/** What a card says it needs: the kind and what it is for, never the value. */
export interface IdentifierNeed {
  readonly kind: IdentifierKind;
  readonly purpose: string;
}

export interface AllocatedIdentifier extends IdentifierNeed {
  readonly value: string;
}

/** What the order of the cards depends on. */
export interface OrderedCard {
  readonly phase: number;
  readonly files: readonly string[];
  /** Positions of the cards the planner said this one waits for (0-based, in card order). */
  readonly declared: readonly number[];
}

/** The identifiers of each card, allocated from one sequence per kind (stub). */
export function allocateIdentifiers(
  needs: readonly (readonly IdentifierNeed[])[],
): AllocatedIdentifier[][] {
  return needs.map(() => []);
}

/** For each card the positions of the cards it depends on (stub). */
export function dependenciesOf(cards: readonly OrderedCard[]): number[][] {
  return cards.map(() => []);
}

/** A card as the groups see it. */
export interface GroupedCard {
  readonly id: string;
  readonly phase: number;
  readonly dependsOn: readonly string[];
}

/** The cards of a phase in the groups that can run together, earliest first (stub). */
export function parallelGroups(cards: readonly GroupedCard[], phase: number): string[][] {
  return cards.filter((card) => card.phase === phase).length === 0 ? [] : [];
}
