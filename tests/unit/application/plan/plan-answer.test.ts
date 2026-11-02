import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';

// RF-601, ADR-013: the planner's answer is untrusted text read as one bounded JSON object.

import { invariant, scenario } from '../../../support/task-card-fixtures.js';

const requirement = { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] };
const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

/** An answer with one requirement and one task card, the card's fields overridden by `extra`. */
function answerWith(extra: object): string {
  return JSON.stringify({ requirements: [requirement], tasks: [{ ...task, ...extra }] });
}

function tasksOf(extra: object): unknown {
  return parsePlanAnswer(answerWith(extra))?.tasks;
}

function unreadableOf(extra: object): unknown {
  return parsePlanAnswer(answerWith(extra))?.unreadableTasks;
}

describe('parsePlanAnswer', () => {
  it('RF-601 reads a fenced answer and gives every list it left out as empty', () => {
    const draft = parsePlanAnswer(
      `Here is the plan.\n\`\`\`json\n${JSON.stringify({ requirements: [requirement] })}\n\`\`\``,
    );

    expect(draft).toEqual({
      summary: '',
      requirements: [requirement],
      components: [],
      decisions: [],
      entities: [],
      phases: [],
      tasks: [],
      risks: [],
      technical: { integrations: [], security: [], targets: [], environments: [] },
    });
  });

  it('RF-601 an answer without a requirement is no answer', () => {
    expect(parsePlanAnswer('{"requirements": []}')).toBeUndefined();
    expect(parsePlanAnswer('No plan today.')).toBeUndefined();
  });

  it('RF-601 P3-82 a task card without acceptance criteria is listed as unreadable and the answer stays', () => {
    const draft = parsePlanAnswer(answerWith({ acceptanceCriteria: [] }));

    expect(draft).toBeDefined();
    expect(draft?.unreadableTasks).toEqual([
      expect.objectContaining({ position: 1, field: 'acceptanceCriteria' }),
    ]);
  });

  it('RF-601 a phase without exit criteria is left out and the answer stays', () => {
    const phase = { name: 'First', goal: 'Orders.', exitCriteria: [] };

    const draft = parsePlanAnswer(JSON.stringify({ requirements: [requirement], phases: [phase] }));

    expect(draft?.phases).toEqual([]);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'phases', position: 1, field: 'exitCriteria' }),
    ]);
  });

  it('RF-601 refuses a text longer than its bound', () => {
    const long = { ...requirement, statement: 'x'.repeat(2001) };

    expect(parsePlanAnswer(JSON.stringify({ requirements: [long] }))).toBeUndefined();
  });
});

describe('parsePlanAnswer: task-card quality', () => {
  it('RF-630 reads the invariant, the risk class, the guard kinds and the probes of a task', () => {
    const extra = {
      ...{ invariant, riskClass: 'money', adds: ['limit', 'filter'] },
      probes: ['A basket of 50.01.'],
    };

    expect(tasksOf(extra)).toEqual([{ ...task, ...extra, files: [], needs: [], dependsOn: [] }]);
  });

  it('RF-630 a task that says none of it is read with no invariant, class or probes', () => {
    expect(tasksOf({})).toEqual([
      { ...task, ...{ invariant: '', adds: [], probes: [] }, files: [], needs: [], dependsOn: [] },
    ]);
  });

  it('RF-635 a risk class that does not exist is read as no class', () => {
    expect(tasksOf({ riskClass: 'catastrophic' })).toMatchObject([{ riskClass: undefined }]);
  });

  it('RF-630 P3-82 a kind of guard that does not exist leaves that card unreadable, the others stay', () => {
    expect(unreadableOf({ adds: ['regex'] })).toEqual([
      expect.objectContaining({ position: 1, field: 'adds' }),
    ]);
  });

  it('RF-630 P3-82 a blank probe leaves that card unreadable', () => {
    expect(unreadableOf({ probes: [' '] })).toEqual([
      expect.objectContaining({ position: 1, field: 'probes' }),
    ]);
  });
});

