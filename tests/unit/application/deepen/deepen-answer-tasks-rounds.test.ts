import { describe, expect, it } from 'vitest';
import { hasAnswerTasks } from '../../../../src/application/deepen/deepen-answers.js';
import { tasksOf } from '../../../../src/application/deepen/deepen-round.js';
import type { Rerun } from '../../../../src/application/understand/answer-rerun.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { RoundPlan } from '../../../../src/domain/deepen/round-plan.js';
import { cardOf, claimOf, coverageOf } from '../../../support/deepen-fixtures.js';

// RF-209, DEC-158 (1), DEC-198 (1): the tasks the answers add are built like every Deepen task (they
// list the parent cards of their area), exist in round 1 only, and are work of their own.

const area = (name: string): Area => ({
  ...{ name, files: [`${name}/a.cs`], estimatedTokens: 10 },
  mapLevel: 'coarse',
  origin: 'folder',
});
const codeMap = { areas: [area('Catalog'), area('Setup')], files: [] };
const none: RoundPlan = { judge: [], reread: [], outOfScope: [], gaps: [], failedAreas: [] };
const runKey = '20261029-100000-understand';

function rerunOf(used: boolean): Rerun {
  const question = {
    ...{ cardId: 'OQ-015', runKey, area: 'Setup', answer: 'No, hide it', used },
    question: 'Is a sold-out item shown?',
    context: 'Setup/a.cs:1-2 x',
  };
  return {
    deps: {
      answers: { answeredQuestions: () => Promise.resolve([]) },
      cards: { cardsOf: () => Promise.resolve([]), markAnswered: () => Promise.resolve([]) },
    },
    plan: {
      project: { userId: 'u', projectId: 'p' },
      pending: [question],
      skipped: [],
      baseline: [],
    },
  };
}

const parent = {
  agentTaskId: 'reader-001',
  area: 'Setup',
  state: 'Done' as const,
  turns: 1,
  withoutCards: false,
  cards: [cardOf('Setup', [claimOf('BR-001.c1', 'Supported', ['Setup/a.cs'])])],
  coverage: coverageOf('Setup', [{ path: 'Setup/a.cs', read: 2 }]),
};
const state = { results: [] };

describe('DEC-158 (1) the parent cards of an answer-only task', () => {
  it('DEC-158 lists the cards of the area and the ids a claim may be added to', () => {
    const parts = { scanned: { codeMap }, rerun: rerunOf(false) };

    const tasks = tasksOf(parts, { results: [parent] }, { plan: none, round: 1 });

    expect(tasks.map((task) => task.area.name)).toEqual(['Setup']);
    expect(JSON.parse(tasks[0]?.parentCards ?? 'null')).toEqual({
      cards: [{ id: 'BR-001', type: 'BR', title: 'Card BR-001' }],
    });
    expect(tasks[0]?.extendable).toEqual(['BR-001']);
  });
});

describe('DEC-198 (1) the answer tasks exist in round 1 only', () => {
  it('DEC-198 adds the task in round 1 and none in round 2, as the answer is marked after round 1', () => {
    const parts = { scanned: { codeMap }, rerun: rerunOf(false) };

    expect(tasksOf(parts, state, { plan: none, round: 1 })).toHaveLength(1);
    expect(tasksOf(parts, state, { plan: none, round: 2 })).toHaveLength(0);
  });

  it('DEC-198 counts an answer not used yet as work, and a used one or none as no work', () => {
    expect(hasAnswerTasks(rerunOf(false), codeMap)).toBe(true);
    expect(hasAnswerTasks(rerunOf(true), codeMap)).toBe(false);
    expect(hasAnswerTasks(undefined, codeMap)).toBe(false);
  });
});
