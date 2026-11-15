import { describe, expect, it } from 'vitest';
import { gapOutcome } from '../../../../../src/application/lab/targets/gap-target.js';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';

// RF-1406, RF-1403 (P10-07): a gap answer records the follow-ups a run would make apart from its
// label (`repair call`, `second round`; only `second round` after a repair), and a `requirement:`
// item is covered by a counted card that lists the requirement (the run's `coverageOf`, P9-06).

const input = {
  items: [
    { id: 'feature:F-1', kind: 'feature', name: 'Search', detail: 'Finds a customer.' },
    { id: 'flow:FLOW-1', kind: 'flow', name: 'Edit an item', detail: 'A clerk edits.' },
    { id: 'requirement:REQ-002', kind: 'requirement', name: 'Audit', detail: 'Logs edits.' },
  ],
  phases: [{ number: 1, name: 'Base', goal: 'The base exists.' }],
  requirements: [{ title: 'Customer search' }, { title: 'Audit' }],
  tasks: [{ id: 'T-001', title: 'Set up' }],
};

function card(builds: readonly string[], extra: Record<string, unknown> = {}) {
  return {
    ...{ title: 'Build it', phase: 1, requirements: [1, 2], invariant: 'Nothing is lost.' },
    acceptanceCriteria: ['Given a customer Ann, when a clerk searches Ann, then Ann is shown.'],
    ...{ riskClass: 'none', adds: [], probes: [], files: ['src/a/'], dependsOn: [], builds },
    ...extra,
  };
}

const answer = (tasks: unknown[]): string => JSON.stringify({ tasks, links: [] });

describe('the follow-ups of a gap answer', () => {
  it('RF-1406 covers a requirement item through a card that lists the requirement', () => {
    expect(gapOutcome(answer([card(['feature:F-1', 'flow:FLOW-1'])]), input)).toEqual({
      ...{ usable: true, detail: 'Covered' },
      followUps: { 'repair call': false, 'second round': false },
    });
    const notListed = card(['feature:F-1', 'flow:FLOW-1'], { requirements: [1] });
    expect(gapOutcome(answer([notListed]), input).detail).toBe('Open');
  });

  it('RF-1406 counts the repair call and the second round apart from the label', () => {
    const late = card(['flow:FLOW-1'], { phase: 9 });

    expect(gapOutcome(answer([card(['feature:F-1']), late]), input)).toEqual({
      ...{ usable: true, detail: 'LeftOut' },
      followUps: { 'repair call': true, 'second round': true },
    });
    expect(gapOutcome('{"tasks":[]}', input).followUps).toEqual({
      ...{ 'repair call': false },
      'second round': true,
    });
    expect(gapOutcome('No cards.', input).followUps).toBeUndefined();
  });

  it('RF-1406 records only the second round after a gap repair', async () => {
    const [repair] = repairTargets({
      gap: draftFile('planner/gap.v6.md', 'GAP'),
      plan: draftFile('planner/package.v12.md', 'PACKAGE'),
    });
    const problems = [
      { position: 1, field: 'phase', reason: 'names a phase that the plan does not have' },
    ];
    const parsed = repair?.parseInput({ ...input, problems });
    if (parsed?.ok !== true) throw new Error('the gap repair case does not read');
    const { env } = environment([{ text: answer([card(['feature:F-1'])]) }]);

    const outcome = await parsed.value.run(env, draftFile('x.v9.md', 'P'));

    expect(outcome).toEqual({ usable: true, detail: 'Open', followUps: { 'second round': true } });
  });
});