const technical = {
  integrations: [{ card: 'INT-001', action: 'replace', note: 'Wrap it.', decision: 2 }],
  security: [
    {
      ...{ name: 'Upload filter', approach: 'denylist', description: 'Forbids extensions.' },
      ...{ invariant: 'Nothing runs.', alternative: 'Allow a list.', sources: ['BR-001'] },
    },
  ],
  targets: [{ name: 'Time', target: 'Two seconds.', sources: ['FEAT-001'] }],
  environments: [{ name: 'Staging', purpose: 'Before a release.' }],
};

describe('parsePlanAnswer: the technical part', () => {
  it('RF-622 reads integrations, security controls, targets and environments with their defaults', () => {
    const draft = parsePlanAnswer(JSON.stringify({ requirements: [requirement], technical }));

    expect(draft?.technical).toEqual({
      integrations: [{ card: 'INT-001', action: 'replace', note: 'Wrap it.', decision: 2 }],
      security: [{ ...technical.security[0], decision: null }],
      targets: [{ name: 'Time', target: 'Two seconds.', sources: ['FEAT-001'], decision: null }],
      environments: [{ name: 'Staging', purpose: 'Before a release.', decision: null }],
    });
  });

  it('RF-622 DEC-135 a control whose approach is none of the known ones is left out, the answer stays', () => {
    const control = { ...technical.security[0], approach: 'blocklist-ish' };

    expect(
      parsePlanAnswer(
        JSON.stringify({ requirements: [requirement], technical: { security: [control] } }),
      )?.technical.security,
    ).toEqual([]);
  });

  it('RF-622 an integration action other than keep or replace is left out, the answer stays', () => {
    const integration = { card: 'INT-001', action: 'ignore', note: '' };

    expect(
      parsePlanAnswer(
        JSON.stringify({ requirements: [requirement], technical: { integrations: [integration] } }),
      )?.technical.integrations,
    ).toEqual([]);
  });

  it('RF-622 leaves out an item with a decision position below 1 and a text longer than its bound', () => {
    const environment = { name: 'Staging', purpose: 'x'.repeat(2001) };
    const position = { card: 'INT-001', action: 'keep', note: '', decision: 0 };

    for (const bad of [{ environments: [environment] }, { integrations: [position] }]) {
      const draft = parsePlanAnswer(
        JSON.stringify({ requirements: [requirement], technical: bad }),
      );
      expect(draft?.unreadableItems).toHaveLength(1);
    }
  });
});

const boundedFaults: [string, object, string][] = [
  ['a blank file', { files: [' '] }, 'files'],
  [
    'more files than the bound',
    { files: Array.from({ length: 51 }, (_, at) => `f${String(at)}`) },
    'files',
  ],
  ['a file longer than the bound', { files: ['x'.repeat(501)] }, 'files'],
  ['more dependencies than the bound', { dependsOn: new Array<number>(51).fill(1) }, 'dependsOn'],
  [
    'more needs than the bound',
    { needs: Array.from({ length: 51 }, () => ({ kind: 'port', purpose: 'p' })) },
    'needs',
  ],
];

describe('parsePlanAnswer: parallel-safe cards', () => {
  it('RF-634 reads the files, the needed identifiers and the cards a task waits for', () => {
    const extra = {
      files: ['src/orders/', 'tests/orders.test.ts'],
      needs: [{ kind: 'error code', purpose: 'order not found' }],
      dependsOn: [2],
    };

    expect(tasksOf(extra)).toMatchObject([extra]);
  });

  it('RF-634 a need of a kind that does not exist is left out, the answer stays usable', () => {
    const needs = [
      { kind: 'ticket number', purpose: 'a' },
      { kind: 'port', purpose: 'api' },
      { kind: 'port' },
      'port',
    ];

    expect(tasksOf({ needs })).toMatchObject([{ needs: [{ kind: 'port', purpose: 'api' }] }]);
  });

  it.each(boundedFaults)(
    'RF-634 P3-82 %s leaves that card unreadable, the answer stays',
    (_, extra, field) => {
      expect(unreadableOf(extra)).toEqual([expect.objectContaining({ position: 1, field })]);
    },
  );
});

