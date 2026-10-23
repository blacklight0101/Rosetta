import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../src/application/plan/plan-answer.js';
import { assemblePlan } from '../../../src/domain/planning/plan-content.js';
import { guardKinds, riskClasses } from '../../../src/domain/planning/task-card-quality.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { allText, cardsOf, packageOf, plain } from '../../support/plan-method-harness.js';
import { invariant, scenario } from '../../support/task-card-fixtures.js';
import { filledExampleOf } from '../../support/prompt-example.js';

// RF-630, RF-633, RF-635, ADR-018, DEC-135: the task cards of the package state what must hold and
// how it will be attacked, the build method pins every guard with a test that fails without it,
// and a risk class sits next to the difficulty. Structure tests over real packages written from
// the recorded planner answer, and over answers the planner could give.

const aiAssisted = { buildMethod: { aiAssisted: true } } as const;
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

const probes = ['A total of 50, of 49.99 and of 50.01.', 'The same total written as 5e1.'];
const plainTask = {
  ...{ title: 'Plain', phase: 1, requirements: [1], acceptanceCriteria: [scenario] },
  ...{ invariant, riskClass: 'none' },
};

/** The Done-when items of a card, one per bullet under its acceptance criteria. */
function criteriaOf(card: string): string[] {
  const section = /Acceptance criteria:\n\n((?:- .+\n)+)/u.exec(card)?.[1] ?? '';
  return section.split('\n').filter((line) => line !== '');
}

describe('RF-630 the invariant and the Done-when scenarios', () => {
  it('RF-630 every task card states the invariant the work must make true', async () => {
    const files = await packageOf({});

    const cards = cardsOf(files);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('\nInvariant: Shipping is free exactly when the order total is');
    expect(cards[1]).toContain('\nInvariant: Only a manager cancels a paid order');
    for (const card of cards) expect(card).toMatch(/\nInvariant: \S.*\n/u);
  });

  it('RF-630 every Done-when item of every card is a Given/When/Then scenario with its inputs', async () => {
    const files = await packageOf({});

    for (const card of cardsOf(files)) {
      const criteria = criteriaOf(card);
      expect(criteria.length).toBeGreaterThan(0);
      for (const criterion of criteria) {
        expect(criterion).toMatch(/^- Given .+, when .+, then .+/u);
      }
    }
  });

  it('RF-630 a card the planner gives no invariant is not written', async () => {
    const recording = plannerAnswering([
      plainTask,
      { ...plainTask, title: 'No invariant', invariant: '' },
      { ...plainTask, title: 'Blank invariant', invariant: '  ' },
    ]);

    const files = await packageOf({}, recording);

    expect(cardsOf(files).map((card) => card.split('\n')[0])).toEqual(['T-001']);
    expect(plain(files['tasks.md'])).not.toContain('No invariant');
  });

  it('RF-630 a card with a Done-when item that is not a scenario is not written', async () => {
    const recording = plannerAnswering([
      plainTask,
      { ...plainTask, title: 'Loose', acceptanceCriteria: [scenario, 'The order is stored.'] },
    ]);

    const files = await packageOf({}, recording);

    expect(plain(files['tasks.md'])).not.toContain('Loose');
  });
});

describe('RF-630 review probes on cards that add a check, a filter, a limit or a parser', () => {
  it('RF-630 a card that adds a guard lists what it adds and its probes', async () => {
    const files = await packageOf({});

    const [orders, cancel] = cardsOf(files);
    expect(orders).toContain('\nAdds: limit\n');
    expect(orders).toContain(
      '\nReview probes:\n\n- A basket of exactly 50, of 49.99 and of 50.01.\n',
    );
    expect(cancel).toContain('\nAdds: check\n');
    expect(cancel).toMatch(/\nReview probes:\n\n- A clerk, a manager and a customer/u);
  });

  it.each(guardKinds)(
    'RF-630 a card that adds a %s but lists no probes is not written',
    async (kind) => {
      const recording = plannerAnswering([
        plainTask,
        { ...plainTask, title: 'Guard', adds: [kind], probes: [] },
      ]);

      const files = await packageOf({}, recording);

      expect(cardsOf(files)).toHaveLength(1);
    },
  );

  it('RF-630 a card that adds nothing and is at no risk carries neither an adds line nor probes', async () => {
    const files = await packageOf({}, plannerAnswering([plainTask]));

    const [card] = cardsOf(files);
    expect(card).toContain('\nInvariant:');
    expect(card).not.toContain('Adds:');
    expect(card).not.toContain('Review probes');
    expect(card).not.toContain('Guard test');
  });

  it('RF-630 a card at a risk that adds no guard still lists its probes', async () => {
    const recording = plannerAnswering([{ ...plainTask, riskClass: 'data loss', probes }]);

    const [card] = cardsOf(await packageOf({}, recording));

    expect(card).toContain('\nReview probes:\n\n- A total of 50, of 49.99 and of 50.01.\n');
    expect(card).not.toContain('Adds:');
    expect(card).not.toContain('Guard test');
  });
});

