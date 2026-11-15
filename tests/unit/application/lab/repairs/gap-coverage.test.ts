import { describe, expect, it } from 'vitest';
import { gapOutcome } from '../../../../../src/application/lab/targets/gap-target.js';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';

// RF-1406, RF-627 (P10-07): the lab checks a gap or gap repair answer as the gap round of a run
// does. `LeftOut`: a run makes its one repair call; `Open`: a run asks a second round or ends
// RST-1806; `ModulesOpen`: only modules are touched by no card; `Covered`: nothing is left.

const input = {
  items: [
    { id: 'feature:F-1', kind: 'feature', name: 'Search', detail: 'Finds a customer.' },
    { id: 'flow:FLOW-1', kind: 'flow', name: 'Edit an item', detail: 'A clerk edits.' },
    { id: 'module:src/App', kind: 'module', name: 'src/App', detail: 'A web application.' },
  ],
  phases: [
    { number: 1, name: 'Base', goal: 'The base exists.' },
    { number: 2, name: 'Catalog', goal: 'The catalog works.' },
  ],
  requirements: [{ title: 'Customer search' }],
  tasks: [
    { id: 'T-001', title: 'Write the database migrations in the chosen stack' },
    { id: 'T-002', title: 'Create, edit and delete catalog items' },
  ],
};

function card(builds: readonly string[], extra: Record<string, unknown> = {}) {
  return {
    ...{ title: 'Build the search', phase: 1, requirements: [1] },
    invariant: 'A search never shows a customer of another shop.',
    acceptanceCriteria: ['Given a customer Ann, when a clerk searches Ann, then Ann is shown.'],
    ...{ riskClass: 'none', adds: [], probes: [], files: ['src/search/'], dependsOn: [], builds },
    ...extra,
  };
}

const answer = (tasks: unknown[], links: unknown[] = []): string =>
  JSON.stringify({ tasks, links });

const everything = card(['feature:F-1', 'flow:FLOW-1', 'module:src/App']);

describe('the gap check of the lab', () => {
  it('RF-1406 reads an answer that builds every item of the block as Covered', () => {
    const linked = answer(
      [card(['feature:F-1', 'module:src/App'])],
      [{ task: 'T-002', builds: ['flow:FLOW-1'] }],
    );

    expect(gapOutcome(answer([everything]), input)).toMatchObject({
      usable: true,
      detail: 'Covered',
    });
    expect(gapOutcome(linked, input)).toMatchObject({ usable: true, detail: 'Covered' });
  });

  it('RF-1406 reads an item no card builds as Open, and a module alone as ModulesOpen', () => {
    const migrations = answer(
      [card(['feature:F-1', 'module:src/App'])],
      [{ task: 'T-001', builds: ['flow:FLOW-1'] }],
    );

    expect(gapOutcome(answer([card(['feature:F-1', 'module:src/App'])]), input).detail).toBe(
      'Open',
    );
    expect(gapOutcome(migrations, input).detail).toBe('Open');
    expect(gapOutcome(answer([], [{ task: 'T-009', builds: ['flow:FLOW-1'] }]), input).detail).toBe(
      'Open',
    );
    expect(gapOutcome('{"tasks":[]}', input)).toMatchObject({ usable: true, detail: 'Open' });
    expect(gapOutcome(answer([card(['feature:F-1', 'flow:FLOW-1'])]), input)).toMatchObject({
      usable: true,
      detail: 'ModulesOpen',
    });
  });
});

describe('the gap check of the lab: the repair', () => {
  it('RF-1406 reads a card left out that names an open item as LeftOut, the run asking a repair', () => {
    const kept = card(['feature:F-1', 'module:src/App']);
    const faults = [
      card(['flow:FLOW-1'], { phase: 9 }),
      card(['flow:FLOW-1'], { invariant: ' ' }),
      card(['flow:FLOW-1'], { acceptanceCriteria: ['The item is saved.'] }),
      card(['flow:FLOW-1'], { riskClass: 'money', probes: [] }),
      card(['flow:FLOW-1'], { riskClass: 'nothing' }),
      card(['Edit an item']),
    ];

    for (const fault of faults) {
      expect(gapOutcome(answer([kept, fault]), input)).toMatchObject({
        usable: true,
        detail: 'LeftOut',
      });
    }
    expect(
      gapOutcome(answer([kept, { title: 'Edit', builds: ['flow:FLOW-1'] }]), input).detail,
    ).toBe('LeftOut');
  });

  it('RF-1406 asks no repair for a card left out once nothing is open', () => {
    const late = card(['feature:F-1'], { phase: 9 });

    expect(gapOutcome(answer([everything, late]), input).detail).toBe('Covered');
    expect(gapOutcome(answer([card(['feature:F-1', 'flow:FLOW-1']), late]), input).detail).toBe(
      'ModulesOpen',
    );
  });

  it('RF-1406 keeps an unreadable answer Unusable', () => {
    expect(gapOutcome('No cards.', input)).toMatchObject({ usable: false, detail: 'Unusable' });
  });
});

describe('the gap check of the lab: the gap repair target', () => {
  it('RF-1406 checks a gap repair answer the same way', async () => {
    const [repair] = repairTargets({
      gap: draftFile('planner/gap.v6.md', 'GAP'),
      plan: draftFile('planner/package.v12.md', 'PACKAGE'),
    });
    const problems = [
      { position: 2, field: 'phase', reason: 'names a phase that the plan does not have' },
    ];
    const parsed = repair?.parseInput({ ...input, problems });
    if (parsed?.ok !== true) throw new Error('the gap repair case does not read');
    const read = async (text: string) => {
      const { env } = environment([{ text }]);
      return (await parsed.value.run(env, draftFile('x.v9.md', 'P'))).detail;
    };

    expect(await read(answer([everything]))).toBe('Covered');
    expect(await read(answer([card(['feature:F-1'])]))).toBe('Open');
    expect(await read(answer([card(['feature:F-1']), card(['flow:FLOW-1'], { phase: 0 })]))).toBe(
      'LeftOut',
    );
  });
});
