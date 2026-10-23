import { describe, expect, it } from 'vitest';
import { readPlanAnswer } from '../../../../src/application/plan/plan-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// P3-126, RF-601, RF-622, ADR-013: one item of a list of the planner's answer that does not read is
// left out and listed by its list, position and field; the answer is refused only when no
// requirement reads. Synthetic answers only (ADR-008).

const requirement = (title: string) => ({ title, statement: `${title}.`, sources: ['FEAT-001'] });
const phase = (name: string) => ({ name, goal: `${name} runs.`, exitCriteria: ['It runs.'] });
const control = { name: 'Input check', approach: 'allowlist', description: 'Checks input.' };
const environment = { name: 'Staging', purpose: 'Rehearsals.' };
const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

function answerWith(extra: object): string {
  return JSON.stringify({ requirements: [requirement('Order')], ...extra });
}

describe('readPlanAnswer: an item that does not read is left out', () => {
  it('P3-126 a security control without a description and an environment without a purpose are listed', () => {
    const { draft, problems } = readPlanAnswer(
      answerWith({
        technical: {
          security: [
            control,
            { name: control.name, approach: control.approach },
            { ...control, name: 'Second' },
            'not an object',
          ],
          environments: [{ name: 'Broken' }, environment],
        },
      }),
    );

    expect(draft?.technical.security.map((each) => each.name)).toEqual(['Input check', 'Second']);
    expect(draft?.technical.environments.map((each) => each.name)).toEqual(['Staging']);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'technical.security', position: 2, field: 'description' }),
      expect.objectContaining({ list: 'technical.security', position: 4, field: 'item' }),
      expect.objectContaining({ list: 'technical.environments', position: 1, field: 'purpose' }),
    ]);
    expect(problems).toEqual([]);
  });
});

describe('readPlanAnswer: every list', () => {
  it('P3-126 every list reads its items one by one', () => {
    const { draft } = readPlanAnswer(
      answerWith({
        components: [{ name: 'Core' }, { responsibility: 'No name.' }],
        decisions: [{ title: 'Use X' }],
        entities: [{ legacy: 'Order' }, { legacy: 'Customer', target: 'Client' }],
        phases: [phase('Orders'), { name: 'No goal' }],
        risks: [{ text: 'Late data.' }, { sources: [] }],
        technical: {
          integrations: [
            { card: 'INT-001', action: 'keep' },
            { card: 'INT-002', action: 'drop' },
          ],
          targets: [{ name: 'Web' }, { name: 'Api', target: 'Node' }],
        },
      }),
    );

    expect(draft?.unreadableItems?.map((each) => `${each.list}#${String(each.position)}`)).toEqual([
      ...['components#2', 'decisions#1', 'entities#1', 'phases#2', 'risks#2'],
      ...['technical.integrations#2', 'technical.targets#1'],
    ]);
    expect(draft?.components).toHaveLength(1);
    expect(draft?.entities).toHaveLength(1);
    expect(draft?.risks).toHaveLength(1);
  });
});

describe('readPlanAnswer: the wording and the positions of what is left out', () => {
  it('P3-126 the reason is a fixed sentence and holds no text of the answer', () => {
    const { draft } = readPlanAnswer(
      answerWith({ risks: [{ text: 'sentinel-0451', sources: 'not a list' }] }),
    );

    expect(JSON.stringify(draft?.unreadableItems)).not.toContain('sentinel-0451');
    expect(draft?.unreadableItems?.[0]?.reason).toMatch(/not readable/u);
  });

  it('P3-126 a bad requirement or phase does not move the positions the cards point at', () => {
    const { draft } = readPlanAnswer(
      JSON.stringify({
        requirements: [{ title: 'Broken' }, requirement('Second'), requirement('Third')],
        phases: [{ name: 'Broken' }, phase('Real')],
        tasks: [{ ...task, phase: 2, requirements: [3, 1] }],
        decisions: [{ title: 'Broken' }, { title: 'D', context: 'c', decision: 'd' }],
        technical: { targets: [{ name: 'Web', target: 'Node', decision: 2 }] },
      }),
    );

    expect(draft?.requirements.map((each) => each.title)).toEqual(['Second', 'Third']);
    expect(draft?.tasks[0]).toMatchObject({ phase: 1, requirements: [2] });
    expect(draft?.technical.targets[0]?.decision).toBe(1);
  });

  it('P3-126 a task that points at the only phase that did not read is left out as before', () => {
    const { draft } = readPlanAnswer(
      JSON.stringify({
        requirements: [requirement('Order')],
        phases: [{ name: 'Broken' }],
        tasks: [task],
      }),
    );

    expect(draft?.tasks[0]?.phase).toBe(0);
  });
});

describe('readPlanAnswer: when the answer is refused', () => {
  it('P3-126 an answer with no requirement that reads is refused and names each failing item', () => {
    const { draft, problems } = readPlanAnswer(
      JSON.stringify({ requirements: [{ title: 'No statement' }, 'text'], phases: [phase('A')] }),
    );

    expect(draft).toBeUndefined();
    expect(problems).toEqual([
      { list: 'requirements', position: 1, field: 'statement' },
      { list: 'requirements', position: 2, field: 'item' },
    ]);
  });

  it('P3-126 an answer without the list of requirements names the list', () => {
    expect(readPlanAnswer('{"summary": "x"}')).toEqual({
      problems: [{ list: 'requirements', field: 'requirements' }],
    });
    expect(readPlanAnswer('{"requirements": []}').problems).toEqual([
      { list: 'requirements', field: 'requirements' },
    ]);
  });

  it('P3-126 an answer that holds no JSON object names the answer', () => {
    expect(readPlanAnswer('No plan today.')).toEqual({
      problems: [{ list: 'answer', field: 'answer' }],
    });
  });

  it('P3-126 a list that is not a list refuses the answer and names the list', () => {
    expect(readPlanAnswer(answerWith({ components: 'many' }))).toEqual({
      problems: [{ list: 'components', field: 'components' }],
    });
    expect(readPlanAnswer(answerWith({ technical: { security: 'many' } })).problems).toEqual([
      { list: 'technical.security', field: 'security' },
    ]);
  });
});
