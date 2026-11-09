import type { PlanContent } from './plan-content.js';
import type { CoverageItem } from './plan-coverage.js';
import type { GapLeftOut } from './plan-gap.js';

// P8-95, RF-627: the links of a gap answer to task cards the plan already has (skeleton; the
// behaviour comes with the fix).

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

// P8-95
export function linkGapItems(
  content: PlanContent,
  links: readonly GapLinkDraft[],
  uncovered: readonly CoverageItem[],
  cards: readonly string[],
): LinkedGap {
  // The skeleton takes no link.
  const known = new Set(cards);
  const open = new Set(uncovered.map((each) => each.id));
  const linked = links.filter((link) => known.has(link.task) && open.size < 0);
  return { content, linked, dropped: [] };
}
