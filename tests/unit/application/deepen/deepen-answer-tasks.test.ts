import { describe, expect, it } from 'vitest';
import {
  answersGivenTo,
  withDeepenAnswers,
} from '../../../../src/application/deepen/deepen-answers.js';
import type { Rerun } from '../../../../src/application/understand/answer-rerun.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-209, RF-241, RF-646, DEC-179, DEC-198 (1), EV-58: in round 1 of a Deepen every area that holds an
// answered question not used yet gets a reader task, so a picked suggested answer and a typed one reach
// the Deepen alike, even when the area has no re-read, gap or failed area.

const project = { userId: 'u-1', projectId: 'p-1' };
const runKey = '20261029-100000-understand';

function areaOf(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`, `${name}/b.cs`],
    estimatedTokens: 10,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

const codeMap = { areas: ['Catalog', 'Setup', 'App_Start', 'Services'].map(areaOf) };
const planned: readonly ReaderTask[] = [{ agentTaskId: 'reader-004', area: areaOf('Catalog') }];
const scope = { codeMap, firstNumber: 5 };

function question(cardId: string, area: string, answer: string, used = false) {
  return {
    ...{ cardId, runKey, area, answer, used },
    question: `Question of ${cardId}?`,
    context: `${area}/a.cs:1-2 A claim.`,
  };
}

function rerunOf(...pending: ReturnType<typeof question>[]): Rerun {
  return {
    deps: {
      answers: { answeredQuestions: () => Promise.resolve([]) },
      cards: { cardsOf: () => Promise.resolve([]), markAnswered: () => Promise.resolve([]) },
    },
    plan: { project, pending, skipped: [], baseline: [] },
  };
}

describe('DEC-198 (1) a picked answer in an area with no task', () => {
  it('EV-58 adds a reader task for each area with an answer not used yet, picked or typed', () => {
    const rerun = rerunOf(
      question('OQ-011', 'Catalog', 'Typed answer.'),
      question('OQ-015', 'Setup', 'No, hide it'),
      question('OQ-008', 'App_Start', 'Yes, show it'),
    );

    const given = withDeepenAnswers(planned, rerun, scope);

    expect(given.map((task) => task.agentTaskId)).toEqual([
      'reader-004',
      'reader-005',
      'reader-006',
    ]);
    expect(given.map((task) => task.area.name)).toEqual(['Catalog', 'Setup', 'App_Start']);
    expect(given[1]?.area.files).toEqual(['Setup/a.cs', 'Setup/b.cs']);
    expect(given[1]?.answers).toContain('Question OQ-015: Question of OQ-015?\n');
    expect(given[1]?.answers).toContain("Owner's answer: No, hide it");
    expect(given[2]?.answers).toContain("Owner's answer: Yes, show it");
  });

  it('EV-58 lists every one of those questions in answersGivenTo, so the round records them', () => {
    const rerun = rerunOf(question('OQ-011', 'Catalog', 'a'), question('OQ-015', 'Setup', 'b'));

    const given = withDeepenAnswers(planned, rerun, scope);

    expect(answersGivenTo(given, rerun)).toEqual([`${runKey}/OQ-011`, `${runKey}/OQ-015`]);
  });

  it('DEC-198 gives one task to an area that holds several answers', () => {
    const rerun = rerunOf(question('OQ-015', 'Setup', 'b'), question('OQ-016', 'Setup', 'c'));

    const given = withDeepenAnswers([], rerun, scope);

    expect(given).toHaveLength(1);
    expect(given[0]?.answers).toContain('OQ-015');
    expect(given[0]?.answers).toContain('OQ-016');
  });
});

describe('DEC-198 (1) the answers that add no task', () => {
  it('DEC-179 leaves out an answer already used, which still reaches a task that exists', () => {
    const rerun = rerunOf(
      question('OQ-011', 'Catalog', 'a', true),
      question('OQ-015', 'Setup', 'b', true),
    );

    const given = withDeepenAnswers(planned, rerun, scope);

    expect(given.map((task) => task.area.name)).toEqual(['Catalog']);
    expect(given[0]?.answers).toContain("Owner's answer: a");
  });

  it('DEC-198 adds no task for an area the code map does not hold or that holds no file', () => {
    const empty = { ...areaOf('Empty'), files: [] };
    const rerun = rerunOf(question('OQ-020', 'Gone', 'a'), question('OQ-021', 'Empty', 'b'));

    const given = withDeepenAnswers(planned, rerun, { ...scope, codeMap: { areas: [empty] } });

    expect(given).toEqual(planned);
  });

  it('DEC-198 plans a Deepen with no pending answer as before', () => {
    expect(withDeepenAnswers(planned, rerunOf(), scope)).toEqual(planned);
    expect(withDeepenAnswers(planned, undefined, scope)).toEqual(planned);
  });

  it('DEC-198 adds no task without a scope, as in a later round', () => {
    const rerun = rerunOf(question('OQ-015', 'Setup', 'b'));

    expect(withDeepenAnswers(planned, rerun).map((task) => task.area.name)).toEqual(['Catalog']);
  });
});
