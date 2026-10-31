import { describe, expect, it } from 'vitest';
import { mergedInto, oq } from '../../support/consolidated-world.js';
import { familyWorld, threeOptions } from '../../support/question-family-world.js';

// RF-646, RF-1007, RF-614, RF-615, DEC-179, data-model.md section 3.16: the questions of an understand
// run and of the Deepens linked to it are one list for the project. Duplicates saved before DEC-179
// are merged on read by the merge record of the cards and by asking-the-same, every answer is kept,
// the newer answer wins and the older one is kept in the history of `answers.md`. No section is
// deleted. Every reader of the questions (the answers page, the plan inputs, the journey) says the same.

const cancel = 'Who may cancel a paid order?';
const cancelAgain = 'who may cancel a paid order';
const keyOf = (index: number): string => `2026101${String(index)}-090000-understand`;
const headings = (text: string): number => (text.match(/^## /gmu) ?? []).length;

/** The first run asked it; the Deepen copied the card and its reader asked it again in its own words. */
async function askedTwice(first: string, second: string) {
  return familyWorld([
    {
      cards: [oq('OQ-001', cancel), oq('OQ-002', 'Does a refund follow a cancellation?')],
      sections: [
        { id: 'OQ-001', question: cancel, answer: first },
        { id: 'OQ-002', question: 'Does a refund follow a cancellation?' },
      ],
    },
    {
      deepens: 0,
      cards: [
        oq('OQ-001', cancel),
        oq('OQ-002', 'Does a refund follow a cancellation?'),
        oq('OQ-005', cancelAgain),
      ],
      sections: [{ id: 'OQ-005', question: cancelAgain, answer: second }],
    },
  ]);
}

describe('RF-646 one list across an understand run and its Deepens', () => {
  it('RF-646 lists a question asked in a run and again in its Deepen once, from either run', async () => {
    const world = await askedTwice('Managers only', '');

    for (const index of [0, 1]) {
      const { questions } = await world.list(index);
      expect(questions.map((each) => each.cardId)).toEqual(['OQ-001', 'OQ-002']);
      expect(questions[0]?.answer).toBe('Managers only');
      expect(questions[0]?.runs).toEqual([keyOf(0), keyOf(1)]);
    }
  });

  it('RF-646 says whether the run has Deepens and whether it is one', async () => {
    const world = await askedTwice('', '');

    expect(await world.list(0)).toMatchObject({ deepens: 1, isDeepen: false, deepening: false });
    expect(await world.list(1)).toMatchObject({ deepens: 1, isDeepen: true, deepening: false });
  });

  it('RF-646 counts a Deepen only once it has ended, so the questions wait for it', async () => {
    const world = await familyWorld([
      { cards: [oq('OQ-001', cancel)], sections: [{ id: 'OQ-001', question: cancel }] },
      { deepens: 0, cards: [oq('OQ-001', cancel)], sections: [], running: true },
    ]);

    expect(await world.list(0)).toMatchObject({ deepens: 0, isDeepen: false, deepening: true });
    expect(await world.journey(0)).toMatchObject({ deepens: 0, isDeepen: false, deepening: true });
  });

  it('RF-646 RF-1007 merges by the merge record of the cards: a survivor answered under a merged-away id', async () => {
    const world = await familyWorld([
      { cards: [oq('OQ-001', cancel)], sections: [{ id: 'OQ-001', question: cancel }] },
      {
        deepens: 0,
        cards: mergedInto(
          [oq('OQ-001', cancel), oq('OQ-005', 'Which roles cancel an order?')],
          ['OQ-001', 'OQ-005'],
        ).filter((card) => card.type === 'OQ'),
        sections: [
          { id: 'OQ-005', question: 'Which roles cancel an order?', answer: 'Managers only' },
        ],
      },
    ]);

    const { questions } = await world.list(0);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ cardId: 'OQ-001', answer: 'Managers only' });
  });
});

describe('RF-646 two questions are not one', () => {
  it('RF-646 keeps two different questions apart', async () => {
    const world = await familyWorld([
      { cards: [oq('OQ-001', cancel)], sections: [{ id: 'OQ-001', question: cancel }] },
      {
        deepens: 0,
        cards: [oq('OQ-001', cancel), oq('OQ-006', 'Who may refund an order?')],
        sections: [{ id: 'OQ-006', question: 'Who may refund an order?' }],
      },
    ]);

    expect((await world.list(1)).questions.map((each) => each.cardId)).toEqual([
      'OQ-001',
      'OQ-006',
    ]);
  });
});

describe('RF-646 DEC-179 questions saved before the change', () => {
  it('RF-646 keeps both answers: the newer wins, the older is kept in the history of answers.md', async () => {
    const world = await askedTwice('Managers only', 'Any staff');

    const { questions } = await world.list(1);
    expect(questions[0]).toMatchObject({ answer: 'Any staff' });
    expect(questions[0]?.history).toEqual([{ runKey: keyOf(0), answer: 'Managers only' }]);
    const text = world.answersText();
    expect(text).toContain(`- History: ${keyOf(0)}: Managers only`);
    expect(text).toContain(`- Runs: runs/${keyOf(0)}, runs/${keyOf(1)}`);
  });

  it('RF-646 deletes no section and does not repeat the history on the next read', async () => {
    const world = await askedTwice('Managers only', 'Any staff');
    const before = headings(world.answersText());

    await world.list(1);
    const once = world.answersText();
    await world.list(0);

    expect(headings(once)).toBe(before);
    expect(world.answersText()).toBe(once);
    expect(once.match(/^- History:/gmu)).toHaveLength(1);
  });

  it('RF-646 an answer that is only in the older run still shows on the list of the Deepen', async () => {
    const world = await askedTwice('Managers only', '');

    expect((await world.list(1)).questions[0]?.answer).toBe('Managers only');
  });
});

