import { describe, expect, it } from 'vitest';
import { withFoundationCards } from '../../../../src/domain/planning/foundation-cards.js';
import { withMigrationCard } from '../../../../src/domain/planning/plan-coverage.js';
import { cardFault } from '../../../../src/domain/planning/task-card-quality.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P5-42, RF-610, RF-623: the fixed cards of every plan, and the waiting every other card does for them.

const tables = targetModel().tables;

/** The text as words, so a name is found only as a whole word or phrase. */
function wordsOf(text: string): string {
  return ` ${text.toLowerCase().replaceAll(/[^a-z0-9#+.]+/gu, ' ')} `;
}

function planned(strategy: 'strangler-fig' | 'parallel-change' | 'rewrite' = 'strangler-fig') {
  const migrated = withMigrationCard(planOf(twoTasks(), 3), tables);
  return withFoundationCards(migrated, strategy, tables).tasks;
}

describe('withFoundationCards', () => {
  it('P5-42 a recorded plan has the five fixed cards, the skeleton first and the cut-over last', () => {
    const tasks = planned();

    expect(tasks.map((task) => task.id)).toEqual(
      tasks.map((_, at) => `T-${String(at + 1).padStart(3, '0')}`),
    );
    expect(tasks[0]?.title).toMatch(/solution skeleton and continuous integration/u);
    expect(tasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/data-access layer/u),
        expect.stringMatching(/approval-test harness/u),
        expect.stringMatching(/Migrate the legacy data/u),
        expect.stringMatching(/Cut over/u),
      ]),
    );
    expect(tasks.at(-1)?.title).toMatch(/Cut over/u);
  });

  it('P5-42 every other card depends on the skeleton, and the cards of the plan on the data access', () => {
    const tasks = planned();
    const access = tasks.find((task) => task.title.includes('data-access'))?.id ?? '';

    for (const task of tasks.slice(1)) expect(task.dependsOn).toContain('T-001');
    for (const title of ['Orders', 'Mail']) {
      expect(tasks.find((task) => task.title === title)?.dependsOn).toContain(access);
    }
  });

  it('P5-42 the planner cards keep their order, renumbered, with their own dependencies', () => {
    const tasks = planned();
    const orders = tasks.find((task) => task.title === 'Orders');
    const mail = tasks.find((task) => task.title === 'Mail');

    expect(orders?.id).not.toBe('T-001');
    expect(mail?.dependsOn).toContain(orders?.id);
  });
});

describe('withFoundationCards: the contents', () => {
  it('P5-42 the data migration card copies each legacy table to its target with a row-count check', () => {
    const card = planned().find((task) => task.title.includes('Migrate the legacy data'));

    expect(card?.acceptanceCriteria.join(' ')).toContain('target table customer holds N rows');
    expect(card?.invariant).toContain('row counts');
  });

  it('P5-42 a strangler-fig plan has a cut-over card that names the routing step', () => {
    const card = planned('strangler-fig').at(-1);

    expect(card?.acceptanceCriteria.join(' ')).toContain('routing step');
    expect(card?.dependsOn.length).toBeGreaterThan(3);
  });

  it('P5-42 the cut-over follows the strategy: one switch for a rewrite, removal for a parallel change', () => {
    expect(planned('rewrite').at(-1)?.acceptanceCriteria.join(' ')).toContain('frozen for writes');
    expect(planned('parallel-change').at(-1)?.acceptanceCriteria.join(' ')).toContain(
      'old way is removed',
    );
  });
});

describe('withFoundationCards: the fixed cards as a whole', () => {
  it('P5-42 every fixed card is a card an agent can build and has no requirement', () => {
    for (const task of planned()) expect(cardFault(task)).toBeUndefined();
    expect(planned().filter((task) => task.requirements.length === 0)).toHaveLength(5);
  });

  it('P5-42 the fixed cards name no technology of the catalogue (DEC-11)', () => {
    const fixed = planned().filter((task) => task.requirements.length === 0);
    const text = fixed
      .map((task) => JSON.stringify(task))
      .join(' ')
      .toLowerCase();
    const names = shippedCatalogue.stack.technologies.flatMap((each) => [
      each.name.toLowerCase(),
      ...each.aliases,
    ]);

    for (const name of names) expect(wordsOf(text).includes(` ${name} `)).toBe(false);
  });

  it('P5-42 a plan with no task or no phase is returned as it is', () => {
    const empty = planOf([]);

    expect(withFoundationCards(empty, 'rewrite', tables)).toBe(empty);
    expect(withFoundationCards(planOf(twoTasks(), 0), 'rewrite', tables).tasks).toHaveLength(2);
  });

  it('P5-42 a planner card with the title of a fixed card is renamed and the five cards stay', () => {
    const first = planned()[0]?.title ?? '';
    const hostile = [
      planTask({ id: 'T-001', title: first }),
      planTask({ id: 'T-002', title: 'B' }),
    ];

    const tasks = withFoundationCards(planOf(hostile), 'rewrite', tables).tasks;

    expect(tasks.filter((task) => task.title === first)).toHaveLength(1);
    expect(tasks.filter((task) => task.requirements.length === 0)).toHaveLength(5);
    expect(tasks.some((task) => task.title === `${first} (planner card)`)).toBe(true);
  });
});
