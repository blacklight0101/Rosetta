import { describe, expect, it } from 'vitest';
import { capturablePromptIds } from '../../../../../src/application/lab/capture/capture-rules.js';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';

// RF-1406, ADR-029: the targets of the planner's two repair prompts send the message of the call
// again with the file under test and the problem lines after it, under the run's own system prompt
// of that call (the gap prompt, the package prompt), and read the answer with the run's parser.

const targets = repairTargets({
  gap: draftFile('planner/gap.v6.md', 'GAP SYSTEM'),
  plan: draftFile('planner/package.v12.md', 'PACKAGE SYSTEM'),
});
const find = (id: string) => {
  const found = targets.find((each) => each.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};
const card = {
  id: 'FEAT-001',
  type: 'FEAT',
  title: 'Checkout',
  summary: 'Pays.',
  claims: [{ claimId: 'FEAT-001.c1', text: 'Pays.', citations: ['src/A.cs:1-2'] }],
};

const inputs: Record<string, Record<string, unknown>> = {
  'planner/gap-repair': {
    items: [{ id: 'feature:F-1', kind: 'feature', name: 'Checkout', detail: 'Pays.' }],
    phases: [{ number: 1, name: 'Base', goal: 'Run.' }],
    requirements: [{ title: 'Pay for a cart' }],
    tasks: [{ id: 'T-001', title: 'Set up' }],
    problems: [
      { position: 2, field: 'phase', reason: 'names a phase that the plan does not have' },
    ],
  },
  'planner/plan-repair': {
    cards: [card],
    owner: { planningBrief: {} },
    problems: [
      { list: 'requirements', position: 1, field: 'sources', reason: 'No card id.' },
      { list: 'answer', field: 'answer' },
    ],
  },
};

const lines: Record<string, readonly string[]> = {
  'planner/gap-repair': ['Card 2: the field "phase" names a phase that the plan does not have.'],
  'planner/plan-repair': [
    'requirements, position 1: the field "sources". No card id.',
    'answer: the field "answer".',
  ],
};

const answers: readonly (readonly [string, string, string])[] = [
  ['planner/gap-repair', '{"tasks":[]}', 'NoCards'],
  ['planner/gap-repair', 'No cards.', 'Unusable'],
  ['planner/plan-repair', 'No plan.', 'Unusable'],
];

describe('the planner repair targets', () => {
  it.each(Object.entries({ 'planner/gap-repair': 'GAP', 'planner/plan-repair': 'PACKAGE' }))(
    'RF-1406 sends %s under the system prompt of its call, the file and the problems after the data',
    async (id, system) => {
      const parsed = find(id).parseInput(inputs[id]);
      if (!parsed.ok) throw new Error(parsed.error);
      const { env, requests } = environment([{ text: 'x' }]);

      await parsed.value.run(env, draftFile('x.v9.md', 'The repair under test.\n'));

      expect(requests).toHaveLength(1);
      expect(requests[0]?.context.role).toBe('planner');
      expect(requests[0]?.system).toBe(`${system} SYSTEM`);
      const message = requests[0]?.messages[0]?.content ?? '';
      expect(message.match(/<<<ROSETTA-DATA /gu)).toHaveLength(2);
      expect(message).toContain('The repair under test.');
      expect(message.endsWith(`The repair under test.\n${(lines[id] ?? []).join('\n')}`)).toBe(
        true,
      );
    },
  );
});

describe('the planner repair targets read and refuse', () => {
  it.each(answers)('RF-1406 reads the answer for %s: %s is %s', async (id, text, detail) => {
    const parsed = find(id).parseInput(inputs[id]);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env } = environment([{ text }]);

    const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'P'));

    expect(outcome.detail).toBe(detail);
    expect(find(id).readsAnswer(text)).toBe(outcome.usable);
  });

  it.each(Object.keys(inputs))(
    'RF-1401 refuses a stray key and a case with no problem for %s',
    (id) => {
      const target = find(id);

      expect(target.parseInput({ ...inputs[id], stray: 1 }).ok).toBe(false);
      expect(target.parseInput({ ...inputs[id], problems: [] }).ok).toBe(false);
    },
  );

  it('RF-1401 refuses a gap problem at position 0', () => {
    const at = { position: 0, field: 'phase', reason: 'is not valid' };

    expect(
      find('planner/gap-repair').parseInput({ ...inputs['planner/gap-repair'], problems: [at] }).ok,
    ).toBe(false);
  });
});

describe('the capture of the repair prompts', () => {
  it('RF-1406 has no rule for a repair prompt, whose message no saved task holds whole', () => {
    const repairs = ['planner/gap-repair', 'planner/plan-repair', 'cards/repair'];

    expect(repairs.filter((id) => capturablePromptIds.includes(id))).toEqual([]);
  });
});
