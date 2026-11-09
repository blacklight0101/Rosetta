import { z } from 'zod';
import type { GapLinkDraft } from '../../domain/planning/gap-links.js';
import type { GapDraft } from '../../domain/planning/plan-gap.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { gapTaskSchema } from './plan-answer.js';
import { salvageLinks, salvageTasks, UnreadableCard } from './gap-salvage.js';
import { readEntries } from './list-entries.js';

// Q-45, Q-54, RF-627, RF-630, ADR-013: the planner's task cards for the items no card builds are
// untrusted text. They are read as one JSON object (fenced or inside prose, like the other planner
// answers) with every list and text bounded, a card being a card of the plan's own answer plus the
// ids it builds. A card that cannot be read is left out and the others stay, and what is left out
// is reported by position, field and a fixed reason, never with a word of the answer (the log and
// the repair attempt use it); which ids are gaps, and whether a card is a card an agent can build,
// is decided by the domain (plan-gap.ts), not here. An answer with no card (`"tasks": []`) is an
// answer; one without a `tasks` list is not. P7-14: a `dependsOn` entry that does not read is
// dropped and counted, never the card; an answer that is not JSON as a whole is read card by card
// (gap-salvage.ts). P8-95: the answer may also link items to cards the plan has, in a `links` list
// read link by link the same way; an answer without one reads as before.

const MAX_CARDS = 50;
const MAX_LINKS = 100;
const MAX_BUILDS = 500;
const ID = 300;

const gapTask = gapTaskSchema
  .omit({ needs: true })
  .extend({ builds: z.array(z.string().max(ID)).max(MAX_BUILDS) });

const answer = z.object({
  tasks: z.array(z.unknown()).max(MAX_CARDS),
  links: z.unknown().optional(),
});

/** P8-95: a link of the answer: the `T-` id of a card of the plan and the item ids it builds. */
const gapLink = z.object({
  task: z.string().max(ID),
  builds: z.array(z.string().max(ID)).max(MAX_BUILDS),
});

/** What a card that cannot be read still says: the ids it names, to see whether it named a gap. */
const named = z.object({ builds: z.array(z.unknown()) });

/** A card of the answer that could not be read: its position (from 1), the field and why. */
export interface GapProblem {
  readonly position: number;
  /** The first field that was wrong, or `card` when the card is not an object. */
  readonly field: string;
  /** A fixed phrase for the kind of fault; it holds no text of the answer. */
  readonly reason: string;
  /** The ids the card named in `builds`, when that list was readable. */
  readonly builds: readonly string[];
}

/** P7-14: a card that was kept although `count` entries of its list `field` were dropped. */
export interface GapEntries {
  readonly position: number;
  readonly field: string;
  readonly count: number;
}

export interface GapAnswer {
  readonly drafts: GapDraft[];
  /** The position in the answer (from 1) of each draft, so a later fault names the right card. */
  readonly positions: number[];
  readonly problems: GapProblem[];
  /** P7-14: the cards kept with entries dropped from a list. */
  readonly entries: GapEntries[];
  /** P7-14: set when the answer was not JSON as a whole and its cards were read one by one. */
  readonly salvaged?: true;
  /** RF-627: set when the single-item rule gave the one card that named no builds the one item. */
  readonly singleItemRule?: string;
  /** P8-95: the links to cards of the plan, set when the answer has a `links` list. */
  readonly links?: GapLinkDraft[];
  /** P8-95: the links that could not be read, by position in `links`, field and a fixed reason. */
  readonly linkProblems?: GapProblem[];
  /** P8-96: set when the answer's `links` value is not a list; it is dropped whole. */
  readonly linksNotList?: true;
  /** P8-96: how many links past the first 100 were dropped, when any were. */
  readonly linksPastMax?: number;
}

function reasonOf(code: string): string {
  if (code === 'too_big') return 'is above its maximum';
  if (code === 'too_small') return 'is empty or below its minimum';
  if (code === 'invalid_type' || code === 'invalid_union') return 'has the wrong type or shape';
  return 'is not valid';
}

function namedIds(card: unknown): string[] {
  const parsed = named.safeParse(card);
  if (!parsed.success) return [];
  const texts = parsed.data.builds.flatMap((each) =>
    typeof each === 'string' && each.length <= ID ? [each] : [],
  );
  return texts.slice(0, MAX_BUILDS);
}

