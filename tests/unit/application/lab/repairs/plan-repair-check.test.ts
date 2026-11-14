import { describe, expect, it } from 'vitest';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { invariant, scenario } from '../../../../support/task-card-fixtures.js';

// RF-1406, RF-604, P8-02 (P10-07): the lab assembles a plan repair answer as a run assembles the plan
// after its repair round. `Fixed`: nothing is left out; `LeftOut`: the package of a run would lose
// an item; `NoRequirements`: no requirement is kept.

const card = {
  id: 'FEAT-001',
  type: 'FEAT',
  title: 'Checkout',
  summary: 'Pays.',
  claims: [{ claimId: 'FEAT-001.c1', text: 'Pays.', citations: ['src/A.cs:1-2'] }],
};
const problems = [{ list: 'requirements', position: 1, field: 'sources', reason: 'No card id.' }];
const brief = (principles: string[]) => ({
  planningBrief: { principles: principles.map((id) => ({ id, title: id, rule: id })) },
});

const requirement = { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] };
const phase = { name: 'First', goal: 'Orders.', exitCriteria: ['Orders are placed.'] };
const task = {
  ...{ title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario], invariant },
  ...{ riskClass: 'none', adds: [], probes: [], files: ['src/orders/'], dependsOn: [] },
};

function plan(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ requirements: [requirement], phases: [phase], tasks: [task], ...extra });
}

async function read(text: string, principles = ['sdd'], cards = [card]) {
  const [, target] = repairTargets({
    gap: draftFile('planner/gap.v6.md', 'GAP'),
    plan: draftFile('planner/package.v12.md', 'PACKAGE'),
  });
  const parsed = target?.parseInput({ cards, owner: brief(principles), problems });
  if (parsed?.ok !== true) throw new Error('the plan repair case does not read');
  const { env } = environment([{ text }]);
  return parsed.value.run(env, draftFile('x.v9.md', 'P'));
}

describe('the plan repair check of the lab', () => {
  it('RF-1406 reads a repair the run keeps whole as Fixed', async () => {
    expect(await read(plan())).toEqual({ usable: true, detail: 'Fixed' });
  });

  it('RF-1406 reads a repair that names no card of the case as a source as LeftOut', async () => {
    const claimSource = { ...requirement, sources: ['BR-404'] };
    const second = { ...requirement, title: 'Pay' };

    const answer = plan({ requirements: [second, claimSource] });

    expect(await read(answer)).toEqual({ usable: true, detail: 'LeftOut' });
  });

  it('RF-1406 reads a task left out or an item not read as LeftOut', async () => {
    const noPhase = plan({ tasks: [task, { ...task, title: 'Ship', phase: 7 }] });
    const unread = plan({ tasks: [task, { ...task, acceptanceCriteria: [] }] });
    const badPhase = plan({ phases: [phase, { ...phase, exitCriteria: [] }] });

    expect((await read(noPhase)).detail).toBe('LeftOut');
    expect((await read(unread)).detail).toBe('LeftOut');
    expect((await read(badPhase)).detail).toBe('LeftOut');
  });

  it('RF-1406 reads a task left with no requirement as LeftOut only when the brief names sdd', async () => {
    const orphan = { ...requirement, title: 'Ship', sources: ['NONE-9'] };
    const answer = plan({
      requirements: [requirement, orphan],
      tasks: [task, { ...task, requirements: [2] }],
    });
    const kept = plan({ tasks: [task, { ...task, title: 'Ship', requirements: [] }] });

    expect((await read(answer)).detail).toBe('LeftOut');
    expect((await read(kept, ['tdd'])).detail).toBe('Fixed');
  });

  it('RF-1406 reads a repair that keeps no requirement as NoRequirements, not usable', async () => {
    const none = plan({ requirements: [{ ...requirement, sources: ['BR-404'] }] });

    expect(await read(none)).toEqual({ usable: false, detail: 'NoRequirements' });
    expect(await read('No plan.')).toEqual({ usable: false, detail: 'Unusable' });
  });
});

describe('the plan repair check of the lab: first-try validity', () => {
  it('RF-1403 keeps first-try validity the parser reading, whatever the check finds', () => {
    const [, target] = repairTargets({
      gap: draftFile('planner/gap.v6.md', 'GAP'),
      plan: draftFile('planner/package.v12.md', 'PACKAGE'),
    });

    expect(target?.readsAnswer(plan())).toBe(true);
    expect(
      target?.readsAnswer(plan({ requirements: [{ ...requirement, sources: ['BR-404'] }] })),
    ).toBe(true);
    expect(target?.readsAnswer('No plan.')).toBe(false);
  });
});

describe('the plan repair check of the lab: content that must survive', () => {
  it('RF-1406 reads a repair that deletes the phases or the task cards as Shrunk, not usable', async () => {
    const deleted = plan({ phases: [], tasks: [] });

    expect(await read(deleted)).toEqual({ usable: false, detail: 'Shrunk' });
    expect((await read(plan({ tasks: [] }))).detail).toBe('Shrunk');
    expect((await read(plan({ phases: [], tasks: [{ ...task, phase: 1 }] }))).detail).toBe(
      'Shrunk',
    );
  });

  it('RF-1406 reads a repair that leaves a FEAT card of the case uncited as Shrunk', async () => {
    const second = { ...card, id: 'FEAT-002', title: 'Refunds' };
    const rule = { ...card, id: 'BR-001', type: 'BR', title: 'Late fee' };

    expect((await read(plan(), ['sdd'], [card, second])).detail).toBe('Shrunk');
    expect((await read(plan(), ['sdd'], [card, rule])).detail).toBe('Fixed');
  });
});
