import { describe, expect, it } from 'vitest';
import { waitingOnQuestions } from '../../../../src/domain/planning/question-cards.js';

// RF-637, DEC-135: which task cards wait on which open question. A question of the brief that
// shapes every card holds them all; one that shapes only the roadmap holds none; a question of
// the analysis holds the cards built from requirements whose source cards are in its area.

const tasks = [
  { id: 'T-001', requirements: ['REQ-001'] },
  { id: 'T-002', requirements: ['REQ-002'] },
  { id: 'T-003', requirements: ['REQ-001', 'REQ-002'] },
  { id: 'T-004', requirements: [] },
] as const;
const requirements = [
  { id: 'REQ-001', sources: ['FEAT-001'] },
  { id: 'REQ-002', sources: ['FEAT-002', 'BR-002'] },
] as const;
const areas = new Map([
  ['FEAT-001', 'orders'],
  ['FEAT-002', 'billing'],
  ['BR-002', 'shipping'],
]);

function waiting(questions: readonly { id: string; area?: string }[]) {
  return waitingOnQuestions({ questions, tasks, requirements, areas });
}

describe('RF-637 the cards that wait on a question', () => {
  it('RF-637 a question of the analysis holds the cards built from sources in its area', () => {
    const { byQuestion } = waiting([
      { id: 'OQ-001', area: 'orders' },
      { id: 'OQ-002', area: 'shipping' },
    ]);

    expect(byQuestion.get('OQ-001')).toEqual(['T-001', 'T-003']);
    expect(byQuestion.get('OQ-002')).toEqual(['T-002', 'T-003']);
  });

  it('RF-637 a question in an area no card was built from holds no card', () => {
    expect(waiting([{ id: 'OQ-003', area: 'payroll' }]).byQuestion.get('OQ-003')).toEqual([]);
    expect(waiting([{ id: 'OQ-004', area: 'Orders' }]).byQuestion.get('OQ-004')).toEqual([]);
  });

  it.each(['principles', 'architecture', 'migration', 'buildMethod', 'stack.database'])(
    'RF-637 the brief question %s holds every card',
    (id) => {
      expect(waiting([{ id }]).byQuestion.get(id)).toEqual(['T-001', 'T-002', 'T-003', 'T-004']);
    },
  );

  it.each(['context.teamSize', 'context.deadline', 'prd.features', 'prd.problem'])(
    'RF-637 the question %s shapes no card',
    (id) => {
      expect(waiting([{ id }]).byQuestion.get(id)).toEqual([]);
    },
  );

  it('RF-637 lists the questions a card waits on, in the order of the questions', () => {
    const { byCard } = waiting([
      { id: 'stack.database' },
      { id: 'OQ-002', area: 'shipping' },
      { id: 'context.deadline' },
    ]);

    expect(byCard.get('T-002')).toEqual(['stack.database', 'OQ-002']);
    expect(byCard.get('T-001')).toEqual(['stack.database']);
    expect(byCard.has('T-005')).toBe(false);
  });
});
