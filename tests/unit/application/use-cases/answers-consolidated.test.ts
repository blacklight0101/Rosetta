import { describe, expect, it } from 'vitest';
import { mergedInto, oq, worldOf, type Filed } from '../../../support/consolidated-world.js';

// RF-243, RF-1007, RF-241, P5-11: the open questions of a run are the questions of the consolidated
// card set, whichever reader asks. The map from a merged-away question to its survivor is the
// `mergedFrom` of the surviving card; nothing is matched by words. Cards are made by the real merge.

const survivor = (reworded = 'Who may cancel an order?') =>
  mergedInto(
    [oq('OQ-001', reworded), oq('OQ-002', 'Who can cancel the order?')],
    ['OQ-001', 'OQ-002'],
  );

const first: Filed = { cardId: 'OQ-001', question: 'Who may cancel?' };
const second: Filed = {
  cardId: 'OQ-002',
  question: 'Who can cancel the order?',
  answer: 'The customer',
};
const secondOpen: Filed = { cardId: 'OQ-002', question: 'Who can cancel the order?' };
const both: readonly Filed[] = [first, second];

const rows = (list: readonly { cardId: string; answer: string }[]) =>
  list.map(({ cardId, answer }) => [cardId, answer]);

describe('the page lists the surviving questions', () => {
  it('P5-11 lists the survivor once, with the answer filed under the merged-away id', async () => {
    const world = await worldOf({ questions: survivor(), filed: both });

    expect(rows(await world.list())).toEqual([['OQ-001', 'The customer']]);
  });

  it('P5-11 keeps the answer of the survivor when both ids have one', async () => {
    const filed = [{ ...first, answer: 'Own answer' }, second];
    const world = await worldOf({ questions: survivor(), filed });

    expect(rows(await world.list())).toEqual([['OQ-001', 'Own answer']]);
  });

  it('P5-11 lists a reworded survivor the file holds no entry for, with the carried answer', async () => {
    const world = await worldOf({ questions: survivor(), filed: [second] });

    expect(rows(await world.list())).toEqual([['OQ-001', 'The customer']]);
  });

  it('P5-11 gives the same rows whichever order the file holds the entries', async () => {
    const forward = await worldOf({ questions: survivor(), filed: both });
    const backward = await worldOf({ questions: survivor(), filed: [...both].reverse() });

    expect(rows(await backward.list())).toEqual(rows(await forward.list()));
  });

  it('P5-11 lists two filed questions with the same words once each, in either file order', async () => {
    const filed = [
      { cardId: 'OQ-001', question: 'Who may cancel?' },
      { cardId: 'OQ-002', question: 'who may cancel', answer: 'The customer' },
    ];
    const cards = [oq('OQ-001', 'Who may cancel?'), oq('OQ-002', 'who may cancel')];
    const forward = await worldOf({ questions: cards, filed });
    const backward = await worldOf({ questions: cards, filed: [...filed].reverse() });

    expect(rows(await forward.list())).toEqual([
      ['OQ-001', ''],
      ['OQ-002', 'The customer'],
    ]);
    expect((await backward.list()).map((each) => each.cardId).sort()).toEqual(['OQ-001', 'OQ-002']);
    expect(rows(await backward.list()).sort()).toEqual(rows(await forward.list()).sort());
  });
});

describe('the page lists the questions the file holds by word', () => {
  it('P5-11 gives a punctuation-only question its own answer and no other', async () => {
    const world = await worldOf({
      questions: [oq('OQ-001', '???'), oq('OQ-002', '!!!')],
      filed: [
        { cardId: 'OQ-001', question: '???' },
        { cardId: 'OQ-002', question: '!!!', answer: 'secret answer to something else' },
      ],
    });

    expect(rows(await world.list())).toEqual([
      ['OQ-001', ''],
      ['OQ-002', 'secret answer to something else'],
    ]);
  });

  it('P5-11 carries an answer to a punctuation-only survivor by id, not by words', async () => {
    const cards = mergedInto([oq('OQ-001', '???'), oq('OQ-002', '!!!')], ['OQ-001', 'OQ-002']);
    const world = await worldOf({
      questions: [...cards, oq('OQ-003', '!!!')],
      filed: [
        { cardId: 'OQ-002', question: '!!!', answer: 'for the survivor' },
        { cardId: 'OQ-003', question: '! ! !' },
      ],
    });

    expect(rows(await world.list())).toEqual([
      ['OQ-001', 'for the survivor'],
      ['OQ-003', ''],
    ]);
  });

  it('P5-11 lists the file as it is when nothing was merged', async () => {
    const world = await worldOf({
      questions: [oq('OQ-001', 'Who may cancel?'), oq('OQ-002', 'Who can cancel the order?')],
      filed: both,
    });

    expect(rows(await world.list())).toEqual([
      ['OQ-001', ''],
      ['OQ-002', 'The customer'],
    ]);
  });
});