describe('RF-1007 RF-646 saving an answer of the one list', () => {
  it('RF-1007 writes the answer into the section that holds the question, whichever run the page is on', async () => {
    const world = await askedTwice('', '');

    const saved = await world.record(1, [{ cardId: 'OQ-001', answer: 'Managers only' }]);

    expect(saved.ok && saved.value[0]?.answer).toBe('Managers only');
    expect(world.answersText()).toContain('- Answer: Managers only');
    expect((await world.list(0)).questions[0]?.answer).toBe('Managers only');
  });

  it('RF-646 an edit replaces the answer that wins and the older answer stays in the history', async () => {
    const world = await askedTwice('Managers only', 'Any staff');

    await world.record(0, [{ cardId: 'OQ-001', answer: 'Nobody' }]);

    const { questions } = await world.list(1);
    expect(questions[0]?.answer).toBe('Nobody');
    expect(headings(world.answersText())).toBe(3);
  });

  it('RF-1007 an empty answer clears the question in every section that holds it', async () => {
    const world = await askedTwice('Managers only', 'Any staff');

    await world.record(0, [{ cardId: 'OQ-001', answer: '' }]);

    expect((await world.list(1)).questions[0]?.answer).toBe('');
    expect((await world.list(0)).questions[0]?.answer).toBe('');
  });
});

describe('RF-1007 RF-241 refusing and reopening', () => {
  it('RF-1007 refuses an id the list has no question for and writes nothing', async () => {
    const world = await askedTwice('', '');
    const before = world.answersText();

    const saved = await world.record(1, [{ cardId: 'OQ-099', answer: 'x' }]);

    expect(saved).toEqual({ ok: false, error: 'unknown-question' });
    expect(world.answersText()).toBe(before);
  });

  it('RF-241 RF-646 reopens a question in every run that marked it Answered', async () => {
    const world = await familyWorld([
      {
        cards: [oq('OQ-001', cancel)],
        sections: [{ id: 'OQ-001', question: cancel, answer: 'x' }],
        answered: ['OQ-001'],
      },
      { deepens: 0, cards: [oq('OQ-001', cancel)], sections: [], answered: ['OQ-001'] },
    ]);
    expect((await world.list(1)).questions[0]?.state).toBe('Answered');

    const reopened = await world.reopen(1, 'OQ-001');

    expect(reopened.ok && reopened.value[0]?.state).toBe('Open');
    expect((await world.list(0)).questions[0]?.state).toBe('Open');
  });
});

describe('RF-645 RF-646 a survivor with no section of its own', () => {
  const merged = () =>
    familyWorld([
      { cards: [oq('OQ-009', 'Unrelated question about invoices?')], sections: [] },
      {
        deepens: 0,
        cards: mergedInto(
          [oq('OQ-001', cancel), oq('OQ-005', 'Which roles cancel an order?')],
          ['OQ-001', 'OQ-005'],
        ).filter((card) => card.type === 'OQ'),
        sections: [
          {
            id: 'OQ-005',
            question: 'Which roles cancel an order?',
            options: threeOptions,
            chosen: '',
          },
        ],
      },
    ]);

  it('RF-645 offers the suggested answers of the section it absorbed', async () => {
    const world = await merged();

    const survivor = (await world.list(1)).questions.find((each) => each.cardId === 'OQ-001');
    expect(survivor?.options).toEqual(threeOptions);
  });

  it('RF-645 writes the fresh section with its options, so a chosen option can be saved', async () => {
    const world = await merged();

    const saved = await world.record(1, [{ cardId: 'OQ-001', answer: '', chosen: 2 }]);

    expect(saved.ok && saved.value.find((each) => each.cardId === 'OQ-001')).toMatchObject({
      answer: 'Any staff',
      chosen: '2',
    });
    expect(world.answersText()).toContain(`## OQ-001 - ${cancel}`);
  });
});

describe('RF-614 RF-615 the plan and the journey use the one list', () => {
  it('RF-614 the plan inputs hold the question once, with its answer', async () => {
    const world = await askedTwice('Managers only', 'Any staff');

    const questions = await world.planQuestions(1);
    expect(questions.map((each) => each.cardId)).toEqual(['OQ-001', 'OQ-002']);
    expect(questions[0]?.answer).toBe('Any staff');
  });

  it('RF-615 the journey counts the open questions of the one list and knows the Deepens', async () => {
    const world = await askedTwice('Managers only', '');

    const source = await world.journey(1);
    expect(source).toMatchObject({ openQuestions: 1, deepens: 1, isDeepen: true });
    expect(await world.journey(0)).toMatchObject({ openQuestions: 1, deepens: 1, isDeepen: false });
  });
});
