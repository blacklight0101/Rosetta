// RF-1412, RF-250: what a merge answer does to the ids and the text of its cards, with no model.
// The run's own code keeps every claim and citation of a merged card, so the check guards the ids
// (as `card-merge.ts` refuses them), the lump that merges unlike cards, and the merged text that
// does not name one of its cards.

export interface MergeAsked {
  readonly ids: readonly string[];
  readonly title: string;
  readonly summary: string;
}

export type MergeLabel = 'Invalid' | 'Lumped' | 'Thin' | 'Merges' | 'NoMerge';

interface Listed {
  readonly id: string;
  readonly title: string;
}

/** The words of four letters or more, without case. */
function wordsOf(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).map((word) => word));
}

function invalid(cards: readonly Listed[], merges: readonly MergeAsked[]): boolean {
  const listed = new Set(cards.map((card) => card.id));
  const used = new Set<string>();
  for (const merge of merges) {
    if (merge.ids.length < 2 || new Set(merge.ids).size !== merge.ids.length) return true;
    for (const id of merge.ids) {
      if (!listed.has(id) || used.has(id)) return true;
      used.add(id);
    }
  }
  return false;
}

function thin(cards: readonly Listed[], merge: MergeAsked): boolean {
  const said = wordsOf(`${merge.title} ${merge.summary}`);
  return merge.ids.some((id) => {
    const own = wordsOf(cards.find((card) => card.id === id)?.title ?? '');
    return own.size > 0 && ![...own].some((word) => said.has(word));
  });
}

/** The first label that applies to the merges the answer asks for. */
// RF-1412
export function checkMerges(cards: readonly Listed[], merges: readonly MergeAsked[]): MergeLabel {
  if (invalid(cards, merges)) return 'Invalid';
  if (cards.length >= 4 && merges.some((merge) => merge.ids.length * 2 > cards.length)) {
    return 'Lumped';
  }
  if (merges.some((merge) => thin(cards, merge))) return 'Thin';
  return merges.length > 0 ? 'Merges' : 'NoMerge';
}
