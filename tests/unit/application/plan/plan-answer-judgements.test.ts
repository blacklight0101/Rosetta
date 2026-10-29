import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import { loadPlannerPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-631, P5-41, ADR-013: the planner's judgement of a claim and the criteria it says contradict a
// kept claim are read item by item from the answer, checked by code, and asked for by the versioned
// planner prompt.

const task = {
  title: 'Sign in',
  phase: 1,
  requirements: [1],
  acceptanceCriteria: ['Given a user, when signing in, then the home page opens.'],
  invariant: 'A user signs in only with the right password.',
  riskClass: 'none',
};

function answerWith(extra: Record<string, unknown>): string {
  return JSON.stringify({
    summary: 'S.',
    requirements: [{ title: 'R', statement: 'S.', sources: ['FEAT-001'] }],
    decisions: [
      { title: 'D1', context: 'c', decision: 'd', sources: ['FEAT-001'] },
      { title: 'D2', context: 'c', decision: 'd', sources: ['FEAT-001'] },
    ],
    phases: [{ name: 'P', goal: 'g', exitCriteria: ['e'] }],
    tasks: [task],
    ...extra,
  });
}

describe('claim judgements in the planner answer', () => {
  it('RF-631 a judgement is read with its claim, kind, decision, reason and security mark', () => {
    const draft = parsePlanAnswer(
      answerWith({
        claimJudgements: [
          { claim: 'FEAT-001.c1', judgement: 'change', decision: 2, reason: 'Hashing.' },
          { claim: 'FEAT-001.c2', judgement: 'defect', reason: 'Fixed date.', security: true },
        ],
      }),
    );

    expect(draft?.claimJudgements).toEqual([
      {
        ...{ claim: 'FEAT-001.c1', judgement: 'change', decision: 2, answer: null },
        ...{ reason: 'Hashing.', security: false },
      },
      {
        ...{ claim: 'FEAT-001.c2', judgement: 'defect', decision: null, answer: null },
        ...{ reason: 'Fixed date.', security: true },
      },
    ]);
  });

  it('RF-631 an answer with no judgement list has none', () => {
    expect(parsePlanAnswer(answerWith({}))?.claimJudgements ?? []).toEqual([]);
  });

  it('ADR-013 a judgement of an unknown kind is left out and listed, the others stay', () => {
    const draft = parsePlanAnswer(
      answerWith({
        claimJudgements: [
          { claim: 'FEAT-001.c1', judgement: 'ignore', reason: 'x' },
          { claim: 'FEAT-001.c2', judgement: 'defect', reason: 'x' },
        ],
      }),
    );

    expect(draft?.claimJudgements?.map((each) => each.claim)).toEqual(['FEAT-001.c2']);
    expect(draft?.unreadableItems?.[0]).toMatchObject({ list: 'claimJudgements', position: 1 });
  });
});

describe('claim judgements in the planner answer, the other cases', () => {
  it('RF-631 a decision position follows the decisions that were kept', () => {
    const draft = parsePlanAnswer(
      answerWith({
        decisions: [
          { title: '', context: 'c', decision: 'd' },
          { title: 'D2', context: 'c', decision: 'd' },
        ],
        claimJudgements: [{ claim: 'FEAT-001.c1', judgement: 'change', decision: 2, reason: 'x' }],
      }),
    );

    expect(draft?.claimJudgements?.[0]?.decision).toBe(1);
  });

  it('P5-41 a task reads the criteria it says contradict a claim', () => {
    const draft = parsePlanAnswer(
      answerWith({
        tasks: [{ ...task, contradicts: [{ criterion: 1, claim: 'FEAT-001.c2' }] }],
      }),
    );

    expect(draft?.tasks[0]?.contradicts).toEqual([{ criterion: 1, claim: 'FEAT-001.c2' }]);
  });
});

describe('claim judgements in the plan', () => {
  it('RF-631 the plan holds the checked judgements, with the ADR id of the decision', () => {
    const draft = parsePlanAnswer(
      answerWith({
        claimJudgements: [
          { claim: 'FEAT-001.c1', judgement: 'change', decision: 2, reason: 'Hashing.' },
          { claim: 'FEAT-777.c1', judgement: 'defect', reason: 'Unknown card.' },
        ],
      }),
    );
    if (draft === undefined) throw new Error('The answer reads.');

    const { content } = assemblePlan(draft, new Set(['FEAT-001']));

    expect(content.judgements).toEqual([
      expect.objectContaining({ claimId: 'FEAT-001.c1', kind: 'change', decisionId: 'ADR-002' }),
    ]);
  });

  it('P5-41 a task keeps its contradictions', () => {
    const draft = parsePlanAnswer(
      answerWith({ tasks: [{ ...task, contradicts: [{ criterion: 1, claim: 'FEAT-001.c2' }] }] }),
    );
    if (draft === undefined) throw new Error('The answer reads.');

    const { content } = assemblePlan(draft, new Set(['FEAT-001']));

    expect(content.tasks[0]?.contradicts).toEqual([{ criterion: 1, claim: 'FEAT-001.c2' }]);
  });
});

describe('the planner prompt', () => {
  it('RNF-004 P5-41 the planner prompt is package.v11.md and asks for the judgements', async () => {
    const file = await loadPlannerPrompt('prompts');
    const text = await readFile('prompts/planner/package.v11.md', 'utf8');

    expect(file).toMatchObject({ name: 'planner/package.v11.md', version: 'v11' });
    expect(text).toContain('claimJudgements');
    expect(text).toContain('contradicts');
  });

  it('DEC-11 the judgement wording names no language, framework or product', async () => {
    const text = await readFile('prompts/planner/package.v11.md', 'utf8');
    const section = text.slice(text.indexOf('claimJudgements'));

    expect(section).not.toMatch(/\b(c#|\.net|asp|java|php|python|sql server|bcrypt)\b/iu);
  });
});

describe('a contradicts item that does not read', () => {
  it('P5-41 RF-631 is left out and listed by task position and field, the others stay', () => {
    const draft = parsePlanAnswer(
      answerWith({
        tasks: [
          {
            ...task,
            contradicts: [
              { criterion: 0, claim: 'FEAT-001.c2' },
              { criterion: 1, claim: 'FEAT-001.c2' },
            ],
          },
        ],
      }),
    );

    expect(draft?.tasks[0]?.contradicts).toEqual([{ criterion: 1, claim: 'FEAT-001.c2' }]);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'tasks.contradicts', position: 1, field: 'contradicts' }),
    ]);
  });
});
