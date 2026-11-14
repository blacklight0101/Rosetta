// RF-1412, RF-264: what an overview answer keeps of its cards, with no model. A statement counts
// as the run counts it (`sectionsOf`): it has text and links at least one card the case lists.

import type { OverviewDraft } from '../../../domain/overview/build-overview.js';

export type OverviewLabel = 'Empty' | 'Lumped' | 'Missed' | 'Written';

interface Listed {
  readonly id: string;
  readonly type: string;
  readonly area: string;
}

/** The section that holds the cards of a type; the other types have none. */
const SECTION_OF: Readonly<Record<string, string>> = {
  FEAT: 'features',
  SCRN: 'screens',
  ENT: 'data',
  INT: 'integrations',
};

/** The kept statements of each section, each with the listed ids it links. */
function keptOf(cards: readonly Listed[], draft: OverviewDraft): Map<string, Set<string>[]> {
  const listed = new Set(cards.map((card) => card.id));
  const kept = new Map<string, Set<string>[]>();
  for (const [section, statements] of Object.entries(draft)) {
    const links = statements
      .filter((each) => each.text.trim() !== '')
      .map((each) => new Set(each.cards.filter((id) => listed.has(id))))
      .filter((ids) => ids.size > 0);
    kept.set(section, links);
  }
  return kept;
}

function missed(cards: readonly Listed[], kept: Map<string, Set<string>[]>): boolean {
  const linked = new Set([...kept.values()].flatMap((list) => list.flatMap((ids) => [...ids])));
  const unreached = cards.some(
    (card) => !cards.some((other) => other.area === card.area && linked.has(other.id)),
  );
  const unfilled = cards.some((card) => {
    const section = SECTION_OF[card.type];
    if (section === undefined) return false;
    const types = new Map(cards.map((other) => [other.id, other.type]));
    return !(kept.get(section) ?? []).some((ids) =>
      [...ids].some((id) => types.get(id) === card.type),
    );
  });
  return unreached || unfilled;
}

/** The first label that applies to the draft the answer holds. */
// RF-1412
export function checkOverview(cards: readonly Listed[], draft: OverviewDraft): OverviewLabel {
  const kept = keptOf(cards, draft);
  const all = [...kept.values()].flat();
  if (all.length === 0) return 'Empty';
  if (cards.length >= 4 && all.some((ids) => ids.size === cards.length)) return 'Lumped';
  return missed(cards, kept) ? 'Missed' : 'Written';
}
