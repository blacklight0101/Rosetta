import { describe, expect, it } from 'vitest';
import {
  foundationTitles,
  withFoundationCards,
} from '../../../../src/domain/planning/foundation-cards.js';
import { withPhaseClosingCards } from '../../../../src/domain/planning/phase-closing-cards.js';
import { withMigrationCard } from '../../../../src/domain/planning/plan-coverage.js';
import { hasData } from '../../../../src/domain/planning/data-presence.js';
import { cardFault } from '../../../../src/domain/planning/task-card-quality.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P6-27, RF-610, DEC-190: a run that found no data gets the skeleton, the harness and the cut-over
// card only. No card depends on a card that was dropped, and the ids stay in one sequence.

const tables = targetModel().tables;
const claims = [
  { claimId: 'ENT-001.c1', text: 'A table.', citations: [], status: 'Supported' },
] as const;
const entity = { type: 'ENT', claims } as const;
const dropped = [foundationTitles.access, foundationTitles.migration];

function dataless(
  phases = 1,
  strategy: 'strangler-fig' | 'parallel-change' | 'rewrite' = 'rewrite',
) {
  return withFoundationCards(planOf(twoTasks(), phases), strategy, [], false);
}

describe('hasData', () => {
  it('P6-27 a run with a table has data', () => {
    expect(hasData([], tables)).toBe(true);
  });

  it('P6-27 a run with an ENT card that holds a claim has data even before a table exists', () => {
    expect(hasData([entity], [])).toBe(true);
  });

  it('P6-27 a run with no table and no ENT claim has none, whatever its other cards say', () => {
    expect(
      hasData(
        [
          { type: 'FEAT', claims },
          { type: 'ENT', claims: [] },
        ],
        [],
      ),
    ).toBe(false);
  });
});

describe('withFoundationCards: a run with no data', () => {
  it('P6-27 has the skeleton, the harness and the cut-over card and nothing for the data', () => {
    const tasks = dataless().tasks;

    expect(tasks.map((task) => task.title)).toEqual([
      foundationTitles.skeleton,
      foundationTitles.harness,
      'Orders',
      'Mail',
      foundationTitles.cutOver,
    ]);
    for (const title of dropped) expect(tasks.some((task) => task.title === title)).toBe(false);
  });
});

describe('withFoundationCards: a run with no data, the ids and the waits', () => {
  it('P6-27 the ids run T-001.. with no gap and no card depends on a card that is not there', () => {
    const tasks = dataless(3).tasks;
    const ids = new Set(tasks.map((task) => task.id));

    expect(tasks.map((task) => task.id)).toEqual(
      tasks.map((_, at) => `T-${String(at + 1).padStart(3, '0')}`),
    );
    for (const task of tasks) for (const on of task.dependsOn) expect(ids.has(on)).toBe(true);
  });

  it('P6-27 the cards of the plan wait for the skeleton, the harness for the skeleton and the cut-over for all', () => {
    const waits = dataless().tasks.map((task) => [task.id, task.dependsOn]);

    expect(waits).toEqual([
      ['T-001', []],
      ['T-002', ['T-001']],
      ['T-003', ['T-001']],
      ['T-004', ['T-001', 'T-003']],
      ['T-005', ['T-001', 'T-002', 'T-003', 'T-004']],
    ]);
  });

  it('P6-27 the three fixed cards are cards an agent can build and carry no requirement', () => {
    const fixed = dataless().tasks.filter((task) => task.requirements.length === 0);

    expect(fixed).toHaveLength(3);
    for (const task of fixed) expect(cardFault(task)).toBeUndefined();
  });

  it('P6-27 the cut-over card keeps its text for every strategy and sits in the last phase', () => {
    for (const strategy of ['strangler-fig', 'parallel-change', 'rewrite'] as const) {
      const cutOver = dataless(2, strategy).tasks.at(-1);
      expect(cutOver?.title).toBe(foundationTitles.cutOver);
      expect(cutOver?.phase).toBe(2);
    }
  });
});

describe('withFoundationCards: a run with no data, the plan around the cards', () => {
  it('P6-27 a planner card that waited on another planner card keeps that wait, renumbered', () => {
    const tasks = withFoundationCards(
      planOf(
        [
          planTask({ id: 'T-001', title: 'A' }),
          planTask({ id: 'T-002', title: 'B', dependsOn: ['T-001'] }),
        ],
        1,
      ),
      'rewrite',
      [],
      false,
    ).tasks;

    expect(tasks.find((task) => task.title === 'B')?.dependsOn).toContain(
      tasks.find((task) => task.title === 'A')?.id,
    );
  });

  it('P6-27 no phase is empty and the closing cards wait only for cards that exist', () => {
    const closed = withPhaseClosingCards(dataless(3)).tasks;
    const ids = new Set(closed.map((task) => task.id));

    for (const task of closed) for (const on of task.dependsOn) expect(ids.has(on)).toBe(true);
    expect(new Set(closed.map((task) => task.phase))).toEqual(new Set([1, 3]));
  });

  it('P6-27 the security review is for the cut-over card alone, which keeps its risk class (RF-635)', () => {
    const closed = withPhaseClosingCards(dataless(1)).tasks;
    const review = closed.find((task) => task.title.startsWith('Review the security'));
    const cutOver = closed.find((task) => task.title === foundationTitles.cutOver);

    expect(cutOver?.riskClass).toBe('data loss');
    expect(review?.dependsOn).toEqual([cutOver?.id]);
  });

  it('P6-27 a plan with no task or no phase is still returned as it is', () => {
    const empty = planOf([]);

    expect(withFoundationCards(empty, 'rewrite', [], false)).toBe(empty);
  });
});

describe('withFoundationCards: a run with data', () => {
  it('P6-27 keeps the five cards and their ids as before', () => {
    const migrated = withMigrationCard(planOf(twoTasks(), 3), tables);
    const before = withFoundationCards(migrated, 'strangler-fig', tables);
    const kept = withFoundationCards(migrated, 'strangler-fig', tables, true);

    expect(kept).toEqual(before);
    expect(kept.tasks.filter((task) => task.requirements.length === 0)).toHaveLength(5);
    for (const title of dropped) expect(kept.tasks.some((task) => task.title === title)).toBe(true);
  });
});
