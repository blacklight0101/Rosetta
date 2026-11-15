import { describe, expect, it } from 'vitest';
import { mergeCounts } from '../../../../../src/application/lab/targets/merge-check.js';

// RF-1412: the merged ids are counted, not the answers, so an answer with one more merge is seen.

const cards = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, title: id }));
const merge = (...ids: string[]) => ({ ids, title: 't', summary: 's' });

describe('the counts of a merge answer', () => {
  it('RF-1412 counts the merges, the ids they hold and the cards of the case', () => {
    expect(mergeCounts(cards, [merge('A', 'B'), merge('C', 'D', 'E')])).toEqual({
      merges: 2,
      mergedIds: 5,
      cards: 5,
    });
  });

  it('RF-1412 counts nothing for an empty answer', () => {
    expect(mergeCounts(cards, [])).toEqual({ merges: 0, mergedIds: 0, cards: 5 });
  });

  it('RF-1412 tells an answer with one more merged pair from the baseline', () => {
    const base = mergeCounts(cards, [merge('A', 'B')]);
    const more = mergeCounts(cards, [merge('A', 'B'), merge('C', 'D')]);

    expect(more.mergedIds - base.mergedIds).toBe(2);
  });
});
