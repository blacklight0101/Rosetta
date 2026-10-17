/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
import type { Card } from '../cards/card.js';
import type { Overview, OverviewSection, OverviewSectionId } from './overview.js';

// RF-264: red stub, replaced by the implementation in the next commit.

export type OverviewDraft = Readonly<
  Record<OverviewSectionId, readonly { readonly text: string; readonly cards: readonly string[] }[]>
>;

export interface BuiltSections {
  readonly sections: readonly OverviewSection[];
  readonly dropped: number;
}

export function sectionsOf(draft: OverviewDraft, shown: readonly Card[]): BuiltSections {
  return { sections: [], dropped: 0 };
}

export function noticeOverview(
  state: Exclude<Overview['state'], 'full'>,
  notice: string,
  notCovered: readonly string[],
): Overview {
  return { state, sections: [], notCovered, questions: [] };
}
