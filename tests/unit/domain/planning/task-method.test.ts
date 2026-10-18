import { describe, expect, it } from 'vitest';
import type { PlanPhase, PlanTask } from '../../../../src/domain/planning/plan-content.js';
import {
  difficultyOfTask,
  sizeOfPhase,
  sizeOfTask,
} from '../../../../src/domain/planning/task-method.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-611, RF-612: the size of a card from the scope it states, the size of a phase and its share
// per person, and the builder difficulty of a card. Derived without the model, so the same card
// always gets the same answer.

function task(requirements: number, criteria: number, phase = 1): PlanTask {
  return {
    ...planTask({ phase }),
    requirements: Array.from({ length: requirements }, (_, index) => `REQ-${String(index + 1)}`),
    acceptanceCriteria: Array.from({ length: criteria }, () => 'Given, when, then.'),
  };
}

const phase: PlanPhase = { number: 1, name: 'First', goal: 'Go.', exitCriteria: [] };

describe('sizeOfTask', () => {
  it.each([
    [0, 1, 'S', 1],
    [1, 1, 'S', 1],
    [1, 2, 'M', 2],
    [2, 2, 'M', 2],
    [3, 2, 'L', 3],
  ] as const)('RF-611 %i requirements and %i criteria are %s (%i points)', (r, c, size, points) => {
    expect(sizeOfTask(task(r, c))).toEqual({ size, points });
  });
});

describe('sizeOfPhase', () => {
  const tasks = [task(1, 1), task(2, 2), task(1, 1, 2)];

  it('RF-611 adds the points of the cards of the phase only', () => {
    expect(sizeOfPhase(phase, tasks, null)).toEqual({
      points: 3,
      cards: 2,
      perPerson: undefined,
    });
  });

  it.each([
    [1, 3],
    [2, 2],
    [3, 1],
    [10, 1],
  ])('RF-611 a team of %i carries %i points a person, rounded up', (team, share) => {
    expect(sizeOfPhase(phase, tasks, team).perPerson).toBe(share);
  });

  it('RF-611 a team size below one is not used', () => {
    expect(sizeOfPhase(phase, tasks, 0).perPerson).toBeUndefined();
  });
});

describe('difficultyOfTask', () => {
  it.each([
    [1, 1, 4, 'smallest'],
    [1, 2, 6, 'middle'],
    [3, 3, 8, 'middle'],
  ] as const)(
    'RF-612 %i requirements and %i criteria rate %i for the %s tier',
    (r, c, rating, tier) => {
      expect(difficultyOfTask(task(r, c))).toEqual({ rating, tier });
    },
  );
});

describe('difficultyOfTask: the risk class', () => {
  const small = task(1, 1);

  it.each(['security boundary', 'data loss', 'money'] as const)(
    'RF-635 a small card of risk class %s is built by the middle tier, its rating unchanged',
    (riskClass) => {
      expect(difficultyOfTask({ ...small, riskClass })).toEqual({ rating: 4, tier: 'middle' });
    },
  );

  it('RF-635 a card of risk class none keeps the tier of its rating', () => {
    expect(difficultyOfTask({ ...small, riskClass: 'none' })).toEqual({
      rating: 4,
      tier: 'smallest',
    });
  });

  it('RF-635 a risk class never lowers the tier of a larger card', () => {
    expect(difficultyOfTask({ ...task(3, 3), riskClass: 'money' }).tier).toBe('middle');
    expect(difficultyOfTask({ ...task(1, 2), riskClass: 'data loss' })).toEqual({
      rating: 6,
      tier: 'middle',
    });
  });
});
