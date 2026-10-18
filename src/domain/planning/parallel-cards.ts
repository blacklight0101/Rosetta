// RF-634, DEC-135, ADR-018: cards that cannot collide when several builders work at once. Each
// card lists the files and folders it expects to change and the shared identifiers it needs (an
// error code, a migration number, a configuration key, a port); the plan allocates every
// identifier, so no two cards get the same one, and orders two cards whose files overlap by a
// dependency, so they are never in one parallel group. Nothing here asks the model: the same cards
// always get the same identifiers, dependencies and groups.

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

const padded = (number: number, width: number): string => String(number).padStart(width, '0');

/** The shape of the identifier numbered `number` (from 1) of each kind. */
const shapes: Readonly<Record<IdentifierKind, (number: number) => string>> = {
  'error code': (number) => `ERR-${padded(number, 3)}`,
  'migration number': (number) => padded(number, 4),
  'configuration key': (number) => `SETTING_${padded(number, 3)}`,
  port: (number) => String(5000 + number),
};

/** The same need in another letter case or spacing. */
function needKey(need: IdentifierNeed): string {
  return `${need.kind}|${need.purpose.trim().replace(/\s+/gu, ' ').toLowerCase()}`;
}

/**
 * The identifiers of each card, in card order. Every kind counts on its own from 1, so no two
 * cards, and no two needs of different cards, get the same value; a card that names the same need
 * twice gets one value.
 */
// RF-634
export function allocateIdentifiers(
  needs: readonly (readonly IdentifierNeed[])[],
): AllocatedIdentifier[][] {
  const taken: Record<IdentifierKind, number> = {
    'error code': 0,
    'migration number': 0,
    'configuration key': 0,
    port: 0,
  };
  return needs.map((own) => {
    const seen = new Set<string>();
    return own.flatMap((need) => {
      if (seen.size === seen.add(needKey(need)).size) return [];
      taken[need.kind] += 1;
      return [{ ...need, value: shapes[need.kind](taken[need.kind]) }];
    });
  });
}

const wildcard = /[*?[\]{}]/u;
const outsideTheRepository = /^(?:[a-z]:|~)$/u;

/** One name of a path: no `::$DATA` stream, no trailing dots or spaces (Windows ignores them). */
function nameOf(part: string): string {
  const stream = part.indexOf('::$');
  const name = (stream < 0 ? part : part.slice(0, stream)).trim();
  return name === '..' ? name : name.replace(/[. ]+$/u, '');
}

/**
 * The folders of a path, lower case, with `.`, `..`, repeated and trailing slashes resolved, in
 * compatibility form (NFKC, so full-width and composed letters match). The path stops at the first
 * name that holds a wildcard (`*?[]{}`), because what follows can be anything below the folder
 * before it; a leading wildcard, a drive (`C:`) and `~` are the root of the repository, which
 * overlaps every card. Other look-alike spellings (`ss` for the German sharp s, 8.3 short names)
 * are not merged: a miss costs a missed ordering, never a repeated identifier.
 */
function segmentsOf(path: string): string[] {
  const folders: string[] = [];
  const parts = path.normalize('NFKC').toLowerCase().replaceAll('\\', '/').split('/');
  for (const [at, part] of parts.entries()) {
    const name = nameOf(part);
    if (at === 0 && outsideTheRepository.test(name)) return [];
    if (wildcard.test(name)) break;
    if (name === '..') folders.pop();
    else if (name !== '' && name !== '.') folders.push(name);
  }
  return folders;
}

/** The files as the plan lists them: trimmed, and each file once however it is spelled. */
// RF-634
export function listedFiles(files: readonly string[]): string[] {
  const seen = new Set<string>();
  return files
    .map((file) => file.trim())
    .filter((file) => file !== '' && seen.size !== seen.add(segmentsOf(file).join('/')).size);
}

/** One path contains the other, or is the same; the root of the repository contains everything. */
function related(left: readonly string[], right: readonly string[]): boolean {
  const shared = Math.min(left.length, right.length);
  return left.slice(0, shared).every((name, at) => name === right[at]);
}

function overlap(
  left: readonly (readonly string[])[],
  right: readonly (readonly string[])[],
): boolean {
  return left.some((one) => right.some((other) => related(one, other)));
}

function reaches(
  dependencies: readonly ReadonlySet<number>[],
  from: number,
  target: number,
): boolean {
  const pending = [from];
  const visited = new Set<number>();
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === target) return true;
    if (!visited.has(next)) pending.push(...(dependencies[next] ?? []));
    visited.add(next);
  }
  return false;
}

/**
 * For each card the positions of the cards it waits for: the ones the planner declared that come
 * before it (an earlier phase, or the same phase and an earlier position), plus, for every earlier
 * card whose files overlap its own and that it does not already wait for through others, that
 * card. Two cards that overlap are therefore always ordered, in one direction only.
 */
// RF-634
export function dependenciesOf(cards: readonly OrderedCard[]): number[][] {
  const order = cards
    .map((_, at) => at)
    .sort((a, b) => phaseOf(cards, a) - phaseOf(cards, b) || a - b);
  const rank = new Map(order.map((card, at) => [card, at]));
  const before = (earlier: number, later: number): boolean =>
    (rank.get(earlier) ?? Infinity) < (rank.get(later) ?? -Infinity);
  const dependencies = cards.map((card, at) => {
    const declared = card.declared.filter((on) => Number.isInteger(on) && before(on, at));
    return new Set(declared);
  });
  const paths = cards.map((card) => card.files.map(segmentsOf));
  order.forEach((later, at) => {
    for (const earlier of order.slice(0, at).reverse()) {
      const ordered = reaches(dependencies, later, earlier);
      if (!ordered && overlap(paths[earlier] ?? [], paths[later] ?? [])) {
        dependencies[later]?.add(earlier);
      }
    }
  });
  return dependencies.map((each) => [...each].sort((a, b) => a - b));
}

function phaseOf(cards: readonly OrderedCard[], at: number): number {
  return cards[at]?.phase ?? 0;
}

/** A card as the groups see it. */
export interface GroupedCard {
  readonly id: string;
  readonly phase: number;
  readonly dependsOn: readonly string[];
}

/**
 * The cards of a phase in the groups that can run together, earliest first: a card is one group
 * after the latest group of the cards of its phase it waits for. What it waits for in an earlier
 * phase is done by then.
 */
// RF-634
export function parallelGroups(cards: readonly GroupedCard[], phase: number): string[][] {
  const own = cards.filter((card) => card.phase === phase);
  const byId = new Map(own.map((card) => [card.id, card]));
  const levels = new Map<string, number>();
  const levelOf = (card: GroupedCard, path: ReadonlySet<string>): number => {
    const known = levels.get(card.id);
    if (known !== undefined) return known;
    const waits = card.dependsOn.flatMap((id) => {
      const other = byId.get(id);
      return other === undefined || path.has(id)
        ? []
        : [levelOf(other, new Set([...path, card.id]))];
    });
    const level = waits.length === 0 ? 0 : Math.max(...waits) + 1;
    levels.set(card.id, level);
    return level;
  };
  const groups: string[][] = [];
  for (const card of own) (groups[levelOf(card, new Set())] ??= []).push(card.id);
  return groups;
}
