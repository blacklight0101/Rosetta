import type { Card } from '../cards/card.js';
import {
  OVERVIEW_SECTIONS,
  type Overview,
  type OverviewCardRef,
  type OverviewSection,
  type OverviewSectionId,
  type OverviewStatement,
} from './overview.js';

// RF-264: what the summariser said, turned into sections. A statement keeps only the cards the
// summariser was shown; one left with no card is dropped, and the count of dropped statements is
// returned so the run can log it. A card id the model invented is never trusted.

export type OverviewDraft = Readonly<
  Record<OverviewSectionId, readonly { readonly text: string; readonly cards: readonly string[] }[]>
>;

export interface BuiltSections {
  readonly sections: readonly OverviewSection[];
  readonly dropped: number;
}

function refsOf(ids: readonly string[], shown: ReadonlyMap<string, Card>): OverviewCardRef[] {
  const refs: OverviewCardRef[] = [];
  for (const id of ids) {
    const card = shown.get(id);
    if (card !== undefined && !refs.some((ref) => ref.id === id)) {
      refs.push({ id, type: card.type });
    }
  }
  return refs;
}

/** The sections of a draft with only the statements that link a shown card. */
// RF-264
export function sectionsOf(draft: OverviewDraft, shown: readonly Card[]): BuiltSections {
  const byId = new Map(shown.map((card) => [card.id, card]));
  let dropped = 0;
  const sections: OverviewSection[] = [];
  for (const id of OVERVIEW_SECTIONS) {
    const statements: OverviewStatement[] = [];
    for (const each of draft[id]) {
      const text = each.text.trim();
      const cards = refsOf(each.cards, byId);
      if (text === '' || cards.length === 0) dropped += 1;
      else statements.push({ text, cards });
    }
    if (statements.length > 0) sections.push({ id, statements });
  }
  return { sections, dropped };
}

/** An overview that tells why it holds no statement and what to do next. */
// RF-264
export function noticeOverview(
  state: Exclude<Overview['state'], 'full'>,
  notice: string,
  notCovered: readonly string[],
): Overview {
  return { state, notice, sections: [], notCovered, questions: [] };
}
