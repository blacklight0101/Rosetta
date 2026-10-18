import { describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { allText, cardsOf, entryOf, packageOf, plain } from '../../support/plan-method-harness.js';

// RF-607, ADR-018, DEC-75: a chosen principle is a rule in the conventions and a check on the
// task cards it concerns; a principle not chosen appears nowhere. Structure tests over real packages
// written from the recorded planner answer.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

/** A planner answer whose tasks are the given ones, over two requirements of supported cards. */
function plannerAnswering(tasks: readonly object[]): ReturnType<typeof recordingOf> {
  const text = JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements: [
      { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
      { title: 'Free shipping', statement: 'Over 50 ships free.', sources: ['BR-001'] },
    ],
    components: [{ name: 'Order service', responsibility: 'Stores orders.', dependsOn: [] }],
    phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
    tasks,
  });
  const reply = (answer: string) => ({
    retried: [],
    response: { text: answer, toolCalls: [], usage, finishReason: 'stop' as const },
  });
  // The second call is the PRD (RF-621) and the third the data model (RF-623); an unreadable
  // answer leaves the PRD sections placeholders and lists every legacy field as dropped.
  return recordingOf(reply(text), reply('No PRD today.'), reply('No data model today.'));
}

const criteria = ['Given a basket, when confirmed, then an order is stored.'];
const quality = { invariant: 'An order is stored once.', riskClass: 'none' } as const;

describe('RF-607 chosen principles as conventions', () => {
  it('RF-607 a chosen principle is a rule in conventions.md and a principle not chosen appears nowhere', async () => {
    const files = await packageOf({ principles: ['solid', 'kiss', 'tdd'] });

    const conventions = plain(files['conventions.md']);
    for (const id of ['solid', 'kiss', 'tdd']) {
      expect(conventions).toContain(`### ${entryOf(id).title}`);
      expect(conventions).toContain(entryOf(id).rule);
      expect(conventions).toContain(entryOf(id).check);
    }
    for (const id of ['dry', 'yagni', 'sdd', 'security-by-design']) {
      expect(allText(files)).not.toContain(entryOf(id).title);
      expect(allText(files)).not.toContain(entryOf(id).rule);
    }
  });
});

describe('RF-607 TDD on the task cards', () => {
  it('RF-607 given TDD, every task card lists the tests to write before the code', async () => {
    const files = await packageOf({ principles: ['tdd'] });

    const cards = cardsOf(files);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toMatch(/\nTests to write first:\n\n- Test: Given /u);
      expect(card.match(/^- Test: /gmu)).toHaveLength(card.match(/^- Given /gmu)?.length ?? -1);
    }
  });

  it('RF-607 without TDD no card lists tests first', async () => {
    const files = await packageOf({ principles: ['kiss'] });

    expect(allText(files)).not.toContain('Tests to write first');
  });
});

describe('RF-607 SDD on the task cards', () => {
  it('RF-607 given SDD, every card names its requirement ids and a card with none is not written', async () => {
    const recording = plannerAnswering([
      { title: 'Order', phase: 1, requirements: [1], acceptanceCriteria: criteria, ...quality },
      {
        title: 'No requirement',
        phase: 1,
        requirements: [],
        acceptanceCriteria: criteria,
        ...quality,
      },
      {
        title: 'Unknown one',
        phase: 1,
        requirements: [9],
        acceptanceCriteria: criteria,
        ...quality,
      },
    ]);

    const files = await packageOf({ principles: ['sdd'] }, recording);

    const cards = cardsOf(files);
    expect(cards.map((card) => card.split('\n')[0])).toEqual(['T-001']);
    expect(cards[0]).toContain('Requirements: [REQ-001](requirements.md#req-001)');
    expect(plain(files['tasks.md'])).not.toContain('No requirement');
  });

  it('RF-607 without SDD a card with no requirement is still written', async () => {
    const recording = plannerAnswering([
      { title: 'Order', phase: 1, requirements: [1], acceptanceCriteria: criteria, ...quality },
      {
        title: 'No requirement',
        phase: 1,
        requirements: [],
        acceptanceCriteria: criteria,
        ...quality,
      },
    ]);

    const files = await packageOf({ principles: ['kiss'] }, recording);

    expect(cardsOf(files)).toHaveLength(2);
  });
});

describe('RF-607 SOLID and KISS on the task cards', () => {
  it('RF-607 given SOLID or KISS, every card has a review checklist that names the principle and what to look for', async () => {
    const files = await packageOf({ principles: ['solid', 'kiss'] });

    for (const card of cardsOf(files)) {
      expect(card).toContain('\nReview checklist:\n\n');
      expect(card).toContain(`- ${entryOf('solid').title}: ${entryOf('solid').check}`);
      expect(card).toContain(`- ${entryOf('kiss').title}: ${entryOf('kiss').check}`);
    }
  });

  it('RF-607 without a design principle no card has a review checklist', async () => {
    const files = await packageOf({ principles: ['tdd', 'sdd'] });

    expect(allText(files)).not.toContain('Review checklist');
  });
});
