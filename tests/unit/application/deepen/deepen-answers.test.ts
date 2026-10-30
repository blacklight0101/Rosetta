import { describe, expect, it } from 'vitest';
import {
  answersGivenTo,
  markUsedAnswers,
  mergedIntoAnswered,
  withDeepenAnswers,
} from '../../../../src/application/deepen/deepen-answers.js';
import { withAnswersOf, type Rerun } from '../../../../src/application/understand/answer-rerun.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-209, RF-241, RF-646, DEC-179: the answers of the project reach every task of a Deepen through the
// code of the re-run with answers; the questions a task used are marked `Answered` once it ended
// `Done`; a new open question that asks the same as an answered one is merged into it.

const project = { userId: 'u-1', projectId: 'p-1' };
const runKey = '20261012-100000-understand';

function areaOf(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`],
    estimatedTokens: 10,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

const tasks: readonly ReaderTask[] = [
  { agentTaskId: 'reader-003', area: areaOf('Catalog'), rejected: '{"rejected":[]}' },
  { agentTaskId: 'reader-004', area: areaOf('Catalog') },
  { agentTaskId: 'reader-005', area: areaOf('Services') },
  { agentTaskId: 'reader-006', area: areaOf('Controllers') },
];

function question(cardId: string, area: string, answer: string) {
  return {
    ...{ cardId, runKey, area, answer },
    question: `Question of ${cardId}?`,
    context: 'Catalog/a.cs:1-2 A claim.',
  };
}

function rerunOf(marked: string[][] = []): Rerun {
  return {
    deps: {
      answers: { answeredQuestions: () => Promise.resolve([]) },
      cards: {
        cardsOf: () => Promise.resolve([]),
        markAnswered: (_project, key, ids) => {
          marked.push([key, ...ids]);
          return Promise.resolve(ids);
        },
      },
    },
    plan: {
      project,
      pending: [
        question('OQ-001', 'Catalog', 'Staff only.'),
        question('OQ-002', 'Catalog', 'Never.'),
        question('OQ-003', 'Services', 'Weekly.'),
      ],
      skipped: [],
      baseline: [],
    },
  };
}

describe('RF-209 the answers a Deepen task is given', () => {
  it('RF-209 gives every task the answers of its area, as the re-run with answers does', () => {
    const rerun = rerunOf();

    const given = withDeepenAnswers(tasks, rerun);

    expect(given).toEqual(withAnswersOf(tasks, rerun.plan));
    expect(given[0]?.answers).toContain("Owner's answer: Staff only.");
    expect(given[0]?.answers).toContain("Owner's answer: Never.");
    expect(given[1]?.answers).toBe(given[0]?.answers);
    expect(given[2]?.answers).toContain('Question OQ-003 (Area: Services): Question of OQ-003?');
  });

  it('RF-209 gives a task of an area with no answered question nothing, and keeps its other data', () => {
    const given = withDeepenAnswers(tasks, rerunOf());

    expect(given[3]).toEqual(tasks[3]);
    expect(given[0]?.rejected).toBe('{"rejected":[]}');
  });

  it('RF-209 leaves the tasks as they are when the project has no answers', () => {
    expect(withDeepenAnswers(tasks, undefined)).toEqual(tasks);
  });
});

describe('RF-209 how many answers a Deepen used', () => {
  it('RF-209 counts each question once, whatever number of tasks read its area', () => {
    expect(answersGivenTo(tasks, rerunOf())).toEqual([
      `${runKey}/OQ-001`,
      `${runKey}/OQ-002`,
      `${runKey}/OQ-003`,
    ]);
  });

  it('RF-209 counts only the questions of the areas the tasks read', () => {
    expect(answersGivenTo(tasks.slice(2, 3), rerunOf())).toEqual([`${runKey}/OQ-003`]);
    expect(answersGivenTo(tasks, undefined)).toEqual([]);
  });
});

describe('RF-241 the questions a Deepen used are marked Answered', () => {
  it('RF-241 marks the questions of the areas whose task ended Done, in the run that raised them', async () => {
    const marked: string[][] = [];

    await markUsedAnswers(rerunOf(marked), new Set(['Catalog']));

    expect(marked).toEqual([[runKey, 'OQ-001', 'OQ-002']]);
  });

  it('RF-241 marks nothing when no task ended Done or the project has no answers', async () => {
    const marked: string[][] = [];

    await markUsedAnswers(rerunOf(marked), new Set());
    await markUsedAnswers(undefined, new Set(['Catalog']));

    expect(marked).toEqual([]);
  });
});

function openQuestion(id: string, question: string): Card {
  return {
    id,
    type: 'OQ',
    title: question,
    summary: 'A summary.',
    area: 'Catalog',
    agentTaskId: 'reader-003',
    confidence: 'Medium',
    claims: [],
    question,
  };
}

describe('RF-646 a new open question that asks the same as an answered one', () => {
  const answered = [{ question: 'Who uses the catalog pages?' }];

  it('RF-646 is merged into the answered question: same words, other case and marks', () => {
    const fresh = [
      openQuestion('OQ-004', 'who uses the CATALOG pages'),
      openQuestion('OQ-005', 'How many items are there?'),
    ];

    expect(mergedIntoAnswered(fresh, answered).map((card) => card.id)).toEqual(['OQ-004']);
  });

  it('RF-646 never merges a card that is not an open question or has no words', () => {
    const feature: Card = {
      ...openQuestion('FEAT-001', 'Who uses the catalog pages?'),
      type: 'FEAT',
    };
    const blank = openQuestion('OQ-006', '?!');

    expect(mergedIntoAnswered([feature, blank], [{ question: '?!' }, ...answered])).toEqual([]);
  });
});
