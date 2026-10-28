import { describe, expect, it } from 'vitest';
import type { PlanPhase, PlanTask } from '../../../../src/domain/planning/plan-content.js';
import {
  difficultyOfTask,
  tierForRisk,
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
      expect(difficultyOfTask(task(r, c))).toEqual({ rating, tier, verifier: 'middle' });
    },
  );
});

describe('difficultyOfTask: the risk class', () => {
  const sizes = { S: task(1, 1), M: task(1, 2), L: task(3, 3) } as const;
  const risky = ['security boundary', 'data loss', 'money'] as const;

  it.each(risky)(
    'RF-635 a small card of risk class %s keeps its rating and is built by the middle tier',
    (riskClass) => {
      expect(difficultyOfTask({ ...sizes.S, riskClass })).toEqual({
        rating: 4,
        tier: 'middle',
        verifier: 'middle',
      });
    },
  );

  it.each(risky.flatMap((riskClass) => [['M', riskClass] as const, ['L', riskClass] as const]))(
    'RF-635 a %s card of risk class %s is rated 9, built by the largest tier and verified by it',
    (size, riskClass) => {
      expect(difficultyOfTask({ ...sizes[size], riskClass })).toEqual({
        rating: 9,
        tier: 'largest',
        verifier: 'largest',
      });
    },
  );

  it.each([
    ['S', 4, 'smallest'],
    ['M', 6, 'middle'],
    ['L', 8, 'middle'],
  ] as const)(
    'RF-635 a %s card of risk class none is rated %i by its size alone',
    (size, rating, tier) => {
      expect(difficultyOfTask({ ...sizes[size], riskClass: 'none' })).toEqual({
        rating,
        tier,
        verifier: 'middle',
      });
    },
  );
});

describe('tierForRisk', () => {
  it.each([
    ['smallest', 'none', 'smallest'],
    ['smallest', 'money', 'middle'],
    ['middle', 'money', 'middle'],
    ['largest', 'security boundary', 'largest'],
    ['largest', 'data loss', 'largest'],
    ['largest', 'none', 'largest'],
  ] as const)('RF-635 the %s tier at risk class %s is %s, never lower', (tier, risk, expected) => {
    expect(tierForRisk(tier, risk)).toBe(expected);
  });
});