describe('parsePlanAnswer: the output cap', () => {
  it('RF-601 reads no JSON past the output cap', () => {
    const padding = ' '.repeat(cardLimits.maxOutputChars);

    expect(parsePlanAnswer(`${padding}${JSON.stringify({ requirements: [requirement] })}`)).toBe(
      undefined,
    );
  });
});

describe('parsePlanAnswer: positions written as objects (Q-54)', () => {
  it('RF-601 Q-54 reads an object with a numeric position in requirements and dependsOn', () => {
    const extra = {
      requirements: [{ position: 3 }, 1],
      dependsOn: [{ position: 4, builds: ['T-004'] }],
    };

    expect(tasksOf(extra)).toMatchObject([{ requirements: [3, 1], dependsOn: [4] }]);
  });

  it.each([
    ['a position written as a string', { position: '3' }],
    ['an object with an id and no position', { id: 3 }],
    ['a position of 0', { position: 0 }],
    ['null', null],
  ])('RF-601 P7-15 %s in requirements is dropped and the card kept', (_name, bad) => {
    expect(unreadableOf({ requirements: [bad] })).toBeUndefined();
    expect(tasksOf({ requirements: [bad] })).toMatchObject([{ requirements: [] }]);
  });
});

describe('parsePlanAnswer: positions written as an index (EV-01)', () => {
  it('RF-601 EV-01 reads an object with an index in requirements and dependsOn', () => {
    const extra = { requirements: [{ index: 1 }, { index: 2 }], dependsOn: [{ index: 3 }] };

    expect(tasksOf(extra)).toMatchObject([{ requirements: [1, 2], dependsOn: [3] }]);
  });

  it('RF-601 P7-15 an index of 0 is dropped and the card kept', () => {
    expect(unreadableOf({ requirements: [{ index: 0 }] })).toBeUndefined();
    expect(tasksOf({ requirements: [{ index: 0 }] })).toMatchObject([{ requirements: [] }]);
  });

  it('RF-601 EV-01 the recorded index-form answer of the evaluation assembles', async () => {
    const text = await readFile(
      join('tests', 'fixtures', 'plan-answers', 'ev01-index-positions.json'),
      'utf8',
    );
    const draft = parsePlanAnswer(text);

    expect(draft?.unreadableTasks).toBeUndefined();
    expect(draft?.tasks).toHaveLength(7);
    expect(draft?.tasks[4]?.requirements).toEqual([10, 11]);
    expect(draft?.tasks[2]?.dependsOn).toEqual([1]);
  });

  it('RF-601 P3-82 a card that is not an object is listed under the field card', () => {
    const draft = parsePlanAnswer(
      JSON.stringify({ requirements: [requirement], tasks: ['Orders'] }),
    );

    expect(draft?.unreadableTasks).toEqual([
      expect.objectContaining({ position: 1, field: 'card' }),
    ]);
  });

  it('RF-601 P3-82 an unreadable card keeps the others and the positions they point at', () => {
    const later = { ...task, title: 'Later', dependsOn: [1] };
    const draft = parsePlanAnswer(
      JSON.stringify({
        requirements: [requirement],
        tasks: [task, { ...task, acceptanceCriteria: [] }, later],
      }),
    );

    expect(draft?.tasks).toHaveLength(3);
    expect(draft?.tasks[2]).toMatchObject({ title: 'Later', dependsOn: [1] });
    expect(draft?.unreadableTasks).toEqual([expect.objectContaining({ position: 2 })]);
  });
});
