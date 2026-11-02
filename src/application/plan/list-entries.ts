import type { EntryNote } from '../../domain/planning/plan-draft.js';
import { listedPosition } from './list-positions.js';

// P7-15, EV-67, RF-601, RF-627, ADR-013: a list of requirements or dependsOn in a task card is read
// entry by entry, never as a whole. A position (a number, an object holding one, or a string of
// digits) is a position; in `requirements` a string that looks like a source card id ("FEAT-114")
// names the requirements that cite that card; any other entry is dropped and counted. The card is
// kept. What was mapped or dropped is reported by card position, field and count with a fixed
// reason, never with a word of the answer (checks.md and the log use it).

const CARD_ID = /^[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)+$/u;
const CARD_ID_LENGTH = 40;

/** The entries of one list: positions, card ids and the number of entries that were neither. */
export interface ListEntries {
  readonly positions: readonly number[];
  readonly cards: readonly string[];
  readonly dropped: number;
}

/** Reads each entry on its own; card ids are taken only when `cards` is set. */
export function readEntries(raw: readonly unknown[], cards: boolean): ListEntries {
  const positions: number[] = [];
  const ids: string[] = [];
  let dropped = 0;
  for (const each of raw) {
    const read = listedPosition.safeParse(each);
    if (read.success) positions.push(read.data);
    else if (cards && typeof each === 'string' && isCardId(each)) ids.push(each);
    else dropped += 1;
  }
  return { positions, cards: ids, dropped };
}

function isCardId(text: string): boolean {
  return text.length <= CARD_ID_LENGTH && CARD_ID.test(text);
}

/** Where the entries of a package card point: the plan's own lists, as the answer wrote them. */
export interface EntryMoves {
  /** Where a requirement position of the answer moved to, or undefined when its item was left out. */
  readonly requirement: (position: number) => number | undefined;
  /** The requirement positions that cite the source card `id`. */
  readonly citing: (id: string) => readonly number[];
}

/** The list as positions, with the number of card ids that mapped and of entries dropped. */
interface ResolvedList {
  readonly positions: number[];
  readonly mapped: number;
  readonly dropped: number;
}

/** The `requirements` of a package card: positions moved, card ids mapped, the rest dropped. */
function resolveRequirements(raw: readonly unknown[], moves: EntryMoves): ResolvedList {
  const positions: number[] = [];
  let mapped = 0;
  let dropped = 0;
  for (const each of raw) {
    const read = readEntries([each], true);
    const [at] = read.positions;
    const [card] = read.cards;
    const cited = card === undefined ? [] : moves.citing(card);
    if (at !== undefined) {
      const to = moves.requirement(at);
      if (to !== undefined) positions.push(to);
    } else if (cited.length > 0) {
      positions.push(...cited);
      mapped += 1;
    } else dropped += 1;
  }
  return { positions: [...new Set(positions)], mapped, dropped };
}

/** The requirement positions (from 1) that cite each source card id, as a lookup. */
export function citingOf(
  items: readonly { readonly sources: readonly string[] }[],
): (id: string) => readonly number[] {
  const cited = new Map<string, number[]>();
  items.forEach((item, index) => {
    for (const id of item.sources) cited.set(id, [...(cited.get(id) ?? []), index + 1]);
  });
  return (id) => cited.get(id) ?? [];
}
/** The `dependsOn` of a package card: positions kept, every other entry dropped. */
function resolveDependsOn(raw: readonly unknown[]): ResolvedList {
  const read = readEntries(raw, false);
  return { positions: [...read.positions], mapped: 0, dropped: read.dropped };
}

/** The `requirements` and `dependsOn` of the card at `position`, read entry by entry (P7-15). */
export function readLists(
  position: number,
  card: { readonly requirements: readonly unknown[]; readonly dependsOn: readonly unknown[] },
  moves: EntryMoves,
  notes: EntryNote[],
): { readonly requirements: number[]; readonly dependsOn: number[] } {
  const requirements = resolveRequirements(card.requirements, moves);
  const dependsOn = resolveDependsOn(card.dependsOn);
  for (const [field, found] of [
    ['requirements', requirements],
    ['dependsOn', dependsOn],
  ] as const) {
    const { mapped, dropped } = found;
    if (mapped + dropped > 0) notes.push({ card: position, field, mapped, dropped });
  }
  return { requirements: requirements.positions, dependsOn: dependsOn.positions };
}

/** The log line for a card kept with entries mapped or dropped: its place, field and counts only. */
export function entryNoteMessage(note: EntryNote): string {
  const { card, field, mapped, dropped } = note;
  return `Task card at position ${String(card)} of the plan answer was kept; in its field "${field}", ${String(mapped)} source card id(s) were mapped to requirements and ${String(dropped)} entr${dropped === 1 ? 'y was' : 'ies were'} dropped.`;
}
