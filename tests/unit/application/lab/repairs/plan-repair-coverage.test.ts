import { describe, expect, it } from 'vitest';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { invariant, scenario } from '../../../../support/task-card-fixtures.js';

// RF-1406, RF-1403 (P10-07, fix round 2): a plan repair is checked against the case's cards and the
// run's coverage of its requirements. The verifier's three probes: (a) every requirement kept but one
// task card, (b) one requirement, one phase and one task, (c) only the FEAT card cited.

const cardOf = (id: string, type: string) => ({
  ...{ id, type, title: id, summary: 'A finding.' },
  claims: [{ claimId: `${id}.c1`, text: 'A finding.', citations: ['src/A.cs:1-2'] }],
});
const cards = [
  cardOf('FEAT-001', 'FEAT'),
  cardOf('BR-001', 'BR'),
  cardOf('ENT-001', 'ENT'),
  cardOf('OQ-001', 'OQ'),
];
const owner = { planningBrief: { principles: [{ id: 'sdd', title: 'SDD', rule: 'sdd' }] } };
const problems = [{ list: 'requirements', position: 1, field: 'sources', reason: 'No card id.' }];

const req = (title: string, sources: string[]) => ({ title, statement: `${title}.`, sources });
const order = req('Order', ['FEAT-001', 'BR-001']);
const store = req('Store orders', ['ENT-001']);
const phase = { name: 'First', goal: 'Orders.', exitCriteria: ['Orders are placed.'] };
const task = (title: string, requirements: number[]) => ({
  ...{ title, phase: 1, requirements, acceptanceCriteria: [scenario], invariant },
  ...{ riskClass: 'none', adds: [], probes: [], files: ['src/orders/'], dependsOn: [] },
});
const plan = (requirements: unknown[], tasks: unknown[]) =>
  JSON.stringify({ requirements, phases: [phase], tasks });

async function read(text: string) {
  const [, target] = repairTargets({
    gap: draftFile('planner/gap.v6.md', 'GAP'),
    plan: draftFile('planner/package.v12.md', 'PACKAGE'),
  });
  const parsed = target?.parseInput({ cards, owner, problems });
  if (parsed?.ok !== true) throw new Error('the plan repair case does not read');
  const { env } = environment([{ text }]);
  return parsed.value.run(env, draftFile('x.v9.md', 'P'));
}

describe('the plan repair check of the lab: the cards and the coverage', () => {
  it('RF-1406 reads a whole repair as Fixed, an open question uncited included', async () => {
    const whole = plan([order, store], [task('Orders', [1]), task('Storage', [2])]);

    expect(await read(whole)).toMatchObject({
      ...{ usable: true, detail: 'Fixed' },
      followUps: { 'gap round': false },
    });
  });

  it('RF-1406 (a) reads every requirement kept with one task card as Open, a gap round', async () => {
    const fewTasks = plan([order, store], [task('Orders', [1])]);

    expect(await read(fewTasks)).toMatchObject({
      ...{ usable: true, detail: 'Open' },
      followUps: { 'gap round': true },
      counts: { requirements: 2, tasks: 1, 'uncovered requirements': 1, 'requirement floor': 1 },
    });
  });

  it('RF-1406 (b) reads one requirement, one phase and one task as Shrunk', async () => {
    const minimal = plan([req('Order', ['FEAT-001'])], [task('Orders', [1])]);

    expect(await read(minimal)).toMatchObject({ usable: false, detail: 'Shrunk' });
  });

  it('RF-1406 (c) reads a repair that cites only the FEAT card as Shrunk', async () => {
    const onlyFeature = plan(
      [req('Order', ['FEAT-001']), req('Pay', ['FEAT-001'])],
      [task('Orders', [1]), task('Pay', [2])],
    );

    expect(await read(onlyFeature)).toMatchObject({ usable: false, detail: 'Shrunk' });
  });
});