describe('saving an answer on the page', () => {
  it('P5-11 saves an answer to a survivor the file holds no entry for, and deletes nothing', async () => {
    const world = await worldOf({ questions: survivor(), filed: [second] });

    const saved = await world.record([{ cardId: 'OQ-001', answer: 'Staff only' }]);

    expect(saved.ok && rows(saved.value)).toEqual([['OQ-001', 'Staff only']]);
    expect(rows(await world.list())).toEqual([['OQ-001', 'Staff only']]);
    const filed = await world.answers.questionsOf(world.ref, world.run.runKey);
    expect(filed.map((each) => [each.cardId, each.answer])).toContainEqual([
      'OQ-002',
      'The customer',
    ]);
  });

  it('P5-11 saves an answer to a survivor whose text another section already holds', async () => {
    const cards = mergedInto(
      [oq('OQ-001', 'Who can cancel the order?'), oq('OQ-002', 'Who may cancel?')],
      ['OQ-001', 'OQ-002'],
    );
    const world = await worldOf({
      questions: cards,
      filed: [{ cardId: 'OQ-002', question: 'Who can cancel the order?' }],
    });

    const saved = await world.record([{ cardId: 'OQ-001', answer: 'Staff only' }]);

    expect(saved.ok && rows(saved.value)).toEqual([['OQ-001', 'Staff only']]);
  });

  it('P5-11 refuses a merged-away id and writes nothing', async () => {
    const world = await worldOf({ questions: survivor(), filed: both });

    const saved = await world.record([{ cardId: 'OQ-002', answer: 'changed' }]);

    expect(saved).toEqual({ ok: false, error: 'unknown-question' });
    const filed = await world.answers.questionsOf(world.ref, world.run.runKey);
    expect(filed.map((each) => each.answer)).toEqual(['', 'The customer']);
  });
});

describe('reopening a question', () => {
  it('P5-11 finds the survivor the file holds no entry for and lists no merged-away id', async () => {
    const world = await worldOf({ questions: survivor(), filed: [second] });
    await world.priorCards.markAnswered(world.ref, world.run.runKey, ['OQ-001']);

    const reopened = await world.reopen('OQ-001');

    expect(reopened.ok && reopened.value.map((each) => [each.cardId, each.state])).toEqual([
      ['OQ-001', 'Open'],
    ]);
  });

  it('P5-11 does not bring the merged-away ids back into the list', async () => {
    const world = await worldOf({ questions: survivor(), filed: both });

    const reopened = await world.reopen('OQ-001');

    expect(reopened.ok && reopened.value.map((each) => each.cardId)).toEqual(['OQ-001']);
  });

  it('P5-11 answers not-found for a merged-away id', async () => {
    const world = await worldOf({ questions: survivor(), filed: both });

    expect(await world.reopen('OQ-002')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('the other readers agree with the page', () => {
  it('P5-11 plan inputs, report and journey count the questions the page lists', async () => {
    const world = await worldOf({
      questions: survivor(),
      filed: [{ cardId: 'OQ-001', question: 'Who may cancel?' }, secondOpen],
    });
    await world.record([{ cardId: 'OQ-001', answer: 'Staff only' }]);

    const page = rows(await world.list());

    expect(page).toEqual([['OQ-001', 'Staff only']]);
    expect(rows(await world.planQuestions())).toEqual(page);
    expect(rows(await world.reportQuestions())).toEqual(page);
    expect((await world.journey())?.openQuestions).toBe(0);
  });

  it('P5-11 they all still wait for a question the page lists without an answer', async () => {
    const world = await worldOf({
      questions: survivor(),
      filed: [{ cardId: 'OQ-001', question: 'Who may cancel?' }, secondOpen],
    });

    expect((await world.planQuestions()).map((each) => each.cardId)).toEqual(['OQ-001']);
    expect((await world.reportQuestions()).map((each) => each.cardId)).toEqual(['OQ-001']);
    expect((await world.journey())?.openQuestions).toBe(1);
  });

  it('P5-11 a run with no merge gives every reader the file as it is', async () => {
    const world = await worldOf({
      questions: [oq('OQ-001', 'Who may cancel?'), oq('OQ-002', 'Who can cancel the order?')],
      filed: both,
    });

    expect(rows(await world.planQuestions())).toEqual(rows(await world.list()));
    expect(rows(await world.reportQuestions())).toEqual(rows(await world.list()));
    expect((await world.journey())?.openQuestions).toBe(1);
  });
});
