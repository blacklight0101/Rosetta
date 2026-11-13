import { describe, expect, it } from 'vitest';
import type { LabTarget } from '../../../../src/application/lab/lab-target.js';
import { gapTarget } from '../../../../src/application/lab/targets/gap-target.js';
import { mergeTarget } from '../../../../src/application/lab/targets/merge-target.js';
import { draftFile, environment } from '../../../support/lab-target-env.js';

// RF-1406, ADR-029: the planner gap target and the summariser merge target render the run's own
// messages under the prompt they are given and read the answer with the run's own parser.

const gapInput = {
  items: [{ id: 'feature:F-1', kind: 'feature', name: 'Search', detail: 'Finds a customer.' }],
  phases: [{ number: 1, name: 'Base', goal: 'The base exists.' }],
  requirements: [{ title: 'Customer search' }],
  tasks: [{ id: 'T-001', title: 'Migrations' }],
};

const mergeInput = {
  type: 'BR',
  cards: [
    { id: 'BR-001', area: 'a', title: 'Late fee', summary: 's', claims: ['c1'] },
    { id: 'BR-002', area: 'b', title: 'Late fees', summary: 's', claims: ['c2'] },
  ],
};

async function run(target: LabTarget, input: unknown, answers: string[]) {
  const parsed = target.parseInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const { env, requests } = environment(answers.map((text) => ({ text })));
  const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'The prompt under test.'));
  return { outcome, requests };
}

describe('the planner gap target', () => {
  it('RF-1406 sends the two data blocks of the run under the prompt it is given', async () => {
    const { requests } = await run(gapTarget(), gapInput, ['{"tasks":[]}']);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.system).toBe('The prompt under test.');
    expect(requests[0]?.context.role).toBe('planner');
    const message = requests[0]?.messages[0]?.content ?? '';
    expect(message.match(/<<<ROSETTA-DATA /gu)).toHaveLength(2);
    expect(message).toContain('feature:F-1');
    expect(message).toContain('Customer search');
  });

  it('RF-1406 tells an empty valid answer from an unreadable one', async () => {
    const empty = await run(gapTarget(), gapInput, ['{"tasks":[]}']);
    const bad = await run(gapTarget(), gapInput, ['No idea.']);

    expect(empty.outcome).toEqual({ usable: true, detail: 'NoCards' });
    expect(bad.outcome).toEqual({ usable: false, detail: 'Unusable' });
    expect(gapTarget().readsAnswer('{"tasks":[]}')).toBe(true);
    expect(gapTarget().readsAnswer('No idea.')).toBe(false);
  });

  it('RF-1406 refuses a case with no item or an unknown key', () => {
    expect(gapTarget().parseInput({ ...gapInput, items: [] }).ok).toBe(false);
    expect(gapTarget().parseInput({ ...gapInput, stray: 1 }).ok).toBe(false);
  });
});

describe('the summariser merge target', () => {
  it('RF-1406 sends the cards as the one data block of the run', async () => {
    const { requests } = await run(mergeTarget(), mergeInput, ['{"merges":[]}']);

    expect(requests[0]?.context.role).toBe('summariser');
    const message = requests[0]?.messages[0]?.content ?? '';
    expect(message.match(/<<<ROSETTA-DATA /gu)).toHaveLength(1);
    expect(message).toContain('BR-002');
  });

  it('RF-1406 tells a merge from none and from an unreadable answer', async () => {
    const merged = await run(mergeTarget(), mergeInput, [
      '{"merges":[{"ids":["BR-001","BR-002"],"title":"Late fee","summary":"One rule."}]}',
    ]);
    const none = await run(mergeTarget(), mergeInput, ['{"merges":[]}']);
    const bad = await run(mergeTarget(), mergeInput, ['Both are the same.']);

    expect(merged.outcome).toEqual({ usable: true, detail: 'Merges' });
    expect(none.outcome).toEqual({ usable: true, detail: 'NoMerge' });
    expect(bad.outcome).toEqual({ usable: false, detail: 'Unusable' });
  });

  it('RF-1406 refuses a case with one card or a type that is not merged', () => {
    const one = { ...mergeInput, cards: mergeInput.cards.slice(0, 1) };

    expect(mergeTarget().parseInput(one).ok).toBe(false);
    expect(mergeTarget().parseInput({ ...mergeInput, type: 'OQ' }).ok).toBe(false);
  });
});
