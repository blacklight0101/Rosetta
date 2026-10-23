import { describe, expect, it } from 'vitest';
import type { RecordedQuestion } from '../../../../src/application/ports/answers-file.js';
import {
  consolidatedQuestions,
  survivorsOf,
  unfiledQuestions,
  type MergeCard,
} from '../../../../src/application/understand/consolidated-questions.js';

// P5-11, RF-243, RF-1007: the map from a merged-away open question to its survivor is the survivor's
// `mergedFrom`; the consolidated set is the filed set seen through that map.

function card(id: string, question: string, mergedFrom?: readonly string[]): MergeCard {
  return {
    ...{ id, type: 'OQ', title: question, question, claims: [`claim of ${id}`] },
    ...(mergedFrom === undefined ? {} : { mergedFrom }),
  };
}

function filed(cardId: string, question: string, answer = ''): RecordedQuestion {
  return { cardId, question, context: `ctx ${cardId}`, answer };
}

const merged = [card('OQ-001', 'Who may cancel?', ['OQ-001', 'OQ-002', 'OQ-003'])];

describe('the map of merged-away questions', () => {
  it('P5-11 maps every absorbed id to the card that lists it, not the card itself', () => {
    expect([...survivorsOf(merged)]).toEqual([
      ['OQ-002', 'OQ-001'],
      ['OQ-003', 'OQ-001'],
    ]);
  });

  it('P5-11 ignores a card that is not an open question and an id that is still a card', () => {
    const cards = [
      ...merged,
      { ...card('BR-001', 'x', ['BR-001', 'BR-002']), type: 'BR' as const },
      card('OQ-002', 'Still here'),
    ];

    expect([...survivorsOf(cards)]).toEqual([['OQ-003', 'OQ-001']]);
  });
});

describe('the consolidated question set', () => {
  it('P5-11 takes the first filled answer in merge order, not in file order', () => {
    const asked = [
      filed('OQ-003', 'c', 'three'),
      filed('OQ-001', 'a'),
      filed('OQ-002', 'b', 'two'),
    ];

    const [only, ...rest] = consolidatedQuestions(asked, merged);

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ cardId: 'OQ-001', question: 'a', answer: 'two' });
  });

  it('P5-11 reads a blank answer of the survivor as none', () => {
    const asked = [filed('OQ-001', 'a', '   '), filed('OQ-002', 'b', 'two')];

    expect(consolidatedQuestions(asked, merged).map((each) => each.answer)).toEqual(['two']);
  });
});

describe('the consolidated question set, unmerged and unfiled', () => {
  it('P5-11 lists the file as it is when no card was merged', () => {
    const asked = [filed('OQ-002', 'b'), filed('OQ-001', 'a')];
    const cards = [card('OQ-001', 'a'), card('OQ-002', 'b')];

    expect(consolidatedQuestions(asked, cards)).toEqual(asked);
    expect(consolidatedQuestions(asked, [])).toEqual(asked);
  });

  it('P5-11 keeps a question whose card is gone and that no merge names', () => {
    const asked = [filed('OQ-009', 'Gone?'), filed('OQ-002', 'b')];

    expect(consolidatedQuestions(asked, merged).map((each) => each.cardId)).toEqual([
      'OQ-009',
      'OQ-001',
    ]);
  });

  it('P5-11 lists a survivor that no section stands for, once', () => {
    const asked = [filed('OQ-009', 'Elsewhere')];

    const listed = consolidatedQuestions(asked, merged);

    expect(listed.map((each) => [each.cardId, each.question, each.answer])).toEqual([
      ['OQ-009', 'Elsewhere', ''],
      ['OQ-001', 'Who may cancel?', ''],
    ]);
  });

  it('P5-11 asks for a section only for the listed questions the file lacks', () => {
    const asked = [filed('OQ-003', 'c', 'three'), filed('OQ-009', 'Elsewhere')];

    expect(unfiledQuestions(asked, merged, 'run-a')).toEqual([
      { cardId: 'OQ-001', runKey: 'run-a', question: 'Who may cancel?', context: 'ctx OQ-003' },
    ]);
    expect(unfiledQuestions([filed('OQ-001', 'a')], merged, 'run-a')).toEqual([]);
  });
});