function problemOf(position: number, error: z.ZodError, card: unknown, whole = 'card'): GapProblem {
  const issue = error.issues[0];
  const first = issue?.path[0];
  const field = typeof first === 'string' ? first : whole;
  return { position, field, reason: reasonOf(issue?.code ?? ''), builds: namedIds(card) };
}

/** RF-627: a card with no valid builds for the block: its list is missing, empty or names no item of the block (the one item given). */
function namesNoBuilds(card: unknown, item: string): boolean {
  if (typeof card !== 'object' || card === null) return false;
  return !('builds' in card) || !Array.isArray(card.builds) || !card.builds.includes(item);
}

/** RF-627: the card with the one item it builds in place of the builds it did not name. */
function buildingOnly(card: unknown, item: string): unknown {
  return typeof card === 'object' && card !== null ? { ...card, builds: [item] } : card;
}

/** P7-14: how many entries of the card's `dependsOn` were dropped while it was read. */
function droppedEntries(card: unknown, kept: number): number {
  if (typeof card !== 'object' || card === null || !('dependsOn' in card)) return 0;
  return Array.isArray(card.dependsOn) ? card.dependsOn.length - kept : 0;
}

/** P7-15: the card kept, its `requirements` read entry by entry, and what changed in its lists. */
function keep(
  answer: GapAnswer,
  position: number,
  data: z.infer<typeof gapTask>,
  droppedDepends: number,
): void {
  const read = readEntries(data.requirements, true);
  const requirements = [...read.positions];
  const cards = read.cards.length === 0 ? {} : { requirementCards: [...read.cards] };
  answer.drafts.push({ ...data, requirements, ...cards });
  answer.positions.push(position);
  if (droppedDepends > 0)
    answer.entries.push({ position, field: 'dependsOn', count: droppedDepends });
  if (read.dropped > 0) {
    answer.entries.push({ position, field: 'requirements', count: read.dropped });
  }
}

function readCards(cards: readonly unknown[], uncoveredItem: string | undefined): GapAnswer {
  const single =
    uncoveredItem !== undefined && cards.length === 1 && namesNoBuilds(cards[0], uncoveredItem)
      ? uncoveredItem
      : undefined;
  const answer: GapAnswer = { drafts: [], positions: [], problems: [], entries: [] };
  cards.forEach((each, index) => {
    const position = index + 1;
    if (each instanceof UnreadableCard) {
      const builds = [...each.builds];
      answer.problems.push({ position, field: 'card', reason: 'is not valid JSON', builds });
      return;
    }
    const card = gapTask.safeParse(single === undefined ? each : buildingOnly(each, single));
    if (!card.success) {
      answer.problems.push(problemOf(position, card.error, each));
      return;
    }
    keep(answer, position, card.data, droppedEntries(each, card.data.dependsOn.length));
  });
  return single === undefined ? answer : { ...answer, singleItemRule: single };
}

/** P8-95: the answer with its links read one by one; as it was when it has no `links` list. */
function withLinks(read: GapAnswer, list: unknown): GapAnswer {
  if (!Array.isArray(list)) return read;
  const links: GapLinkDraft[] = [];
  const linkProblems: GapProblem[] = [];
  list.slice(0, MAX_LINKS).forEach((each: unknown, index) => {
    const position = index + 1;
    const link = gapLink.safeParse(each);
    if (link.success) links.push({ position, ...link.data });
    else linkProblems.push(problemOf(position, link.error, each, 'link'));
  });
  return { ...read, links, linkProblems };
}

// Q-45, Q-54, RF-627, P7-14, P8-95: `uncoveredItem` is the one item the block holds, when it holds exactly one.
export function parseGapAnswer(output: string, uncoveredItem?: string): GapAnswer | undefined {
  const text = output.slice(0, cardLimits.maxOutputChars);
  for (const value of searchJson(text).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) {
      return withLinks(readCards(parsed.data.tasks, uncoveredItem), parsed.data.links);
    }
  }
  const salvaged = salvageTasks(text, MAX_CARDS);
  if (salvaged === undefined) return undefined;
  const read = { ...readCards(salvaged, uncoveredItem), salvaged: true as const };
  return withLinks(read, salvageLinks(text));
}