describe('RF-630 the build method and the probes', () => {
  it('RF-630 the build method says the builder runs the same probes before asking for review', async () => {
    const agents = plain((await packageOf(aiAssisted))['AGENTS.md']);

    expect(agents).toMatch(/^## Review probes$/mu);
    expect(agents).toContain('adds a check, a filter, a limit or a parser');
    expect(agents).toContain('before asking for review');
    expect(agents).toContain('other spellings and letter cases');
    expect(agents).toContain('values one step past a limit');
  });

  it('RF-630 the cards state their invariant and probes whether or not the build is AI-assisted', async () => {
    const files = await packageOf({ buildMethod: { aiAssisted: false } });

    expect(Object.keys(files)).not.toContain('AGENTS.md');
    for (const card of cardsOf(files)) {
      expect(card).toMatch(/\nInvariant: \S/u);
      expect(card).toContain('\nReview probes:\n');
    }
  });
});

describe('RF-633 a failing test for every guard', () => {
  it('RF-633 the build method requires a test that fails when the guard is removed', async () => {
    const agents = plain((await packageOf(aiAssisted))['AGENTS.md']);

    expect(agents).toMatch(/^## Guard tests$/mu);
    expect(agents).toContain('each branch, check or guard a card adds');
    expect(agents).toContain('a test that fails when that guard is removed');
    expect(agents).toContain('even when the code already behaves correctly');
  });

  it('RF-633 the build method has the reviewer confirm it by removing the guard', async () => {
    const agents = plain((await packageOf(aiAssisted))['AGENTS.md']);

    expect(agents).toContain('mutation check');
    expect(agents).toContain('the reviewer removes the guard and confirms that the test fails');
  });

  it('RF-633 a card that adds a guard asks for its guard test', async () => {
    const files = await packageOf({});

    // P5-08: the rule is the same for every card, so it is written once before the cards.
    const tasks = plain(files['tasks.md']);
    const shared = tasks.slice(0, tasks.indexOf('\n## T-'));
    expect(shared).toMatch(/\nGuard test: .*fails when the guard is removed.*\n/u);
    for (const card of cardsOf(files)) expect(card).not.toContain('Guard test:');
  });
});

describe('RF-635 the risk class next to the difficulty', () => {
  it('RF-635 every card has a risk class, directly after its difficulty when the build is AI-assisted', async () => {
    const files = await packageOf(aiAssisted);

    const classes = cardsOf(files).map(
      (card) => /\nDifficulty: .+\n\nRisk class: (.+)\n/u.exec(card)?.[1],
    );
    expect(classes).toEqual(['money', 'security boundary']);
  });

  it('RF-635 the risk class is on every card without an AI-assisted build too, and no difficulty is', async () => {
    const files = await packageOf({});

    for (const card of cardsOf(files)) expect(card).toMatch(/\nRisk class: \S.*\n/u);
    expect(allText(files)).not.toContain('Difficulty:');
  });
});

describe('RF-635 the risk class and the model tier', () => {
  it('RF-635 a card with no risk class, or one that does not exist, is not written', async () => {
    const recording = plannerAnswering([
      plainTask,
      { ...plainTask, title: 'Unclassed', riskClass: undefined },
      { ...plainTask, title: 'Unheard of', riskClass: 'catastrophic' },
    ]);

    const files = await packageOf({}, recording);

    expect(cardsOf(files)).toHaveLength(1);
    expect(plain(files['tasks.md'])).not.toContain('Unclassed');
    expect(plain(files['tasks.md'])).not.toContain('Unheard of');
  });

  it('RF-635 a small card at a trust boundary is built by the middle model tier, not the smallest', async () => {
    const files = await packageOf(aiAssisted);

    const [, cancel] = cardsOf(files);
    expect(cancel).toContain('\nSize: S (1 point)\n');
    expect(cancel).toContain('\nDifficulty: 4 (middle model tier)\n');
  });

  it('RF-635 a small card at no risk keeps the smallest model tier', async () => {
    const files = await packageOf(aiAssisted, plannerAnswering([plainTask]));

    expect(cardsOf(files)[0]).toContain(
      '\nDifficulty: 4 (smallest model tier)\n\nRisk class: none\n',
    );
  });

  it('RF-635 the build method builds a risky card at least with the middle tier and reviews it with its probes', async () => {
    const agents = plain((await packageOf(aiAssisted))['AGENTS.md']);

    expect(agents).toMatch(/^## Risk class$/mu);
    for (const each of riskClasses) expect(agents).toContain(each);
    expect(agents).toContain('a risk class other than none');
    expect(agents).toContain('at least the middle model tier');
    expect(agents).toContain('reviewed with its probes');
    expect(agents).toContain('whatever its difficulty');
  });
});

describe('RF-630 RF-635 the planner prompt and the demo package', () => {
  it('RF-630 the planner prompt asks for the invariant, the risk class, the guards and the probes', async () => {
    const prompt = await readFile('prompts/planner/package.v7.md', 'utf8');

    for (const word of ['invariant', 'riskClass', 'adds', 'probes', 'Given, When, Then']) {
      expect(prompt).toContain(word);
    }
    for (const each of [...riskClasses, ...guardKinds]) expect(prompt).toContain(each);
  });

  it('RF-630 the example answer in the planner prompt keeps every task it shows', async () => {
    const prompt = await readFile('prompts/planner/package.v7.md', 'utf8');
    const example = filledExampleOf(prompt);

    const draft = parsePlanAnswer(example);

    expect(draft?.tasks.length).toBeGreaterThan(0);
    const supported = new Set(['FEAT-001', 'BR-001', 'ENT-001']);
    const content = draft === undefined ? undefined : assemblePlan(draft, supported).content;
    expect(content?.tasks).toHaveLength(draft?.tasks.length ?? -1);
  });

  it('RF-630 the demo package has no card without an invariant, a scenario, a risk class and probes where due', async () => {
    const files = await packageOf(aiAssisted);

    const cards = cardsOf(files);
    for (const card of cards) {
      expect(card).toMatch(/\nInvariant: \S/u);
      expect(card).toMatch(/\nRisk class: \S/u);
      expect(criteriaOf(card).length).toBeGreaterThan(0);
    }
    for (const card of cards.filter((each) => each.includes('\nAdds: '))) {
      expect(card).toContain('\nReview probes:\n');
    }
  });
});
