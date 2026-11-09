import type { PlanContent, PlanTask } from './plan-content.js';
import { isMigrationCard, type CoverageItem } from './plan-coverage.js';
import type { GapLeftOut } from './plan-gap.js';

// P8-95, RF-627, RF-623, ADR-013, EV-95: a gap answer may say that an item of its block is work a
// task card of the plan already does, by linking the item to that card's `T-` id, instead of
// writing a card that repeats it. Without this the planner could only write nothing for such an
// item (the eShop plan of EV-95: four create, edit and delete journeys of other legacy front ends
// beside a card that creates, edits and deletes catalog items), and the item stayed a gap with no
// card left out to repair. The answer is untrusted: a link counts only for a card the plan had
// before the round (never one the same answer adds, never the card code writes for the
// migrations) and only for the ids of the block; what it builds is added after the card's own
// builds, in the order of the block. A link that does neither is dropped with its position and
// field, never with text of the answer, and the items it named stay gaps.

/** A link of the gap answer: its position in `links` (from 1), the card's `T-` id and the item ids. */
export interface GapLinkDraft {
  readonly position: number;
  readonly task: string;
  readonly builds: readonly string[];
}

/** The items a link gave a card of the plan. */
export interface GapLinked {
  readonly task: string;
  readonly builds: readonly string[];
}

export interface LinkedGap {
  readonly content: PlanContent;
  readonly linked: readonly GapLinked[];
  readonly dropped: readonly GapLeftOut[];
}

const UNKNOWN_CARD = 'names no task card of the plan';
const MIGRATIONS = 'names the card that writes the database migrations';
const NO_ITEM = 'names no item that is still built by no task card';

/** Why the link is dropped, as the field and a fixed phrase; undefined when it is kept. */
function faultOf(
  card: PlanTask | undefined,
  builds: readonly string[],
): { readonly field: string; readonly reason: string } | undefined {
  if (card === undefined) return { field: 'task', reason: UNKNOWN_CARD };
  if (isMigrationCard(card)) return { field: 'task', reason: MIGRATIONS };
  return builds.length === 0 ? { field: 'builds', reason: NO_ITEM } : undefined;
}

/** The card with the items added after its own builds, each id once. */
function withBuilds(task: PlanTask, added: readonly string[]): PlanTask {
  const own = new Set(task.builds);
  return { ...task, builds: [...task.builds, ...added.filter((id) => !own.has(id))] };
}

/**
 * The plan with the items of the block each link names added to its card. `cards` are the ids of
 * the cards the plan had before the gap round.
 */
// P8-95, RF-627
export function linkGapItems(
  content: PlanContent,
  links: readonly GapLinkDraft[],
  uncovered: readonly CoverageItem[],
  cards: readonly string[],
): LinkedGap {
  const before = new Set(cards);
  const linked: GapLinked[] = [];
  const dropped: GapLeftOut[] = [];
  for (const link of links) {
    const card = before.has(link.task)
      ? content.tasks.find((task) => task.id === link.task)
      : undefined;
    const named = new Set(link.builds);
    const builds = uncovered.filter((item) => named.has(item.id)).map((item) => item.id);
    const fault = faultOf(card, builds);
    if (fault === undefined) linked.push({ task: link.task, builds });
    else dropped.push({ position: link.position, ...fault, builds: link.builds });
  }
  if (linked.length === 0) return { content, linked, dropped };
  const tasks = content.tasks.map((task) =>
    withBuilds(
      task,
      linked.filter((link) => link.task === task.id).flatMap((link) => link.builds),
    ),
  );
  return { content: { ...content, tasks }, linked, dropped };
}
