import { describe, expect, it } from 'vitest';
import { withPhaseClosingCards } from '../../../../src/domain/planning/phase-closing-cards.js';
import { cardFault } from '../../../../src/domain/planning/task-card-quality.js';
import { planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P6-10, RF-630, RF-635, DEC-176: the phase-closing verification-matrix cards and the security review
// card, derived from the plan without a model call.

const money = {
  riskClass: 'money',
  probes: ['A price of -1 => refused.'],
} as const;

function twoPhases() {
  return planOf(
    [
      planTask({ id: 'T-001', title: 'Orders', phase: 1, requirements: ['REQ-001'] }),
      planTask({
        id: 'T-002',
        title: 'Mail',
        phase: 2,
        requirements: ['REQ-002'],
        dependsOn: ['T-001'],
      }),
    ],
    2,
  );
}

function matrixCards(tasks: readonly { title: string }[]) {
  return tasks.filter((task) => /^Verify phase \d+ against its requirements/u.test(task.title));
}

describe('withPhaseClosingCards', () => {
  it('RF-630 a two-phase plan has a verification-matrix card in each phase', () => {
    const tasks = withPhaseClosingCards(twoPhases()).tasks;
    const matrices = tasks.filter((task) => matrixCards([task]).length > 0);

    expect(matrices.map((task) => task.phase)).toEqual([1, 2]);
    expect(matrices[0]?.dependsOn).toEqual(['T-001']);
    expect(matrices[0]?.title).toBe('Verify phase 1 against its requirements');
    expect(matrices[0]?.acceptanceCriteria.join(' ')).toContain('REQ-001');
    expect(matrices[1]?.acceptanceCriteria.join(' ')).toContain('REQ-002');
  });

  it('RF-630 the matrix card names the tests, the measured targets and the follow-up cards', () => {
    const text = withPhaseClosingCards(twoPhases())
      .tasks.filter((task) => matrixCards([task]).length > 0)
      .flatMap((task) => [task.invariant, ...task.acceptanceCriteria])
      .join(' ')
      .toLowerCase();

    for (const word of ['test', 'measured', 'follow-up']) expect(text).toContain(word);
  });

  it('RF-630 a one-phase plan with no risk gets no closing card', () => {
    const plan = planOf([planTask()], 1);

    expect(withPhaseClosingCards(plan)).toEqual(plan);
  });

  it('RF-630 a plan with a money card has a security review card that waits for the risky cards', () => {
    const plan = planOf(
      [
        planTask({ id: 'T-001', title: 'Pay', ...money }),
        planTask({ id: 'T-002', title: 'Mail' }),
        planTask({ id: 'T-003', title: 'Refund', phase: 2, ...money }),
      ],
      2,
    );
    const tasks = withPhaseClosingCards(plan).tasks;
    const review = tasks.find((task) => task.title.startsWith('Review the security'));

    expect(review?.phase).toBe(2);
    expect(review?.dependsOn).toEqual(['T-001', 'T-003']);
    expect(review?.acceptanceCriteria.join(' ')).toContain('money');
    expect(tasks.at(-1)?.dependsOn).toContain(review?.id);
  });
});

describe('withPhaseClosingCards security review and ids', () => {
  it('RF-630 a plan with no risk class other than none has no security review card', () => {
    const tasks = withPhaseClosingCards(twoPhases()).tasks;

    expect(tasks.some((task) => task.title.startsWith('Review the security'))).toBe(false);
  });

  it('RF-630 the same plan always gets the same cards, with new ids after the last one', () => {
    const once = withPhaseClosingCards(twoPhases());
    const again = withPhaseClosingCards(twoPhases());

    expect(again).toEqual(once);
    expect(once.tasks.map((task) => task.id)).toEqual(['T-001', 'T-002', 'T-003', 'T-004']);
  });

  it('RF-630 every closing card is a card an agent can build without guessing', () => {
    const plan = withPhaseClosingCards(
      planOf([planTask({ id: 'T-001', title: 'Pay', ...money })], 2),
    );

    for (const task of plan.tasks.slice(1)) expect(cardFault(task)).toBeUndefined();
  });

  it('RF-630 a planner card with a reserved title is renamed, never taken for a closing card', () => {
    const plan = planOf(
      [
        planTask({ id: 'T-001', title: 'Verify phase 1 against its requirements' }),
        planTask({ id: 'T-002', title: 'Mail', phase: 2 }),
      ],
      2,
    );
    const titles = withPhaseClosingCards(plan).tasks.map((task) => task.title);

    expect(titles[0]).toBe('Verify phase 1 against its requirements (planner card)');
    expect(
      titles.filter((title) => title === 'Verify phase 1 against its requirements'),
    ).toHaveLength(1);
  });
});
