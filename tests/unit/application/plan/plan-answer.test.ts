import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';

// RF-601, ADR-013: the planner's answer is untrusted text read as one bounded JSON object.

import { invariant, scenario } from '../../../support/task-card-fixtures.js';

const requirement = { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] };

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

  it('RF-601 a task card without acceptance criteria makes the answer unusable', () => {
    const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [] };

    expect(parsePlanAnswer(JSON.stringify({ requirements: [requirement], tasks: [task] }))).toBe(
      undefined,
    );
  });

  it('RF-601 a phase without exit criteria makes the answer unusable', () => {
    const phase = { name: 'First', goal: 'Orders.', exitCriteria: [] };

    expect(
      parsePlanAnswer(JSON.stringify({ requirements: [requirement], phases: [phase] })),
    ).toBeUndefined();
  });

  it('RF-601 refuses a text longer than its bound', () => {
    const long = { ...requirement, statement: 'x'.repeat(2001) };

    expect(parsePlanAnswer(JSON.stringify({ requirements: [long] }))).toBeUndefined();
  });
});

describe('parsePlanAnswer: task-card quality', () => {
  const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

  function tasksOf(extra: object): unknown {
    const answer = JSON.stringify({ requirements: [requirement], tasks: [{ ...task, ...extra }] });
    return parsePlanAnswer(answer)?.tasks;
  }

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

  it('RF-630 a kind of guard that does not exist makes the answer unusable', () => {
    expect(tasksOf({ adds: ['regex'] })).toBeUndefined();
  });

  it('RF-630 a blank probe makes the answer unusable', () => {
    expect(tasksOf({ probes: [' '] })).toBeUndefined();
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

  it('RF-622 DEC-135 a control whose approach is none of the known ones makes the answer unusable', () => {
    const control = { ...technical.security[0], approach: 'blocklist-ish' };

    expect(
      parsePlanAnswer(
        JSON.stringify({ requirements: [requirement], technical: { security: [control] } }),
      ),
    ).toBeUndefined();
  });

  it('RF-622 an integration action other than keep or replace makes the answer unusable', () => {
    const integration = { card: 'INT-001', action: 'ignore', note: '' };

    expect(
      parsePlanAnswer(
        JSON.stringify({ requirements: [requirement], technical: { integrations: [integration] } }),
      ),
    ).toBeUndefined();
  });

  it('RF-622 refuses a decision position below 1 and a text longer than its bound', () => {
    const environment = { name: 'Staging', purpose: 'x'.repeat(2001) };
    const position = { card: 'INT-001', action: 'keep', note: '', decision: 0 };

    for (const bad of [{ environments: [environment] }, { integrations: [position] }]) {
      expect(
        parsePlanAnswer(JSON.stringify({ requirements: [requirement], technical: bad })),
      ).toBeUndefined();
    }

describe('parsePlanAnswer: parallel-safe cards', () => {
  const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

  function tasksOf(extra: object): unknown {
    const answer = JSON.stringify({ requirements: [requirement], tasks: [{ ...task, ...extra }] });
    return parsePlanAnswer(answer)?.tasks;
  }

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

  it.each([
    ['a blank file', { files: [' '] }],
    [
      'more files than the bound',
      { files: Array.from({ length: 51 }, (_, at) => `f${String(at)}`) },
    ],
    ['a file longer than the bound', { files: ['x'.repeat(501)] }],
    ['a dependency that is not a position', { dependsOn: [0] }],
    [
      'more needs than the bound',
      { needs: Array.from({ length: 51 }, () => ({ kind: 'port', purpose: 'p' })) },
    ],
  ])('RF-634 %s makes the answer unusable', (_, extra) => {
    expect(tasksOf(extra)).toBeUndefined();
  });
});

describe('parsePlanAnswer: the output cap', () => {
  it('RF-601 reads no JSON past the output cap', () => {
    const padding = ' '.repeat(cardLimits.maxOutputChars);

    expect(parsePlanAnswer(`${padding}${JSON.stringify({ requirements: [requirement] })}`)).toBe(
      undefined,
    );
  });
});
